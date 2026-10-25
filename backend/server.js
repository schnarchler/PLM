const express  = require('express');
const AdmZip   = require('adm-zip');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const initSqlJs = require('sql.js');

const app  = express();

// plm.config liegt an der PLM-Wurzel (eine Ebene über backend/); Tests
// setzen PLM_CONFIG auf eine eigene Datei.
// Format: Schlüssel=Wert, Zeilen mit # werden ignoriert
const PLM_CONFIG_PATH = process.env.PLM_CONFIG || path.join(__dirname, '..', 'plm.config');

function loadConfig() {
  try {
    if (!fs.existsSync(PLM_CONFIG_PATH)) return {};
    const result = {};
    for (const line of fs.readFileSync(PLM_CONFIG_PATH, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq > 0) result[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
    return result;
  } catch { return {}; }
}
function saveConfig(obj) {
  let lines = [];
  try {
    if (fs.existsSync(PLM_CONFIG_PATH)) lines = fs.readFileSync(PLM_CONFIG_PATH, 'utf8').split('\n');
  } catch {}
  for (const [key, raw] of Object.entries(obj)) {
    // Kein Zeilenumbruch im Wert — sonst liesse sich über das Datenpfad-Feld
    // eine weitere Zeile, etwa ein Slicer-Pfad, in die Datei schreiben.
    const value = String(raw ?? '').replace(/[\r\n]+/g, '');
    const idx = lines.findIndex(l => l.trim().startsWith(key + '='));
    if (idx >= 0) lines[idx] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(PLM_CONFIG_PATH, lines.join('\n'));
}

if (!fs.existsSync(PLM_CONFIG_PATH)) {
  fs.writeFileSync(PLM_CONFIG_PATH,
    '# PLM Konfiguration - Datenpfad fuer diesen PC anpassen\n' +
    '# Leerzeilen und Zeilen mit # werden ignoriert\n' +
    '# Beispiele:\n' +
    '#   Windows: data_dir=D:\\Proton Drive\\My files\\plm-data\n' +
    '#   Linux:   data_dir=/home/user/plm-data\n' +
    'data_dir=\n');
  console.log('plm.config erstellt: ' + PLM_CONFIG_PATH);
}
const _config = loadConfig();
// Die Datenpfade sind veränderbar: /api/data-path/move schaltet den laufenden
// Server nach dem Verschieben ohne Neustart auf das neue Verzeichnis um.
let DATA_DIR, DB_PATH, FILES_DIR, TRASH_DIR, BACKUP_DIR;
function setDataDir(dir) {
  DATA_DIR   = path.resolve(dir);
  DB_PATH    = path.join(DATA_DIR, 'plm.db');
  FILES_DIR  = path.join(DATA_DIR, 'files');
  TRASH_DIR  = path.join(DATA_DIR, 'papierkorb');
  BACKUP_DIR = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(DATA_DIR,  { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
}
setDataDir(process.env.PLM_DATA_DIR || _config.data_dir || path.join(__dirname, 'data'));
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');

// -- sql.js wrapper (synchronous-style API) ---------------------
let db;
let saveTimer;
let dbDirty = false;

// Atomar schreiben (tmp + rename), damit ein Absturz mitten im
// Schreiben die plm.db nicht korrumpiert.
function flushDb() {
  if (!dbDirty || !db) return;
  clearTimeout(saveTimer);
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, Buffer.from(db.export()));
  if (_replaceFile(tmpPath, DB_PATH) === 'copied') {
    console.warn('  plm.db war gesperrt (Sync-Programm, Virenscanner?) - direkt geschrieben statt umbenannt.');
  }
  dbDirty = false;
}

// ── DATEI ERSETZEN ────────────────────────────────────────────
// Unter Windows sperren Sync-Programme (Proton Drive, OneDrive), Virenscanner
// und die Suche eine Datei, während sie sie lesen — Umbenennen darüber
// scheitert dann mit EPERM/EBUSY. Kurz warten und neu versuchen; hält die
// Sperre an, den Inhalt direkt hineinkopieren: Gesperrt ist meist nur das
// Ersetzen, nicht das Schreiben. Die .tmp-Datei bleibt bis dahin als
// vollständige Kopie liegen.
const FILE_LOCK_CODES = ['EPERM', 'EBUSY', 'EACCES'];
function _sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function _replaceFile(tmpPath, destPath, { tries = 8, sleep = _sleepSync } = {}) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmpPath, destPath); return 'renamed'; }
    catch (err) {
      if (!FILE_LOCK_CODES.includes(err.code)) throw err;
      if (i < tries) { sleep(40 * (i + 1)); continue; }   // zusammen höchstens ~1.4 s
      fs.copyFileSync(tmpPath, destPath);
      try { fs.unlinkSync(tmpPath); } catch {}
      return 'copied';
    }
  }
}
// ── ENDE DATEI ERSETZEN

// Debounce 500ms — aber spätestens nach 5s flushen, damit ununterbrochene
// Schreibvorgänge das Speichern nicht endlos hinauszögern.
const MAX_FLUSH_DELAY = 5000;
let dirtySince = 0;
function saveDb() {
  if (!dbDirty) { dbDirty = true; dirtySince = Date.now(); }
  clearTimeout(saveTimer);
  const overdue = Date.now() - dirtySince >= MAX_FLUSH_DELAY;
  // Schlägt das Speichern fehl, nicht auf die nächste Änderung warten
  saveTimer = setTimeout(function attempt() {
    try { flushDb(); }
    catch (err) {
      console.error('  DB-Speichern fehlgeschlagen: ' + err.message + ' - neuer Versuch in 5 s');
      saveTimer = setTimeout(attempt, 5000);
    }
  }, overdue ? 0 : 500);
}

// Ausstehende Änderungen beim Beenden sichern (Debounce-Fenster = 500ms)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    try { flushDb(); } catch (err) { console.error('DB-Speichern beim Beenden fehlgeschlagen:', err.message); }
    process.exit(0);
  });
}
process.on('exit', () => { try { flushDb(); } catch {} });

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// Mehrere Statements atomar ausführen: schlägt eines fehl, wird alles zurückgerollt.
function tx(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    saveDb();
    return result;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch {}
    throw err;
  }
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return undefined;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function count(sql, params = []) {
  return (get(sql, params) || {c: 0}).c;
}

function runGetId(sql, params = []) {
  db.run(sql, params);
  saveDb();
  const r = get('SELECT last_insert_rowid() as id');
  return r ? r.id : null;
}

// -- PAPIERKORB -------------------------------------------------
// Gelöschte Dateien wandern in den Papierkorb, statt sofort zu verschwinden.
// Wird eine ältere Sicherung wiederhergestellt, holt PLM die Dateien, auf die
// sie noch verweist, von dort zurück. Nach TRASH_KEEP_DAYS werden sie beim
// Start endgültig entfernt.
const TRASH_KEEP_DAYS = 30;
function trashFile(filename) {
  if (!filename) return;
  const src = path.join(FILES_DIR, filename);
  if (!fs.existsSync(src)) return;
  try {
    fs.mkdirSync(TRASH_DIR, { recursive: true });
    const dest = path.join(TRASH_DIR, filename);
    try { fs.renameSync(src, dest); }
    catch { fs.copyFileSync(src, dest); fs.unlinkSync(src); }
    const now = new Date();
    fs.utimesSync(dest, now, now);   // Löschzeitpunkt, nicht Upload-Zeitpunkt
  } catch (err) {
    console.error('Papierkorb nicht verfügbar, Datei wird direkt gelöscht:', err.message);
    try { fs.unlinkSync(src); } catch {}
  }
}
function purgeTrash() {
  if (!fs.existsSync(TRASH_DIR)) return;
  const limit = Date.now() - TRASH_KEEP_DAYS * 86400000;
  let removed = 0;
  for (const f of fs.readdirSync(TRASH_DIR)) {
    const p = path.join(TRASH_DIR, f);
    try { if (fs.statSync(p).mtimeMs < limit) { fs.unlinkSync(p); removed++; } } catch {}
  }
  if (removed) console.log(`  Papierkorb: ${removed} Datei(en) älter als ${TRASH_KEEP_DAYS} Tage entfernt`);
}

// -- INIT DB ----------------------------------------------------
// Automatisches Backup beim Start: eine Kopie pro Tag, die letzten 14 behalten.
// Von Hand erstellte Sicherungen und die Sicherung vor einer Wiederherstellung
// haben einen Zusatz im Namen und fallen nicht unter diese Rotation.
const BACKUP_KEEP = 14;
function autoBackupDb() {
  if (!fs.existsSync(DB_PATH)) return;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const dest = path.join(BACKUP_DIR, `plm-${today}.db`);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(DB_PATH, dest);
    console.log('  DB-Backup erstellt: ' + dest);
  }
  const old = fs.readdirSync(BACKUP_DIR)
    .filter(f => /^plm-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .slice(0, -BACKUP_KEEP);
  old.forEach(f => { try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {} });
}

let SQL;
async function initDb() {
  SQL = await initSqlJs();
  try { autoBackupDb(); }
  catch (err) { console.error('DB-Backup fehlgeschlagen:', err.message); }
  try { purgeTrash(); }
  catch (err) { console.error('Papierkorb aufräumen fehlgeschlagen:', err.message); }
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  applySchema();
}

// Hinweise am Teil: Spalte → Bezeichnung (fürs Protokoll). Konstruktion und
// Fertigung sind intern, nur der Kundenhinweis steht auf dem Lieferschein.
const HINT_LABEL = { hint_design: 'Konstruktionshinweis', hint_production: 'Fertigungshinweis', hint_customer: 'Kundenhinweis' };

// Tabellen, Spalten, Migrationen und Indizes — alles idempotent. Läuft beim
// Start und nach dem Wiederherstellen einer Sicherung, damit auch ein älterer
// Stand das aktuelle Schema bekommt.
function applySchema() {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    customer TEXT,
    pinned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
    item_type TEXT NOT NULL,
    item_number TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    source_url TEXT,
    default_price REAL,
    classification TEXT DEFAULT NULL,
    weight_g REAL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(item_number)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    rev TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DFT',
    description TEXT,
    eco_reason TEXT,
    released_at TEXT,
    released_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(item_id, rev)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revision_id INTEGER NOT NULL,
    ds_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    version TEXT DEFAULT '1',
    notes TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_rev_id INTEGER NOT NULL,
    child_item_id INTEGER NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    position INTEGER,
    notes TEXT,
    UNIQUE(parent_rev_id, child_item_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS print_settings (
    revision_id INTEGER PRIMARY KEY,
    material TEXT, color TEXT, layer_height TEXT,
    infill TEXT, supports TEXT, nozzle TEXT,
    print_temp TEXT, bed_temp TEXT, printer TEXT, notes TEXT,
    printer_cost_hr REAL,
    filament_price_kg REAL,
    filament_weight_total REAL,
    part_weight REAL,
    print_duration REAL,
    raw_material_id INTEGER REFERENCES raw_materials(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Wer hat's getan — der Name als Kopie, damit die Historie lesbar bleibt
  try { db.run('ALTER TABLE changelog ADD COLUMN user_id INTEGER'); } catch {}
  try { db.run('ALTER TABLE changelog ADD COLUMN user_name TEXT'); } catch {}

  // Personen für die Nachvollziehbarkeit (siehe BENUTZER). Nie gelöscht, nur deaktiviert.
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','superuser','admin')),
    pin_hash TEXT,
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    last_seen_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT, phone TEXT, address TEXT, notes TEXT,
    street TEXT, postal_code TEXT, city TEXT, country TEXT DEFAULT 'Deutschland',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_name_free TEXT,
    status TEXT DEFAULT 'DRAFT',
    title TEXT NOT NULL,
    notes TEXT,
    order_date TEXT,
    delivery_date TEXT,
    tax_rate REAL DEFAULT 19,
    discount_pct REAL DEFAULT 0,
    payment_terms TEXT,
    include_tax INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    notes TEXT,
    position INTEGER DEFAULT 999,
    raw_material_id INTEGER REFERENCES raw_materials(id),
    estimated_hours REAL,
    printer_name TEXT DEFAULT '',
    estimated_print_hours REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    customer_name_free TEXT,
    status TEXT DEFAULT 'DRAFT',
    title TEXT NOT NULL,
    notes TEXT,
    quote_date TEXT,
    valid_until TEXT,
    tax_rate REAL DEFAULT 19,
    discount_pct REAL DEFAULT 0,
    payment_terms TEXT,
    include_tax INTEGER DEFAULT 0,
    estimated_hours REAL DEFAULT 0,
    include_hours INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    item_id INTEGER,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    notes TEXT,
    position INTEGER DEFAULT 999,
    raw_material_id INTEGER REFERENCES raw_materials(id),
    estimated_hours REAL,
    printer_name TEXT DEFAULT '',
    estimated_print_hours REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    doc_type TEXT DEFAULT 'OTHER',
    notes TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    order_id INTEGER,
    customer_id INTEGER,
    customer_name_free TEXT,
    status TEXT DEFAULT 'DRAFT',
    delivery_date TEXT,
    manufacture_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS delivery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER NOT NULL,
    item_id INTEGER,
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'Stk',
    unit_price REAL,
    print_settings_json TEXT,
    notes TEXT,
    position INTEGER DEFAULT 999,
    raw_material_id INTEGER REFERENCES raw_materials(id)
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER DEFAULT 0
  )`);
  db.run(`INSERT OR IGNORE INTO counters VALUES ('project',0),('customer',0),('order',0),('quote',0),('delivery',0),('supplier',0),('purchase_order',0)`);

  db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name_free TEXT,
    status TEXT DEFAULT 'DRAFT',
    order_date TEXT,
    expected_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL REFERENCES purchase_orders(id),
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'Stk',
    unit_price REAL,
    inventory_item_id INTEGER REFERENCES inventory_items(id),
    received_qty REAL DEFAULT 0,
    notes TEXT,
    position INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  // Seed default settings if not yet present
  const defaults = {
    company_name: '', company_street: '', company_postal_code: '', company_city: '',
    company_country: 'Schweiz', company_phone: '', company_email: '', company_website: '',
    company_uid: '', bank_name: '', bank_iban: '', bank_bic: '',
    default_tax_rate: '', default_payment_terms: '30 Tage netto',
    default_currency: 'CHF', quote_validity_days: '',
    default_filament_price_kg: '', default_machine_cost_hr: '',
    invoice_footer: 'Bitte begleichen Sie den Betrag gemäss Zahlungsbedingungen. Vielen Dank!',
    quote_footer: 'Dieses Angebot ist freibleibend. Preise exkl. MwSt., sofern nicht anders angegeben.',
    receipt_footer: '',
    receipt_line_width: '32',
    receipt_show_datetime: '1',
    receipt_show_customer: '1',
    receipt_show_item_number: '1',
    receipt_show_notes: '1',
    label_show_qr: '1'
  };
  Object.entries(defaults).forEach(([k, v]) => {
    db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k, v]);
  });

  db.run(`CREATE TABLE IF NOT EXISTS printers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cost_per_hour REAL DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS nozzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    size TEXT NOT NULL
  )`);
  const _nz = get('SELECT COUNT(*) as n FROM nozzles');
  if (!_nz || _nz.n === 0) {
    ['0.2','0.4','0.6','0.8','1.0'].forEach(s => db.run('INSERT INTO nozzles (size) VALUES (?)', [s]));
  }

  db.run(`CREATE TABLE IF NOT EXISTS material_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    print_temp TEXT,
    bed_temp TEXT,
    nozzle TEXT,
    filament_price_kg REAL,
    notes TEXT
  )`);
  const _mp = get('SELECT COUNT(*) as n FROM material_presets');
  if (!_mp || _mp.n === 0) {
    [['PLA','210','60','0.4',22],['PETG','235','85','0.4',24],
     ['ASA','250','100','0.4',32],['ABS','240','110','0.4',20],['TPU','225','50','0.4',30]]
    .forEach(([n,pt,bt,nz,fp]) => db.run(
      'INSERT INTO material_presets (name,print_temp,bed_temp,nozzle,filament_price_kg) VALUES (?,?,?,?,?)',
      [n,pt,bt,nz,fp]));
  }

  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // Adresse wie bei Kunden; das Freitextfeld address bleibt für ältere Einträge
  for (const col of ['street', 'postal_code', 'city', 'country'])
    try { db.run(`ALTER TABLE suppliers ADD COLUMN ${col} TEXT DEFAULT ''`); } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Sonstiges',
    sku TEXT,
    unit TEXT DEFAULT 'Stk',
    stock_qty REAL DEFAULT 0,
    min_qty REAL DEFAULT 0,
    price_per_unit REAL,
    supplier_id INTEGER REFERENCES suppliers(id),
    notes TEXT,
    item_id INTEGER REFERENCES items(id),
    color TEXT,
    material TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    type TEXT NOT NULL,
    qty REAL NOT NULL,
    reference TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS raw_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    material_type TEXT DEFAULT '',
    color TEXT DEFAULT '',
    brand TEXT DEFAULT '',
    stock_qty REAL DEFAULT 0,
    min_qty REAL DEFAULT 0,
    unit TEXT DEFAULT 'g',
    notes TEXT DEFAULT '',
    lot_number TEXT DEFAULT '',
    dimensions TEXT DEFAULT '',
    weight_g REAL,
    print_temp REAL,
    bed_temp REAL,
    nozzle TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS raw_material_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
    qty REAL NOT NULL,
    type TEXT NOT NULL,
    notes TEXT DEFAULT '',
    unit_price REAL,
    lot_number TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS standard_part_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    std_part_id INTEGER NOT NULL REFERENCES standard_parts(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_size INTEGER,
    ds_type TEXT DEFAULT 'DOC',
    notes TEXT DEFAULT '',
    uploaded_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS standard_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    designation TEXT NOT NULL,
    standard TEXT DEFAULT '',
    std_number TEXT DEFAULT '',
    name TEXT DEFAULT '',
    size TEXT DEFAULT '',
    material TEXT DEFAULT '',
    unit_price REAL,
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bom_std_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_rev_id INTEGER NOT NULL REFERENCES revisions(id),
    std_part_id INTEGER NOT NULL REFERENCES standard_parts(id),
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    position INTEGER DEFAULT 999,
    notes TEXT DEFAULT '',
    UNIQUE(parent_rev_id, std_part_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id),
    item_id INTEGER REFERENCES items(id),
    date TEXT,
    hours REAL NOT NULL,
    description TEXT,
    billable INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS applied_migrations (key TEXT PRIMARY KEY)`);

  // One-time data migration: lowercase item types/numbers, revisions letters→numbers
  migrateOnce('lowercase-numbering-v1', () => {
    db.run("UPDATE items SET item_type=LOWER(item_type)");
    db.run("UPDATE items SET item_number=REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(item_number,'-ASM-','-asm-'),'-PRT-','-prt-'),'-DOC-','-doc-'),'-Asm-','-asm-'),'-Prt-','-prt-'),'-Doc-','-doc-')");
    function letterToNum(s) {
      if (!s || /^\d+$/.test(s)) return s;
      let n = 0;
      for (const c of s.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
      return String(n);
    }
    const revs = all('SELECT id, rev FROM revisions');
    for (const r of revs) {
      const newRev = letterToNum(r.rev);
      if (newRev !== r.rev) db.run('UPDATE revisions SET rev=? WHERE id=?', [newRev, r.id]);
    }
    console.log('Migration lowercase-numbering-v1 angewendet');
  });

  // Add new columns to existing databases (safe try/catch)
  try { db.run('ALTER TABLE projects ADD COLUMN pinned INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN estimated_hours REAL DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN include_hours INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE items ADD COLUMN classification TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE items ADD COLUMN weight_g REAL'); } catch {}
  try { db.run('ALTER TABLE items ADD COLUMN variant_group_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE items ADD COLUMN notes TEXT DEFAULT NULL'); } catch {}
  // Hinweise am Teil, je Art ein Feld. Nur der Kundenhinweis kommt auf den Lieferschein.
  for (const k of Object.keys(HINT_LABEL)) {
    try { db.run(`ALTER TABLE items ADD COLUMN ${k} TEXT DEFAULT NULL`); } catch {}
  }
  // Nicht mehr verwendete Spalten entfernen statt als Datenmüll mitzuschleppen —
  // auch nach dem Wiederherstellen einer älteren Sicherung.
  // important_note: Vorläufer der drei Hinweisfelder, nie ausgeliefert.
  const itemCols = all('PRAGMA table_info(items)').map(c => c.name);
  for (const col of ['important_note']) {
    if (itemCols.includes(col)) db.run(`ALTER TABLE items DROP COLUMN ${col}`);
  }
  try { db.run('ALTER TABLE items ADD COLUMN short_code TEXT DEFAULT NULL'); } catch {}
  // Jeder je vergebene Kurzcode bleibt hier reserviert — auch nach dem
  // Löschen des Teils, damit ein alter Aufdruck nie auf ein neues Teil zeigt.
  db.run(`CREATE TABLE IF NOT EXISTS short_codes (
    code TEXT PRIMARY KEY,
    item_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_items_short_code ON items(short_code)');
  db.run('INSERT OR IGNORE INTO short_codes (code,item_id) SELECT short_code,id FROM items WHERE short_code IS NOT NULL');
  {
    const missing = all('SELECT id FROM items WHERE short_code IS NULL ORDER BY id');
    missing.forEach(r => assignShortCode(r.id));
    if (missing.length) console.log(`Kurzcode: ${missing.length} Teil(e) nachgetragen`);
  }
  try { db.run('ALTER TABLE bom ADD COLUMN child_rev_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE purchase_order_items ADD COLUMN std_part_id INTEGER REFERENCES standard_parts(id)'); } catch {}
  try { db.run('ALTER TABLE inventory_items ADD COLUMN std_part_id INTEGER REFERENCES standard_parts(id)'); } catch {}
  try { db.run('ALTER TABLE deliveries ADD COLUMN material_consumed INTEGER DEFAULT 0'); } catch {}
  try { db.run('ALTER TABLE projects ADD COLUMN color TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN valid_until TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE orders ADD COLUMN origin_quote_number TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE quotes ADD COLUMN migrated_to_order_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE purchase_order_items ADD COLUMN raw_material_id INTEGER REFERENCES raw_materials(id)'); } catch {}
  try { db.run('ALTER TABLE raw_material_movements ADD COLUMN article_number TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE delivery_items ADD COLUMN order_item_id INTEGER REFERENCES order_items(id)'); } catch {}
  // Gelieferter Stand: welche Revision des Items in dieser Position steckt.
  // NULL = folgt automatisch der aktiven Revision (bis zur Lieferung).
  // rev_fixed: 'manual' = von Hand gewählt, 'delivery' = beim Status
  // „Geliefert" fixiert, 'migration' = nachträglich aus dem Lieferdatum ermittelt.
  try { db.run('ALTER TABLE delivery_items ADD COLUMN revision_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE delivery_items ADD COLUMN rev_fixed TEXT DEFAULT NULL'); } catch {}
  // Zeiterfassung: Von/Bis-Uhrzeit (HH:MM), wenn die Stunden daraus berechnet
  // wurden. NULL = nur die Dauer wurde eingegeben.
  try { db.run('ALTER TABLE time_entries ADD COLUMN start_time TEXT DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE time_entries ADD COLUMN end_time TEXT DEFAULT NULL'); } catch {}
  // Füllmuster aus dem Slicer (gyroid, grid …). Für schon hochgeladene 3MF
  // einmalig nachtragen, damit es nicht erst nach einem neuen Upload erscheint.
  try { db.run('ALTER TABLE print_settings ADD COLUMN infill_pattern TEXT DEFAULT NULL'); } catch {}
  // Prüfsumme der gespeicherten Datei — wird beim ersten Vergleich berechnet
  // und dann nicht mehr neu gelesen (Checkout-Scan, Check-in, Revisionsvergleich)
  try { db.run('ALTER TABLE datasets ADD COLUMN sha1 TEXT DEFAULT NULL'); } catch {}
  // Aussenmasse einer STL als JSON [x,y,z] in mm — ebenfalls beim ersten
  // Abruf berechnet. NULL = noch nicht gerechnet, '' = nicht lesbar.
  try { db.run('ALTER TABLE datasets ADD COLUMN dims TEXT DEFAULT NULL'); } catch {}

  // Rückverfolgung: welche Material-Charge in welcher Produktionsposition
  // steckt, und die Prüfung je Position (wer, wann, Ergebnis)
  try { db.run('ALTER TABLE raw_material_movements ADD COLUMN delivery_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE raw_material_movements ADD COLUMN delivery_item_id INTEGER DEFAULT NULL'); } catch {}
  for (const col of ['inspection_result', 'inspection_note', 'inspected_by', 'inspected_at']) {
    try { db.run(`ALTER TABLE delivery_items ADD COLUMN ${col} TEXT DEFAULT NULL`); } catch {}
  }
  // Ältere Abbuchungen kennen den Produktionsauftrag nur aus der Notiz
  // („Verbrauch LS-2026-001") — einmalig verknüpfen, die Position nur wenn eindeutig
  migrateOnce('trace-consumption-links-v1', () => {
    for (const m of all("SELECT id, raw_material_id, notes FROM raw_material_movements WHERE type='out' AND delivery_id IS NULL AND notes LIKE 'Verbrauch %'")) {
      const d = get('SELECT id FROM deliveries WHERE number=?', [m.notes.slice('Verbrauch '.length).trim()]);
      if (!d) continue;
      const pos = all('SELECT id FROM delivery_items WHERE delivery_id=? AND raw_material_id=?', [d.id, m.raw_material_id]);
      db.run('UPDATE raw_material_movements SET delivery_id=?, delivery_item_id=? WHERE id=?', [d.id, pos.length === 1 ? pos[0].id : null, m.id]);
    }
  });

  // Änderungsanträge (ECR): eine Änderung mit Begründung für ein oder mehrere
  // Teile. OPEN → APPROVED → IN_WORK → DONE, oder REJECTED.
  db.run(`CREATE TABLE IF NOT EXISTS ecrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE,
    title TEXT NOT NULL,
    reason TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'OPEN',
    created_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    decided_by TEXT,
    decided_at TEXT,
    decision_note TEXT,
    done_at TEXT
  )`);
  // rev_before: Stand beim Anlegen, rev_after: Revision, in der geändert wird
  db.run(`CREATE TABLE IF NOT EXISTS ecr_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ecr_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    note TEXT DEFAULT '',
    rev_before INTEGER,
    rev_after INTEGER,
    UNIQUE(ecr_id, item_id)
  )`);
  migrateOnce('infill-pattern-from-3mf-v1', () => {
    let n = 0;
    for (const ps of all("SELECT revision_id FROM print_settings WHERE infill_pattern IS NULL OR infill_pattern=''")) {
      const files = all("SELECT filename FROM datasets WHERE revision_id=? AND LOWER(original_name) LIKE '%.3mf' ORDER BY id DESC", [ps.revision_id]);
      for (const f of files) {
        let parsed;
        try { parsed = parse3mfSettings(fs.readFileSync(path.join(FILES_DIR, f.filename))); } catch { continue; }
        const pattern = parsed.settings && printSettingsFrom3mf(parsed.settings).infill_pattern;
        if (pattern) { run('UPDATE print_settings SET infill_pattern=? WHERE revision_id=?', [pattern, ps.revision_id]); n++; break; }
      }
    }
    if (n) console.log(`Füllmuster aus 3MF nachgetragen: ${n} Revision(en)`);
  });
  // Bei Baugruppen zusätzlich die komplette Struktur zum Lieferzeitpunkt:
  // jedes Unterteil mit der Revision, die damals verbaut war. Nummer und Name
  // sind kopiert, damit der Stand lesbar bleibt, auch wenn ein Item später
  // umbenannt oder gelöscht wird. unit_qty = Menge pro gelieferter Einheit.
  db.run(`CREATE TABLE IF NOT EXISTS delivery_structure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_item_id INTEGER NOT NULL,
    parent_item_id INTEGER,
    item_id INTEGER NOT NULL,
    revision_id INTEGER,
    rev TEXT,
    item_number TEXT,
    name TEXT,
    item_type TEXT,
    quantity REAL DEFAULT 1,
    unit_qty REAL DEFAULT 1,
    depth INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0
  )`);
  db.run(`INSERT OR IGNORE INTO counters VALUES ('rm_lot',0)`);

  // Angebote sind keine eigene Sache mehr, sondern die erste Phase eines
  // Auftrags. Bestehende Angebote wandern einmalig herueber und behalten ihre
  // ANG-Nummer, damit gedruckte Belege zuordenbar bleiben. Bereits umgewandelte
  // Angebote (ACCEPTED) haben schon einen Auftrag und werden uebersprungen.
  migrateOnce('quotes-as-order-phase-v1', () => {
    let moved = 0, skipped = 0;
    // ACCEPTED heisst: das Angebot wurde schon in einen Auftrag umgewandelt,
    // der Auftrag existiert also bereits. Kein zweiter Datensatz dafuer.
    // ('SKIP' statt null, weil `null ?? 'QUOTE'` zu 'QUOTE' aufloesen wuerde.)
    const STATUS = { DRAFT: 'QUOTE', SENT: 'QUOTE', ACCEPTED: 'SKIP', DECLINED: 'DECLINED' };
    for (const q of all('SELECT * FROM quotes ORDER BY id')) {
      const target = STATUS[q.status] || 'QUOTE';
      if (target === 'SKIP') { skipped++; continue; }
      if (get('SELECT 1 as y FROM orders WHERE number=?', [q.number])) { skipped++; continue; }
      const oid = runGetId(`INSERT INTO orders
        (number,customer_id,customer_name_free,title,status,notes,order_date,valid_until,
         tax_rate,discount_pct,payment_terms,include_tax,estimated_hours,include_hours,origin_quote_number)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [q.number, q.customer_id, q.customer_name_free || null, q.title, target, q.notes || '',
         q.quote_date || null, q.valid_until || null, q.tax_rate, q.discount_pct,
         q.payment_terms || '', q.include_tax || 0, q.estimated_hours || 0, q.include_hours || 0, q.number]);
      for (const qi of all('SELECT * FROM quote_items WHERE quote_id=? ORDER BY COALESCE(position,id),id', [q.id])) {
        run(`INSERT INTO order_items
          (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,position,
           raw_material_id,estimated_hours,printer_name,estimated_print_hours)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [oid, qi.item_id, qi.description, qi.quantity, qi.unit, qi.unit_price, qi.discount_pct,
           qi.notes || '', qi.position || null, qi.raw_material_id || null, qi.estimated_hours || null,
           qi.printer_name || '', qi.estimated_print_hours || null]);
      }
      run('UPDATE quotes SET migrated_to_order_id=? WHERE id=?', [oid, q.id]);
      moved++;
    }
    if (moved || skipped) console.log(`Migration Angebote -> Auftragsphase: ${moved} übernommen, ${skipped} übersprungen`);
  });

  // Indizes auf Fremdschlüssel- und Filterspalten (idempotent)
  [
    'CREATE INDEX IF NOT EXISTS idx_items_project        ON items(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_items_parent         ON items(parent_id)',
    'CREATE INDEX IF NOT EXISTS idx_items_variant        ON items(variant_group_id)',
    'CREATE INDEX IF NOT EXISTS idx_revisions_item       ON revisions(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_datasets_revision    ON datasets(revision_id)',
    'CREATE INDEX IF NOT EXISTS idx_datasets_size        ON datasets(file_size)',
    'CREATE INDEX IF NOT EXISTS idx_bom_parent           ON bom(parent_rev_id)',
    'CREATE INDEX IF NOT EXISTS idx_bom_child            ON bom(child_item_id)',
    'CREATE INDEX IF NOT EXISTS idx_bom_std_part         ON bom_std_parts(std_part_id)',
    'CREATE INDEX IF NOT EXISTS idx_changelog_entity     ON changelog(entity_type, entity_id)',
    'CREATE INDEX IF NOT EXISTS idx_changelog_created    ON changelog(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_order_items_item     ON order_items(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_quote_items_quote    ON quote_items(quote_id)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_items_del   ON delivery_items(delivery_id)',
    'CREATE INDEX IF NOT EXISTS idx_deliveries_order     ON deliveries(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_po_items_po          ON purchase_order_items(po_id)',
    'CREATE INDEX IF NOT EXISTS idx_documents_project    ON documents(project_id)',
    'CREATE INDEX IF NOT EXISTS idx_inv_movements_item   ON inventory_movements(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_rm_movements_mat     ON raw_material_movements(raw_material_id)',
    'CREATE INDEX IF NOT EXISTS idx_rm_movements_del     ON raw_material_movements(delivery_id)',
    'CREATE INDEX IF NOT EXISTS idx_rm_movements_di      ON raw_material_movements(delivery_item_id)',
    'CREATE INDEX IF NOT EXISTS idx_ecr_items_ecr        ON ecr_items(ecr_id)',
    'CREATE INDEX IF NOT EXISTS idx_ecr_items_item       ON ecr_items(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_std_part_files_part  ON standard_part_files(std_part_id)',
    'CREATE INDEX IF NOT EXISTS idx_time_entries_order   ON time_entries(order_id)',
    'CREATE INDEX IF NOT EXISTS idx_time_entries_item    ON time_entries(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_items_rev   ON delivery_items(revision_id)',
    'CREATE INDEX IF NOT EXISTS idx_delivery_items_item  ON delivery_items(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_dstruct_di           ON delivery_structure(delivery_item_id)',
    'CREATE INDEX IF NOT EXISTS idx_dstruct_item         ON delivery_structure(item_id)',
    'CREATE INDEX IF NOT EXISTS idx_dstruct_rev          ON delivery_structure(revision_id)',
    'CREATE INDEX IF NOT EXISTS idx_items_class          ON items(classification)',
  ].forEach(sql => db.run(sql));

  // Lieferungen von vor dieser Funktion bekommen ihren Stand nachträglich:
  // die Revision, die am Lieferdatum aktiv war. Als 'migration' markiert,
  // damit die Oberfläche sie als ermittelt statt erfasst kennzeichnen kann.
  migrateOnce('delivered-revisions-v1', () => {
    let fixed = 0;
    for (const d of all("SELECT id, delivery_date, updated_at FROM deliveries WHERE status='DELIVERED'")) {
      const date = d.delivery_date || (d.updated_at || '').slice(0, 10) || null;
      for (const di of all('SELECT * FROM delivery_items WHERE delivery_id=? AND item_id IS NOT NULL AND revision_id IS NULL', [d.id])) {
        if (freezeDeliveryItem(di, 'migration', itemId => revisionAt(itemId, date))) fixed++;
      }
    }
    if (fixed) console.log(`Migration gelieferter Stand: ${fixed} Position(en) nachträglich fixiert`);
  });

  // Klassifizierungen vereinheitlichen: Leerzeichen und Gross-/Kleinschreibung
  // auf den Namen in der Liste ziehen, sonst zerfällt die Suche nach Klasse.
  migrateOnce('classification-normalize-v1', () => {
    const n = normalizeAllClassifications();
    if (n) console.log(`Migration Klassifizierung: ${n} Item(s) vereinheitlicht`);
  });

  // Gleiche Begriffe auch in der bestehenden Historie: frühere englische
  // Einträge auf die heutigen deutschen Bezeichnungen ziehen.
  migrateOnce('changelog-german-v1', () => {
    const map = {
      'Created': 'Erstellt', 'Updated': 'Geändert',
      'Dataset Added': 'Datei hinzugefügt', 'Dataset Deleted': 'Datei gelöscht',
      'BOM Add': 'BOM: Position hinzugefügt', 'BOM Entfernt': 'BOM: Position entfernt',
      'BOM Import': 'BOM importiert', 'BOM Revision': 'BOM: Revision',
      'REL': 'Status → REL', 'artikel_nr': 'Artikel-Nr. vergeben',
    };
    for (const [from, to] of Object.entries(map)) db.run('UPDATE changelog SET action=? WHERE action=?', [to, from]);
    db.run("UPDATE changelog SET action=REPLACE(action,'Status -> ','Status → ') WHERE action LIKE 'Status -> %'");
    db.run("UPDATE revisions SET description='Erste Revision' WHERE description='Initial revision'");
  });
  // Der Begriff BOM bleibt. Wo changelog-german-v1 schon mit „Stückliste: …"
  // gelaufen ist, die Einträge auf die BOM-Bezeichnungen zurückziehen.
  migrateOnce('changelog-bom-v1', () => {
    const map = {
      'Stückliste: Position hinzugefügt': 'BOM: Position hinzugefügt',
      'Stückliste: Position entfernt': 'BOM: Position entfernt',
      'Stückliste importiert': 'BOM importiert',
      'Stückliste: Revision': 'BOM: Revision',
    };
    for (const [from, to] of Object.entries(map)) db.run('UPDATE changelog SET action=? WHERE action=?', [to, from]);
  });

  // Lieferanten-Adressen aus dem Freitext in Strasse/PLZ/Ort/Land übernehmen.
  // Was sich nicht eindeutig zerlegen lässt, bleibt als Freitext stehen.
  migrateOnce('supplier-address-split-v1', () => {
    let n = 0;
    for (const s of all("SELECT id, address FROM suppliers WHERE COALESCE(address,'')!='' AND COALESCE(city,'')=''")) {
      const a = splitAddress(s.address);
      if (!a) continue;
      db.run('UPDATE suppliers SET street=?,postal_code=?,city=?,country=? WHERE id=?', [a.street, a.postal_code, a.city, a.country, s.id]);
      n++;
    }
    if (n) console.log(`Migration Lieferanten-Adresse: ${n} übernommen`);
  });

  saveDb();
  console.log('Datenbank bereit: ' + DB_PATH);
  recalcOnStart();
}

function recalcOnStart() {
  // Rohmaterial: stock_qty aus Movements neu berechnen
  const rmIds = all('SELECT id FROM raw_materials').map(r => r.id);
  let rmFixed = 0;
  for (const id of rmIds) {
    const calc = get(`SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty ELSE -qty END),0) as s FROM raw_material_movements WHERE raw_material_id=?`, [id])?.s || 0;
    const cur  = get('SELECT stock_qty FROM raw_materials WHERE id=?', [id])?.stock_qty ?? 0;
    if (Math.abs(calc - cur) > 0.0001) {
      run('UPDATE raw_materials SET stock_qty=MAX(0,?) WHERE id=?', [calc, id]);
      rmFixed++;
    }
  }

  // Lagerartikel: stock_qty aus inventory_transactions neu berechnen (falls Tabelle existiert)
  try {
    const invIds = all('SELECT id FROM inventory_items').map(r => r.id);
    let invFixed = 0;
    for (const id of invIds) {
      const calc = get(`SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty ELSE -qty END),0) as s FROM inventory_transactions WHERE inventory_item_id=?`, [id])?.s;
      if (calc == null) break; // Tabelle ohne Einträge — kein Handlungsbedarf
      const cur = get('SELECT stock_qty FROM inventory_items WHERE id=?', [id])?.stock_qty ?? 0;
      if (Math.abs(calc - cur) > 0.0001) {
        run('UPDATE inventory_items SET stock_qty=MAX(0,?) WHERE id=?', [calc, id]);
        invFixed++;
      }
    }
    if (invFixed) console.log(`recalc: ${invFixed} Lagerartikel-Bestände korrigiert`);
  } catch (_) {}

  if (rmFixed) console.log(`recalc: ${rmFixed} Rohmaterial-Bestände korrigiert`);

  // PLM Status-Übersicht loggen
  const byStatus = all(`
    SELECT r.status, COUNT(*) as count
    FROM revisions r JOIN items i ON r.item_id = i.id
    WHERE r.id = (SELECT MAX(r2.id) FROM revisions r2 WHERE r2.item_id = r.item_id)
    GROUP BY r.status ORDER BY r.status`);
  if (byStatus.length) {
    console.log('PLM Status: ' + byStatus.map(s => `${s.status}=${s.count}`).join(' · '));
  }

  if (rmFixed) saveDb();
}

function migrateOnce(key, fn) {
  const applied = get('SELECT 1 as y FROM applied_migrations WHERE key=?', [key]);
  if (applied) return;
  fn();
  db.run('INSERT OR IGNORE INTO applied_migrations (key) VALUES (?)', [key]);
  saveDb();
}

// -- HELPERS ----------------------------------------------------
function nextRev(current) { return nextRevLabel(current); }

function nextCounter(key) {
  db.run('UPDATE counters SET value=value+1 WHERE key=?', [key]);
  saveDb();
  const row = get('SELECT value FROM counters WHERE key=?', [key]);
  if (!row) throw new Error('Counter not found: ' + key);
  return row.value;
}

function padN(n, key, def) { return String(n).padStart(parseInt(getSetting(key, String(def)))||def, '0'); }
function nextProjectNumber() { return padN(nextCounter('project'), 'pad_project', 3); }
function getSetting(key, def='') { return get('SELECT value FROM settings WHERE key=?', [key])?.value ?? def; }

// ── KLASSIFIZIERUNG ───────────────────────────────────────────
// Die Liste liegt als JSON in settings.item_classifications (Name + Farbe), am
// Item steht nur der Name als Text. Darum ziehen diese Helfer abweichende
// Schreibweisen auf den Listeneintrag — sonst findet die Suche nach
// „Kaufteil" kein Item mit „kaufteil ". Standardliste wie im Frontend.
const DEFAULT_CLASS_NAMES = ['Eigenteil', 'Kaufteil', 'Normteil', 'Halbzeug', 'Rohmaterial'];
function classificationList() {
  try {
    const raw = getSetting('item_classifications', '');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(c => typeof c === 'string' ? c : c?.name).filter(Boolean);
    }
  } catch {}
  return DEFAULT_CLASS_NAMES.slice();
}
// Freitext → Name aus der Liste in deren Schreibweise, sonst getrimmt; leer → null.
function canonicalClass(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  return classificationList().find(n => n.trim().toLowerCase() === v.toLowerCase()) || v;
}
function normalizeAllClassifications() {
  let n = 0;
  for (const r of all('SELECT id, classification FROM items WHERE classification IS NOT NULL')) {
    const c = canonicalClass(r.classification);
    if (c !== r.classification) { db.run('UPDATE items SET classification=? WHERE id=?', [c, r.id]); n++; }
  }
  return n;
}
function nextCustomerNumber() {
  const pre = getSetting('prefix_customer','KD');
  return pre + '-' + padN(nextCounter('customer'), 'pad_customer', 3);
}
function nextOrderNumber() {
  const pre = getSetting('prefix_order','AUF');
  const yr = getSetting('num_yearly','1') !== '0' ? new Date().getFullYear()+'-' : '';
  return pre + '-' + yr + padN(nextCounter('order'), 'pad_order', 3);
}
function nextQuoteNumber() {
  const pre = getSetting('prefix_quote','ANG');
  const yr = getSetting('num_yearly','1') !== '0' ? new Date().getFullYear()+'-' : '';
  return pre + '-' + yr + padN(nextCounter('quote'), 'pad_quote', 3);
}
function nextDeliveryNumber() {
  const pre = getSetting('prefix_delivery','LS');
  const yr = getSetting('num_yearly','1') !== '0' ? new Date().getFullYear()+'-' : '';
  return pre + '-' + yr + padN(nextCounter('delivery'), 'pad_delivery', 3);
}
function nextSupplierNumber() { return 'LF-' + String(nextCounter('supplier')).padStart(4, '0'); }
function nextPoNumber() {
  const pre = getSetting('prefix_po','EK');
  const yr = getSetting('num_yearly','1') !== '0' ? new Date().getFullYear()+'-' : '';
  return pre + '-' + yr + padN(nextCounter('purchase_order'), 'pad_po', 3);
}

function parseIni(content) {
  const s = {};
  for (let line of content.split(/\r?\n/)) {
    let t = line.trim();
    if (!t || t.startsWith('<') || t.startsWith('[')) continue;
    // PrusaSlicer 2.9+ stores config as commented lines: '; key = value'
    if (t.startsWith('; ')) t = t.slice(2).trim();
    else if (t.startsWith(';')) t = t.slice(1).trim();
    else if (t.startsWith('#')) t = t.slice(1).trim();
    if (!t) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    // Skip keys with spaces or XML chars (not valid INI keys)
    if (k && !k.includes(' ') && !k.includes('<') && !k.includes('>')) s[k] = v;
  }
  return Object.keys(s).length ? s : null;
}

function parseJson(content) {
  try {
    const j = JSON.parse(content.trim());
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const s = {};
      for (const [k, v] of Object.entries(j)) {
        if (v !== null && v !== undefined && typeof v !== 'object') s[k] = String(v);
        else if (Array.isArray(v) && v.length && typeof v[0] !== 'object') s[k] = v.join(';');
      }
      return Object.keys(s).length ? s : null;
    }
  } catch(e) {}
  return null;
}

function parseConfig(content) {
  const t = content.trim();
  if (t.startsWith('{')) return parseJson(t);
  return parseIni(t);
}

// Map OrcaSlicer / BambuStudio key names → PrusaSlicer equivalents
const ORCA_KEY_MAP = {
  nozzle_temperature:               'temperature',
  nozzle_temperature_initial_layer: 'first_layer_temperature',
  hot_plate_temp:                   'bed_temperature',
  cool_plate_temp:                  'bed_temperature',
  textured_plate_temp:              'bed_temperature',
  hot_plate_temp_initial_layer:     'first_layer_bed_temperature',
  initial_layer_print_height:       'first_layer_height',
  sparse_infill_density:            'fill_density',
  sparse_infill_pattern:            'fill_pattern',
  wall_loops:                       'perimeters',
  top_shell_layers:                 'top_solid_layers',
  bottom_shell_layers:              'bottom_solid_layers',
  enable_support:                   'support_material',
  support_type:                     'support_material_style',
  support_threshold_angle:          'support_material_threshold',
  initial_layer_speed:              'first_layer_speed',
  outer_wall_speed:                 'perimeter_speed',
  internal_solid_infill_speed:      'solid_infill_speed',
  process_name:                     'print_settings_id',
  printer_model:                    'printer_settings_id',
  filament_id:                      'filament_settings_id',
};

function normalizeSettings(s) {
  const out = Object.assign({}, s);
  for (const [from, to] of Object.entries(ORCA_KEY_MAP)) {
    if (s[from] !== undefined && out[to] === undefined) out[to] = s[from];
  }
  return out;
}

function readZipEntry(entry) {
  // adm-zip: getData() can return null for some entries; use getDataAsync fallback
  try {
    const buf = entry.getData();
    if (buf && buf.length > 0) return buf.toString('utf8');
  } catch(e) {}
  return null;
}

// Druckparameter aus einer 3MF-Datei in print_settings uebernehmen.
// Slicer liefern Mehrfachwerte als "0.4;0.4" — davon zaehlt der erste.
function _firstVal(v) {
  if (v === undefined || v === null) return null;
  const first = String(v).split(';')[0].trim();
  return first === '' ? null : first;
}
function _num(v) {
  const f = _firstVal(v);
  if (f === null) return null;
  const n = parseFloat(String(f).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Mapping Slicer-Schluessel -> print_settings-Spalten. Mehrere Kandidaten je
// Spalte, weil PrusaSlicer, Orca und Bambu unterschiedlich benennen.
function printSettingsFrom3mf(settings) {
  const pick = (...keys) => { for (const k of keys) { const v = _firstVal(settings[k]); if (v) return v; } return null; };
  const pickNum = (...keys) => { for (const k of keys) { const v = _num(settings[k]); if (v !== null) return v; } return null; };
  const supportRaw = pick('support_material', 'enable_support');
  return {
    material:     pick('filament_type', 'filament_settings_id'),
    color:        pick('filament_colour', 'filament_color'),
    layer_height: pickNum('layer_height'),
    infill:       pickNum('fill_density', 'sparse_infill_density'),
    infill_pattern: pick('fill_pattern', 'sparse_infill_pattern'),
    supports:     supportRaw === null ? null : (supportRaw === '1' || supportRaw.toLowerCase() === 'true' ? 1 : 0),
    nozzle:       pickNum('nozzle_diameter'),
    print_temp:   pickNum('temperature', 'nozzle_temperature'),
    bed_temp:     pickNum('bed_temperature', 'hot_plate_temp'),
    printer:      pick('printer_settings_id', 'printer_model'),
  };
}

function parse3mfSettings(buffer) {
  try {
    const zip = new AdmZip(buffer);
    const allEntries = zip.getEntries();
    const entryNames = allEntries.map(e => e.entryName);

    const CONFIG_PRIORITY = [
      'slic3r_pe.config', 'prusaslicer', 'superslicer', 'slic3r',
      'project_settings', 'orcaslicer', 'bambu'
    ];
    const configEntries = allEntries.filter(e => {
      const n = e.entryName.toLowerCase().replace(/\\/g, '/');
      if (e.isDirectory) return false;
      if (n === 'metadata/model.config') return false; // standard 3MF XML, not print config
      if (n.endsWith('.config')) return true;
      if (n.startsWith('metadata/') && n.endsWith('.json')) return true;
      return false;
    }).sort((a, b) => {
      const na = a.entryName.toLowerCase();
      const nb = b.entryName.toLowerCase();
      const pa = CONFIG_PRIORITY.findIndex(c => na.includes(c));
      const pb = CONFIG_PRIORITY.findIndex(c => nb.includes(c));
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });

    for (const entry of configEntries) {
      const content = readZipEntry(entry);
      if (!content) continue;
      console.log('3MF: trying', entry.entryName, '– first 80 chars:', content.trim().slice(0, 80).replace(/\n/g, '↵'));
      const parsed = parseConfig(content);
      if (parsed) {
        const normalized = normalizeSettings(parsed);
        console.log('3MF: parsed', Object.keys(normalized).length, 'keys from', entry.entryName);
        return { settings: normalized, source: entry.entryName };
      }
    }

    return { settings: null, entries: entryNames };
  } catch(e) {
    console.error('3MF parse error:', e);
    return { settings: null, error: String(e) };
  }
}

function getLatestRevision(itemId) {
  return get('SELECT * FROM revisions WHERE item_id=? ORDER BY rowid DESC LIMIT 1', [itemId]);
}
function getActiveRevision(itemId) {
  return get("SELECT * FROM revisions WHERE item_id=? AND status='REL' ORDER BY rowid DESC LIMIT 1", [itemId])
    || getLatestRevision(itemId);
}
// Welche Revision war an einem Datum aktiv? Nur für Lieferungen aus der Zeit
// vor dem automatischen Fixieren — beste Näherung aus Freigabe- und Erstelldatum,
// nach denselben Regeln wie getActiveRevision.
function revisionAt(itemId, date) {
  if (!date) return getActiveRevision(itemId);
  const end = String(date).slice(0, 10) + ' 23:59:59';
  return get(`SELECT * FROM revisions WHERE item_id=? AND released_at IS NOT NULL AND released_at<=?
              ORDER BY released_at DESC, rowid DESC LIMIT 1`, [itemId, end])
    || get('SELECT * FROM revisions WHERE item_id=? AND created_at<=? ORDER BY rowid DESC LIMIT 1', [itemId, end])
    || get('SELECT * FROM revisions WHERE item_id=? ORDER BY rowid ASC LIMIT 1', [itemId]);
}

// ── GELIEFERTER STAND ─────────────────────────────────────────
// Eine Produktionsposition verweist bis zur Lieferung auf das Item und folgt
// dessen aktiver Revision. Beim Status „Geliefert" wird die Revision fixiert
// (delivery_items.revision_id); bei Baugruppen wird zusätzlich die komplette
// Struktur mit den Revisionen aller Unterteile festgehalten. Gelieferte
// Revisionen sind danach gesperrt — Änderungen gehen in eine neue Revision.

// Struktur einer Baugruppenrevision festhalten. resolve bestimmt die Revision
// automatisch folgender Positionen (Standard: aktive Revision).
function snapshotStructure(deliveryItemId, rootItemId, rootRevId, resolve = getActiveRevision) {
  run('DELETE FROM delivery_structure WHERE delivery_item_id=?', [deliveryItemId]);
  let pos = 0;
  (function walk(parentItemId, revId, depth, unitQty, trail) {
    if (depth > 30) return;
    const kids = all(`SELECT b.child_item_id, b.child_rev_id, b.quantity, i.item_number, i.name, i.item_type
      FROM bom b JOIN items i ON i.id=b.child_item_id
      WHERE b.parent_rev_id=? ORDER BY b.position, b.id`, [revId]);
    for (const k of kids) {
      if (trail.includes(k.child_item_id)) continue;   // Zyklus in der Stückliste
      const rev = (k.child_rev_id && get('SELECT * FROM revisions WHERE id=?', [k.child_rev_id]))
        || resolve(k.child_item_id);
      const qty = parseFloat(k.quantity) || 1;
      run(`INSERT INTO delivery_structure
        (delivery_item_id,parent_item_id,item_id,revision_id,rev,item_number,name,item_type,quantity,unit_qty,depth,position)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [deliveryItemId, parentItemId, k.child_item_id, rev?.id || null, rev?.rev || null,
         k.item_number, k.name, k.item_type, qty, unitQty * qty, depth, ++pos]);
      if (rev) walk(k.child_item_id, rev.id, depth + 1, unitQty * qty, trail.concat(k.child_item_id));
    }
  })(rootItemId, rootRevId, 1, 1, [rootItemId]);
  return pos;
}

// Revision einer Position fixieren. Eine von Hand gewählte Revision bleibt,
// sonst gilt die aktive. Gibt die fixierte Revision zurück (oder null).
function freezeDeliveryItem(di, how, resolve = getActiveRevision) {
  if (!di?.item_id) return null;
  const item = get('SELECT id, item_type FROM items WHERE id=?', [di.item_id]);
  if (!item) return null;
  const chosen = di.revision_id
    ? get('SELECT * FROM revisions WHERE id=? AND item_id=?', [di.revision_id, di.item_id]) : null;
  const rev = chosen || resolve(di.item_id);
  if (!rev) return null;
  if (!chosen) run('UPDATE delivery_items SET revision_id=?, rev_fixed=? WHERE id=?', [rev.id, how, di.id]);
  if (item.item_type === 'asm') snapshotStructure(di.id, item.id, rev.id, resolve);
  return rev;
}

function freezeDelivery(deliveryId) {
  const fixed = [];
  for (const di of all('SELECT * FROM delivery_items WHERE delivery_id=? AND item_id IS NOT NULL', [deliveryId])) {
    const rev = freezeDeliveryItem(di, 'delivery');
    if (rev) fixed.push(rev.rev);
  }
  if (fixed.length) log('delivery', deliveryId, 'Stand fixiert', `${fixed.length} Position(en) auf ihre Revision fixiert`);
  return fixed.length;
}

// Zurück aus „Geliefert": automatisch fixierte Revisionen folgen wieder der
// aktiven, von Hand gewählte bleiben. Die Strukturkopie entfällt.
function unfreezeDelivery(deliveryId) {
  run(`UPDATE delivery_items SET revision_id=NULL, rev_fixed=NULL
       WHERE delivery_id=? AND rev_fixed IN ('delivery','migration')`, [deliveryId]);
  run(`DELETE FROM delivery_structure
       WHERE delivery_item_id IN (SELECT id FROM delivery_items WHERE delivery_id=?)`, [deliveryId]);
  log('delivery', deliveryId, 'Stand gelöst', 'Status nicht mehr „Geliefert"');
}

// Statuswechsel eines Produktionsauftrags: fixieren beim Wechsel nach
// „Geliefert", lösen beim Wechsel zurück.
function onDeliveryStatusChange(deliveryId, prevStatus, newStatus) {
  if (newStatus === 'DELIVERED' && prevStatus !== 'DELIVERED') freezeDelivery(deliveryId);
  else if (prevStatus === 'DELIVERED' && newStatus !== 'DELIVERED') unfreezeDelivery(deliveryId);
}

// Gelieferte Produktionsaufträge, in denen diese Revision steckt — direkt
// als Position oder als Unterteil einer gelieferten Baugruppe.
function deliveriesOfRevision(revId) {
  return all(`SELECT d.id, d.number, d.title, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d LEFT JOIN customers c ON d.customer_id=c.id
    WHERE d.status='DELIVERED' AND d.id IN (
      SELECT di.delivery_id FROM delivery_items di WHERE di.revision_id=?
      UNION
      SELECT di.delivery_id FROM delivery_structure ds
        JOIN delivery_items di ON di.id=ds.delivery_item_id WHERE ds.revision_id=?)
    ORDER BY d.number`, [revId, revId]);
}

function deliveredLockMessage(list) {
  const nums = list.slice(0, 3).map(d => d.number).join(', ') + (list.length > 3 ? ` … (+${list.length - 3})` : '');
  return `Diese Revision wurde geliefert (${nums}) und ist fixiert. Änderungen bitte in einer neuen Revision.`;
}

// Schreibzugriff auf eine gelieferte Revision abweisen. true = abgewiesen.
function rejectIfDelivered(res, revId) {
  if (!revId) return false;
  const list = deliveriesOfRevision(revId);
  if (!list.length) return false;
  res.status(409).json({ error: deliveredLockMessage(list), delivered: list });
  return true;
}

// Dateien, Druckparameter und Stückliste einer Revision in eine neue
// übernehmen. „Neue Revision", ECO und Check-in nutzen denselben Weg, damit
// eine neue Revision immer gleich aussieht.
function copyRevisionContent(from, toRevId, toRevLabel) {
  let files = 0;
  for (const ds of all('SELECT * FROM datasets WHERE revision_id=?', [from.id])) {
    try {
      const ext = path.extname(ds.filename);
      const newFile = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
      fs.copyFileSync(path.join(FILES_DIR, ds.filename), path.join(FILES_DIR, newFile));
      const newName = (ds.original_name || '').replace(`_rev${from.rev}`, `_rev${toRevLabel}`);
      runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes,sha1,dims) VALUES (?,?,?,?,?,?,?,?,?)',
        [toRevId, ds.ds_type, newFile, newName || ds.original_name, ds.file_size, ds.version, ds.notes, ds.sha1 ?? null, ds.dims ?? null]);
      files++;
    } catch (e) { console.error('Datei-Kopie fehlgeschlagen:', e.message); }
  }
  const ps = get('SELECT * FROM print_settings WHERE revision_id=?', [from.id]);
  if (ps) {
    run(`INSERT INTO print_settings (revision_id,material,color,layer_height,infill,infill_pattern,supports,nozzle,print_temp,bed_temp,printer,notes,printer_cost_hr,filament_price_kg,filament_weight_total,part_weight,print_duration,raw_material_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [toRevId, ps.material, ps.color, ps.layer_height, ps.infill, ps.infill_pattern, ps.supports, ps.nozzle,
       ps.print_temp, ps.bed_temp, ps.printer, ps.notes, ps.printer_cost_hr, ps.filament_price_kg,
       ps.filament_weight_total, ps.part_weight, ps.print_duration, ps.raw_material_id]);
  }
  // Stückliste inklusive fixierter Revisionen
  for (const b of all('SELECT * FROM bom WHERE parent_rev_id=?', [from.id])) {
    run('INSERT INTO bom (parent_rev_id,child_item_id,quantity,unit,position,notes,child_rev_id) VALUES (?,?,?,?,?,?,?)',
      [toRevId, b.child_item_id, b.quantity, b.unit, b.position, b.notes, b.child_rev_id]);
  }
  for (const b of all('SELECT * FROM bom_std_parts WHERE parent_rev_id=?', [from.id])) {
    run('INSERT INTO bom_std_parts (parent_rev_id,std_part_id,quantity,unit,position,notes) VALUES (?,?,?,?,?,?)',
      [toRevId, b.std_part_id, b.quantity, b.unit, b.position, b.notes]);
  }
  return { files };
}
// Recursively sum dev hours (time_entries) for an item and all its BOM children via CTE.
// UNION (nicht UNION ALL): dedupliziert die Baumzeilen und beendet die Rekursion
// auch bei einem Stuecklisten-Zyklus. Am Ergebnis aendert das nichts, weil das
// abschliessende IN ohnehin nur die Menge der item_id auswertet.
function calcDevHours(itemId) {
  const row = get(`
    WITH RECURSIVE tree(item_id) AS (
      SELECT ?
      UNION
      SELECT b.child_item_id
      FROM bom b
      JOIN tree t ON b.parent_rev_id = (
        SELECT id FROM revisions WHERE item_id = t.item_id ORDER BY rowid DESC LIMIT 1
      )
    )
    SELECT COALESCE(SUM(te.hours), 0) as total
    FROM time_entries te
    WHERE te.item_id IN (SELECT item_id FROM tree)
  `, [itemId]);
  return row?.total || 0;
}
function calcManufacturingCost(revisionId) {
  if (!revisionId) return null;
  const ps = get('SELECT * FROM print_settings WHERE revision_id=?', [revisionId]);
  if (!ps) return null;
  const filament = (ps.filament_weight_total > 0 && ps.filament_price_kg > 0)
    ? (ps.filament_weight_total / 1000) * ps.filament_price_kg : 0;
  const machine = (ps.print_duration > 0 && ps.printer_cost_hr > 0)
    ? ps.print_duration * ps.printer_cost_hr : 0;
  if (filament === 0 && machine === 0) return null;
  return { filament, machine, total: filament + machine };
}

function calcItemCost(itemId, _visited) {
  const visited = _visited || new Set();
  if (visited.has(itemId)) return null;
  visited.add(itemId);
  const rev = getLatestRevision(itemId);
  if (!rev) return null;
  // Direct print_settings take priority (parts)
  const direct = calcManufacturingCost(rev.id);
  if (direct) return { ...direct, from_bom: false };
  // For assemblies: sum BOM children recursively
  const bom = all('SELECT child_item_id, quantity FROM bom WHERE parent_rev_id=?', [rev.id]);
  if (!bom.length) return null;
  let filament = 0, machine = 0, hasAny = false;
  for (const b of bom) {
    const c = calcItemCost(b.child_item_id, new Set(visited));
    if (!c) continue;
    filament += c.filament * b.quantity;
    machine  += c.machine  * b.quantity;
    hasAny = true;
  }
  if (!hasAny) return null;
  return { filament, machine, total: filament + machine, from_bom: true };
}

function log(type, id, action, details) {
  const u = userContext.getStore();
  db.run('INSERT INTO changelog (entity_type,entity_id,action,details,user_id,user_name) VALUES (?,?,?,?,?,?)',
    [type, id, action, details || '', u?.id ?? null, u?.name ?? null]);
  saveDb();
}

// 'full'   = DFT → REV → REL → ECO → OBS (Standard)
// 'simple' = ohne Freigabe: Revisionen bleiben DFT, neue Revision direkt anlegbar
function workflowMode()     { return getSetting('workflow_mode','full') === 'simple' ? 'simple' : 'full'; }
function itemSep()          { return getSetting('num_sep','-'); }
function segAsm()           { return getSetting('seg_asm','asm'); }
function segPrt()           { return getSetting('seg_prt','prt'); }
function segDoc()           { return getSetting('seg_doc','doc'); }
function itemPad(type)      {
  if (type==='asm') return parseInt(getSetting('pad_asm','3'))||3;
  if (type==='doc') return parseInt(getSetting('pad_doc','3'))||3;
  return parseInt(getSetting('pad_prt','3'))||3;
}
function nextRevLabel(current) {
  const fmt = getSetting('rev_format','num');
  if (fmt === 'letter') {
    if (!current) return 'A';
    const code = current.charCodeAt(0);
    return code >= 65 && code < 90 ? String.fromCharCode(code+1) : current; // A-Y → next letter
  }
  const n = parseInt(current);
  return String(isNaN(n) ? 1 : n + 1);
}
function firstRevLabel() {
  return getSetting('rev_format','num') === 'letter' ? 'A' : '1';
}

// ── KURZCODE ──────────────────────────────────────────────────
// Kurzer Code zum Aufdrucken auf 3D-Druckteile: "K7M" steht für das Teil,
// auf dem Teil steht "K7M-3" für Revision 3. Ohne Zeichen, die klein
// gedruckt leicht verwechselt werden (0 O Q 1 I L 2 Z 5 S 8 B G V).
// Zufällig statt fortlaufend: ein Tippfehler trifft so meist keinen
// gültigen Code statt eines anderen Teils.
const SHORT_CODE_ALPHABET = '34679ACDEFHJKMNPRTUWXY';
function newShortCode() {
  // 3 Zeichen reichen für rund 10'000 Teile; wird es eng, kommt eines dazu
  for (let len = 3; len <= 6; len++) {
    for (let i = 0; i < 50; i++) {
      let code = '';
      for (let k = 0; k < len; k++) code += SHORT_CODE_ALPHABET[crypto.randomInt(SHORT_CODE_ALPHABET.length)];
      if (!get('SELECT 1 as y FROM short_codes WHERE code=?', [code])) return code;
    }
  }
  throw new Error('Kein freier Kurzcode gefunden');
}
function assignShortCode(itemId) {
  const it = get('SELECT short_code FROM items WHERE id=?', [itemId]);
  if (!it) return null;
  if (it.short_code) return it.short_code;
  const code = newShortCode();
  db.run('INSERT INTO short_codes (code,item_id) VALUES (?,?)', [code, itemId]);
  db.run('UPDATE items SET short_code=? WHERE id=?', [code, itemId]);
  saveDb();
  return code;
}
// Text, der auf das Teil gedruckt wird: Kurzcode und Revision
const printCode = (shortCode, rev) => shortCode ? shortCode + (rev ? '-' + rev : '') : '';

// Findet ein Teil über das, was auf dem Teil oder dem Etikett steht:
// "K7M-3", "k7m 3", "K7M rev3", nur "K7M" — oder die volle Nummer mit
// Revision aus dem QR-Code des Etiketts ("P1042-prt-0012 rev3").
function findByPrintCode(q) {
  const s = String(q || '').trim();
  if (!s || s.length > 80) return null;
  let item = null, rev = null;
  const byCode = s.match(/^([A-Za-z0-9]{3,6})(?:(?:\s*[-./]\s*|\s+)(?:rev\s*)?([A-Za-z0-9]{1,3}))?$/i);
  if (byCode) {
    item = get('SELECT * FROM items WHERE short_code=?', [byCode[1].toUpperCase()]);
    rev = byCode[2] || null;
  }
  if (!item) {
    const byNumber = s.match(/^(\S+?)[\s_-]*rev\s*([A-Za-z0-9]{1,3})$/i);
    if (byNumber) {
      item = get('SELECT * FROM items WHERE LOWER(item_number)=LOWER(?)', [byNumber[1]]);
      rev = byNumber[2];
    }
  }
  if (!item) return null;
  const project = get('SELECT number, name FROM projects WHERE id=?', [item.project_id]) || {};
  const revision = rev
    ? get('SELECT id, rev, status FROM revisions WHERE item_id=? AND UPPER(rev)=UPPER(?)', [item.id, rev]) || null
    : null;
  return {
    item: { id: item.id, project_id: item.project_id, item_number: item.item_number, name: item.name,
      item_type: item.item_type, short_code: item.short_code,
      project_number: project.number, project_name: project.name },
    revision, rev_requested: rev, latest_revision: getLatestRevision(item.id) || null,
  };
}

function nextItemSeq(projectId, type) {
  const seg = type === 'asm' ? segAsm() : type === 'doc' ? segDoc() : segPrt();
  const sep = itemSep(); const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const rows = all('SELECT item_number FROM items WHERE project_id=? AND item_type=?', [projectId, type]);
  const re = new RegExp(esc(sep) + esc(seg) + esc(sep) + '(\\d+)$');
  const nums = rows.map(r => { const m = r.item_number.match(re); return m ? parseInt(m[1]) : 0; });
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(itemPad(type), '0');
}
function nextPrtNumber(projectId, asmNum) {
  const sep = itemSep(); const sa = segAsm(); const sp = segPrt();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  let rows;
  if (asmNum) {
    rows = all("SELECT item_number FROM items WHERE project_id=? AND item_type='prt' AND item_number LIKE ?", [projectId, `%${sep}${sa}${sep}${asmNum}${sep}${sp}${sep}%`]);
  } else {
    rows = all("SELECT item_number FROM items WHERE project_id=? AND item_type='prt' AND item_number NOT LIKE ?", [projectId, `%${sep}${sa}${sep}%${sep}${sp}${sep}%`]);
  }
  const re = new RegExp(esc(sep) + esc(sp) + esc(sep) + '(\\d+)$');
  const nums = rows.map(r => { const m = r.item_number.match(re); return m ? parseInt(m[1]) : 0; });
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(itemPad('prt'), '0');
}


function mimeType(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  const map = {
    pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    txt: 'text/plain', md: 'text/plain', csv: 'text/csv',
    gcode: 'text/plain', nc: 'text/plain', bgcode: 'text/plain',
    json: 'application/json',
    stl: 'model/stl', obj: 'model/obj', '3mf': 'model/3mf',
    step: 'application/step', stp: 'application/step',
    iges: 'application/iges', igs: 'application/iges',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    zip: 'application/zip', '7z': 'application/x-7z-compressed',
  };
  return map[ext] || 'application/octet-stream';
}

function guessType(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1);
  if (['stl','obj','3mf','step','stp','iges','igs','f3d','blend','fcstd','ipt','iam','sldprt','sldasm','par','asm','prt','catpart','catproduct','jt','x_t','x_b'].includes(ext)) return 'CAD';
  if (['gcode','bgcode','nc','cnc'].includes(ext)) return 'GCODE';
  if (['pdf'].includes(ext)) return 'PDF';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'IMAGE';
  if (['xlsx','xls','csv','ods'].includes(ext)) return 'SPREADSHEET';
  if (['docx','doc','odt','txt','md'].includes(ext)) return 'DOC';
  return 'OTHER';
}

// -- MULTER -----------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FILES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
  }
});
// defParamCharset utf8: sonst kommen Umlaute in hochgeladenen Dateinamen als Zeichensalat an
const upload = _keepUser(multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 }, defParamCharset: 'utf8' }));

// Fremde Webseiten abweisen. Ohne Anmeldung könnte sonst jede Seite, die im
// Browser auf diesem PC offen ist, per JavaScript Daten lesen, ändern oder
// löschen. Die eigene Oberfläche kommt vom selben Server: gleiche Herkunft
// (Origin), und der Host ist ein Name oder eine Adresse dieses PCs. Den Host
// prüfen hält DNS-Rebinding ab — eine fremde Domain, die auf 127.0.0.1 zeigt.
// Programme ohne Browser (Tests, curl) schicken keinen Origin.
app.use((req, res, next) => {
  if (!_isOwnHost(_hostOf(req))) return res.status(403).json({ error: 'Unbekannter Host: ' + (req.headers.host || '—') });
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let same = false;
    try { same = new URL(origin).host === req.headers.host; } catch {}
    if (!same) return res.status(403).json({ error: 'Anfrage von fremder Webseite abgelehnt' });
  }
  next();
});
app.use(express.json());

// ── BENUTZER ──────────────────────────────────────────────────
// Nachvollziehbarkeit, keine Sicherheit: Wer am PC sitzt, wählt sich aus —
// ohne Passwort, Admins auf Wunsch mit PIN. Allein (0–1 Personen) gibt es
// keine Auswahl; die eine Person darf alles und steht in jedem Eintrag. Ab
// zwei Personen fragt PLM beim Öffnen „Wer ist dran?" und nach einer Pause
// bei der nächsten Änderung noch einmal kurz nach. Die Sitzungen liegen nur
// im Speicher: Die Auswahl gilt, bis der Browser schliesst oder PLM endet.
// Rollen: user ändert, superuser gibt zusätzlich frei, admin darf alles.
const { AsyncLocalStorage } = require('node:async_hooks');
const userContext = new AsyncLocalStorage();   // Person der laufenden Anfrage, für log()
const ROLES = ['user', 'superuser', 'admin'];
const ROLE_RANK = { user: 1, superuser: 2, admin: 3 };
const ROLE_LABEL = { user: 'User', superuser: 'Superuser', admin: 'Admin' };
const sessions = new Map();                    // Token → { userId, lastActivity }
const sessionCookie = () => 'plm_user_' + PORT; // Cookies kennen keinen Port

function activeUsers() {
  return all(`SELECT id, name, role, pin_hash, last_seen_at FROM users WHERE active=1
    ORDER BY COALESCE(last_seen_at,'') DESC, name COLLATE NOCASE`);
}
const publicUser = u => u && ({ id: u.id, name: u.name, role: u.role, has_pin: !!u.pin_hash });
const userMode = users => users.length === 0 ? 'none' : users.length === 1 ? 'single' : 'team';
function idleMinutes() {
  const v = parseFloat(getSetting('user_idle_minutes', '30'));
  return Number.isFinite(v) && v > 0 ? v : 0;
}
function cookieOf(req, name) {
  for (const part of String(req.headers.cookie || '').split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

// Wer ist bei dieser Anfrage dran? Allein ist die eine Person Admin.
function resolveUser(req, users = activeUsers()) {
  const mode = userMode(users);
  if (mode === 'none') return { mode, user: null, session: null };
  if (mode === 'single') return { mode, user: { ...publicUser(users[0]), role: 'admin' }, session: null };
  const token = cookieOf(req, sessionCookie());
  const session = token ? sessions.get(token) : null;
  const u = session && users.find(x => x.id === session.userId);
  return { mode, user: u ? publicUser(u) : null, session: u ? session : null };
}

function startSession(req, res, userId) {
  const old = cookieOf(req, sessionCookie());
  if (old) sessions.delete(old);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId, lastActivity: Date.now() });
  res.setHeader('Set-Cookie', `${sessionCookie()}=${token}; HttpOnly; SameSite=Strict; Path=/`);
}
function endSessionsOf(userId) {
  for (const [token, s] of sessions) if (s.userId === userId) sessions.delete(token);
}

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + '$' + crypto.scryptSync(pin, salt, 32).toString('hex');
}
function checkPin(pin, stored) {
  const [salt, hash] = String(stored).split('$');
  const got = crypto.scryptSync(pin, salt, 32);
  const want = Buffer.from(hash || '', 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const validPin = pin => /^.{4,12}$/.test(String(pin));

// Was braucht eine Anfrage? null = niemand muss gewählt sein
// Diese Anfragen ändern nichts an den Daten
const NO_CHANGE = [/^(POST|DELETE) \/api\/session$/, /^POST \/api\/shutdown$/, /^POST \/api\/parse-(3mf|step-bom)$/,
  /^POST \/api\/print-(receipt|receipt-delivery|label)$/, /^POST \/api\/launch-cad$/, /^POST \/api\/checkout\/open$/,
  /^POST \/api\/datasets\/\d+\/open-in-slicer$/];
// Einstellungen, die jede Person für sich ändern darf
const PERSONAL_SETTINGS = ['font_scale', 'theme', 'sort_projects', 'sort_items', 'project_view',
  'customer_view', 'supplier_view', 'purchasing_tab'];
const ADMIN_ONLY = [
  /^PUT \/api\/settings$/,
  /^(POST|PUT) \/api\/users(\/\d+)?$/,
  /^(PUT|POST) \/api\/data-path(\/move)?$/,
  /^POST \/api\/backups\/(restore-upload|[^/]+\/restore)$/, /^DELETE \/api\/backups\/[^/]+$/,
  /^PUT \/api\/counters$/, /^POST \/api\/classifications\/rename$/,
  /^(POST|PUT|DELETE) \/api\/(printers|nozzles|material-presets)(\/\d+)?$/,
  /^DELETE \/api\/(projects|items|customers|suppliers)\/\d+$/,
];
function requiredRole(req) {
  const key = req.method + ' ' + req.path;
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || NO_CHANGE.some(r => r.test(key))) return null;
  if (key === 'PUT /api/settings' && Object.keys(req.body || {}).every(k => PERSONAL_SETTINGS.includes(k))) return 'user';
  if (ADMIN_ONLY.some(r => r.test(key))) return 'admin';
  if (/^PUT \/api\/revisions\/\d+\/status$/.test(key) && ['REL', 'OBS'].includes(req.body?.status)) return 'superuser';
  // Einen Änderungsantrag genehmigen oder ablehnen ist wie Freigeben
  if (/^PUT \/api\/ecrs\/\d+\/decision$/.test(key)) return 'superuser';
  return 'user';
}
const ROLE_ERROR = { superuser: 'Freigeben dürfen nur Superuser und Admins.', admin: 'Das dürfen nur Admins.' };

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const { mode, user, session } = resolveUser(req);
  req.plmUser = user;
  const need = requiredRole(req);
  if (need && mode === 'team') {
    if (!user) return res.status(401).json({ error: 'Bitte zuerst wählen, wer dran ist', need_user: true });
    const idle = idleMinutes();
    if (idle && Date.now() - session.lastActivity > idle * 60000) {
      return res.status(428).json({ error: `Weiter als ${user.name}?`, confirm_user: true, user });
    }
    if (ROLE_RANK[user.role] < ROLE_RANK[need]) return res.status(403).json({ error: ROLE_ERROR[need] });
  }
  if (session) session.lastActivity = Date.now();
  userContext.run(user, next);
});

function sessionInfo(user, users = activeUsers()) {
  return { mode: userMode(users), user, users: users.map(publicUser), idle_minutes: idleMinutes(), roles: ROLE_LABEL };
}
app.get('/api/session', (req, res) => {
  const users = activeUsers();
  res.json(sessionInfo(resolveUser(req, users).user, users));
});
app.post('/api/session', (req, res) => {
  const users = activeUsers();
  if (userMode(users) !== 'team') return res.json(sessionInfo(resolveUser(req, users).user, users));
  const u = users.find(x => x.id === Number(req.body?.user_id));
  if (!u) return res.status(400).json({ error: 'Diese Person gibt es nicht mehr' });
  // Die PIN schützt den Wechsel zu einem Admin — wer nach einer Pause nur weitermacht, braucht sie nicht
  const continues = resolveUser(req, users).user?.id === u.id;
  if (u.pin_hash && !continues && !checkPin(String(req.body?.pin ?? ''), u.pin_hash)) {
    return res.status(403).json({ error: 'PIN stimmt nicht', pin_required: true });
  }
  startSession(req, res, u.id);
  run("UPDATE users SET last_seen_at=datetime('now') WHERE id=?", [u.id]);
  saveDb();
  res.json(sessionInfo(publicUser(u)));
});
app.delete('/api/session', (req, res) => {
  const token = cookieOf(req, sessionCookie());
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${sessionCookie()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.get('/api/users', (req, res) => {
  res.json(all(`SELECT id, name, role, active, created_at, last_seen_at, pin_hash IS NOT NULL AS has_pin
    FROM users ORDER BY active DESC, name COLLATE NOCASE`));
});
const cleanName = n => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
const nameTaken = (name, exceptId) => all('SELECT id, name FROM users WHERE active=1')
  .some(u => u.id !== exceptId && u.name.toLowerCase() === name.toLowerCase());

app.post('/api/users', (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  if (nameTaken(name)) return res.status(400).json({ error: `„${name}" gibt es schon` });
  const before = activeUsers();
  // Die erste Person ist allein und darf alles
  const role = before.length === 0 ? 'admin' : (ROLES.includes(req.body?.role) ? req.body.role : 'user');
  const pin = req.body?.pin ? String(req.body.pin) : '';
  if (pin && !validPin(pin)) return res.status(400).json({ error: 'Die PIN braucht 4 bis 12 Zeichen' });
  const id = runGetId('INSERT INTO users (name, role, pin_hash) VALUES (?,?,?)',
    [name, role, role === 'admin' && pin ? hashPin(pin) : null]);
  log('user', id, 'Person angelegt', `${name} (${ROLE_LABEL[role]})`);
  // Aus „allein" wird „Team": Die bisherige Person bleibt an diesem Gerät gewählt
  if (before.length === 1 && !resolveUser(req).session) startSession(req, res, before[0].id);
  res.json(publicUser(get('SELECT * FROM users WHERE id=?', [id])));
});

app.put('/api/users/:id', (req, res) => {
  const u = get('SELECT * FROM users WHERE id=?', [req.params.id]);
  if (!u) return res.status(404).json({ error: 'Nicht gefunden' });
  const b = req.body || {};
  const name = b.name !== undefined ? cleanName(b.name) : u.name;
  const role = b.role !== undefined ? b.role : u.role;
  const active = b.active !== undefined ? (b.active ? 1 : 0) : u.active;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unbekannte Rolle' });
  if (active && nameTaken(name, u.id)) return res.status(400).json({ error: `„${name}" gibt es schon` });
  const otherAdmins = all("SELECT id FROM users WHERE active=1 AND role='admin' AND id!=?", [u.id]);
  if (!otherAdmins.length && (role !== 'admin' || !active)) {
    return res.status(400).json({ error: 'Es braucht mindestens einen aktiven Admin' });
  }
  let pinHash = u.pin_hash;
  if ('pin' in b) {
    if (b.pin && !validPin(b.pin)) return res.status(400).json({ error: 'Die PIN braucht 4 bis 12 Zeichen' });
    pinHash = b.pin ? hashPin(String(b.pin)) : null;
  }
  if (role !== 'admin') pinHash = null;   // PIN nur für Admins
  run('UPDATE users SET name=?, role=?, active=?, pin_hash=? WHERE id=?', [name, role, active, pinHash, u.id]);
  if (!active) endSessionsOf(u.id);
  const changes = [name !== u.name && `Name ${u.name} → ${name}`, role !== u.role && `Rolle ${ROLE_LABEL[role]}`,
    active !== u.active && (active ? 'aktiviert' : 'deaktiviert'), pinHash !== u.pin_hash && (pinHash ? 'PIN gesetzt' : 'PIN entfernt')]
    .filter(Boolean);
  if (changes.length) log('user', u.id, 'Person geändert', `${name}: ${changes.join(', ')}`);
  res.json(publicUser(get('SELECT * FROM users WHERE id=?', [u.id])));
});

// multer ruft next() aus dem Datenstrom des Uploads auf, dort ist die Person
// der Anfrage nicht mehr bekannt — für die Route wieder herstellen
function _keepUser(m) {
  for (const k of ['single', 'array', 'fields', 'none', 'any']) {
    const orig = m[k].bind(m);
    m[k] = (...args) => {
      const mw = orig(...args);
      return (req, res, next) => mw(req, res, err => userContext.run(req.plmUser ?? null, () => next(err)));
    };
  }
  return m;
}

// Während einer laufenden Datenverschiebung keine Schreibzugriffe zulassen,
// sonst landen Änderungen im alten Verzeichnis und gehen verloren.
app.use((req, res, next) => {
  if (dataMove.running && req.method !== 'GET' && !req.path.startsWith('/api/data-path')) {
    return res.status(503).json({ error: 'Daten werden gerade verschoben — bitte warten.' });
  }
  next();
});
// no-cache: Der Browser fragt bei jedem Laden nach, ob sich die Datei geändert
// hat — nach einem Update gibt es also nie ein veraltetes Skript. Unverändert
// antwortet der Server nur mit 304, und der Browser nutzt seine Kopie samt
// bereits übersetztem JavaScript, statt alles neu zu laden.
app.use(express.static(FRONTEND_DIR, { setHeaders: (res, filePath) => {
  if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
  }
}}));

// ==============================================================
// PROJECTS
// ==============================================================
app.get('/api/projects', (req, res) => {
  const projects = all('SELECT * FROM projects ORDER BY pinned DESC, number DESC');
  const itemCounts = {};
  all('SELECT project_id, item_type, COUNT(*) as c FROM items GROUP BY project_id, item_type').forEach(r => {
    const t = itemCounts[r.project_id] || (itemCounts[r.project_id] = { total: 0 });
    t.total += r.c;
    t[r.item_type] = (t[r.item_type] || 0) + r.c;
  });
  const fileCounts = {};
  all('SELECT i.project_id as pid, COUNT(*) as c FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id GROUP BY i.project_id').forEach(r => {
    fileCounts[r.pid] = r.c;
  });
  projects.forEach(p => {
    const t = itemCounts[p.id] || {};
    p.item_count = t.total || 0;
    p.asm_count  = t.asm   || 0;
    p.prt_count  = t.prt   || 0;
    p.doc_count  = t.doc   || 0;
    p.file_count = fileCounts[p.id] || 0;
  });
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, description, customer, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const number = nextProjectNumber();
  const id = runGetId('INSERT INTO projects (number,name,description,customer,color) VALUES (?,?,?,?,?)',
    [number, name, description||'', customer||'', color||null]);
  log('project', id, 'Erstellt', number + ' – ' + name);
  res.json(get('SELECT * FROM projects WHERE id=?', [id]));
});

app.get('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  p.items = all('SELECT * FROM items WHERE project_id=? ORDER BY item_type, item_number DESC', [p.id]);
  p.items.forEach(item => {
    item.latest_revision = getLatestRevision(item.id);
    if (item.latest_revision && item.item_type === 'asm') {
      item.latest_revision.bom = all(
        'SELECT b.child_item_id, b.quantity, b.unit, b.position FROM bom b WHERE b.parent_rev_id=? ORDER BY b.position',
        [item.latest_revision.id]
      );
    }
  });
  p.changelog = all("SELECT * FROM changelog WHERE entity_type='project' AND entity_id=? ORDER BY created_at DESC LIMIT 20", [p.id]);
  p.documents = all('SELECT * FROM documents WHERE project_id=? ORDER BY uploaded_at DESC', [p.id]);
  res.json(p);
});

app.put('/api/projects/:id', (req, res) => {
  const { name, description, customer, color } = req.body;
  run("UPDATE projects SET name=?,description=?,customer=?,color=?,updated_at=datetime('now') WHERE id=?",
    [name, description, customer, color||null, req.params.id]);
  log('project', req.params.id, 'Geändert', name);
  res.json(get('SELECT * FROM projects WHERE id=?', [req.params.id]));
});

app.post('/api/projects/:id/pin', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  const pinned = p.pinned ? 0 : 1;
  run('UPDATE projects SET pinned=? WHERE id=?', [pinned, req.params.id]);
  res.json({ pinned });
});

app.delete('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  const revIds = all('SELECT r.id FROM revisions r JOIN items i ON r.item_id=i.id WHERE i.project_id=?', [p.id]);
  // Dateien erst nach erfolgreichem Commit löschen (nicht zurückrollbar)
  const filesToDelete = [];
  tx(() => {
    revIds.forEach(r => {
      all('SELECT filename FROM datasets WHERE revision_id=?', [r.id]).forEach(f => filesToDelete.push(f.filename));
      run('DELETE FROM datasets WHERE revision_id=?', [r.id]);
      run('DELETE FROM bom WHERE parent_rev_id=?', [r.id]);
      run('DELETE FROM print_settings WHERE revision_id=?', [r.id]);
    });
    const itemIds = all('SELECT id FROM items WHERE project_id=?', [p.id]);
    itemIds.forEach(i => {
      run('DELETE FROM revisions WHERE item_id=?', [i.id]);
      run('DELETE FROM changelog WHERE entity_type=? AND entity_id=?', ['item', i.id]);
    });
    run('DELETE FROM items WHERE project_id=?', [p.id]);
    run('DELETE FROM changelog WHERE entity_type=? AND entity_id=?', ['project', p.id]);
    run('DELETE FROM projects WHERE id=?', [p.id]);
  });
  filesToDelete.forEach(fn => trashFile(fn));
  res.json({ success: true });
});

// ==============================================================
// AUSSENMASSE AUS STL
// ==============================================================
// Achsparallele Hülle über alle Eckpunkte, so wie das Teil in der Datei
// liegt. STL kennt keine Einheit — Slicer und CAD rechnen in mm.
function stlDimensions(buf) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const add = (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (z < z0) z0 = z; if (z > z1) z1 = z;
  };
  // Binär erkennen wie der Viewer (parseSTL): Grösse passt genau zur Dreieckzahl.
  // Viele binäre Dateien beginnen trotzdem mit „solid" im Kopf.
  const cnt = buf.length >= 84 ? buf.readUInt32LE(80) : -1;
  if (cnt >= 0 && buf.length === 84 + cnt * 50) {
    for (let i = 0; i < cnt; i++) {
      for (let v = 0, o = 84 + i * 50 + 12; v < 3; v++, o += 12) {
        add(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8));
      }
    }
  } else {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    const txt = buf.toString('latin1');
    let m;
    while ((m = re.exec(txt)) !== null) add(+m[1], +m[2], +m[3]);
  }
  if (x1 < x0) return null;
  const r = v => Math.round(v * 100) / 100;
  return [r(x1 - x0), r(y1 - y0), r(z1 - z0)];
}
// Wie _fileHash: einmal gerechnet, dann aus der DB. Nur für STL-Dateien.
function _datasetDims(ds) {
  if (path.extname(ds.original_name || ds.filename || '').toLowerCase() !== '.stl') return null;
  if (ds.dims === null || ds.dims === undefined) {
    let d = null;
    const p = path.join(FILES_DIR, ds.filename);
    // Sehr grosse Dateien nicht lesen — gleiche Grenze wie die Prüfsumme
    try { if (fs.statSync(p).size <= COMPARE_HASH_LIMIT) d = stlDimensions(fs.readFileSync(p)); }
    catch (e) { console.error('STL-Masse nicht lesbar:', ds.filename, e.message); }
    ds.dims = d ? JSON.stringify(d) : '';
    if (ds.id) run('UPDATE datasets SET dims=? WHERE id=?', [ds.dims, ds.id]);
  }
  try { return ds.dims ? JSON.parse(ds.dims) : null; } catch { return null; }
}

// ==============================================================
// ITEMS
// ==============================================================
app.get('/api/items/:id', (req, res) => {
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  item.project = get('SELECT * FROM projects WHERE id=?', [item.project_id]);
  item.revisions = all('SELECT * FROM revisions WHERE item_id=? ORDER BY rowid DESC', [item.id]);
  item.revisions.forEach(rev => {
    rev.datasets = all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, uploaded_at', [rev.id]);
    rev.datasets.forEach(d => { d.dims = _datasetDims(d); });
    // Rohmaterial mit Namen — das PDF-Datenblatt zeigt sonst nur die ID
    rev.print_settings = get(`SELECT ps.*, rm.name AS raw_material_name FROM print_settings ps
      LEFT JOIN raw_materials rm ON rm.id=ps.raw_material_id WHERE ps.revision_id=?`, [rev.id]) || null;
    // Gelieferte Revisionen sind fixiert (siehe GELIEFERTER STAND)
    rev.delivered = deliveriesOfRevision(rev.id);
    if (item.item_type === 'asm') {
      rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type, i.default_price FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
      rev.bom.forEach(b => {
        b.child_active_rev = getActiveRevision(b.child_item_id);
        // child_rev_id ist normalerweise NULL: dann folgt die Position automatisch
        // der aktiven Revision. Ist sie gesetzt, bleibt die Position auf diesem Stand.
        b.child_pinned_rev = b.child_rev_id
          ? get('SELECT * FROM revisions WHERE id=?', [b.child_rev_id]) : null;
        b.child_effective_rev = b.child_pinned_rev || b.child_active_rev;
        b.rev_outdated = !!(b.child_pinned_rev && b.child_active_rev
          && b.child_pinned_rev.id !== b.child_active_rev.id);
        b.dev_hours = calcDevHours(b.child_item_id);
      });
      rev.bom_std = all('SELECT bs.*, sp.designation, sp.name as sp_name, sp.material, sp.size, sp.unit_price, sp.standard, sp.std_number FROM bom_std_parts bs JOIN standard_parts sp ON bs.std_part_id=sp.id WHERE bs.parent_rev_id=? ORDER BY bs.position', [rev.id]);
    }
  });
  item.changelog = all("SELECT * FROM changelog WHERE entity_type='item' AND entity_id=? ORDER BY created_at DESC", [item.id]);
  item.children = all('SELECT * FROM items WHERE parent_id=?', [item.id]);
  item.effective_weight_g = getEffectiveWeight(item.id);
  item.variants = item.variant_group_id
    ? all('SELECT id,item_number,name,item_type FROM items WHERE variant_group_id=? AND id!=? ORDER BY item_number', [item.variant_group_id, item.id])
    : [];
  item.delivered = item.revisions.some(r => r.delivered.length);
  // Fuer das Datenblatt: Entwicklungszeit (BOM-Rollup) und verknuepfter Lagerbestand
  item.dev_hours = calcDevHours(item.id);
  item.inventory = all(`SELECT id, name, sku, unit, stock_qty, min_qty, price_per_unit, notes
    FROM inventory_items WHERE item_id=? ORDER BY name`, [item.id]);
  // Offene Änderungsanträge, die dieses Teil betreffen
  item.ecrs = all(`SELECT e.id, e.number, e.title, e.status FROM ecr_items ei JOIN ecrs e ON e.id=ei.ecr_id
    WHERE ei.item_id=? AND e.status IN ('OPEN','APPROVED','IN_WORK') ORDER BY e.id DESC`, [item.id]);
  res.json(item);
});

app.post('/api/projects/:projectId/items', (req, res) => {
  const { name, description, item_type, parent_id, source_url, default_price } = req.body;
  if (!name || !item_type) return res.status(400).json({ error: 'Name und Typ fehlen' });
  const project = get('SELECT * FROM projects WHERE id=?', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

  let item_number;
  if (item_type === 'asm') {
    item_number = project.number + itemSep() + segAsm() + itemSep() + nextItemSeq(project.id, 'asm');
  } else if (item_type === 'doc') {
    item_number = project.number + itemSep() + segDoc() + itemSep() + nextItemSeq(project.id, 'doc');
  } else {
    if (parent_id) {
      const parent = get('SELECT * FROM items WHERE id=?', [parent_id]);
      const asmMatch = parent ? parent.item_number.match(/-asm-(\d+)/) : null;
      const asmNum = asmMatch ? asmMatch[1] : null;
      item_number = asmNum
        ? project.number + itemSep() + segAsm() + itemSep() + asmNum + itemSep() + segPrt() + itemSep() + nextPrtNumber(project.id, asmNum)
        : project.number + itemSep() + segPrt() + itemSep() + nextPrtNumber(project.id, null);
    } else {
      item_number = project.number + itemSep() + segPrt() + itemSep() + nextPrtNumber(project.id, null);
    }
  }

  // Klassifizierung ableiten statt abfragen: mit Quelle/Link ist es in aller
  // Regel ein Kaufteil, ohne ein Eigenteil. Leere Einstellung = keine Zuordnung.
  const derivedClass = canonicalClass(req.body.classification
    || getSetting(source_url ? 'default_class_bought' : 'default_class_own', ''));

  const itemId = runGetId('INSERT INTO items (project_id,parent_id,item_type,item_number,name,description,source_url,default_price,classification) VALUES (?,?,?,?,?,?,?,?,?)',
    [project.id, parent_id || null, item_type, item_number, name, description || '', source_url || null, default_price != null ? parseFloat(default_price) : null, derivedClass]);
  assignShortCode(itemId);
  run('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, firstRevLabel(), 'DFT', 'Erste Revision']);
  log('item', itemId, 'Erstellt', item_type + ' ' + item_number + ' rev' + firstRevLabel());
  res.json(get('SELECT * FROM items WHERE id=?', [itemId]));
});

app.put('/api/items/:id', (req, res) => {
  const { name, description, source_url, default_price, classification, weight_g, notes } = req.body;
  // notes nur schreiben, wenn das Feld im Request vorkommt — sonst wuerden
  // Aufrufe ohne notes (z.B. Preis-Inline-Edit) die Notizen leeren.
  const keepNotes = !Object.prototype.hasOwnProperty.call(req.body, 'notes');
  const before = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  run(`UPDATE items SET name=?,description=?,source_url=?,default_price=?,classification=?,weight_g=?,
       notes=CASE WHEN ? THEN notes ELSE ? END WHERE id=?`,
    [name, description, source_url||null, default_price != null ? parseFloat(default_price) : null, canonicalClass(classification), weight_g != null ? parseFloat(weight_g) : null,
     keepNotes ? 1 : 0, notes || null, req.params.id]);
  // Hinweise genauso: nur die schreiben, die mitgeschickt werden
  for (const k of Object.keys(HINT_LABEL)) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      run(`UPDATE items SET ${k}=? WHERE id=?`, [String(req.body[k] || '').trim() || null, req.params.id]);
    }
  }
  const after = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  // Der Verkaufspreis ist kaufmännisch und braucht keine neue Revision —
  // nachvollziehbar bleibt er über einen eigenen Eintrag mit alt → neu und Grund.
  const priceChanged = before && before.default_price !== after.default_price;
  if (priceChanged) {
    const chf = v => v == null ? '—' : v.toFixed(2);
    const reason = String(req.body.price_reason || '').trim();
    log('item', req.params.id, 'Preis geändert',
      `VP ${chf(before.default_price)} → ${chf(after.default_price)} CHF` + (reason ? ' · ' + reason : ''));
  }
  // Hinweise sind oft sicherheitsrelevant — darum mit vollem Wortlaut im Protokoll
  const hintsChanged = before ? Object.keys(HINT_LABEL).filter(k => before[k] !== after[k]) : [];
  for (const k of hintsChanged) {
    log('item', req.params.id, `${HINT_LABEL[k]} ${after[k] ? 'gesetzt' : 'entfernt'}`, after[k] || before[k]);
  }
  const otherChanged = !before || ['name', 'description', 'source_url', 'classification', 'weight_g', 'notes']
    .some(k => before[k] !== after[k]);
  if (otherChanged || !(priceChanged || hintsChanged.length)) log('item', req.params.id, 'Geändert', name);
  res.json(after);
});

app.post('/api/items/:id/link-variant', (req, res) => {
  const { other_item_id } = req.body;
  const a = get('SELECT id,variant_group_id FROM items WHERE id=?', [req.params.id]);
  const b = get('SELECT id,variant_group_id FROM items WHERE id=?', [other_item_id]);
  if (!a || !b || a.id === b.id) return res.status(400).json({ error: 'Ungültige Items' });

  let groupId;
  if (a.variant_group_id && b.variant_group_id) {
    // merge: move all of b's group into a's group
    groupId = a.variant_group_id;
    run('UPDATE items SET variant_group_id=? WHERE variant_group_id=?', [groupId, b.variant_group_id]);
  } else if (a.variant_group_id) {
    groupId = a.variant_group_id;
    run('UPDATE items SET variant_group_id=? WHERE id=?', [groupId, b.id]);
  } else if (b.variant_group_id) {
    groupId = b.variant_group_id;
    run('UPDATE items SET variant_group_id=? WHERE id=?', [groupId, a.id]);
  } else {
    const maxRow = get('SELECT COALESCE(MAX(variant_group_id),0)+1 as next FROM items');
    groupId = maxRow.next;
    run('UPDATE items SET variant_group_id=? WHERE id IN (?,?)', [groupId, a.id, b.id]);
  }
  log('item', a.id, 'Variante verknüpft', 'mit Item ' + b.id + ' (Gruppe ' + groupId + ')');
  res.json({ ok: true, group_id: groupId });
});

app.delete('/api/items/:id/variant-group', (req, res) => {
  const item = get('SELECT id,variant_group_id FROM items WHERE id=?', [req.params.id]);
  if (!item || !item.variant_group_id) return res.status(400).json({ error: 'Item ist in keiner Variantengruppe' });
  run('UPDATE items SET variant_group_id=NULL WHERE id=?', [item.id]);
  log('item', item.id, 'Variante entfernt', 'aus Gruppe ' + item.variant_group_id);
  res.json({ ok: true });
});

app.get('/api/items/:id/where-used', (req, res) => {
  const rows = all(`
    SELECT i.id, i.item_number, i.name, i.item_type, i.classification,
      r.id as rev_id, r.rev, r.status,
      p.id as project_id, p.number as project_number, p.name as project_name,
      b.quantity, b.unit, b.child_rev_id
    FROM bom b
    JOIN revisions r ON b.parent_rev_id = r.id
    JOIN items i ON r.item_id = i.id
    JOIN projects p ON i.project_id = p.id
    WHERE b.child_item_id = ?
    ORDER BY p.number, i.item_number, CAST(r.rev AS INTEGER)`, [req.params.id]);
  // Auf welchen Stand ist diese Verwendung fixiert? NULL = folgt automatisch.
  const active = getActiveRevision(req.params.id);
  rows.forEach(r => {
    r.pinned_rev = r.child_rev_id ? get('SELECT id, rev, status FROM revisions WHERE id=?', [r.child_rev_id]) : null;
    r.rev_outdated = !!(r.pinned_rev && active && r.pinned_rev.id !== active.id);
  });
  res.json(rows);
});

// Abhaengigkeitsgraph fuer die Mindmap-Ansicht.
// Nach oben: wer verwendet dieses Item (Where-Used, rekursiv).
// Nach unten: was verwendet dieses Item (BOM, rekursiv), inklusive Normteile.
// Beruecksichtigt nur die jeweils neueste Revision — Verwendungen, die nur in
// aelteren Revisionen stehen, werden gezaehlt und als historic_up gemeldet.
app.get('/api/items/:id/graph', (req, res) => {
  const rootId = parseInt(req.params.id);
  const root = get('SELECT * FROM items WHERE id=?', [rootId]);
  if (!root) return res.status(404).json({ error: 'Nicht gefunden' });

  const MAX_DEPTH = 6;
  const MAX_NODES = 400;
  const up   = Math.min(parseInt(req.query.up)   || 3, MAX_DEPTH);
  const down = Math.min(parseInt(req.query.down) || 3, MAX_DEPTH);

  const latestRevId = id => get('SELECT id FROM revisions WHERE item_id=? ORDER BY rowid DESC LIMIT 1', [id])?.id || null;

  const nodes = new Map();   // key -> node
  const edges = [];          // { from, to, quantity, unit }
  const edgeSeen = new Set();
  let truncatedUp = false, truncatedDown = false;

  function addItemNode(row, level) {
    const key = 'i' + row.id;
    const existing = nodes.get(key);
    if (existing) {
      // Naeher am Zentrum gewinnt, damit die Ebene stabil bleibt
      if (Math.abs(level) < Math.abs(existing.level)) existing.level = level;
      return existing;
    }
    const rev = get('SELECT rev, status FROM revisions WHERE item_id=? ORDER BY rowid DESC LIMIT 1', [row.id]);
    const proj = row.project_id ? get('SELECT number FROM projects WHERE id=?', [row.project_id]) : null;
    const node = {
      key, kind: 'item', id: row.id, level,
      item_number: row.item_number, name: row.name, item_type: row.item_type,
      classification: row.classification || null,
      rev: rev?.rev || null, status: rev?.status || null,
      project_number: proj?.number || null,
      is_root: row.id === rootId,
    };
    nodes.set(key, node);
    return node;
  }

  function addEdge(fromKey, toKey, quantity, unit, pinnedRev) {
    const sig = fromKey + '>' + toKey;
    if (edgeSeen.has(sig)) return;
    edgeSeen.add(sig);
    edges.push({ from: fromKey, to: toKey, quantity: quantity ?? null,
      unit: unit || null, pinned_rev: pinnedRev || null });
  }

  addItemNode(root, 0);

  // ── nach unten: BOM ──
  // useRevId: ist die Position auf eine Revision fixiert, wird deren
  // Unterstueckliste aufgeklappt statt der aktuellsten.
  (function walkDown(itemId, fromKey, depth, path, useRevId) {
    if (depth > down) { truncatedDown = true; return; }
    if (nodes.size >= MAX_NODES) { truncatedDown = true; return; }
    const revId = useRevId || latestRevId(itemId);
    if (!revId) return;

    const kids = all(`SELECT b.quantity, b.unit, b.child_rev_id, i.*
      FROM bom b JOIN items i ON i.id=b.child_item_id
      WHERE b.parent_rev_id=? ORDER BY b.position`, [revId]);
    for (const k of kids) {
      if (path.includes(k.id)) continue;            // Zyklus
      const node = addItemNode(k, depth);
      const pin = k.child_rev_id
        ? get('SELECT rev FROM revisions WHERE id=?', [k.child_rev_id]) : null;
      addEdge(fromKey, node.key, k.quantity, k.unit, pin?.rev || null);
      walkDown(k.id, node.key, depth + 1, path.concat(k.id), k.child_rev_id || null);
    }

    // Normteile sind Blaetter, keine Items
    const std = all(`SELECT bs.quantity, bs.unit, sp.id, sp.designation, sp.name as sp_name, sp.std_number
      FROM bom_std_parts bs JOIN standard_parts sp ON bs.std_part_id=sp.id
      WHERE bs.parent_rev_id=? ORDER BY bs.position`, [revId]);
    for (const sp of std) {
      const key = 's' + sp.id + '@' + itemId;
      if (!nodes.has(key)) {
        nodes.set(key, {
          key, kind: 'std', id: sp.id, level: depth,
          item_number: sp.std_number || sp.designation || '—',
          name: sp.sp_name || sp.designation || 'Normteil',
          item_type: 'std', classification: 'Normteil',
          rev: null, status: null, project_number: null, is_root: false,
        });
      }
      addEdge(fromKey, key, sp.quantity, sp.unit, null);
    }
  })(rootId, 'i' + rootId, 1, [rootId], null);

  // ── nach oben: Where-Used ──
  let historicUp = 0;
  (function walkUp(itemId, toKey, depth, path) {
    if (depth > up) { truncatedUp = true; return; }
    if (nodes.size >= MAX_NODES) { truncatedUp = true; return; }

    const parents = all(`SELECT r.id as rev_id, r.item_id, b.quantity, b.unit, b.child_rev_id
      FROM bom b JOIN revisions r ON b.parent_rev_id=r.id
      WHERE b.child_item_id=?`, [itemId]);

    for (const pr of parents) {
      if (pr.rev_id !== latestRevId(pr.item_id)) { historicUp++; continue; }
      if (path.includes(pr.item_id)) continue;      // Zyklus
      const prow = get('SELECT * FROM items WHERE id=?', [pr.item_id]);
      if (!prow) continue;
      const node = addItemNode(prow, -depth);
      const pin = pr.child_rev_id
        ? get('SELECT rev FROM revisions WHERE id=?', [pr.child_rev_id]) : null;
      addEdge(node.key, toKey, pr.quantity, pr.unit, pin?.rev || null);
      walkUp(pr.item_id, node.key, depth + 1, path.concat(pr.item_id));
    }
  })(rootId, 'i' + rootId, 1, [rootId]);

  res.json({
    root: 'i' + rootId,
    nodes: [...nodes.values()],
    edges,
    historic_up: historicUp,
    truncated: { up: truncatedUp, down: truncatedDown },
    limits: { up, down, max_nodes: MAX_NODES },
  });
});

// Angebote sind die Phase QUOTE eines Auftrags und stecken in orders. Die alte
// Angebotstabelle ist nur noch Archiv — ihre Einträge haben alle einen Auftrag.
app.get('/api/items/:id/erp-usage', (req, res) => {
  const id = req.params.id;
  const orders = all(`
    SELECT o.id, o.number, o.title, o.status, o.order_date,
      oi.quantity, oi.unit, oi.unit_price
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE oi.item_id = ? ORDER BY o.order_date DESC, o.id DESC`, [id]);
  const active = getActiveRevision(id);
  // Welcher Stand steckt in welchem Produktionsauftrag? Vor der Lieferung die
  // aktive (oder von Hand gewählte) Revision, danach die fixierte.
  const deliveries = all(`
    SELECT d.id, d.number, d.title, d.status, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) as customer_name,
      di.quantity, di.unit, di.revision_id, di.rev_fixed, r.rev, r.status as rev_status
    FROM delivery_items di JOIN deliveries d ON di.delivery_id = d.id
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN revisions r ON r.id = di.revision_id
    WHERE di.item_id = ? ORDER BY d.delivery_date DESC, d.id DESC`, [id]);
  // Als Unterteil einer gelieferten Baugruppe
  const viaAssembly = all(`
    SELECT d.id, d.number, d.title, d.status, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) as customer_name,
      di.quantity * ds.unit_qty as quantity, di.unit, ds.revision_id, ds.rev,
      r.status as rev_status, i.item_number as via_item_number, i.name as via_name
    FROM delivery_structure ds
    JOIN delivery_items di ON di.id = ds.delivery_item_id
    JOIN deliveries d ON d.id = di.delivery_id
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN revisions r ON r.id = ds.revision_id
    LEFT JOIN items i ON i.id = di.item_id
    WHERE ds.item_id = ? AND d.status = 'DELIVERED'
    ORDER BY d.delivery_date DESC, d.id DESC`, [id]);
  for (const d of [...deliveries, ...viaAssembly]) {
    if (!d.revision_id && active) { d.rev = active.rev; d.rev_status = active.status; d.rev_auto = true; }
    d.rev_outdated = !!(d.revision_id && active && d.revision_id !== active.id);
  }
  res.json({ orders, deliveries, via_assembly: viaAssembly, active_rev: active ? { id: active.id, rev: active.rev } : null });
});

app.put('/api/items/:id/move', (req, res) => {
  const { target_project_id } = req.body;
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const targetProject = get('SELECT * FROM projects WHERE id=?', [target_project_id]);
  if (!targetProject) return res.status(400).json({ error: 'Zielprojekt nicht gefunden' });
  if (item.project_id === parseInt(target_project_id))
    return res.status(400).json({ error: 'Item ist bereits in diesem Projekt' });
  const oldProject = get('SELECT * FROM projects WHERE id=?', [item.project_id]);

  function moveTree(itemId, newParentId) {
    const it = get('SELECT * FROM items WHERE id=?', [itemId]);
    if (!it) return;
    let newNum;
    if (it.item_type === 'asm') {
      newNum = targetProject.number + itemSep() + segAsm() + itemSep() + nextItemSeq(targetProject.id, 'asm');
    } else if (it.item_type === 'doc') {
      newNum = targetProject.number + itemSep() + segDoc() + itemSep() + nextItemSeq(targetProject.id, 'doc');
    } else {
      if (newParentId) {
        const np = get('SELECT * FROM items WHERE id=?', [newParentId]);
        const asmMatch = np ? np.item_number.match(/-asm-(\d+)/) : null;
        const asmNum = asmMatch ? asmMatch[1] : null;
        newNum = asmNum
          ? targetProject.number + itemSep() + segAsm() + itemSep() + asmNum + itemSep() + segPrt() + itemSep() + nextPrtNumber(targetProject.id, asmNum)
          : targetProject.number + itemSep() + segPrt() + itemSep() + nextPrtNumber(targetProject.id, null);
      } else {
        newNum = targetProject.number + itemSep() + segPrt() + itemSep() + nextPrtNumber(targetProject.id, null);
      }
    }
    run('UPDATE items SET project_id=?,parent_id=?,item_number=? WHERE id=?',
      [targetProject.id, newParentId, newNum, itemId]);
    all('SELECT id FROM items WHERE parent_id=?', [itemId]).forEach(c => moveTree(c.id, itemId));
  }

  moveTree(item.id, null);
  log('item', item.id, 'Verschoben', `→ Projekt ${targetProject.number} (${targetProject.name})`);
  log('project', targetProject.id, 'Item erhalten', `${item.item_type} von Projekt ${oldProject?.number||'?'}`);
  saveDb();
  res.json({ success: true, item: get('SELECT * FROM items WHERE id=?', [item.id]) });
});

app.delete('/api/items/:id', (req, res) => {
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const revs = all('SELECT id FROM revisions WHERE item_id=?', [item.id]);
  // Gelieferte Items nur über Einstellungen → Admin (force=1) — sonst
  // verschwindet der Nachweis, welcher Stand beim Kunden ist.
  if (req.query.force !== '1') {
    const delivered = revs.flatMap(r => deliveriesOfRevision(r.id));
    if (delivered.length) {
      const nums = [...new Set(delivered.map(d => d.number))].slice(0, 3).join(', ');
      return res.status(409).json({ error: `Item wurde geliefert (${nums}) — Löschen nur unter Einstellungen → Admin.` });
    }
  }
  log('project', item.project_id, 'Item gelöscht', item.item_type + ' ' + item.item_number + ' – ' + item.name);
  // Dateien erst nach erfolgreichem Commit löschen (nicht zurückrollbar)
  const filesToDelete = [];
  tx(() => {
    revs.forEach(rev => {
      all('SELECT filename FROM datasets WHERE revision_id=?', [rev.id]).forEach(f => filesToDelete.push(f.filename));
      run('DELETE FROM datasets WHERE revision_id=?', [rev.id]);
      run('DELETE FROM bom WHERE parent_rev_id=?', [rev.id]);
      run('DELETE FROM print_settings WHERE revision_id=?', [rev.id]);
    });
    run('DELETE FROM revisions WHERE item_id=?', [item.id]);
    run('DELETE FROM bom WHERE child_item_id=?', [item.id]);
    run('DELETE FROM changelog WHERE entity_type=? AND entity_id=?', ['item', item.id]);
    run('DELETE FROM items WHERE id=?', [item.id]);
  });
  filesToDelete.forEach(fn => trashFile(fn));
  res.json({ success: true });
});

// ==============================================================
// REVISIONS
// ==============================================================
app.get('/api/revisions/:id', (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Nicht gefunden' });
  rev.datasets = all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, uploaded_at', [rev.id]);
  rev.print_settings = get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]) || null;
  rev.item = get('SELECT * FROM items WHERE id=?', [rev.item_id]);
  if (rev.item && rev.item.item_type === 'asm') {
    rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type, i.default_price FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
    rev.bom.forEach(b => { b.dev_hours = calcDevHours(b.child_item_id); });
  }
  res.json(rev);
});

// ── REVISIONEN VERGLEICHEN ────────────────────────────────────
// Zwei Revisionen desselben Items gegenüberstellen: Kopfdaten, Druckparameter,
// Stückliste, Normteile und Dateien. Dateien werden über den Namen ohne _revN
// zugeordnet; bei gleicher Grösse entscheidet eine Prüfsumme. Eine beim ECO
// oder bei „Neue Revision" kopierte Datei gilt so als unverändert.
// Liefert Rohwerte — Bezeichnungen und Einheiten setzt das Frontend, damit
// Vergleich und Datenblatt dieselben Begriffe verwenden.
const COMPARE_PS_FIELDS = ['material', 'layer_height', 'infill', 'infill_pattern', 'supports', 'nozzle',
  'print_temp', 'bed_temp', 'printer', 'print_duration', 'filament_weight_total', 'part_weight',
  'filament_price_kg', 'printer_cost_hr', 'raw_material_id', 'notes'];
const COMPARE_HASH_LIMIT = 256 * 1024 * 1024;

function _blank(v) { return v === null || v === undefined || String(v).trim() === ''; }
function _sameValue(a, b) {
  if (_blank(a) && _blank(b)) return true;
  if (_blank(a) || _blank(b)) return false;
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a).trim() === String(b).trim();
}
function _hashOf(p) {
  try {
    if (fs.statSync(p).size > COMPARE_HASH_LIMIT) return null;
    return crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
  } catch { return null; }
}
// Prüfsumme einer gespeicherten Datei: einmal berechnet, dann in der DB.
// Gespeicherte Dateien ändern sich nie — neuer Inhalt ist immer eine neue Datei.
function _fileHash(ds) {
  if (ds.sha1) return ds.sha1;
  if (!ds.filename) return null;
  const h = _hashOf(path.join(FILES_DIR, ds.filename));
  if (h && ds.id) run('UPDATE datasets SET sha1=? WHERE id=?', [h, ds.id]);
  return h;
}
// Dateien im Checkout-Ordner: Prüfsumme merken, solange Grösse und
// Änderungsdatum gleich bleiben. Der Scan läuft bei jedem Seitenaufruf.
const _hashCache = new Map();
function _cachedHash(p, st) {
  const c = _hashCache.get(p);
  if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) return c.hash;
  const hash = _hashOf(p);
  _hashCache.set(p, { size: st.size, mtimeMs: st.mtimeMs, hash });
  return hash;
}
// Liegt genau dieser Inhalt schon im PLM? Verglichen wird nur mit Dateien
// gleicher Grösse, damit der Scan schnell bleibt.
function _contentInPlm(p, st) {
  if (!get('SELECT 1 AS y FROM datasets WHERE file_size=? LIMIT 1', [st.size])) return false;
  const h = _cachedHash(p, st);
  if (!h) return false;
  if (get('SELECT 1 AS y FROM datasets WHERE file_size=? AND sha1=? LIMIT 1', [st.size, h])) return true;
  // Ältere Dateien ohne gespeicherte Prüfsumme: jetzt einmal berechnen
  return all('SELECT id, filename, sha1 FROM datasets WHERE file_size=? AND sha1 IS NULL', [st.size])
    .some(ds => _fileHash(ds) === h);
}
// Dateiname ohne Revisionskennung: 0028-prt-001_rev2.stl → 0028-prt-001.stl
function _datasetKey(ds) {
  return ds.ds_type + ':' + String(ds.original_name || '').replace(/_rev[A-Za-z0-9]+(?=[._]|$)/g, '').toLowerCase();
}

app.get('/api/items/:id/compare', (req, res) => {
  const item = get('SELECT id, item_number, name, item_type FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });
  const ra = get('SELECT * FROM revisions WHERE id=? AND item_id=?', [req.query.a, item.id]);
  const rb = get('SELECT * FROM revisions WHERE id=? AND item_id=?', [req.query.b, item.id]);
  if (!ra || !rb) return res.status(400).json({ error: 'Beide Revisionen müssen zu diesem Item gehören.' });

  const head = r => ({ id: r.id, rev: r.rev, status: r.status, created_at: r.created_at,
    released_at: r.released_at, released_by: r.released_by, description: r.description,
    eco_reason: r.eco_reason, delivered: deliveriesOfRevision(r.id).map(d => d.number) });

  const meta = ['status', 'description', 'eco_reason', 'released_at', 'released_by']
    .map(f => ({ field: f, a: ra[f] ?? null, b: rb[f] ?? null, changed: !_sameValue(ra[f], rb[f]) }))
    .filter(r => !_blank(r.a) || !_blank(r.b));

  const psA = get('SELECT * FROM print_settings WHERE revision_id=?', [ra.id]) || {};
  const psB = get('SELECT * FROM print_settings WHERE revision_id=?', [rb.id]) || {};
  const rmName = id => _blank(id) ? null : (get('SELECT name FROM raw_materials WHERE id=?', [id])?.name || `#${id}`);
  const print_settings = COMPARE_PS_FIELDS.map(f => {
    let a = psA[f] ?? null, b = psB[f] ?? null;
    if (f === 'raw_material_id') { a = rmName(a); b = rmName(b); }
    return { field: f, a, b, changed: !_sameValue(a, b) };
  }).filter(r => !_blank(r.a) || !_blank(r.b));

  // Stückliste: Zuordnung über das Kind-Item, Reihenfolge wie in Revision A,
  // neue Positionen aus B dahinter
  const bomOf = revId => all(`SELECT b.*, i.item_number, i.name, i.item_type, r.rev as pinned_rev
    FROM bom b JOIN items i ON i.id=b.child_item_id LEFT JOIN revisions r ON r.id=b.child_rev_id
    WHERE b.parent_rev_id=? ORDER BY b.position, b.id`, [revId]);
  const stdOf = revId => all(`SELECT bs.*, sp.designation, sp.name as sp_name
    FROM bom_std_parts bs JOIN standard_parts sp ON sp.id=bs.std_part_id
    WHERE bs.parent_rev_id=? ORDER BY bs.position, bs.id`, [revId]);
  function diffRows(A, B, keyOf, describe, side, extraChange) {
    const mapA = new Map(A.map(x => [keyOf(x), x])), mapB = new Map(B.map(x => [keyOf(x), x]));
    const keys = [...mapA.keys(), ...[...mapB.keys()].filter(k => !mapA.has(k))];
    return keys.map(k => {
      const x = mapA.get(k), y = mapB.get(k);
      const qtyChanged = !!(x && y && (!_sameValue(x.quantity, y.quantity) || (x.unit || '') !== (y.unit || '')));
      const otherChanged = !!(x && y && extraChange && extraChange(x, y));
      const change = !x ? 'added' : !y ? 'removed' : (qtyChanged || otherChanged) ? 'changed' : 'same';
      return { ...describe(y || x), a: x ? side(x) : null, b: y ? side(y) : null, change,
        qty_changed: qtyChanged, rev_changed: otherChanged };
    });
  }
  const bom = diffRows(bomOf(ra.id), bomOf(rb.id), x => x.child_item_id,
    x => ({ child_item_id: x.child_item_id, item_number: x.item_number, name: x.name, item_type: x.item_type }),
    x => ({ quantity: x.quantity, unit: x.unit, pinned_rev: x.pinned_rev || null }),
    (x, y) => (x.child_rev_id || null) !== (y.child_rev_id || null));
  const bom_std = diffRows(stdOf(ra.id), stdOf(rb.id), x => x.std_part_id,
    x => ({ std_part_id: x.std_part_id, designation: x.designation, name: x.sp_name }),
    x => ({ quantity: x.quantity, unit: x.unit }));

  // Dateien: gleicher Schlüssel mehrfach in einer Revision → durchnummerieren
  const dsOf = revId => {
    const seen = {};
    return all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, original_name, id', [revId])
      .map(d => { const k = _datasetKey(d); seen[k] = (seen[k] || 0) + 1; return { ...d, _key: k + '#' + seen[k] }; });
  };
  const datasets = diffRows(dsOf(ra.id), dsOf(rb.id), d => d._key,
    d => ({ ds_type: d.ds_type, name: d.original_name }),
    d => ({ id: d.id, original_name: d.original_name, file_size: d.file_size, version: d.version, uploaded_at: d.uploaded_at }))
    .map(row => {
      if (row.change !== 'same') return row;
      // gleich benannt: Inhalt prüfen
      if (row.a.file_size !== row.b.file_size) return { ...row, change: 'changed', content: 'different' };
      const ha = _fileHash(get('SELECT id, filename, sha1 FROM datasets WHERE id=?', [row.a.id]) || {});
      const hb = _fileHash(get('SELECT id, filename, sha1 FROM datasets WHERE id=?', [row.b.id]) || {});
      if (ha && hb) return ha === hb ? { ...row, content: 'identical' } : { ...row, change: 'changed', content: 'different' };
      return { ...row, content: 'unknown' };
    });

  const changed = list => list.filter(r => r.change ? r.change !== 'same' : r.changed).length;
  res.json({
    item, a: head(ra), b: head(rb), meta, print_settings, bom, bom_std, datasets,
    summary: { meta: changed(meta), print_settings: changed(print_settings), bom: changed(bom),
      bom_std: changed(bom_std), datasets: changed(datasets) },
  });
});

// ECO: freigegebene Revision sperren und eine neue DFT-Revision mit ihrem
// Inhalt anlegen. Statuswechsel und Check-in eines geänderten freigegebenen
// Teils gehen denselben Weg.
function startEco(rev, reason) {
  run("UPDATE revisions SET status='ECO',eco_reason=?,updated_at=datetime('now') WHERE id=?", [reason || '', rev.id]);
  const lastRev = get('SELECT rev FROM revisions WHERE item_id=? ORDER BY rowid DESC LIMIT 1', [rev.item_id]);
  const newRev = nextRev(lastRev ? lastRev.rev : '0');
  const newRevId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
    [rev.item_id, newRev, 'DFT', 'ECO: ' + (reason || '')]);
  // Wie „Neue Revision": Dateien, Druckparameter und Stückliste übernehmen
  const copied = copyRevisionContent(rev, newRevId, newRev);
  log('revision', rev.id, 'ECO', `Neue Revision rev${newRev} erstellt, ${copied.files} Datei(en), Druckparameter und BOM übernommen`);
  return get('SELECT * FROM revisions WHERE id=?', [newRevId]);
}

app.put('/api/revisions/:id/status', (req, res) => {
  const { status, description, eco_reason } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Nicht gefunden' });

  const validTransitions = { DFT:['REV'], REV:['DFT','REL'], REL:['ECO','OBS'], ECO:['OBS'], OBS:[] };
  if (!validTransitions[rev.status]?.includes(status))
    return res.status(400).json({ error: `Statuswechsel von ${rev.status} nach ${status} ist nicht möglich` });

  if (status === 'REL') {
    // For assemblies: all BOM children must have at least one REL revision.
    // Im einfachen Workflow erreicht nie ein Teil den Status REL — die Pruefung
    // waere dort nicht erfuellbar und wird uebersprungen.
    const item = get('SELECT * FROM items WHERE id=?', [rev.item_id]);
    if (item && item.item_type === 'asm' && workflowMode() === 'full') {
      const bomChildren = all('SELECT b.child_item_id FROM bom b WHERE b.parent_rev_id=?', [rev.id]);
      const unreleasedNames = [];
      for (const b of bomChildren) {
        const relRev = get("SELECT id FROM revisions WHERE item_id=? AND status='REL' LIMIT 1", [b.child_item_id]);
        if (!relRev) {
          const childItem = get('SELECT item_number, name FROM items WHERE id=?', [b.child_item_id]);
          if (childItem) unreleasedNames.push(childItem.item_number + ' ' + childItem.name);
        }
      }
      if (unreleasedNames.length) {
        return res.status(400).json({ error: 'Nicht alle Unterteile sind freigegeben: ' + unreleasedNames.join(', ') });
      }
    }
    run("UPDATE revisions SET status=?,released_at=datetime('now'),released_by=?,description=COALESCE(?,description),updated_at=datetime('now') WHERE id=?",
      [status, userContext.getStore()?.name || null, description || null, rev.id]);
    run("UPDATE revisions SET status='OBS',updated_at=datetime('now') WHERE item_id=? AND status='REL' AND id!=?",
      [rev.item_id, rev.id]);
  } else if (status === 'ECO') {
    startEco(rev, eco_reason);
  } else {
    run("UPDATE revisions SET status=?,updated_at=datetime('now') WHERE id=?", [status, rev.id]);
  }

  log('revision', rev.id, 'Status → ' + status, description || eco_reason || '');
  res.json(get('SELECT * FROM revisions WHERE id=?', [rev.id]));
});

// Neue Revision direkt anlegen — der Weg im einfachen Workflow, in dem es
// kein REL und damit auch kein ECO gibt, und nach einer Lieferung, die die
// Revision fixiert hat. Dateien, Druckparameter und Stückliste der bisherigen
// Revision werden übernommen, genau wie beim ECO.
app.post('/api/items/:id/revisions', (req, res) => {
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });

  const last = getLatestRevision(item.id);
  if (last && (last.status === 'REL' || last.status === 'ECO')) {
    return res.status(400).json({
      error: 'Die aktuelle Revision ist freigegeben — bitte den ECO-Weg verwenden.' });
  }

  const newRev = nextRev(last ? last.rev : '0');
  const newRevId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
    [item.id, newRev, 'DFT', req.body?.description || '']);

  if (last) copyRevisionContent(last, newRevId, newRev);

  log('item', item.id, 'Neue Revision', `rev${newRev} angelegt`);
  saveDb();
  res.json(get('SELECT * FROM revisions WHERE id=?', [newRevId]));
});

app.delete('/api/revisions/:id', (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Nicht gefunden' });
  if (rev.status !== 'DFT')
    return res.status(400).json({ error: 'Nur DFT-Revisionen können gelöscht werden.' });
  if (rejectIfDelivered(res, rev.id)) return;
  const others = all('SELECT id FROM revisions WHERE item_id=? AND id!=?', [rev.item_id, rev.id]);
  if (!others.length)
    return res.status(400).json({ error: 'Letzte Revision kann nicht gelöscht werden — lösche das Item.' });
  const datasets = all('SELECT filename FROM datasets WHERE revision_id=?', [rev.id]);
  for (const ds of datasets) {
    trashFile(ds.filename);
  }
  run('DELETE FROM datasets WHERE revision_id=?', [rev.id]);
  run('DELETE FROM print_settings WHERE revision_id=?', [rev.id]);
  run('DELETE FROM bom WHERE parent_rev_id=?', [rev.id]);
  run('DELETE FROM bom_std_parts WHERE parent_rev_id=?', [rev.id]);
  // Positionen, die auf genau diese Revision fixiert waren, fallen auf
  // automatisch zurueck — sonst zeigte die Fixierung ins Leere. Gilt auch für
  // Produktionspositionen, die vor der Lieferung von Hand fixiert wurden.
  const pinned = all('SELECT id FROM bom WHERE child_rev_id=?', [rev.id]);
  if (pinned.length) {
    run('UPDATE bom SET child_rev_id=NULL WHERE child_rev_id=?', [rev.id]);
    log('revision', rev.id, 'BOM: Revision', `${pinned.length} fixierte Position(en) auf automatisch zurückgesetzt`);
  }
  run('UPDATE delivery_items SET revision_id=NULL, rev_fixed=NULL WHERE revision_id=?', [rev.id]);
  run('DELETE FROM revisions WHERE id=?', [rev.id]);
  log('revision', rev.id, 'Gelöscht', `DFT rev${rev.rev} von Item ${rev.item_id}`);
  // If the previous revision is ECO, revert it back to REL
  const ecoRev = get("SELECT id FROM revisions WHERE item_id=? AND status='ECO' ORDER BY CAST(rev AS INTEGER) DESC LIMIT 1", [rev.item_id]);
  if (ecoRev) {
    run("UPDATE revisions SET status='REL', updated_at=datetime('now') WHERE id=?", [ecoRev.id]);
    log('revision', ecoRev.id, 'Status → REL', 'ECO zurückgesetzt nach Löschen der DFT-Revision');
  }
  res.json({ ok: true });
});

app.put('/api/revisions/:id/print-settings', (req, res) => {
  const { material, color, layer_height, infill, infill_pattern, supports, nozzle, print_temp, bed_temp, printer, notes,
    printer_cost_hr, filament_price_kg, filament_weight_total, part_weight, print_duration, raw_material_id } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Nicht gefunden' });
  if (rejectIfDelivered(res, rev.id)) return;
  run(`INSERT INTO print_settings (revision_id,material,color,layer_height,infill,infill_pattern,supports,nozzle,print_temp,bed_temp,printer,notes,printer_cost_hr,filament_price_kg,filament_weight_total,part_weight,print_duration,raw_material_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(revision_id) DO UPDATE SET
    material=excluded.material, color=excluded.color, layer_height=excluded.layer_height,
    infill=excluded.infill, infill_pattern=excluded.infill_pattern, supports=excluded.supports, nozzle=excluded.nozzle,
    print_temp=excluded.print_temp, bed_temp=excluded.bed_temp, printer=excluded.printer, notes=excluded.notes,
    printer_cost_hr=excluded.printer_cost_hr, filament_price_kg=excluded.filament_price_kg,
    filament_weight_total=excluded.filament_weight_total, part_weight=excluded.part_weight,
    print_duration=excluded.print_duration, raw_material_id=excluded.raw_material_id`,
    // Fehlende Felder als NULL binden — sql.js lehnt undefined ab, und ein
    // Teil-Payload soll die Position nicht in einen Fehler laufen lassen.
    [rev.id, material ?? null, color ?? null, layer_height ?? null, infill ?? null, infill_pattern ?? null, supports ?? null,
     nozzle ?? null, print_temp ?? null, bed_temp ?? null, printer ?? null, notes ?? null,
     printer_cost_hr||null, filament_price_kg||null, filament_weight_total||null, part_weight||null, print_duration||null,
     raw_material_id||null]);
  log('revision', rev.id, 'Druckparameter gespeichert', [material, printer].filter(Boolean).join(', '));
  res.json(get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]));
});

// ==============================================================
// BOM
// ==============================================================
app.post('/api/revisions/:revId/bom', (req, res) => {
  const { child_item_id, quantity, unit, position, notes, child_rev_id } = req.body;
  if (rejectIfDelivered(res, req.params.revId)) return;
  // Revision nur uebernehmen, wenn sie wirklich zu diesem Kind gehoert
  const pin = child_rev_id
    ? get('SELECT id FROM revisions WHERE id=? AND item_id=?', [child_rev_id, child_item_id])?.id || null
    : null;
  try {
    run('INSERT INTO bom (parent_rev_id,child_item_id,quantity,unit,position,notes,child_rev_id) VALUES (?,?,?,?,?,?,?)',
      [req.params.revId, child_item_id, quantity || 1, unit || 'pcs', position || 999, notes || '', pin]);
    const childNo = get('SELECT item_number FROM items WHERE id=?', [child_item_id])?.item_number || ('Item ' + child_item_id);
    log('revision', req.params.revId, 'BOM: Position hinzugefügt', childNo + ' x' + (quantity || 1));
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'Bereits in der BOM oder ungültig' }); }
});

app.put('/api/bom/:id/quantity', (req, res) => {
  const { quantity, unit } = req.body;
  if (rejectIfDelivered(res, get('SELECT parent_rev_id FROM bom WHERE id=?', [req.params.id])?.parent_rev_id)) return;
  run('UPDATE bom SET quantity=?, unit=? WHERE id=?', [Math.max(1, Math.round(parseFloat(quantity)||1)), unit||'Stk', req.params.id]);
  saveDb();
  res.json({ success: true });
});

// Revision einer Stuecklistenposition fixieren oder wieder automatisch folgen lassen.
// rev_id = null/leer -> automatisch (Standard).
app.put('/api/bom/:id/revision', (req, res) => {
  const { rev_id } = req.body;
  const bom = get('SELECT b.*, i.item_number FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.id=?', [req.params.id]);
  if (!bom) return res.status(404).json({ error: 'Position nicht gefunden' });
  if (rejectIfDelivered(res, bom.parent_rev_id)) return;

  if (rev_id == null || rev_id === '') {
    run('UPDATE bom SET child_rev_id=NULL WHERE id=?', [bom.id]);
    log('revision', bom.parent_rev_id, 'BOM: Revision', `${bom.item_number}: folgt wieder automatisch`);
    saveDb();
    return res.json({ success: true, child_rev_id: null });
  }

  const target = get('SELECT * FROM revisions WHERE id=? AND item_id=?', [rev_id, bom.child_item_id]);
  if (!target) return res.status(400).json({ error: 'Revision gehört nicht zu diesem Teil' });
  run('UPDATE bom SET child_rev_id=? WHERE id=?', [target.id, bom.id]);
  log('revision', bom.parent_rev_id, 'BOM: Revision', `${bom.item_number}: fixiert auf rev${target.rev}`);
  saveDb();
  res.json({ success: true, child_rev_id: target.id, rev: target.rev, status: target.status });
});

app.put('/api/revisions/:revId/bom-reorder', (req, res) => {
  const { order } = req.body; // array of bom ids in new order
  if (rejectIfDelivered(res, req.params.revId)) return;
  order.forEach((id, idx) => run('UPDATE bom SET position=? WHERE id=? AND parent_rev_id=?', [idx+1, id, req.params.revId]));
  saveDb();
  res.json({ success: true });
});

app.delete('/api/bom/:id', (req, res) => {
  const bom = get('SELECT b.*, i.item_number FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.id=?', [req.params.id]);
  if (bom && rejectIfDelivered(res, bom.parent_rev_id)) return;
  if (bom) log('revision', bom.parent_rev_id, 'BOM: Position entfernt', bom.item_number + ' x' + bom.quantity);
  run('DELETE FROM bom WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// DATASETS
// ==============================================================
app.post('/api/revisions/:revId/datasets', upload.single('file'), (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.revId]);
  if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' });
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const lockedBy = deliveriesOfRevision(rev.id);
  if (lockedBy.length) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(409).json({ error: deliveredLockMessage(lockedBy) });
  }
  const { notes, version } = req.body;
  const dsType = guessType(req.file.originalname);
  const item = get('SELECT item_number FROM items WHERE id=?', [rev.item_id]);
  const ext  = path.extname(req.file.originalname).toLowerCase();
  const base = item ? `${item.item_number}_rev${rev.rev}` : path.basename(req.file.originalname, ext);
  // Avoid duplicate names: check existing datasets for this revision
  const existing = all('SELECT original_name FROM datasets WHERE revision_id=?', [rev.id]);
  let displayName = base + ext;
  if (existing.some(d => d.original_name === displayName)) {
    let n = 2;
    while (existing.some(d => d.original_name === `${base}_${n}${ext}`)) n++;
    displayName = `${base}_${n}${ext}`;
  }
  // Die Datei wird auf {Artikelnr}_rev{X} umbenannt — den ursprünglichen Dateinamen
  // als Notiz festhalten, sonst geht er verloren.
  const origName = req.file.originalname;
  const finalNotes = displayName !== origName
    ? (notes ? `${notes} · ${origName}` : origName)
    : (notes || '');
  const id = runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
    [rev.id, dsType, req.file.filename, displayName, req.file.size, version || '1', finalNotes]);
  log('revision', rev.id, 'Datei hinzugefügt', displayName + ' (' + dsType + ')');

  // 3MF enthaelt die Slicer-Konfiguration — Druckparameter automatisch
  // uebernehmen, statt sie noch einmal von Hand einzutippen. Bereits
  // gefuellte Felder bleiben unangetastet.
  if (ext === '.3mf') {
    try {
      const parsed = parse3mfSettings(fs.readFileSync(path.join(FILES_DIR, req.file.filename)));
      if (parsed.settings) {
        const vals = printSettingsFrom3mf(parsed.settings);
        const cur = get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]);
        const cols = Object.keys(vals).filter(k => vals[k] !== null && (!cur || cur[k] === null || cur[k] === ''));
        if (cols.length) {
          if (!cur) run('INSERT INTO print_settings (revision_id) VALUES (?)', [rev.id]);
          run(`UPDATE print_settings SET ${cols.map(c => c + '=?').join(',')} WHERE revision_id=?`,
            [...cols.map(c => vals[c]), rev.id]);
          log('revision', rev.id, 'Druckparameter', `${cols.length} Werte aus ${displayName} übernommen`);
        }
      }
    } catch (e) { console.error('3MF-Auswertung fehlgeschlagen:', e.message); }
  }

  saveDb();
  res.json(get('SELECT * FROM datasets WHERE id=?', [id]));
});

// ── CHECKOUT ──────────────────────────────────────────────────
function getCheckoutDir() {
  const row = get("SELECT value FROM settings WHERE key='checkout_dir'");
  const dir = (row?.value || '').trim() || path.join(DATA_DIR, 'checkout');
  return path.resolve(dir);
}

function collectCheckoutDatasets(itemId, types, visited = new Set(), mode = 'latest') {
  if (visited.has(itemId)) return [];
  visited.add(itemId);
  const item = get('SELECT * FROM items WHERE id=?', [itemId]);
  if (!item) return [];
  // Select revision: 'released' = REL revision; 'latest' = highest rev number
  const rev = mode === 'released'
    ? (get("SELECT * FROM revisions WHERE item_id=? AND status='REL' ORDER BY CAST(rev AS INTEGER) DESC LIMIT 1", [itemId])
       || get('SELECT * FROM revisions WHERE item_id=? ORDER BY CAST(rev AS INTEGER) DESC LIMIT 1', [itemId]))
    : get('SELECT * FROM revisions WHERE item_id=? ORDER BY CAST(rev AS INTEGER) DESC LIMIT 1', [itemId]);
  if (!rev) return [];
  let datasets = all('SELECT * FROM datasets WHERE revision_id=?', [rev.id]);
  if (types && types.length) {
    // CAD sub-types (STL, STEP, OBJ, 3MF …) are stored as ds_type='CAD' — match by extension
    const CAD_SUBTYPES = { STL:['stl'], OBJ:['obj'], '3MF':['3mf'],
      STEP:['step','stp'], IGES:['iges','igs'], OTHER_CAD:['f3d','blend','fcstd','ipt','iam','sldprt','sldasm','par','asm','prt','catpart','catproduct','jt','x_t','x_b'] };
    const cadExtKeys = new Set(types.filter(t => CAD_SUBTYPES[t]));
    const allowedExts = new Set([].concat(...[...cadExtKeys].map(k => CAD_SUBTYPES[k])));
    const wantCad = types.includes('CAD');
    datasets = datasets.filter(d => {
      if (d.ds_type !== 'CAD') return types.includes(d.ds_type);
      // For CAD files: match if 'CAD' selected, or if specific subtype extension matches
      const ext = path.extname(d.original_name).slice(1).toLowerCase();
      if (wantCad && !cadExtKeys.size) return true;          // only 'CAD' selected, no subtypes → all CAD
      if (wantCad) return true;                               // 'CAD' + subtypes → all CAD
      return allowedExts.has(ext);                            // only subtypes → match by ext
    });
  }
  const result = datasets.map(d => ({ ...d, item_number: item.item_number, item_name: item.name, rev_number: rev.rev, rev_status: rev.status }));
  if (item.item_type === 'asm') {
    const children = all('SELECT child_item_id FROM bom WHERE parent_rev_id=?', [rev.id]);
    for (const b of children) {
      result.push(...collectCheckoutDatasets(b.child_item_id, types, visited, mode));
    }
  }
  return result;
}

function removeReadOnly(filePath) {
  try { fs.chmodSync(filePath, 0o644); } catch {}
}

function deleteFolderRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  // Remove read-only from all files first (required before deletion)
  function makeWritable(p) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        fs.readdirSync(p).forEach(e => makeWritable(path.join(p, e)));
      } else {
        fs.chmodSync(p, 0o644);
      }
    } catch {}
  }
  makeWritable(dirPath);
  // Use rmSync (Node 14.14+) with fallback
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Fallback for older Node
    for (const entry of fs.readdirSync(dirPath)) {
      const full = path.join(dirPath, entry);
      if (fs.statSync(full).isDirectory()) deleteFolderRecursive(full);
      else fs.unlinkSync(full);
    }
    fs.rmdirSync(dirPath);
  }
}

// Ordner und Dateien aus einer Anfrage: nur direkt im Checkout-Verzeichnis.
// Sonst liesse sich über den Check-in jeder Ordner auf dem PC löschen und
// über den Import jede Datei einlesen. Symlinks zählen nicht.
function checkoutFolderFrom(folder, { allowRoot = false } = {}) {
  if (!folder || typeof folder !== 'string') return null;
  const root = getCheckoutDir();
  const abs = path.resolve(folder);
  if (!(path.dirname(abs) === root || (allowRoot && abs === root))) return null;
  try { return fs.lstatSync(abs).isDirectory() ? abs : null; } catch { return null; }
}
function checkoutFileIn(dir, name) {
  if (!name || typeof name !== 'string' || name !== path.basename(name) || name.startsWith('.')) return null;
  const abs = path.join(dir, name);
  try { return fs.lstatSync(abs).isFile() ? abs : null; } catch { return null; }
}

app.post('/api/items/:id/checkout', (req, res) => {
  try {
    const { types, mode } = req.body;
    const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Nicht gefunden' });

    const checkoutDir = getCheckoutDir();
    fs.mkdirSync(checkoutDir, { recursive: true });

    const revMode = mode === 'released' ? 'released' : 'latest';
    const datasets = collectCheckoutDatasets(item.id, types && types.length ? types : null, new Set(), revMode);
    if (!datasets.length) return res.json({ folder: null, files: [], warning: 'Keine Dateien gefunden — sind Dateien in den Revisionen hochgeladen?' });

    const safe = item.item_number.replace(/[^a-zA-Z0-9_-]/g, '_');
    const outDir = path.join(checkoutDir, safe);
    fs.mkdirSync(outDir, { recursive: true });

    const copied = [];
    const usedNames = {};
    for (const ds of datasets) {
      const src = path.join(FILES_DIR, ds.filename);
      if (!fs.existsSync(src)) continue;
      const ext = path.extname(ds.original_name);
      const safeNum  = ds.item_number.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (ds.item_name || '').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const base = safeName ? `${safeNum}_${safeName}_rev${ds.rev_number}` : `${safeNum}_rev${ds.rev_number}`;
      let name = base + ext;
      if (usedNames[name] !== undefined) {
        usedNames[name]++;
        name = `${base}_${usedNames[name]}${ext}`;
      } else {
        usedNames[name] = 0;
      }
      const dest = path.join(outDir, name);
      fs.copyFileSync(src, dest);
      if (ds.rev_status === 'REL') { try { fs.chmodSync(dest, 0o444); } catch {} }
      // Änderungsdatum (volle Genauigkeit, nicht auf ms gerundet) und Grösse merken:
      // zeigt beim Einchecken, ob die Datei bearbeitet wurde
      const st = fs.statSync(dest);
      copied.push({ name, ds_type: ds.ds_type, item_number: ds.item_number, item_name: ds.item_name, readonly: ds.rev_status === 'REL',
        mtime: st.mtimeMs, size: st.size });
    }

    if (!copied.length) {
      deleteFolderRecursive(outDir);
      return res.json({ folder: null, files: [], warning: 'Keine Dateien vorhanden (Quelldateien fehlen im Datenverzeichnis)' });
    }

    const activeRev = getActiveRevision(item.id);
    fs.writeFileSync(path.join(outDir, '.checkout.json'), JSON.stringify({
      item_id: item.id, item_number: item.item_number, item_name: item.name,
      item_type: item.item_type, checked_out: new Date().toISOString(), files: copied,
      rev_status: activeRev?.status || null
    }, null, 2));

    const nonRel = copied.filter(f => !f.readonly);
    if (nonRel.length) {
      const typeLabels = types && types.length ? types.join(', ') : 'alle';
      log('item', item.id, 'Ausgecheckt', `${nonRel.length} Dateien (${typeLabels}) → ${outDir}`);
    }
    res.json({ folder: outDir, files: copied });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Checkout fehlgeschlagen: ' + err.message });
  }
});

app.get('/api/checkout/scan', (req, res) => {
  try {
    const checkoutDir = getCheckoutDir();
    if (!fs.existsSync(checkoutDir)) return res.json({ item_files: [], root_files: [] });

    const result = { item_files: [], root_files: [] };
    const entries = fs.readdirSync(checkoutDir);

    // Root-level files (not directories, not hidden). Was schon im PLM ist —
    // als neues Item angelegt oder an ein Item angehängt — gilt nicht mehr als
    // neu, obwohl die Datei hier liegen bleibt. Ändert sie sich, ist sie wieder neu.
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const p = path.join(checkoutDir, e);
      const st = fs.statSync(p);
      if (st.isFile() && !_contentInPlm(p, st)) {
        result.root_files.push({ name: e, path: p, ds_type: guessType(e) });
      }
    }

    // Subdirectory: detect new files not in .checkout.json
    for (const e of entries) {
      const dir = path.join(checkoutDir, e);
      if (!fs.statSync(dir).isDirectory()) continue;
      const metaPath = path.join(dir, '.checkout.json');
      if (!fs.existsSync(metaPath)) continue;
      let meta;
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { continue; }
      const tracked = new Set((meta.files || []).map(f => f.name));
      const newFiles = fs.readdirSync(dir)
        .filter(f => !f.startsWith('.') && !tracked.has(f))
        .filter(f => fs.statSync(path.join(dir, f)).isFile())
        .map(f => ({ name: f, ds_type: guessType(f) }));
      if (newFiles.length) {
        result.item_files.push({
          item_id: meta.item_id,
          item_number: meta.item_number,
          item_name: meta.item_name,
          folder: dir,
          new_files: newFiles
        });
      }
    }

    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Import new files from checkout folder into PLM
app.post('/api/checkout/import', (req, res) => {
  try {
    const { mode, item_id, files, new_item } = req.body;

    if (mode === 'item') {
      // Auch von der obersten Ebene: Dateien, die nicht im Ordner eines Items liegen
      const folder = checkoutFolderFrom(req.body.folder, { allowRoot: true });
      if (!folder) return res.status(400).json({ error: 'Kein Ordner im Checkout-Verzeichnis' });
      // Add files to existing item's latest non-REL revision
      const item = get('SELECT * FROM items WHERE id=?', [item_id]);
      if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });
      let rev = get("SELECT * FROM revisions WHERE item_id=? AND status != 'REL' ORDER BY id DESC LIMIT 1", [item_id]);
      if (!rev) {
        // All revisions are REL — create new revision
        const lastRev = get('SELECT * FROM revisions WHERE item_id=? ORDER BY id DESC LIMIT 1', [item_id]);
        const nextRev = lastRev ? String(parseInt(lastRev.rev || '1') + 1) : '2';
        const revId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [item_id, nextRev, 'DFT', 'Neue Revision durch Checkout-Import']);
        rev = get('SELECT * FROM revisions WHERE id=?', [revId]);
      }
      const imported = [];
      for (const f of files || []) {
        const src = checkoutFileIn(folder, f.name);
        if (!src) continue;
        const ext = path.extname(f.name);
        const storedName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
        fs.copyFileSync(src, path.join(FILES_DIR, storedName));
        const stat = fs.statSync(src);
        const chkItem = get('SELECT item_number FROM items WHERE id=?', [item_id]);
        const chkExt  = path.extname(f.name).toLowerCase();
        const chkBase = chkItem ? `${chkItem.item_number}_rev${rev.rev}` : path.basename(f.name, chkExt);
        const chkExisting = all('SELECT original_name FROM datasets WHERE revision_id=?', [rev.id]);
        let chkDisplay = chkBase + chkExt;
        if (chkExisting.some(d => d.original_name === chkDisplay)) {
          let n = 2; while (chkExisting.some(d => d.original_name === `${chkBase}_${n}${chkExt}`)) n++;
          chkDisplay = `${chkBase}_${n}${chkExt}`;
        }
        runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
          [rev.id, f.ds_type || guessType(f.name), storedName, chkDisplay, stat.size, '1', 'Importiert aus Checkout']);
        // Track in .checkout.json so it's not flagged again
        const metaPath = path.join(folder, '.checkout.json');
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          meta.files = [...(meta.files || []), { name: f.name, ds_type: f.ds_type }];
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        } catch {}
        imported.push(f.name);
      }
      log('item', item_id, 'Importiert', `${imported.length} Dateien aus Checkout → rev${rev.rev}`);
      res.json({ success: true, count: imported.length, rev: rev.rev });

    } else if (mode === 'new') {
      // Create new item in given project
      const { project_id, item_type, name, file_path, file_name, ds_type } = new_item;
      const project = get('SELECT * FROM projects WHERE id=?', [project_id]);
      if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });
      const filePath = file_path ? checkoutFileIn(getCheckoutDir(), path.basename(String(file_path))) : null;
      if (file_path && (!filePath || path.resolve(String(file_path)) !== filePath)) {
        return res.status(400).json({ error: 'Keine Datei im Checkout-Verzeichnis' });
      }

      let item_number;
      if (item_type === 'asm') {
        item_number = project.number + itemSep() + segAsm() + itemSep() + nextItemSeq(project.id, 'asm');
      } else if (item_type === 'doc') {
        item_number = project.number + itemSep() + segDoc() + itemSep() + nextItemSeq(project.id, 'doc');
      } else {
        item_number = project.number + itemSep() + segPrt() + itemSep() + nextPrtNumber(project.id, null);
      }

      const itemId = runGetId('INSERT INTO items (project_id,parent_id,item_type,item_number,name,description) VALUES (?,?,?,?,?,?)',
        [project.id, null, item_type, item_number, name, '']);
      assignShortCode(itemId);
      const revId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, firstRevLabel(), 'DFT', 'Erstellt durch Checkout-Import']);

      if (filePath) {
        const ext = path.extname(file_name);
        const storedName = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
        fs.copyFileSync(filePath, path.join(FILES_DIR, storedName));
        const stat = fs.statSync(filePath);
        const newExt  = path.extname(file_name).toLowerCase();
        const newItem = get('SELECT item_number FROM items WHERE id=?', [itemId]);
        const newDisplay = newItem ? `${newItem.item_number}_rev${firstRevLabel()}${newExt}` : file_name;
        runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
          [revId, ds_type || guessType(file_name), storedName, newDisplay, stat.size, '1', 'Importiert aus Checkout']);
      }

      log('item', itemId, 'Erstellt', `${item_type} ${item_number} via Checkout-Import`);
      res.json({ success: true, item_number });
    } else {
      res.status(400).json({ error: 'Ungültiger Modus' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/checkout/list', (req, res) => {
  const checkoutDir = getCheckoutDir();
  if (!fs.existsSync(checkoutDir)) return res.json([]);
  const entries = fs.readdirSync(checkoutDir).map(name => {
    const meta = path.join(checkoutDir, name, '.checkout.json');
    if (!fs.existsSync(meta)) return null;
    try {
      const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
      return { ...m, folder: path.join(checkoutDir, name), folder_name: name };
    } catch { return null; }
  }).filter(Boolean);
  res.json(entries.sort((a, b) => b.checked_out.localeCompare(a.checked_out)));
});

// Im Checkout bearbeitet? Gleiches Änderungsdatum und gleiche Grösse wie beim
// Auschecken: nein. Sonst entscheidet der Inhalt — liegt er schon im PLM, wurde
// die Datei nur angefasst (Checkouts von früher kennen das Datum noch nicht).
function _changedInCheckout(folder, meta) {
  const known = new Map((meta.files || []).map(f => [f.name, f]));
  return fs.readdirSync(folder).filter(name => {
    if (name.startsWith('.')) return false;
    const p = path.join(folder, name);
    let st;
    try { st = fs.statSync(p); } catch { return false; }
    if (!st.isFile()) return false;
    const k = known.get(name);
    if (k && k.mtime === st.mtimeMs && k.size === st.size) return false;
    return !_contentInPlm(p, st);
  });
}

// In welcher Revision wird geändert? Ein offener Entwurf nimmt die Änderung
// direkt; ist das Item freigegeben, per ECO in eine neue Revision; sonst
// (veraltet, geliefert) in eine neue Revision mit dem bisherigen Inhalt.
// Für den Check-in geänderter Dateien und fürs Umsetzen eines Änderungsantrags.
function _draftRevision(itemId, reason) {
  const last = getLatestRevision(itemId);
  if (!last) return null;
  if (last.status === 'DFT' && !deliveriesOfRevision(last.id).length) return last;
  if (last.status === 'REL') {
    const rev = startEco(last, reason);
    log('revision', last.id, 'Status → ECO', reason);
    return rev;
  }
  const label = nextRev(last.rev);
  const id = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, label, 'DFT', reason]);
  copyRevisionContent(last, id, label);
  log('item', itemId, 'Neue Revision', `rev${label}: ${reason}`);
  return get('SELECT * FROM revisions WHERE id=?', [id]);
}

// Datei aus dem Checkout in eine Revision übernehmen — eine gleichnamige wird ersetzt
function _checkinFile(rev, item, src) {
  const ext = path.extname(src).toLowerCase();
  const stored = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
  fs.copyFileSync(src, path.join(FILES_DIR, stored));
  const stat = fs.statSync(src);
  const displayName = (item ? `${item.item_number}_rev${rev.rev}` : path.basename(src, ext)) + ext;
  const existingDs = get('SELECT * FROM datasets WHERE revision_id=? AND original_name=?', [rev.id, displayName]);
  if (existingDs) {
    trashFile(existingDs.filename);
    run('DELETE FROM datasets WHERE id=?', [existingDs.id]);
  }
  runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
    [rev.id, guessType(src), stored, displayName, stat.size, '1', 'Check-in']);
  return displayName;
}

app.post('/api/checkout/checkin', (req, res) => {
  try {
    // Gelöscht wird nur ein Ordner, den ein Checkout angelegt hat
    const folder = checkoutFolderFrom(req.body.folder);
    if (!folder || !fs.existsSync(path.join(folder, '.checkout.json'))) {
      return res.status(400).json({ error: 'Kein Checkout-Ordner: ' + String(req.body.folder || '') });
    }

    // Read metadata
    let meta = null;
    try {
      const metaPath = path.join(folder, '.checkout.json');
      if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}

    const uploaded = [];
    const revisions = [];
    let discarded = 0;
    const wasRel = meta?.rev_status === 'REL' || meta?.rev_status === 'OBS';

    if (meta?.item_id && wasRel) {
      // Freigegeben: unverändert ist nichts zu tun. Wurde trotzdem etwas
      // bearbeitet, bleibt der Ordner, bis entschieden ist — neue Revision
      // (bei REL per ECO) oder verwerfen.
      const changed = _changedInCheckout(folder, meta);
      const ownerOf = name => (meta.files || []).find(f => f.name === name)?.item_number || meta.item_number;
      const choice = req.body.rel_changes;
      if (changed.length && choice !== 'new_revision' && choice !== 'discard') {
        return res.json({ ask: 'rel_changed', item_number: meta.item_number, item_name: meta.item_name,
          files: changed.map(name => ({ name, item_number: ownerOf(name) })) });
      }
      if (choice === 'discard') discarded = changed.length;
      else {
        // Dateien eines Unterteils (Checkout einer Baugruppe) gehören in dessen Revision
        const byItem = new Map();
        for (const name of changed) byItem.set(ownerOf(name), [...(byItem.get(ownerOf(name)) || []), name]);
        for (const [number, names] of byItem) {
          const item = get('SELECT * FROM items WHERE item_number=?', [number]) || get('SELECT * FROM items WHERE id=?', [meta.item_id]);
          const rev = item && _draftRevision(item.id, 'Beim Einchecken geändert');
          if (!rev) continue;
          for (const name of names) uploaded.push(_checkinFile(rev, item, path.join(folder, name)));
          revisions.push({ item_number: item.item_number, rev: rev.rev });
        }
      }
    } else if (meta?.item_id) {
      // Find or create active revision
      let rev = get("SELECT * FROM revisions WHERE item_id=? AND status NOT IN ('REL','OBS') ORDER BY id DESC LIMIT 1", [meta.item_id]);
      // Eine gelieferte Revision ist fixiert — die eingecheckten Dateien
      // landen in einer neuen Revision, die den bisherigen Inhalt übernimmt.
      if (rev && deliveriesOfRevision(rev.id).length) {
        const label = nextRev(rev.rev);
        const newRevId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
          [meta.item_id, label, 'DFT', `Neue Revision durch Check-in (rev${rev.rev} ist geliefert)`]);
        copyRevisionContent(rev, newRevId, label);
        log('item', meta.item_id, 'Neue Revision', `rev${label} angelegt, weil rev${rev.rev} geliefert und fixiert ist`);
        rev = get('SELECT * FROM revisions WHERE id=?', [newRevId]);
      }
      if (!rev) {
        const lastRev = get('SELECT * FROM revisions WHERE item_id=? ORDER BY id DESC LIMIT 1', [meta.item_id]);
        const nextRevStr = lastRev ? String(parseInt(lastRev.rev || '1') + 1) : '2';
        const newRevId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
          [meta.item_id, nextRevStr, 'DFT', 'Neue Revision durch Check-in']);
        rev = get('SELECT * FROM revisions WHERE id=?', [newRevId]);
      }
      const item = get('SELECT item_number FROM items WHERE id=?', [meta.item_id]);

      // Upload all non-hidden files from folder
      for (const fname of fs.readdirSync(folder)) {
        if (fname.startsWith('.')) continue;
        const src = path.join(folder, fname);
        try {
          if (!fs.statSync(src).isFile()) continue;
        } catch { continue; }
        uploaded.push(_checkinFile(rev, item, src));
      }
    }

    // Delete folder
    deleteFolderRecursive(folder);
    if (meta) log('item', meta.item_id, 'Eingecheckt', `${uploaded.length} Datei(en) hochgeladen, `
      + (discarded ? `${discarded} geänderte verworfen, ` : '') + 'Ordner gelöscht');
    res.json({ success: true, uploaded, revisions, discarded });
  } catch (err) {
    res.status(500).json({ error: 'Einchecken fehlgeschlagen: ' + err.message });
  }
});

app.post('/api/checkout/open', (req, res) => {
  if (!_isLocalRequest(req)) return res.status(403).json({ error: 'Ordner lassen sich nur auf dem PC öffnen, auf dem das PLM läuft.' });
  const folder = checkoutFolderFrom(req.body.folder, { allowRoot: true });
  if (!folder) return res.status(400).json({ error: 'Kein Ordner im Checkout-Verzeichnis' });
  const opener = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  launchProgram({ cmd: opener, args: [] }, folder).catch(e => console.error('Ordner öffnen:', e.message));
  res.json({ success: true });
});

// ── SLICER ────────────────────────────────────────────────────
// „Im Slicer öffnen": Die Modelldatei wird als Arbeitskopie nach
// <Checkout>/Slicer gelegt und der gewählte Slicer damit gestartet. Der
// Dateiname beginnt mit dem Kurzcode, so trägt ihn auch der G-Code.
// In den Einstellungen wird nur gewählt, welcher Slicer — das Programm wird
// an den üblichen Orten gesucht. Ein eigener Pfad geht nur über plm.config:
// Die API ist ohne Anmeldung im Netz erreichbar, ein dort einstellbarer
// Programmpfad liesse jeden im Netz Programme auf diesem PC starten.
const SLICERS = [
  { id: 'prusa', name: 'PrusaSlicer', configKey: 'prusaslicer',
    commands: ['prusa-slicer', 'PrusaSlicer', 'prusaslicer'], flatpak: 'com.prusa3d.PrusaSlicer',
    appImage: /prusa-?slicer/i, win: ['Prusa3D\\PrusaSlicer\\prusa-slicer.exe'],
    mac: 'PrusaSlicer.app/Contents/MacOS/PrusaSlicer' },
  { id: 'bambu', name: 'Bambu Studio', configKey: 'bambustudio',
    commands: ['bambu-studio', 'BambuStudio', 'bambustudio'], flatpak: 'com.bambulab.BambuStudio',
    appImage: /bambu-?studio/i, win: ['Bambu Studio\\bambu-studio.exe'],
    mac: 'BambuStudio.app/Contents/MacOS/BambuStudio' },
  // Creality legt die Version in den Ordnernamen (Creality\Creality Print 6.0\…),
  // die Flatpak-ID ist nicht fest — daher Platzhalter bzw. Muster
  { id: 'creality', name: 'Creality Print', configKey: 'crealityprint',
    commands: ['CrealityPrint', 'crealityprint', 'creality-print'], flatpak: /creality.*print/i,
    appImage: /creality-?print/i,
    win: ['Creality*\\Creality*Print*\\Creality*Print.exe', 'Creality*Print*\\Creality*Print.exe'],
    mac: 'CrealityPrint.app/Contents/MacOS/CrealityPrint' },
];
const SLICER_EXTS = ['.stl', '.3mf', '.obj', '.step', '.stp', '.amf'];

function _isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function _onPath(cmd) {
  const exts = process.platform === 'win32' ? ['.exe', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean))
    for (const e of exts) { const p = path.join(dir, cmd + e); if (_isFile(p)) return p; }
  return null;
}
// Pfadteile mit * werden im Ordner gesucht, bei mehreren Treffern zuerst die höchste Version
const _byVersion = (a, b) => b.localeCompare(a, undefined, { numeric: true });
function _globFile(dir, parts) {
  if (!parts.length) return _isFile(dir) ? dir : null;
  const [part, ...rest] = parts;
  if (!part.includes('*')) return _globFile(path.join(dir, part), rest);
  const re = new RegExp('^' + part.split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i');
  let names; try { names = fs.readdirSync(dir); } catch { return null; }
  for (const n of names.filter(n => re.test(n)).sort(_byVersion)) {
    const hit = _globFile(path.join(dir, n), rest);
    if (hit) return hit;
  }
  return null;
}

// Wo ist der Slicer installiert? → { cmd, args, where }, { error } oder null
function findSlicer(s) {
  const custom = (loadConfig()[s.configKey] || '').trim();
  if (custom) return _isFile(custom) ? { cmd: custom, args: [], where: custom }
    : { error: `Pfad aus plm.config nicht gefunden: ${custom}` };
  for (const c of s.commands) { const p = _onPath(c); if (p) return { cmd: p, args: [], where: p }; }
  const home = os.homedir();
  const at = p => (_isFile(p) ? { cmd: p, args: [], where: p } : null);
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean);
    for (const r of roots) for (const rel of s.win) { const hit = at(_globFile(r, rel.split('\\')) || ''); if (hit) return hit; }
    return null;
  }
  if (process.platform === 'darwin') {
    for (const r of ['/Applications', path.join(home, 'Applications')]) { const hit = at(path.join(r, s.mac)); if (hit) return hit; }
    return null;
  }
  const flatpak = _onPath('flatpak');
  const appId = flatpak && ['/var/lib/flatpak', path.join(home, '.local/share/flatpak')]
    .flatMap(r => { try { return fs.readdirSync(path.join(r, 'app')); } catch { return []; } })
    .find(n => (s.flatpak instanceof RegExp ? s.flatpak.test(n) : n === s.flatpak));
  if (appId) return { cmd: flatpak, args: ['run', appId], where: 'Flatpak ' + appId };
  const dirs = ['Applications', 'AppImages', '.local/bin', 'Downloads', 'Desktop', 'Schreibtisch']
    .map(d => path.join(home, d)).concat('/opt');
  for (const dir of dirs) {
    let names; try { names = fs.readdirSync(dir); } catch { continue; }
    // Bei mehreren Versionen die mit dem höchsten Namen
    const hit = names.filter(n => /\.appimage$/i.test(n) && s.appImage.test(n)).sort(_byVersion)[0];
    if (hit) return at(path.join(dir, hit));
  }
  return null;
}

function slicerStatus() {
  const chosen = getSetting('slicer', '');
  const slicers = SLICERS.map(s => {
    const f = findSlicer(s);
    return { id: s.id, name: s.name, config_key: s.configKey, found: !!(f && !f.error), where: f?.where || null, error: f?.error || null };
  });
  // Nichts gewählt: der erste installierte
  const active = SLICERS.some(s => s.id === chosen) ? chosen : (slicers.find(s => s.found)?.id || '');
  return { chosen, active, slicers };
}

// Programme starten nur für Aufrufe von diesem PC — von einem anderen Gerät
// aus ginge das Fenster ohnehin hier auf. Der Host wird mitgeprüft: Eine
// fremde Webseite kann den Browser per DNS-Rebinding auf 127.0.0.1 lenken,
// schickt dann aber ihren eigenen Namen als Host mit.
function _isLocalRequest(req) {
  if (!_isOwnHost(_hostOf(req))) return false;
  const a = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '').toLowerCase();
  return a === '127.0.0.1' || a === '::1' || _ownAddresses().includes(a);
}
function _hostOf(req) {
  return String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
}
function _ownAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(Boolean).map(i => i.address.toLowerCase());
}
// Namen, unter denen dieser PC erreichbar ist — auch pc.local, pc.fritz.box …
function _isOwnHost(host) {
  const name = os.hostname().toLowerCase();
  return ['localhost', '127.0.0.1', '::1', name].includes(host) || host.startsWith(name + '.')
    || _ownAddresses().includes(host);
}

// K7M-3_Halter.stl — mehrere Modelle gleichen Typs in einer Revision mit _2, _3
function slicerFileName(ds, ext) {
  const code = ds.short_code ? printCode(ds.short_code, ds.rev) : `${ds.item_number}_rev${ds.rev}`;
  const name = (ds.item_name || '').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_').replace(/\s+/g, '_')
    .replace(/_+/g, '_').replace(/^_|_$/g, '');
  const same = all('SELECT id, original_name FROM datasets WHERE revision_id=? ORDER BY id', [ds.revision_id])
    .filter(d => path.extname(d.original_name || '').toLowerCase() === ext);
  const n = same.findIndex(d => d.id === ds.id);
  return (code + (name ? '_' + name : '') + (n > 0 ? '_' + (n + 1) : '')).replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '_') + ext;
}

function _sameContent(a, b) {
  try { return fs.statSync(a).size === fs.statSync(b).size && fs.readFileSync(a).equals(fs.readFileSync(b)); }
  catch { return false; }
}

// Ohne Shell starten — Pfade mit Leerzeichen oder Sonderzeichen bleiben ein Argument
function launchProgram(found, file = null) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    if (process.platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) env.DISPLAY = ':0';
    const args = file ? [...found.args, file] : found.args;
    const child = require('child_process').spawn(found.cmd, args, { detached: true, stdio: 'ignore', env });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

app.get('/api/slicers', (req, res) => {
  res.json({ ...slicerStatus(), local: _isLocalRequest(req) });
});

app.post('/api/datasets/:id/open-in-slicer', async (req, res) => {
  if (!_isLocalRequest(req)) return res.status(403).json({ error: 'Der Slicer lässt sich nur auf dem PC öffnen, auf dem das PLM läuft.' });
  const ds = get(`SELECT d.*, r.rev, i.item_number, i.name AS item_name, i.short_code
    FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id WHERE d.id=?`, [req.params.id]);
  if (!ds) return res.status(400).json({ error: 'Datei nicht mehr vorhanden' });
  const ext = path.extname(ds.original_name || '').toLowerCase();
  if (!SLICER_EXTS.includes(ext)) return res.status(400).json({ error: `${ext || 'Diese Datei'} lässt sich im Slicer nicht öffnen` });
  const src = path.join(FILES_DIR, ds.filename);
  if (!_isFile(src)) return res.status(400).json({ error: 'Datei fehlt im Datenverzeichnis' });

  const sl = SLICERS.find(s => s.id === slicerStatus().active);
  if (!sl) return res.status(400).json({ error: 'Kein Slicer installiert — siehe Einstellungen → 3D-Druck' });
  const found = findSlicer(sl);
  if (!found || found.error) return res.status(400).json({ error: `${sl.name} nicht gefunden${found?.error ? ' (' + found.error + ')' : ''} — siehe Einstellungen → 3D-Druck` });

  // Eine vorhandene, abweichende Arbeitskopie bleibt stehen: Ein im Slicer
  // gespeichertes Projekt (Kurzcode gesetzt, Teile angeordnet) ginge sonst verloren.
  const dir = path.join(getCheckoutDir(), 'Slicer');
  const dest = path.join(dir, slicerFileName(ds, ext));
  let kept = false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!_isFile(dest)) fs.copyFileSync(src, dest);
    else kept = !_sameContent(src, dest);
  } catch (e) { return res.status(500).json({ error: 'Arbeitskopie fehlgeschlagen: ' + e.message }); }

  try { await launchProgram(found, dest); }
  catch (e) { return res.status(500).json({ error: `${sl.name} liess sich nicht starten: ${e.message}` }); }
  res.json({ ok: true, slicer: sl.name, file: dest, kept });
});

app.get('/api/datasets/:id/download', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Nicht gefunden' });
  const fp = path.join(FILES_DIR, ds.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei fehlt' });
  res.download(fp, ds.original_name);
});

app.get('/api/datasets/:id/view', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Nicht gefunden' });
  const fp = path.join(FILES_DIR, ds.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei fehlt' });
  res.setHeader('Content-Type', mimeType(ds.original_name));
  res.setHeader('Content-Disposition', 'inline; filename="' + ds.original_name.replace(/"/g, '') + '"');
  res.sendFile(fp);
});

app.put('/api/datasets/:id', (req, res) => {
  const { notes, original_name } = req.body;
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Nicht gefunden' });
  if (rejectIfDelivered(res, ds.revision_id)) return;
  run('UPDATE datasets SET notes=?,original_name=? WHERE id=?', [notes||'', original_name||ds.original_name, req.params.id]);
  res.json(get('SELECT * FROM datasets WHERE id=?', [req.params.id]));
});

app.delete('/api/datasets/:id', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Nicht gefunden' });
  if (rejectIfDelivered(res, ds.revision_id)) return;
  trashFile(ds.filename);
  run('DELETE FROM datasets WHERE id=?', [ds.id]);
  log('revision', ds.revision_id, 'Datei gelöscht', ds.original_name);
  res.json({ success: true });
});

// ==============================================================
// CUSTOMERS
// ==============================================================
// Auftragstotal wie auf dem Beleg: Positionen, Gesamtrabatt, MwSt. falls ausgewiesen
function orderTotal(o, subtotal) {
  const net = subtotal - subtotal * (o.discount_pct||0) / 100;
  return net + (o.include_tax ? net*(o.tax_rate||0)/100 : 0);
}
// Umsatz zaehlt erst ab Bestaetigung; Angebote, Entwuerfe und Abgelehntes nicht
const REVENUE_STATUSES = ['CONFIRMED', 'DELIVERED', 'INVOICED'];
const OPEN_ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'DELIVERED'];

app.get('/api/customers', (req, res) => {
  const customers = all('SELECT * FROM customers ORDER BY name COLLATE NOCASE');
  const orders = all(`
    SELECT o.customer_id, o.status, o.discount_pct, o.include_tax, o.tax_rate,
      COALESCE(o.order_date, substr(o.created_at,1,10)) as activity_date,
      COALESCE(SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)), 0) as subtotal
    FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id IS NOT NULL GROUP BY o.id`);
  const byCustomer = {};
  orders.forEach(o => (byCustomer[o.customer_id] ??= []).push(o));
  customers.forEach(c => {
    const list = byCustomer[c.id] || [];
    c.order_count = list.length;
    c.open_order_count = list.filter(o => OPEN_ORDER_STATUSES.includes(o.status)).length;
    c.open_quote_count = list.filter(o => o.status === 'QUOTE').length;
    c.revenue = list.filter(o => REVENUE_STATUSES.includes(o.status))
      .reduce((s, o) => s + orderTotal(o, o.subtotal), 0);
    c.last_activity = list.reduce((m, o) => (o.activity_date > m ? o.activity_date : m), '') || null;
  });
  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const { name, email, phone, street, postal_code, city, country, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const number = nextCustomerNumber();
  const id = runGetId('INSERT INTO customers (number,name,email,phone,street,postal_code,city,country,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [number, name, email||'', phone||'', street||'', postal_code||'', city||'', country||'Deutschland', notes||'']);
  res.json(get('SELECT * FROM customers WHERE id=?', [id]));
});

app.get('/api/customers/:id', (req, res) => {
  const c = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Nicht gefunden' });

  // Angebote sind Auftraege in der Phase QUOTE, darum keine eigene Liste mehr
  c.orders = all(`
    SELECT o.*, COALESCE(SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)), 0) as subtotal,
      COUNT(oi.id) as item_count
    FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id=? GROUP BY o.id ORDER BY COALESCE(o.order_date, o.created_at) DESC, o.id DESC`, [c.id]);
  c.orders.forEach(o => { o.total = orderTotal(o, o.subtotal); });
  c.revenue = c.orders.filter(o => REVENUE_STATUSES.includes(o.status)).reduce((s, o) => s + o.total, 0);

  c.deliveries = all(`
    SELECT d.*, COUNT(di.id) as item_count,
      SUM(di.quantity * COALESCE(di.unit_price,0)) as total,
      o.number as order_number
    FROM deliveries d
    LEFT JOIN delivery_items di ON di.delivery_id = d.id
    LEFT JOIN orders o ON d.order_id = o.id
    WHERE d.customer_id=? GROUP BY d.id ORDER BY d.id DESC`, [c.id]);

  res.json(c);
});

app.put('/api/customers/:id', (req, res) => {
  const { name, email, phone, street, postal_code, city, country, notes } = req.body;
  run('UPDATE customers SET name=?,email=?,phone=?,street=?,postal_code=?,city=?,country=?,notes=? WHERE id=?',
    [name, email, phone, street, postal_code, city, country||'Deutschland', notes, req.params.id]);
  res.json(get('SELECT * FROM customers WHERE id=?', [req.params.id]));
});

app.delete('/api/customers/:id', (req, res) => {
  const c = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Nicht gefunden' });

  // Belege duerfen ihren Kunden nicht verlieren: ohne Namen bleibt der
  // Adressblock auf einer nachgedruckten Rechnung leer. Der Name wandert
  // darum in das Freitextfeld, das es dafuer schon gibt.
  const touched = {};
  for (const t of ['orders', 'quotes', 'deliveries']) {
    const rows = all(`SELECT id FROM ${t} WHERE customer_id=?`, [c.id]);
    if (!rows.length) continue;
    run(`UPDATE ${t} SET customer_name_free=COALESCE(NULLIF(customer_name_free,''), ?), customer_id=NULL WHERE customer_id=?`,
      [c.name, c.id]);
    touched[t] = rows.length;
  }
  run('DELETE FROM customers WHERE id=?', [c.id]);
  const summary = Object.entries(touched).map(([t, n]) => `${n}× ${t}`).join(', ');
  log('customer', c.id, 'Gelöscht', summary ? `Name übernommen in ${summary}` : 'ohne Belege');
  saveDb();
  res.json({ success: true, kept_name_in: touched });
});

// ==============================================================
// ORDERS
// ==============================================================
app.get('/api/orders', (req, res) => {
  const orders = all('SELECT o.*,COALESCE(c.name,o.customer_name_free) as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.number DESC');
  const itemsByOrder = {};
  all('SELECT * FROM order_items ORDER BY COALESCE(position,id),id').forEach(i => (itemsByOrder[i.order_id] ??= []).push(i));
  orders.forEach(o => {
    o.items = itemsByOrder[o.id] || [];
    const sub = o.items.reduce((s,i) => s + i.quantity*i.unit_price*(1-(i.discount_pct||0)/100), 0);
    o.computed_total = orderTotal(o, sub);
  });
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer_id, customer_name_free, title, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours, status, valid_until } = req.body;
  if (!title) return res.status(400).json({ error: 'Bezeichnung fehlt' });
  const number = nextOrderNumber();
  const id = runGetId('INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,delivery_date,valid_until,tax_rate,discount_pct,payment_terms,include_tax,estimated_hours,include_hours,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, customer_name_free||null, title, notes||'', order_date||null, delivery_date||null, valid_until||null, tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, status||'DRAFT']);
  res.json(get('SELECT * FROM orders WHERE id=?', [id]));
});

app.get('/api/orders/:id', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Nicht gefunden' });
  o.items = all('SELECT oi.*,i.item_number,i.item_type,i.default_price,i.weight_g FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=? ORDER BY COALESCE(oi.position,oi.id),oi.id', [o.id]);
  o.items.forEach(li => { li.manufacturing_cost = calcLineItemCost(li) || null; });
  // Fertigungslose zum Auftrag — damit der Fertigung-Tab ohne zweiten Request
  // auskommt und man nicht in die Produktionsliste wechseln muss.
  o.deliveries = all(`SELECT d.*, (SELECT COUNT(*) FROM delivery_items di WHERE di.delivery_id=d.id) as item_count
    FROM deliveries d WHERE d.order_id=? ORDER BY d.id`, [o.id]);
  res.json(o);
});

app.put('/api/orders/:id', (req, res) => {
  const { customer_id, customer_name_free, title, status, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours, valid_until } = req.body;
  run(`UPDATE orders SET customer_id=?,customer_name_free=?,title=?,status=?,notes=?,order_date=?,delivery_date=?,
    valid_until=?,tax_rate=?,discount_pct=?,payment_terms=?,include_tax=?,estimated_hours=?,include_hours=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id||null, customer_name_free||null, title, status, notes, order_date, delivery_date,
     valid_until||null, tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, req.params.id]);
  res.json(get('SELECT * FROM orders WHERE id=?', [req.params.id]));
});

app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (status === 'DELIVERED') {
    const existing = get('SELECT delivery_date FROM orders WHERE id=?', [req.params.id]);
    if (!existing?.delivery_date) {
      run(`UPDATE orders SET status=?,delivery_date=date('now'),updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
      return res.json({ success: true, delivery_date: new Date().toISOString().slice(0, 10) });
    }
  }
  run(`UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/orders/:id', (req, res) => {
  tx(() => {
    run('DELETE FROM order_items WHERE order_id=?', [req.params.id]);
    run('DELETE FROM orders WHERE id=?', [req.params.id]);
  });
  res.json({ success: true });
});

app.post('/api/orders/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  const id = runGetId('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null]);
  res.json(get('SELECT * FROM order_items WHERE id=?', [id]));
});

// ── Preis-Sync Auftrag ↔ Produktion ───────────────────────────
// Positionen sind über delivery_items.order_item_id verknüpft. Produktions-
// positionen aus der Zeit vor dieser Spalte werden über Auftrag + Artikel +
// Beschreibung gematcht und dabei dauerhaft nachverknüpft.
function linkedDeliveryItemIds(oi) {
  const direct = all('SELECT id FROM delivery_items WHERE order_item_id=?', [oi.id]).map(r => r.id);
  const legacy = all(`SELECT di.id FROM delivery_items di
    JOIN deliveries d ON di.delivery_id=d.id
    WHERE d.order_id=? AND di.order_item_id IS NULL
      AND COALESCE(di.item_id,-1)=COALESCE(?,-1) AND di.description=?`,
    [oi.order_id, oi.item_id ?? null, oi.description]).map(r => r.id);
  legacy.forEach(id => run('UPDATE delivery_items SET order_item_id=? WHERE id=?', [oi.id, id]));
  return direct.concat(legacy);
}

function syncPriceFromOrderItem(orderItemId) {
  const oi = get('SELECT * FROM order_items WHERE id=?', [orderItemId]);
  if (!oi) return 0;
  const ids = linkedDeliveryItemIds(oi);
  ids.forEach(id => run('UPDATE delivery_items SET unit_price=? WHERE id=?', [oi.unit_price ?? 0, id]));
  return ids.length;
}

app.put('/api/order-items/:id', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  run('UPDATE order_items SET item_id=?,description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=?,raw_material_id=?,estimated_hours=?,printer_name=?,estimated_print_hours=? WHERE id=?',
    [item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null, req.params.id]);
  const priceSynced = syncPriceFromOrderItem(req.params.id);
  const row = get('SELECT * FROM order_items WHERE id=?', [req.params.id]);
  if (row) row.price_synced = priceSynced;
  res.json(row);
});

app.delete('/api/order-items/:id', (req, res) => {
  run('DELETE FROM order_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.put('/api/order-items/:id/move', (req, res) => {
  const { direction } = req.body;
  const item = get('SELECT * FROM order_items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const siblings = all('SELECT id FROM order_items WHERE order_id=? ORDER BY COALESCE(position,id),id', [item.order_id]);
  siblings.forEach((s, i) => run('UPDATE order_items SET position=? WHERE id=?', [i+1, s.id]));
  const idx = siblings.findIndex(s => s.id === item.id);
  if (direction === 'up' && idx > 0) {
    run('UPDATE order_items SET position=? WHERE id=?', [idx, item.id]);
    run('UPDATE order_items SET position=? WHERE id=?', [idx+1, siblings[idx-1].id]);
  } else if (direction === 'down' && idx < siblings.length-1) {
    run('UPDATE order_items SET position=? WHERE id=?', [idx+2, item.id]);
    run('UPDATE order_items SET position=? WHERE id=?', [idx+1, siblings[idx+1].id]);
  }
  saveDb(); res.json({ success: true });
});

app.put('/api/delivery-items/:id/move', (req, res) => {
  const { direction } = req.body;
  const item = get('SELECT * FROM delivery_items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const siblings = all('SELECT id FROM delivery_items WHERE delivery_id=? ORDER BY COALESCE(position,id),id', [item.delivery_id]);
  siblings.forEach((s, i) => run('UPDATE delivery_items SET position=? WHERE id=?', [i+1, s.id]));
  const idx = siblings.findIndex(s => s.id === item.id);
  if (direction === 'up' && idx > 0) {
    run('UPDATE delivery_items SET position=? WHERE id=?', [idx, item.id]);
    run('UPDATE delivery_items SET position=? WHERE id=?', [idx+1, siblings[idx-1].id]);
  } else if (direction === 'down' && idx < siblings.length-1) {
    run('UPDATE delivery_items SET position=? WHERE id=?', [idx+2, item.id]);
    run('UPDATE delivery_items SET position=? WHERE id=?', [idx+1, siblings[idx+1].id]);
  }
  saveDb(); res.json({ success: true });
});

// ==============================================================
// QUOTES (ANGEBOTE)
// ==============================================================
app.get('/api/quotes', (req, res) => {
  const quotes = all('SELECT q.*,COALESCE(c.name,q.customer_name_free) as customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id ORDER BY q.number DESC');
  const itemsByQuote = {};
  all('SELECT * FROM quote_items ORDER BY COALESCE(position,id),id').forEach(i => (itemsByQuote[i.quote_id] ??= []).push(i));
  quotes.forEach(q => { q.items = itemsByQuote[q.id] || []; });
  res.json(quotes);
});

app.post('/api/quotes', (req, res) => {
  const { customer_id, customer_name_free, title, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Bezeichnung fehlt' });
  const number = nextQuoteNumber();
  const id = runGetId('INSERT INTO quotes (number,customer_id,customer_name_free,title,notes,quote_date,valid_until,tax_rate,discount_pct,payment_terms,include_tax,estimated_hours,include_hours,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, customer_name_free||null, title, notes||'', quote_date||null, valid_until||null, tax_rate??19, discount_pct??0, payment_terms||'30 Tage netto', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, status||'DRAFT']);
  res.json(get('SELECT * FROM quotes WHERE id=?', [id]));
});

app.get('/api/quotes/:id', (req, res) => {
  const q = get(`SELECT q.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id WHERE q.id=?`, [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Nicht gefunden' });
  q.items = all('SELECT qi.*,i.item_number,i.item_type,i.default_price,i.weight_g FROM quote_items qi LEFT JOIN items i ON qi.item_id=i.id WHERE qi.quote_id=?', [q.id]);
  q.items.forEach(li => { li.manufacturing_cost = calcLineItemCost(li) || null; });
  res.json(q);
});

app.put('/api/quotes/:id', (req, res) => {
  const { customer_id, customer_name_free, title, status, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours } = req.body;
  run(`UPDATE quotes SET customer_id=?,customer_name_free=?,title=?,status=?,notes=?,quote_date=?,valid_until=?,
    tax_rate=?,discount_pct=?,payment_terms=?,include_tax=?,estimated_hours=?,include_hours=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id||null, customer_name_free||null, title, status, notes, quote_date, valid_until,
     tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, req.params.id]);
  res.json(get('SELECT * FROM quotes WHERE id=?', [req.params.id]));
});

app.put('/api/quotes/:id/status', (req, res) => {
  const { status } = req.body;
  run(`UPDATE quotes SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/quotes/:id', (req, res) => {
  tx(() => {
    run('DELETE FROM quote_items WHERE quote_id=?', [req.params.id]);
    run('DELETE FROM quotes WHERE id=?', [req.params.id]);
  });
  res.json({ success: true });
});

app.post('/api/quotes/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  const id = runGetId('INSERT INTO quote_items (quote_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null]);
  res.json(get('SELECT * FROM quote_items WHERE id=?', [id]));
});

app.put('/api/quote-items/:id', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  run('UPDATE quote_items SET item_id=?,description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=?,raw_material_id=?,estimated_hours=?,printer_name=?,estimated_print_hours=? WHERE id=?',
    [item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null, req.params.id]);
  res.json(get('SELECT * FROM quote_items WHERE id=?', [req.params.id]));
});

app.delete('/api/quote-items/:id', (req, res) => {
  run('DELETE FROM quote_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/quotes/:id/convert', (req, res) => {
  const q = get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Nicht gefunden' });
  const orderId = tx(() => {
    const number = nextOrderNumber();
    const id = runGetId(`INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,tax_rate,discount_pct,payment_terms,include_tax)
      VALUES (?,?,?,?,?,date('now'),?,?,?,?)`,
      [number, q.customer_id, q.customer_name_free||null, q.title, q.notes||'', q.tax_rate, q.discount_pct, q.payment_terms||'', q.include_tax||0]);
    const qItems = all('SELECT * FROM quote_items WHERE quote_id=?', [q.id]);
    qItems.forEach(qi => {
      run('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [id, qi.item_id, qi.description, qi.quantity, qi.unit, qi.unit_price, qi.discount_pct, qi.notes||'', qi.raw_material_id||null, qi.estimated_hours||null, qi.printer_name||'', qi.estimated_print_hours||null]);
    });
    run("UPDATE quotes SET status='ACCEPTED',updated_at=datetime('now') WHERE id=?", [q.id]);
    return id;
  });
  res.json(get('SELECT * FROM orders WHERE id=?', [orderId]));
});

// ==============================================================
// RÜCKVERFOLGUNG
// ==============================================================
// Pro Position eines Produktionsauftrags: Revision, verbrauchte Material-
// Chargen und die Prüfung. Umgekehrt pro Rohmaterial: welche Charge in welchen
// Produktionsauftrag und zu welchem Kunden ging — für einen Rückruf.
const _userName = () => userContext.getStore()?.name || null;
function _positionRev(di) {
  const rev = di.revision_id ? get('SELECT id, rev, status FROM revisions WHERE id=?', [di.revision_id])
    : di.item_id ? getActiveRevision(di.item_id) : null;
  return rev ? { rev: rev.rev, status: rev.status, fixed: !!di.revision_id } : null;
}
const _usedLots = (where, params) => all(`SELECT m.qty, m.lot_number, m.created_at, rm.id AS raw_material_id,
    rm.name AS material, rm.unit
  FROM raw_material_movements m JOIN raw_materials rm ON rm.id=m.raw_material_id
  WHERE m.type='out' AND ${where} ORDER BY m.id`, params);

app.get('/api/deliveries/:id/trace', (req, res) => {
  const d = get(`SELECT d.*, COALESCE(c.name, d.customer_name_free) AS customer_name FROM deliveries d
    LEFT JOIN customers c ON c.id=d.customer_id WHERE d.id=?`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Nicht gefunden' });
  const positions = all(`SELECT di.*, i.item_number, i.item_type FROM delivery_items di
    LEFT JOIN items i ON i.id=di.item_id WHERE di.delivery_id=? ORDER BY di.position, di.id`, [d.id]).map(di => ({
    id: di.id, description: di.description, item_id: di.item_id, item_number: di.item_number, item_type: di.item_type,
    quantity: di.quantity, unit: di.unit, revision: _positionRev(di),
    lots: _usedLots('m.delivery_item_id=?', [di.id]),
    inspection: di.inspection_result ? { result: di.inspection_result, note: di.inspection_note,
      by: di.inspected_by, at: di.inspected_at } : null,
  }));
  res.json({ id: d.id, number: d.number, title: d.title, status: d.status, customer_name: d.customer_name,
    delivery_date: d.delivery_date, material_consumed: !!d.material_consumed, positions,
    unassigned_lots: _usedLots('m.delivery_id=? AND m.delivery_item_id IS NULL', [d.id]) });
});

// Prüfung einer Position: OK, NOK oder zurücksetzen (ohne result)
app.put('/api/delivery-items/:id/inspection', (req, res) => {
  const di = get('SELECT * FROM delivery_items WHERE id=?', [req.params.id]);
  if (!di) return res.status(404).json({ error: 'Nicht gefunden' });
  const result = ['OK', 'NOK'].includes(req.body?.result) ? req.body.result : null;
  const note = result ? String(req.body?.note ?? '').trim().slice(0, 500) : '';
  run(`UPDATE delivery_items SET inspection_result=?, inspection_note=?, inspected_by=?,
    inspected_at=${result ? "datetime('now')" : 'NULL'} WHERE id=?`, [result, note || null, result ? _userName() : null, di.id]);
  log('delivery', di.delivery_id, 'Prüfung', `${di.description}: ${
    result === 'OK' ? 'in Ordnung' : result === 'NOK' ? 'nicht in Ordnung' : 'zurückgesetzt'}${note ? ' – ' + note : ''}`);
  res.json(get('SELECT id, inspection_result, inspection_note, inspected_by, inspected_at FROM delivery_items WHERE id=?', [di.id]));
});

app.get('/api/raw-materials/:id/trace', (req, res) => {
  const rows = all(`SELECT m.lot_number, m.qty, m.created_at, d.id AS delivery_id, d.number AS delivery_number,
      d.title AS delivery_title, d.status AS delivery_status, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) AS customer_name,
      di.id AS delivery_item_id, di.description, di.item_id, di.revision_id, i.item_number
    FROM raw_material_movements m
    JOIN deliveries d ON d.id=m.delivery_id
    LEFT JOIN customers c ON c.id=d.customer_id
    LEFT JOIN delivery_items di ON di.id=m.delivery_item_id
    LEFT JOIN items i ON i.id=di.item_id
    WHERE m.raw_material_id=? AND m.type='out'
    ORDER BY m.lot_number, m.id DESC`, [req.params.id]);
  rows.forEach(r => { r.revision = r.delivery_item_id ? _positionRev(r) : null; delete r.revision_id; });
  res.json(rows);
});

// ==============================================================
// ÄNDERUNGSANTRÄGE (ECR)
// ==============================================================
function nextEcrNumber() {
  const y = new Date().getFullYear(), key = 'ecr-' + y;
  db.run('INSERT OR IGNORE INTO counters (key,value) VALUES (?,0)', [key]);
  db.run('UPDATE counters SET value=value+1 WHERE key=?', [key]);
  return `ECR-${y}-${String(get('SELECT value FROM counters WHERE key=?', [key]).value).padStart(3, '0')}`;
}

// Auswirkung einer Änderung: übergeordnete Baugruppen über alle Ebenen (jeweils
// der aktuelle Stand), offene Angebote, Aufträge und Produktionsaufträge mit
// dem Teil oder einer dieser Baugruppen, dazu der Lagerbestand.
function _ecrImpact(itemId) {
  const parents = [], seen = new Set([itemId]);
  for (let level = [itemId]; level.length;) {
    const next = [];
    for (const id of level) {
      for (const p of all(`SELECT DISTINCT i.id, i.item_number, i.name, i.item_type FROM bom b
          JOIN revisions r ON r.id=b.parent_rev_id JOIN items i ON i.id=r.item_id
          WHERE b.child_item_id=? AND r.id=(SELECT MAX(id) FROM revisions WHERE item_id=i.id)`, [id])) {
        if (seen.has(p.id)) continue;
        seen.add(p.id); parents.push(p); next.push(p.id);
      }
    }
    level = next;
  }
  const ids = [...seen], ph = ids.map(() => '?').join(',');
  return {
    parents,
    orders: all(`SELECT DISTINCT o.id, o.number, o.title, o.status FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE oi.item_id IN (${ph}) AND o.status IN ('QUOTE','DRAFT','CONFIRMED') ORDER BY o.number`, ids),
    production: all(`SELECT DISTINCT d.id, d.number, d.title, d.status FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id
      WHERE di.item_id IN (${ph}) AND d.status!='DELIVERED' ORDER BY d.number`, ids),
    stock: get('SELECT COALESCE(SUM(stock_qty),0) AS n FROM inventory_items WHERE item_id=?', [itemId]).n,
  };
}

function _ecrFull(id) {
  const e = get('SELECT * FROM ecrs WHERE id=?', [id]);
  if (!e) return null;
  const rev = rid => (rid && get('SELECT id, rev, status FROM revisions WHERE id=?', [rid])) || null;
  e.items = all(`SELECT ei.*, i.item_number, i.name, i.item_type FROM ecr_items ei JOIN items i ON i.id=ei.item_id
    WHERE ei.ecr_id=? ORDER BY i.item_number`, [e.id]).map(x => {
    const l = getLatestRevision(x.item_id);
    return { ...x, before: rev(x.rev_before), after: rev(x.rev_after),
      latest: l ? { id: l.id, rev: l.rev, status: l.status } : null, impact: _ecrImpact(x.item_id) };
  });
  return e;
}

// Teile aus der Anfrage: nur vorhandene, jedes einmal
function _ecrItemList(items) {
  const out = [], seen = new Set();
  for (const x of Array.isArray(items) ? items : []) {
    const id = parseInt(x?.item_id, 10);
    if (!id || seen.has(id) || !get('SELECT id FROM items WHERE id=?', [id])) continue;
    seen.add(id);
    out.push({ item_id: id, note: String(x.note ?? '').trim().slice(0, 1000) });
  }
  return out;
}
function _ecrOr404(req, res) {
  const e = get('SELECT * FROM ecrs WHERE id=?', [req.params.id]);
  if (!e) res.status(404).json({ error: 'Nicht gefunden' });
  return e;
}
function _ecrFields(req, res) {
  const title = String(req.body?.title ?? '').trim();
  if (!title) { res.status(400).json({ error: 'Titel fehlt' }); return null; }
  const items = _ecrItemList(req.body?.items);
  if (!items.length) { res.status(400).json({ error: 'Mindestens ein Teil wählen' }); return null; }
  return { title, reason: String(req.body?.reason ?? ''), description: String(req.body?.description ?? ''), items };
}

app.get('/api/ecrs', (req, res) => {
  res.json(all(`SELECT e.*, (SELECT COUNT(*) FROM ecr_items WHERE ecr_id=e.id) AS item_count FROM ecrs e
    ORDER BY CASE e.status WHEN 'OPEN' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'IN_WORK' THEN 2 ELSE 3 END, e.id DESC`));
});

app.get('/api/ecrs/:id', (req, res) => {
  const e = _ecrFull(req.params.id);
  if (!e) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(e);
});

app.post('/api/ecrs', (req, res) => {
  const f = _ecrFields(req, res);
  if (!f) return;
  const id = tx(() => {
    const number = nextEcrNumber();
    const id = runGetId('INSERT INTO ecrs (number,title,reason,description,created_by) VALUES (?,?,?,?,?)',
      [number, f.title, f.reason, f.description, _userName()]);
    for (const x of f.items) {
      run('INSERT INTO ecr_items (ecr_id,item_id,note,rev_before) VALUES (?,?,?,?)',
        [id, x.item_id, x.note, getLatestRevision(x.item_id)?.id ?? null]);
      log('item', x.item_id, 'Änderungsantrag', `${number} – ${f.title}`);
    }
    log('ecr', id, 'Angelegt', `${number} – ${f.title} (${f.items.length} ${f.items.length === 1 ? 'Teil' : 'Teile'})`);
    return id;
  });
  res.json(_ecrFull(id));
});

app.put('/api/ecrs/:id', (req, res) => {
  const e = _ecrOr404(req, res);
  if (!e) return;
  if (e.status !== 'OPEN') return res.status(400).json({ error: 'Nur offene Änderungsanträge lassen sich bearbeiten' });
  const f = _ecrFields(req, res);
  if (!f) return;
  tx(() => {
    run('UPDATE ecrs SET title=?, reason=?, description=? WHERE id=?', [f.title, f.reason, f.description, e.id]);
    // Der Stand beim Anlegen bleibt für Teile, die schon dabei waren
    const before = new Map(all('SELECT item_id, rev_before FROM ecr_items WHERE ecr_id=?', [e.id]).map(x => [x.item_id, x.rev_before]));
    run('DELETE FROM ecr_items WHERE ecr_id=?', [e.id]);
    for (const x of f.items) {
      run('INSERT INTO ecr_items (ecr_id,item_id,note,rev_before) VALUES (?,?,?,?)', [e.id, x.item_id, x.note,
        before.has(x.item_id) ? before.get(x.item_id) : (getLatestRevision(x.item_id)?.id ?? null)]);
    }
    log('ecr', e.id, 'Geändert', `${e.number} – ${f.title}`);
  });
  res.json(_ecrFull(e.id));
});

app.put('/api/ecrs/:id/decision', (req, res) => {
  const e = _ecrOr404(req, res);
  if (!e) return;
  if (e.status !== 'OPEN') return res.status(400).json({ error: 'Über diesen Änderungsantrag ist schon entschieden' });
  const approve = !!req.body?.approve;
  const note = String(req.body?.note ?? '').trim().slice(0, 1000);
  run("UPDATE ecrs SET status=?, decided_by=?, decided_at=datetime('now'), decision_note=? WHERE id=?",
    [approve ? 'APPROVED' : 'REJECTED', _userName(), note, e.id]);
  log('ecr', e.id, approve ? 'Genehmigt' : 'Abgelehnt', `${e.number}${note ? ' – ' + note : ''}`);
  res.json(_ecrFull(e.id));
});

// Umsetzen: je Teil die Revision, in der geändert wird — ein offener Entwurf
// oder eine neue Revision (freigegebene Teile per ECO)
app.post('/api/ecrs/:id/implement', (req, res) => {
  const e = _ecrOr404(req, res);
  if (!e) return;
  if (e.status !== 'APPROVED') return res.status(400).json({ error: 'Umsetzen geht erst nach der Genehmigung' });
  tx(() => {
    for (const x of all('SELECT * FROM ecr_items WHERE ecr_id=?', [e.id])) {
      const rev = _draftRevision(x.item_id, `${e.number}: ${e.title}`);
      if (!rev) continue;
      run('UPDATE ecr_items SET rev_after=? WHERE id=?', [rev.id, x.id]);
      log('item', x.item_id, 'Änderungsantrag umsetzen', `${e.number} → rev${rev.rev}`);
    }
    run("UPDATE ecrs SET status='IN_WORK' WHERE id=?", [e.id]);
    log('ecr', e.id, 'In Umsetzung', e.number);
  });
  res.json(_ecrFull(e.id));
});

app.post('/api/ecrs/:id/close', (req, res) => {
  const e = _ecrOr404(req, res);
  if (!e) return;
  if (e.status !== 'IN_WORK') return res.status(400).json({ error: 'Abschliessen geht erst nach dem Umsetzen' });
  run("UPDATE ecrs SET status='DONE', done_at=datetime('now') WHERE id=?", [e.id]);
  log('ecr', e.id, 'Erledigt', e.number);
  res.json(_ecrFull(e.id));
});

app.delete('/api/ecrs/:id', (req, res) => {
  const e = _ecrOr404(req, res);
  if (!e) return;
  if (!['OPEN', 'REJECTED'].includes(e.status)) {
    return res.status(400).json({ error: 'Genehmigte Änderungsanträge bleiben als Nachweis erhalten' });
  }
  tx(() => {
    run('DELETE FROM ecr_items WHERE ecr_id=?', [e.id]);
    run('DELETE FROM ecrs WHERE id=?', [e.id]);
    log('ecr', e.id, 'Gelöscht', `${e.number} – ${e.title}`);
  });
  res.json({ ok: true });
});

// ==============================================================
// DASHBOARD
// ==============================================================
// Nur was offen ist und Aufmerksamkeit braucht — leere Bereiche blendet die
// Oberfläche aus. Fristen sind schon sortiert: die dringendsten zuerst.
app.get('/api/dashboard', (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const orders = (statuses, orderBy) => all(`
    SELECT o.id, o.number, o.title, o.status, o.delivery_date, o.valid_until,
      COALESCE(c.name, o.customer_name_free) as customer_name,
      SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)) as total
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN (${statuses.map(() => '?').join(',')})
    GROUP BY o.id ORDER BY ${orderBy}`, statuses);
  const openOrders = orders(['DRAFT', 'CONFIRMED'], 'o.id DESC');
  // Angebote sind Aufträge in der Phase QUOTE — die bald ablaufenden zuerst
  const openQuotes = orders(['QUOTE'], 'o.valid_until IS NULL, o.valid_until, o.id DESC');

  // Produktion: noch nicht geliefert, die fälligsten zuerst
  const openDeliveries = all(`
    SELECT d.id, d.number, d.title, d.status, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id = c.id
    WHERE d.status != 'DELIVERED'
    ORDER BY d.delivery_date IS NULL, d.delivery_date, d.id DESC`);

  // PLM items currently in REV (awaiting approval)
  const inReview = all(`
    SELECT i.id, i.item_number, i.item_type, i.name, i.project_id,
      r.id as rev_id, r.rev, r.status, r.updated_at,
      p.number as project_number, p.name as project_name
    FROM revisions r
    JOIN items i ON r.item_id = i.id
    JOIN projects p ON i.project_id = p.id
    WHERE r.status = 'REV'
    ORDER BY r.updated_at DESC`);

  // Lager auf oder unter dem Mindestbestand, die knappsten zuerst
  const lowStock = all(`
    SELECT id, name, color, material, unit, stock_qty, min_qty FROM inventory_items
    WHERE min_qty > 0 AND stock_qty <= min_qty
    ORDER BY stock_qty < min_qty DESC, name`);

  const revenue = monthOnly => get(`
    SELECT COALESCE(SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)), 0) as total
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED','INVOICED','DELIVERED')${monthOnly ? ' AND o.created_at LIKE ?' : ''}`,
    monthOnly ? [thisMonth + '%'] : [])?.total || 0;

  // Kennzahlen zur Datenbank — Zählungen und Summen aus der DB (die
  // Dateigrössen stehen in datasets), ohne jede Datei auf der Platte anzufassen
  const n = sql => get(sql)?.n || 0;
  let dbBytes = 0, lastBackup = null;
  try { dbBytes = fs.statSync(DB_PATH).size; } catch {}
  try {
    for (const f of fs.readdirSync(BACKUP_DIR)) {
      if (!BACKUP_NAME_RE.test(f)) continue;
      const t = fs.statSync(path.join(BACKUP_DIR, f)).mtime.toISOString();
      if (!lastBackup || t > lastBackup) lastBackup = t;
    }
  } catch {}
  const stats = {
    projects:   n('SELECT COUNT(*) n FROM projects'),
    assemblies: n("SELECT COUNT(*) n FROM items WHERE item_type='asm'"),
    parts:      n("SELECT COUNT(*) n FROM items WHERE item_type='prt'"),
    documents:  n("SELECT COUNT(*) n FROM items WHERE item_type='doc'"),
    released:   n("SELECT COUNT(DISTINCT item_id) n FROM revisions WHERE status='REL'"),
    revisions:  n('SELECT COUNT(*) n FROM revisions'),
    standard_parts: n('SELECT COUNT(*) n FROM standard_parts'),
    customers:  n('SELECT COUNT(*) n FROM customers'),
    orders:     n("SELECT COUNT(*) n FROM orders WHERE status IN ('DRAFT','CONFIRMED','DELIVERED','INVOICED')"),
    delivered:  n("SELECT COUNT(*) n FROM deliveries WHERE status='DELIVERED'"),
    hours:      n('SELECT COALESCE(SUM(hours),0) n FROM time_entries'),
    files:      n('SELECT COUNT(*) n FROM datasets'),
    files_bytes: n('SELECT COALESCE(SUM(file_size),0) n FROM datasets'),
    db_bytes:   dbBytes,
    last_backup: lastBackup,
    since:      get('SELECT MIN(created_at) n FROM changelog')?.n || null,   // erster Eintrag der Historie
    version:    APP_VERSION,
  };

  const openEcrs = all(`SELECT e.id, e.number, e.title, e.status,
      (SELECT COUNT(*) FROM ecr_items WHERE ecr_id=e.id) AS item_count
    FROM ecrs e WHERE e.status IN ('OPEN','APPROVED','IN_WORK') ORDER BY e.id DESC`);

  res.json({ openDeliveries, openOrders, openQuotes, inReview, lowStock, openEcrs,
    revenueMonth: revenue(true), revenueTotal: revenue(false), stats });
});

// ==============================================================
// STATS / SEARCH
// ==============================================================
app.get('/api/stats', (req, res) => {
  const recentItems = all('SELECT i.*,p.name as project_name FROM items i JOIN projects p ON i.project_id=p.id ORDER BY i.id DESC LIMIT 8');
  recentItems.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  res.json({
    projects:   count('SELECT COUNT(*) as c FROM projects'),
    items:      count('SELECT COUNT(*) as c FROM items'),
    assemblies: count("SELECT COUNT(*) as c FROM items WHERE item_type='asm'"),
    parts:      count("SELECT COUNT(*) as c FROM items WHERE item_type='prt'"),
    datasets:   count('SELECT COUNT(*) as c FROM datasets'),
    customers:  count('SELECT COUNT(*) as c FROM customers'),
    orders:     count('SELECT COUNT(*) as c FROM orders'),
    quotes:     count('SELECT COUNT(*) as c FROM quotes'),
    deliveries: count('SELECT COUNT(*) as c FROM deliveries'),
    inventory:     count('SELECT COUNT(*) as c FROM inventory_items'),
    raw_materials: count('SELECT COUNT(*) as c FROM raw_materials'),
    standard_parts:count('SELECT COUNT(*) as c FROM standard_parts'),
    open_pos:      count("SELECT COUNT(*) as c FROM purchase_orders WHERE status IN ('DRAFT','ORDERED')"),
    ecr_open:      count("SELECT COUNT(*) as c FROM ecrs WHERE status IN ('OPEN','APPROVED','IN_WORK')"),
    by_status:     all(`SELECT r.status, COUNT(*) as count FROM revisions r JOIN items i ON r.item_id=i.id WHERE r.id=(SELECT MAX(r2.id) FROM revisions r2 WHERE r2.item_id=r.item_id) GROUP BY r.status ORDER BY r.status`),
    recent_items:  recentItems,
    recent_projects: all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 5'),
  });
});

app.get('/api/storage', (req, res) => {
  let dbSize = 0, filesSize = 0;
  try { dbSize = fs.statSync(DB_PATH).size; } catch {}
  function dirSize(dir) {
    let total = 0;
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) total += dirSize(p);
        else try { total += fs.statSync(p).size; } catch {}
      }
    } catch {}
    return total;
  }
  filesSize = dirSize(FILES_DIR);
  const trashSize = dirSize(TRASH_DIR);
  res.json({ db_bytes: dbSize, files_bytes: filesSize, trash_bytes: trashSize, total_bytes: dbSize + filesSize + trashSize });
});

// ── SUCHE ─────────────────────────────────────────────────────
// Mehrere Wörter müssen alle vorkommen, egal in welchem Feld: „Halter PETG"
// findet ein Item mit „Halter" im Namen und „PETG" in der Beschreibung.
// class= filtert Items exakt nach Klassifizierung (__none__ = ohne) und lässt
// die übrigen Bereiche weg, weil nur Items eine Klassifizierung haben.
// class_counts zählt die Item-Treffer je Klassifizierung für die Wortsuche
// ohne Klassenfilter — daraus zeigen die Chips ihre Zahlen.
// Angebote sind Aufträge in der Phase QUOTE und erscheinen unter orders.
function searchTokens(q) {
  return String(q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
}
// SQLite-LIKE ignoriert Gross-/Kleinschreibung nur bei ASCII: „öse" fände
// „Öse M5" nicht. Wörter mit Umlaut werden darum zusätzlich in Klein- und
// Grossschreibung der Umlaute gesucht.
function tokenVariants(t) {
  if (!/[äöüÄÖÜ]/.test(t)) return [t];
  const lower = t.replace(/[ÄÖÜ]/g, c => c.toLowerCase());
  const upper = t.replace(/[äöü]/g, c => c.toUpperCase());
  return [...new Set([t, lower, upper])];
}
function likeAll(tokens, columns) {
  if (!tokens.length) return { sql: '1=1', params: [] };
  const params = [];
  const sql = tokens.map(t => {
    const parts = [];
    for (const c of columns) {
      for (const v of tokenVariants(t)) { parts.push(`COALESCE(${c},'') LIKE ?`); params.push('%' + v + '%'); }
    }
    return '(' + parts.join(' OR ') + ')';
  }).join(' AND ');
  return { sql, params };
}
// Relevanz: exakte oder beginnende Nummer zuerst, dann Name, dann der Rest
function itemScore(i, tokens, raw) {
  const q = String(raw || '').trim().toLowerCase();
  const num = (i.item_number || '').toLowerCase(), name = (i.name || '').toLowerCase();
  let score = 0;
  if (q) {
    if (num === q) score += 100; else if (num.startsWith(q)) score += 60;
    if (name === q) score += 50; else if (name.startsWith(q)) score += 30;
  }
  for (const t of tokens.map(x => x.toLowerCase())) {
    if (num.includes(t)) score += 12;
    if (name.includes(t)) score += 10;
    if ((i.classification || '').toLowerCase() === t) score += 8;
    if ((i.description || '').toLowerCase().includes(t)) score += 3;
    if ((i.notes || '').toLowerCase().includes(t)) score += 2;
  }
  return score;
}

app.get('/api/search', (req, res) => {
  const tokens = searchTokens(req.query.q);
  const cls = String(req.query.class || '').trim();
  const empty = { items: [], items_total: 0, projects: [], datasets: [], orders: [], customers: [], deliveries: [], rawMaterials: [] };

  const wi = likeAll(tokens, ['i.item_number', 'i.short_code', 'i.name', 'i.description', 'i.classification', 'i.notes']);
  const class_counts = all(`SELECT TRIM(COALESCE(i.classification,'')) as name, COUNT(*) as count
    FROM items i WHERE ${wi.sql} GROUP BY LOWER(TRIM(COALESCE(i.classification,'')))`, wi.params);
  if (!tokens.length && !cls) return res.json({ ...empty, class_counts, class: '' });

  let clsSql = '', clsParams = [];
  if (cls === '__none__') clsSql = " AND (i.classification IS NULL OR TRIM(i.classification)='')";
  else if (cls) { clsSql = ' AND LOWER(TRIM(i.classification))=LOWER(?)'; clsParams = [cls]; }

  const keep = cls ? 300 : 40;
  const items = all(`SELECT i.*, p.name as project_name, p.number as project_number, p.color as project_color
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE ${wi.sql}${clsSql} ORDER BY i.id DESC LIMIT 500`, [...wi.params, ...clsParams]);
  items.forEach(i => { i.score = itemScore(i, tokens, req.query.q); });
  items.sort((a, b) => b.score - a.score || a.item_number.localeCompare(b.item_number));
  const items_total = count(`SELECT COUNT(*) as c FROM items i WHERE ${wi.sql}${clsSql}`, [...wi.params, ...clsParams]);
  const shown = items.slice(0, keep);
  shown.forEach(i => { i.latest_revision = getLatestRevision(i.id); });

  if (cls) return res.json({ ...empty, items: shown, items_total, class_counts, class: cls });

  const wp = likeAll(tokens, ['number', 'name', 'description', 'customer']);
  const projects = all(`SELECT * FROM projects WHERE ${wp.sql} LIMIT 10`, wp.params);

  const wd = likeAll(tokens, ['d.original_name', 'd.notes']);
  const datasets = all(`SELECT d.id, d.original_name, d.ds_type, d.file_size,
    r.rev, i.item_number, i.id as item_id, i.project_id,
    p.number as project_number, p.name as project_name
    FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id JOIN projects p ON i.project_id=p.id
    WHERE ${wd.sql} ORDER BY d.id DESC LIMIT 20`, wd.params);

  const wo = likeAll(tokens, ['o.number', 'o.title', 'c.name', 'o.customer_name_free']);
  const orders = all(`SELECT o.id, o.number, o.title, o.status, o.order_date, o.delivery_date, o.valid_until,
    COALESCE(c.name, o.customer_name_free) as customer_name
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id
    WHERE ${wo.sql} ORDER BY o.id DESC LIMIT 15`, wo.params);

  const wc = likeAll(tokens, ['number', 'name', 'email', 'city']);
  const customers = all(`SELECT id, number, name, email, city, phone FROM customers
    WHERE ${wc.sql} ORDER BY id DESC LIMIT 10`, wc.params);

  const wl = likeAll(tokens, ['d.number', 'd.title', 'c.name', 'd.customer_name_free']);
  const deliveries = all(`SELECT d.id, d.number, d.title, d.status, d.delivery_date, d.order_id,
    COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d LEFT JOIN customers c ON d.customer_id=c.id
    WHERE ${wl.sql} ORDER BY d.id DESC LIMIT 10`, wl.params);

  // Rohmaterial: sucht auch in Lot- und Artikelnummern
  const wr = likeAll(tokens, ['rm.name', 'rm.material_type', 'rm.color', 'rm.brand', 'rmm.article_number', 'rmm.lot_number']);
  const rawMaterials = all(`
    SELECT DISTINCT rm.id, rm.name, rm.material_type, rm.color, rm.brand, rm.stock_qty, rm.unit,
      rmm.article_number, rmm.lot_number
    FROM raw_materials rm
    LEFT JOIN raw_material_movements rmm ON rmm.raw_material_id=rm.id AND rmm.article_number IS NOT NULL
    WHERE ${wr.sql}
    ORDER BY rm.name LIMIT 15`, wr.params);

  // Kurzcode oder Etiketten-QR: direkter Treffer auf Teil und Revision
  const code_match = findByPrintCode(req.query.q);

  res.json({ code_match, items: shown, items_total, projects, datasets, orders, customers, deliveries, rawMaterials, class_counts, class: '' });
});

// ── KLASSIFIZIERUNG: VERWENDUNG UND UMBENENNEN ────────────────
// Verwendung je Wert, auch für Werte, die nicht (mehr) in der Liste stehen
app.get('/api/classifications/usage', (req, res) => {
  const list = classificationList().map(n => n.toLowerCase());
  const usage = all(`SELECT TRIM(classification) as name, COUNT(*) as count FROM items
    WHERE classification IS NOT NULL AND TRIM(classification)!=''
    GROUP BY LOWER(TRIM(classification)) ORDER BY name`);
  usage.forEach(u => { u.in_list = list.includes(u.name.toLowerCase()); });
  res.json({ usage, without: count("SELECT COUNT(*) as c FROM items WHERE classification IS NULL OR TRIM(classification)=''") });
});

// Neuen Namen auf alle Items übertragen; to = '' entfernt die Klassifizierung.
// Mehrere Umbenennungen (auch A↔B) laufen über Platzhalter, damit keine die
// andere überschreibt.
app.post('/api/classifications/rename', (req, res) => {
  const renames = (Array.isArray(req.body?.renames) ? req.body.renames : [])
    .map(r => ({ from: String(r?.from ?? '').trim(), to: String(r?.to ?? '').trim() }))
    .filter(r => r.from && r.from !== r.to);
  const result = [];
  // Voreinstellungen vorher lesen, damit auch ein Tausch A↔B richtig ankommt
  const defaults = ['default_class_own', 'default_class_bought']
    .map(key => [key, getSetting(key, '').trim().toLowerCase()]);
  tx(() => {
    const tag = '__umbenennen_' + Date.now() + '_';
    renames.forEach((r, i) => db.run('UPDATE items SET classification=? WHERE LOWER(TRIM(classification))=LOWER(?)', [tag + i, r.from]));
    renames.forEach((r, i) => {
      const n = count('SELECT COUNT(*) as c FROM items WHERE classification=?', [tag + i]);
      db.run('UPDATE items SET classification=? WHERE classification=?', [r.to || null, tag + i]);
      result.push({ ...r, items: n });
      // Voreinstellungen für neue Teile ziehen mit
      for (const [key, value] of defaults) {
        if (value === r.from.toLowerCase()) db.run('UPDATE settings SET value=? WHERE key=?', [r.to, key]);
      }
      if (n) log('settings', 0, r.to ? 'Klassifizierung umbenannt' : 'Klassifizierung entfernt',
        r.to ? `${r.from} → ${r.to} (${n} Item${n === 1 ? '' : 's'})` : `${r.from} (${n} Item${n === 1 ? '' : 's'})`);
    });
  });
  res.json({ renamed: result.reduce((s, r) => s + r.items, 0), renames: result });
});

app.get('/api/changelog', (req, res) => {
  const limit = parseInt(req.query.limit) || 150;
  const rows = all('SELECT * FROM changelog ORDER BY created_at DESC, id DESC LIMIT ?', [limit]);
  rows.forEach(r => {
    if (r.entity_type === 'item') {
      const item = get('SELECT item_number, name, project_id, item_type FROM items WHERE id=?', [r.entity_id]);
      if (item) { r.ref = item.item_number; r.label = item.name; r.project_id = item.project_id; r.item_id = r.entity_id; r.item_type = item.item_type; }
    } else if (r.entity_type === 'revision') {
      const rev = get('SELECT item_id FROM revisions WHERE id=?', [r.entity_id]);
      if (rev) {
        const item = get('SELECT item_number, name, project_id, item_type FROM items WHERE id=?', [rev.item_id]);
        if (item) { r.ref = item.item_number; r.label = item.name; r.project_id = item.project_id; r.item_id = rev.item_id; r.item_type = item.item_type; }
      }
    } else if (r.entity_type === 'project') {
      const proj = get('SELECT number, name FROM projects WHERE id=?', [r.entity_id]);
      if (proj) { r.ref = proj.number; r.label = proj.name; r.project_id = r.entity_id; }
    } else if (r.entity_type === 'order' || r.entity_type === 'delivery') {
      const row = get(`SELECT number, title FROM ${r.entity_type === 'order' ? 'orders' : 'deliveries'} WHERE id=?`, [r.entity_id]);
      if (row) { r.ref = row.number; r.label = row.title; }
    } else if (r.entity_type === 'customer') {
      const c = get('SELECT number, name FROM customers WHERE id=?', [r.entity_id]);
      if (c) { r.ref = c.number; r.label = c.name; }
    } else if (r.entity_type === 'ecr') {
      const e = get('SELECT number, title FROM ecrs WHERE id=?', [r.entity_id]);
      if (e) { r.ref = e.number; r.label = e.title; }
    }
  });
  res.json(rows);
});

app.get('/api/items-released', (req, res) => {
  try {
    // Normal nicht löschbar: freigegeben (auch im ECO) oder geliefert —
    // diese Liste bietet sie unter Einstellungen → Admin an
    const delivered = `SELECT di.item_id FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id
        WHERE d.status='DELIVERED' AND di.item_id IS NOT NULL
      UNION SELECT ds.item_id FROM delivery_structure ds JOIN delivery_items di ON di.id=ds.delivery_item_id
        JOIN deliveries d ON d.id=di.delivery_id WHERE d.status='DELIVERED'`;
    const items = all(`
      SELECT i.id, i.item_number, i.name, i.item_type, p.number as project_number,
        CASE WHEN i.id IN (${delivered}) THEN 1 ELSE 0 END as delivered
      FROM items i
      JOIN projects p ON i.project_id = p.id
      WHERE i.id IN (SELECT item_id FROM revisions WHERE status IN ('REL','OBS','ECO'))
         OR i.id IN (${delivered})
      ORDER BY p.number, i.item_number`);
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/items-all', (req, res) => {
  const q = req.query.q ? '%' + req.query.q + '%' : '%';
  const items = all(`SELECT i.id, i.item_number, i.name, i.item_type, i.default_price, i.weight_g,
    p.name as project_name, p.number as project_number
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE i.item_number LIKE ? OR i.name LIKE ?
    ORDER BY i.item_number LIMIT 40`, [q, q]);
  items.forEach(i => {
    i.latest_revision = getLatestRevision(i.id);
    if (i.latest_revision) {
      i.latest_revision.print_settings = get('SELECT * FROM print_settings WHERE revision_id=?', [i.latest_revision.id]) || null;
      i.manufacturing_cost = calcItemCost(i.id);
    }
  });
  res.json(items);
});

// Returns effective weight for an item: direct weight_g if set, else sum of BOM children (recursive)
function getEffectiveWeight(itemId, _visited) {
  const visited = _visited || new Set();
  if (visited.has(itemId)) return null;
  visited.add(itemId);
  const item = get('SELECT weight_g, item_type FROM items WHERE id=?', [itemId]);
  if (!item) return null;
  if (item.weight_g > 0) return item.weight_g;
  if (item.item_type !== 'asm') return null;
  const rev = getLatestRevision(itemId);
  if (!rev) return null;
  const bom = all('SELECT child_item_id, quantity FROM bom WHERE parent_rev_id=?', [rev.id]);
  if (!bom.length) return null;
  let total = 0, hasAny = false;
  for (const b of bom) {
    const w = getEffectiveWeight(b.child_item_id, new Set(visited));
    if (w == null) continue;
    total += w * b.quantity;
    hasAny = true;
  }
  return hasAny ? total : null;
}

function calcLineItemCost(oi) {
  let material = 0, machine = 0, work = 0;
  if (oi.raw_material_id && oi.item_id) {
    const rm      = get('SELECT weight_g FROM raw_materials WHERE id=?', [oi.raw_material_id]);
    const itemW   = getEffectiveWeight(oi.item_id);
    const mov     = get(`SELECT unit_price FROM raw_material_movements
      WHERE raw_material_id=? AND type='in' AND unit_price IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`, [oi.raw_material_id]);
    if (rm?.weight_g > 0 && itemW > 0 && mov?.unit_price != null) {
      material = (mov.unit_price / rm.weight_g) * itemW;
    }
  }
  if (oi.printer_name && oi.estimated_print_hours > 0) {
    const printer = get('SELECT cost_per_hour FROM printers WHERE name=?', [oi.printer_name]);
    if (printer?.cost_per_hour > 0) machine = oi.estimated_print_hours * printer.cost_per_hour;
  }
  if (oi.estimated_hours > 0) {
    const rate = parseFloat(getSetting('hourly_rate', '0')) || 0;
    if (rate > 0) work = oi.estimated_hours * rate;
  }
  const total = material + machine + work;
  return total > 0 ? { material, machine, work, total } : null;
}

app.get('/api/profit-overview', (req, res) => {
  const items = all(`SELECT i.id, i.project_id, i.item_number, i.name, i.item_type, i.default_price,
    i.weight_g, i.classification,
    p.id as project_db_id, p.name as project_name, p.number as project_number
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE i.item_type IN ('prt','asm')
    ORDER BY p.number, i.item_number`);

  // Revenue, qty and weighted-avg unit_price per item from non-cancelled orders
  const revenueStats = all(`
    SELECT oi.item_id,
      SUM(oi.quantity) as total_qty,
      SUM(oi.quantity * COALESCE(oi.unit_price, 0)) as total_revenue,
      SUM(oi.quantity * COALESCE(oi.unit_price, 0)) / NULLIF(SUM(oi.quantity), 0) as avg_unit_price
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status NOT IN ('CANCELLED') AND oi.item_id IS NOT NULL AND oi.unit_price IS NOT NULL
    GROUP BY oi.item_id`);
  const revenueById = {};
  revenueStats.forEach(s => { revenueById[s.item_id] = s; });

  // Calculated cost per item: weighted average of calcLineItemCost across all non-cancelled order_items
  const allOrderItems = all(`
    SELECT oi.item_id, oi.quantity, oi.raw_material_id, oi.estimated_hours,
           oi.printer_name, oi.estimated_print_hours
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status NOT IN ('CANCELLED') AND oi.item_id IS NOT NULL`);

  const costSumById = {};  // { item_id: { weightedCostSum, totalQty } }
  allOrderItems.forEach(oi => {
    const c = calcLineItemCost(oi);
    if (!c) return;
    if (!costSumById[oi.item_id]) costSumById[oi.item_id] = { weightedSum: 0, qty: 0 };
    costSumById[oi.item_id].weightedSum += c.total * oi.quantity;
    costSumById[oi.item_id].qty         += oi.quantity;
  });

  items.forEach(i => {
    const rev  = revenueById[i.id];
    i.order_qty     = rev ? (rev.total_qty || 0) : 0;
    i.order_revenue = rev ? (rev.total_revenue || 0) : 0;
    const cs = costSumById[i.id];
    i.avg_calc_cost  = (cs && cs.qty > 0) ? cs.weightedSum / cs.qty : null;
    i.avg_unit_price = rev?.avg_unit_price ?? null;
    const cost  = i.avg_calc_cost;
    const price = i.avg_unit_price;
    i.margin     = (cost != null && price != null) ? price - cost : null;
    i.margin_pct = (i.margin != null && cost > 0) ? (i.margin / cost * 100) : null;
    i.theor_gain = (i.margin != null && i.order_qty > 0) ? i.margin * i.order_qty : null;
  });
  res.json(items);
});

// ==============================================================
// DOCUMENTS (project-level)
// ==============================================================
app.post('/api/projects/:id/documents', upload.single('file'), (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const { name, notes } = req.body;
  const docType = guessType(req.file.originalname);
  const displayName = name || req.file.originalname;
  const id = runGetId('INSERT INTO documents (project_id,name,filename,original_name,file_size,doc_type,notes) VALUES (?,?,?,?,?,?,?)',
    [p.id, displayName, req.file.filename, req.file.originalname, req.file.size, docType, notes || req.file.originalname]);
  log('project', p.id, 'Dokument hochgeladen', displayName + ' (' + docType + ')');
  res.json(get('SELECT * FROM documents WHERE id=?', [id]));
});

app.get('/api/documents/:id/download', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  const fp = path.join(FILES_DIR, doc.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei fehlt' });
  res.download(fp, doc.original_name);
});

app.get('/api/documents/:id/view', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  const fp = path.join(FILES_DIR, doc.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei fehlt' });
  res.setHeader('Content-Type', mimeType(doc.original_name));
  res.setHeader('Content-Disposition', 'inline; filename="' + doc.original_name.replace(/"/g, '') + '"');
  res.sendFile(fp);
});

app.put('/api/documents/:id', (req, res) => {
  const { name, notes } = req.body;
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  run('UPDATE documents SET name=?,notes=? WHERE id=?', [name||doc.name, notes??doc.notes, req.params.id]);
  res.json(get('SELECT * FROM documents WHERE id=?', [req.params.id]));
});

app.delete('/api/documents/:id', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  trashFile(doc.filename);
  run('DELETE FROM documents WHERE id=?', [req.params.id]);
  log('project', doc.project_id, 'Dokument gelöscht', doc.name);
  res.json({ success: true });
});

app.get('/api/projects/:id/items-for-bom', (req, res) => {
  const items = all("SELECT * FROM items WHERE project_id=? AND item_type IN ('asm','prt')", [req.params.id]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  res.json(items);
});

app.get('/api/items-for-bom', (req, res) => {
  const q = req.query.q ? '%' + req.query.q + '%' : '%';
  const items = all(`SELECT i.*, p.number as project_number, p.name as project_name
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE i.item_type IN ('asm','prt') AND (i.item_number LIKE ? OR i.name LIKE ? OR p.number LIKE ?)
    ORDER BY p.number, i.item_number LIMIT 40`, [q, q, q]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  res.json(items);
});

// ==============================================================
// SETTINGS
// ==============================================================
app.get('/api/counters', (req, res) => {
  res.json(Object.fromEntries(all('SELECT key, value FROM counters').map(r => [r.key, r.value])));
});

app.put('/api/counters', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => {
    const n = parseInt(v);
    if (!isNaN(n) && n >= 0) db.run('UPDATE counters SET value=? WHERE key=?', [n, k]);
  });
  saveDb();
  res.json(Object.fromEntries(all('SELECT key, value FROM counters').map(r => [r.key, r.value])));
});

// Firmenlogo für Angebote, Rechnungen usw. — als Data-URL in den Einstellungen,
// damit es in jeder Sicherung steckt. /api/settings lädt bei jedem Seitenstart,
// dort steht deshalb nur company_logo_at (Zeitpunkt = Version des Logos).
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const LOGO_KEYS = ['company_logo', 'company_logo_at'];
const uploadLogo = _keepUser(multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }));
function _publicSettings() {
  const s = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  delete s.company_logo;
  return s;
}

app.get('/api/settings', (req, res) => {
  res.json(_publicSettings());
});

app.get('/api/settings/logo', (req, res) => {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(getSetting('company_logo', ''));
  if (!m) return res.status(404).json({ error: 'Kein Logo hinterlegt' });
  res.setHeader('Content-Type', m[1]);
  // Ein SVG kann Skripte enthalten — direkt im Browser geöffnet laufen sie so nicht
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(Buffer.from(m[2], 'base64'));
});

app.post('/api/settings/logo', (req, res) => uploadLogo.single('file')(req, res, err => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Das Logo ist zu gross (höchstens 2 MB)' : err.message });
  const f = req.file;
  if (!f || !LOGO_TYPES.includes(f.mimetype)) return res.status(400).json({ error: 'Bitte ein Bild wählen: PNG, JPG, WebP oder SVG' });
  const vals = [`data:${f.mimetype};base64,${f.buffer.toString('base64')}`, String(Date.now())];
  LOGO_KEYS.forEach((k, i) => db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, vals[i]]));
  saveDb();
  res.json(_publicSettings());
}));

app.delete('/api/settings/logo', (req, res) => {
  db.run(`DELETE FROM settings WHERE key IN (${LOGO_KEYS.map(() => '?').join(',')})`, LOGO_KEYS);
  saveDb();
  res.json(_publicSettings());
});

// Bestimmt, wo der Check-in Ordner löscht — nur vom PC aus änderbar
const LOCAL_ONLY_SETTINGS = ['checkout_dir'];

app.put('/api/settings', (req, res) => {
  const changed = LOCAL_ONLY_SETTINGS.filter(k => k in req.body && String(req.body[k] ?? '') !== getSetting(k, ''));
  if (changed.length && !_isLocalRequest(req)) {
    return res.status(403).json({ error: 'Das Checkout-Verzeichnis lässt sich nur auf dem PC ändern, auf dem das PLM läuft.' });
  }
  // Das Logo kommt nur über /api/settings/logo
  Object.entries(req.body).filter(([k]) => !LOGO_KEYS.includes(k)).forEach(([k, v]) => {
    db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v??'')]);
  });
  saveDb();
  res.json(_publicSettings());
});

// -- DATA PATH -------------------------------------------------
app.get('/api/data-path', (req, res) => {
  const cfg = loadConfig();
  res.json({ data_dir: DATA_DIR, db_path: DB_PATH, files_dir: FILES_DIR, config_file: PLM_CONFIG_PATH, configured: !!cfg.data_dir });
});

app.put('/api/data-path', (req, res) => {
  const { data_dir } = req.body;
  if (!data_dir || typeof data_dir !== 'string') return res.status(400).json({ error: 'Datenverzeichnis fehlt' });
  const cfg = loadConfig();
  cfg.data_dir = data_dir.trim();
  saveConfig(cfg);
  res.json({ ok: true, message: 'Pfad gespeichert. Bitte Server neu starten damit die Änderung wirksam wird.' });
});

// -- DATA MOVE -------------------------------------------------
// Verschiebt das komplette Datenverzeichnis (Datenbank, Dateien, Backups,
// Checkout …) an einen neuen Ort: kopieren → prüfen → umschalten → aufräumen.
const dataMove = {
  running: false, done: false, error: null, phase: '', message: '',
  from: '', to: '', total_bytes: 0, copied_bytes: 0, total_files: 0, keep_source: false,
};

function dirStats(dir) {
  let bytes = 0, files = 0;
  const stack = [dir];
  while (stack.length) {
    let entries = [];
    const d = stack.pop();
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) { files++; try { bytes += fs.statSync(p).size; } catch {} }
    }
  }
  return { bytes, files };
}

// Asynchron kopieren, damit der Server während des Umzugs erreichbar bleibt
// (Fortschrittsabfrage im Frontend) und nicht blockiert.
async function copyTree(src, dest, onBytes) {
  await fs.promises.mkdir(dest, { recursive: true });
  for (const e of await fs.promises.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyTree(s, d, onBytes);
    else if (e.isFile()) {
      await fs.promises.copyFile(s, d);
      onBytes((await fs.promises.stat(d)).size);
    }
    // Symlinks/Sonderdateien werden übersprungen
  }
}

// true wenn child gleich parent ist oder darin liegt
function isInside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}

function fmtMB(b) { return (b / 1024 / 1024).toFixed(1) + ' MB'; }

async function runDataMove(target, keepSource, targetExisted) {
  const source = DATA_DIR;
  try {
    dataMove.phase = 'prepare';
    flushDb();                                  // ausstehende DB-Änderungen sichern
    dataMove.phase = 'copy';
    await copyTree(source, target, b => { dataMove.copied_bytes += b; });

    dataMove.phase = 'verify';
    const a = dirStats(source), b = dirStats(target);
    if (a.files !== b.files || a.bytes !== b.bytes) {
      throw new Error(`Prüfung fehlgeschlagen: alt ${a.files} Dateien / ${fmtMB(a.bytes)}, neu ${b.files} Dateien / ${fmtMB(b.bytes)}. Es wurde nichts gelöscht.`);
    }

    dataMove.phase = 'switch';
    const cfg = loadConfig();
    cfg.data_dir = target;
    saveConfig(cfg);
    setDataDir(target);
    dbDirty = true;
    flushDb();                                  // DB aus dem Speicher an den neuen Ort schreiben

    if (!keepSource) {
      dataMove.phase = 'cleanup';
      fs.rmSync(source, { recursive: true, force: true });
    }

    dataMove.phase = 'done';
    dataMove.message = keepSource
      ? 'Daten kopiert. Der neue Pfad ist aktiv, die Daten am alten Ort bleiben erhalten.'
      : 'Daten verschoben. Der neue Pfad ist aktiv, der alte Ordner wurde gelöscht.';
    console.log('Datenverzeichnis umgestellt: ' + source + ' -> ' + target);
  } catch (err) {
    dataMove.error = err.message;
    console.error('Verschieben fehlgeschlagen:', err.message);
    // Nur aufräumen solange noch nicht umgeschaltet wurde — die Quelle bleibt unangetastet
    if (DATA_DIR === source) {
      try {
        if (targetExisted) for (const e of fs.readdirSync(target)) fs.rmSync(path.join(target, e), { recursive: true, force: true });
        else fs.rmSync(target, { recursive: true, force: true });
      } catch {}
    }
  } finally {
    dataMove.running = false;
    dataMove.done = !dataMove.error;
  }
}

app.post('/api/data-path/move', (req, res) => {
  if (dataMove.running) return res.status(409).json({ error: 'Es läuft bereits eine Verschiebung.' });
  const raw = String(req.body?.target_dir || '').trim();
  const keepSource = !!req.body?.keep_source;
  if (!raw) return res.status(400).json({ error: 'Zielpfad fehlt' });
  if (!path.isAbsolute(raw)) return res.status(400).json({ error: 'Bitte einen absoluten Pfad angeben.' });

  const target = path.resolve(raw);
  if (target === DATA_DIR) return res.status(400).json({ error: 'Das ist bereits das aktuelle Datenverzeichnis.' });
  if (isInside(DATA_DIR, target)) return res.status(400).json({ error: 'Das Ziel darf nicht innerhalb des aktuellen Datenverzeichnisses liegen.' });
  if (isInside(target, DATA_DIR)) return res.status(400).json({ error: 'Das Ziel darf kein übergeordneter Ordner des aktuellen Datenverzeichnisses sein.' });

  let targetExisted = false;
  try {
    const st = fs.statSync(target);
    if (!st.isDirectory()) return res.status(400).json({ error: 'Das Ziel ist eine Datei, kein Ordner.' });
    targetExisted = true;
    if (fs.readdirSync(target).length) return res.status(400).json({ error: 'Der Zielordner ist nicht leer. Bitte einen leeren oder noch nicht vorhandenen Ordner wählen.' });
    try { fs.accessSync(target, fs.constants.W_OK); }
    catch { return res.status(400).json({ error: 'Kein Schreibrecht im Zielordner: ' + target }); }
  } catch (err) {
    if (err.code !== 'ENOENT') return res.status(400).json({ error: 'Ziel nicht lesbar: ' + err.message });
    // Nicht probeweise anlegen: nächstgelegenen vorhandenen Ordner auf Schreibrecht prüfen.
    let parent = path.dirname(target);
    while (parent !== path.dirname(parent) && !fs.existsSync(parent)) parent = path.dirname(parent);
    try { fs.accessSync(parent, fs.constants.W_OK); }
    catch { return res.status(400).json({ error: 'Zielordner kann nicht angelegt werden — kein Schreibrecht in: ' + parent }); }
  }

  const src = dirStats(DATA_DIR);
  try {                                          // Platz am Ziel prüfen (10% Reserve)
    const st = fs.statfsSync(targetExisted ? target : path.dirname(target));
    const free = st.bsize * st.bavail;
    if (free < src.bytes * 1.1) {
      return res.status(400).json({ error: `Zu wenig Speicherplatz am Ziel: ${fmtMB(free)} frei, ${fmtMB(src.bytes)} benötigt.` });
    }
  } catch {}

  Object.assign(dataMove, {
    running: true, done: false, error: null, phase: 'prepare', message: '',
    from: DATA_DIR, to: target, total_bytes: src.bytes, copied_bytes: 0,
    total_files: src.files, keep_source: keepSource,
  });
  res.json({ ok: true, started: true, total_bytes: src.bytes, total_files: src.files });
  setImmediate(() => runDataMove(target, keepSource, targetExisted));
});

app.get('/api/data-path/move-status', (req, res) => {
  res.json({ ...dataMove, data_dir: DATA_DIR, db_path: DB_PATH, files_dir: FILES_DIR });
});

// -- PRINTERS --------------------------------------------------
app.get('/api/printers', (req, res) => res.json(all('SELECT * FROM printers ORDER BY name')));
app.post('/api/printers', (req, res) => {
  const { name, cost_per_hour } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = runGetId('INSERT INTO printers (name,cost_per_hour) VALUES (?,?)', [name, cost_per_hour||0]);
  res.json(get('SELECT * FROM printers WHERE id=?', [id]));
});
app.put('/api/printers/:id', (req, res) => {
  const { name, cost_per_hour } = req.body;
  run('UPDATE printers SET name=?,cost_per_hour=? WHERE id=?', [name, cost_per_hour||0, req.params.id]);
  res.json(get('SELECT * FROM printers WHERE id=?', [req.params.id]));
});
app.delete('/api/printers/:id', (req, res) => {
  run('DELETE FROM printers WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// -- NOZZLES ---------------------------------------------------
app.get('/api/nozzles', (req, res) => res.json(all('SELECT * FROM nozzles ORDER BY CAST(size AS REAL)')));
app.post('/api/nozzles', (req, res) => {
  const { size } = req.body;
  if (!size) return res.status(400).json({ error: 'Grösse fehlt' });
  const id = runGetId('INSERT INTO nozzles (size) VALUES (?)', [size]);
  res.json(get('SELECT * FROM nozzles WHERE id=?', [id]));
});
app.delete('/api/nozzles/:id', (req, res) => {
  run('DELETE FROM nozzles WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// -- MATERIAL PRESETS ------------------------------------------
app.get('/api/material-presets', (req, res) => res.json(all('SELECT * FROM material_presets ORDER BY name')));
app.post('/api/material-presets', (req, res) => {
  const { name, print_temp, bed_temp, nozzle, filament_price_kg, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = runGetId('INSERT INTO material_presets (name,print_temp,bed_temp,nozzle,filament_price_kg,notes) VALUES (?,?,?,?,?,?)',
    [name, print_temp||'', bed_temp||'', nozzle||'', filament_price_kg||null, notes||'']);
  res.json(get('SELECT * FROM material_presets WHERE id=?', [id]));
});
app.put('/api/material-presets/:id', (req, res) => {
  const { name, print_temp, bed_temp, nozzle, filament_price_kg, notes } = req.body;
  run('UPDATE material_presets SET name=?,print_temp=?,bed_temp=?,nozzle=?,filament_price_kg=?,notes=? WHERE id=?',
    [name, print_temp||'', bed_temp||'', nozzle||'', filament_price_kg||null, notes||'', req.params.id]);
  res.json(get('SELECT * FROM material_presets WHERE id=?', [req.params.id]));
});
app.delete('/api/material-presets/:id', (req, res) => {
  run('DELETE FROM material_presets WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// -- SHUTDOWN --------------------------------------------------
// CAD-Programm: Pfad in plm.config (cad_path=…), aus demselben Grund wie
// beim Slicer. Programmpfade gehören ohnehin zum PC, nicht zu den Daten —
// das Datenverzeichnis kann zwischen PCs geteilt sein.
function cadStatus() {
  const where = (loadConfig().cad_path || '').trim();
  const legacy = (getSetting('cad_path', '') || '').trim();
  return { configured: !!where, found: !!where && _isFile(where), where: where || null,
    legacy_path: !where && legacy ? legacy : null };
}
// Früher stand der Pfad in der Datenbank. Gilt er auf diesem PC, wandert er
// einmalig nach plm.config.
function migrateCadPath() {
  const old = (getSetting('cad_path', '') || '').trim();
  if (!old || loadConfig().cad_path || !_isFile(old)) return;
  saveConfig({ cad_path: old });
  console.log('CAD-Pfad nach plm.config übernommen: ' + old);
}

app.get('/api/cad', (req, res) => res.json({ ...cadStatus(), local: _isLocalRequest(req) }));

app.post('/api/launch-cad', async (req, res) => {
  if (!_isLocalRequest(req)) return res.status(403).json({ error: 'Das CAD-Programm lässt sich nur auf dem PC starten, auf dem das PLM läuft.' });
  const cad = cadStatus();
  if (!cad.configured) return res.status(400).json({ error: 'Kein CAD-Programm eingetragen — in plm.config cad_path=… setzen' });
  if (!cad.found) return res.status(400).json({ error: 'CAD-Programm nicht gefunden: ' + cad.where });
  try { await launchProgram({ cmd: cad.where, args: [] }); }
  catch (e) { return res.status(500).json({ error: 'CAD-Programm liess sich nicht starten: ' + e.message }); }
  res.json({ success: true });
});

app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true, message: 'Server wird beendet...' });
  setTimeout(() => {
    console.log('Server wird per Browser-Befehl beendet.');
    process.exit(0);
  }, 500);
});

// ── VERSION ───────────────────────────────────────────────────
// Major.Minor aus package.json, dahinter die Anzahl Commits — zählt mit
// jedem Commit von selbst hoch. Dazu Commit, Datum und ob nicht committete
// Änderungen laufen. Ohne Git (ZIP-Download von GitHub, Git nicht installiert)
// kommen Commit und Datum aus version.json, die Anzahl Commits liefert dann
// erst die Update-Prüfung bei GitHub. Ohne beides bleibt die Nummer aus package.json.
const REPO_DIR = process.env.PLM_REPO_DIR || path.join(__dirname, '..');   // Tests: eigenes Wegwerf-Repo
const _majorMinor = pkg => pkg.split('.').slice(0, 2).join('.');
const _versionOf = (pkg, count) => _majorMinor(pkg) + '.' + count;
// GitHub setzt beim Download als ZIP Commit und Datum in version.json ein
// (export-subst, siehe .gitattributes). Im Git-Checkout stehen dort nur die
// Platzhalter — dann gibt es keinen Archiv-Stand.
function _archiveStand() {
  try {
    const a = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'backend', 'version.json'), 'utf8'));
    return /^[0-9a-f]{40}$/.test(a.commit) ? a : null;
  } catch { return null; }
}
const APP_VERSION = (() => {
  const pkg = require('./package.json').version || '0.0.0';
  const info = { version: pkg, commit: null, date: null, dirty: false, source: null };
  const git = args => require('child_process').execFileSync('git', args, {
    cwd: REPO_DIR, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  }).toString().trim();
  try {
    // Nur der eigene Checkout zählt — sonst antwortet ein Repo weiter oben,
    // in das jemand die ZIP entpackt hat
    if (!fs.existsSync(path.join(REPO_DIR, '.git'))) throw new Error('kein Git-Checkout');
    const count = git(['rev-list', '--count', 'HEAD']);
    const [commit, date] = git(['log', '-1', '--format=%h %cI']).split(' ');
    Object.assign(info, { version: _versionOf(pkg, count), commit, date, source: 'git' });
    info.dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  } catch {
    const a = _archiveStand();
    if (a) Object.assign(info, { version: _majorMinor(pkg), commit: a.commit.slice(0, 7), sha: a.commit,
      date: a.date || null, source: 'zip' });
  }
  return info;
})();

app.get('/api/version', (req, res) => res.json({ ...APP_VERSION, data_dir: DATA_DIR }));

// ── UPDATE-PRÜFUNG ────────────────────────────────────────────
// Gibt es auf dem Git-Remote neuere Commits als den laufenden Stand? git fetch
// holt sie im Hintergrund, die Oberfläche meldet sie beim Öffnen — mit der
// laufenden Version weiterarbeiten geht immer. Die Prüfung fragt nie nach:
// kein Passwort, keine Passphrase, kein Anmeldefenster. Ist das Remote nicht
// erreichbar, zählt der Stand vom letzten Abruf (fetched: false); ohne Git
// oder Upstream bleibt sie still (available: false).
const UPDATE_MAX_AGE = 30 * 60 * 1000;   // länger offenes PLM prüft beim nächsten Öffnen neu
let _update = null;

function _gitBg(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = require('child_process').execFile('git', args, {
      cwd: REPO_DIR, timeout: 20000, windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', ...env },
    }, (err, out, errOut) => err
      ? reject(new Error(err.killed ? 'Zeitüberschreitung' : String(errOut).trim().split('\n')[0] || err.message))
      : resolve(String(out).trim()));
    child.stdin?.end();
  });
}

// SSH im Batch-Modus, damit nichts nachfragt — ausser es ist schon ein
// eigener SSH-Befehl eingestellt (Umgebung oder Git-Konfiguration)
async function _gitFetch() {
  const ownSsh = process.env.GIT_SSH_COMMAND || process.env.GIT_SSH
    || await _gitBg(['config', '--get', 'core.sshCommand']).catch(() => '');
  await _gitBg(['fetch', '--quiet'], ownSsh ? {} : { GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o ConnectTimeout=10' });
}

async function checkForUpdate() {
  const res = { available: false, behind: 0, version: null, upstream: null, commits: [], fetched: false,
    checked_at: new Date().toISOString(), error: null };
  if (APP_VERSION.source === 'zip') return checkGithubUpdate(res);
  if (!APP_VERSION.commit) return { ...res, error: 'Kein Git-Stand' };
  try {
    res.upstream = await _gitBg(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    try {
      await _gitFetch();
      res.fetched = true;
    } catch (e) { res.error = 'Remote nicht erreichbar: ' + e.message; }
    // Ab dem laufenden Commit, nicht ab HEAD: nach einem Pull ohne Neustart
    // läuft noch der alte Stand
    const range = APP_VERSION.commit + '..@{u}';
    res.behind = parseInt(await _gitBg(['rev-list', '--count', range]), 10) || 0;
    if (!res.behind) return res;
    const log = await _gitBg(['log', '-n', '20', '--format=%h%x1f%cI%x1f%s', range]);
    res.commits = log.split('\n').filter(Boolean).map(l => {
      const [commit, date, subject] = l.split('\x1f');
      return { commit, date, subject };
    });
    // Versionsnummer wie oben, mit Major.Minor aus der neuen package.json
    let pkg = require('./package.json').version || '0.0.0';
    const pkgPath = path.relative(REPO_DIR, path.join(__dirname, 'package.json')).split(path.sep).join('/');
    try { pkg = JSON.parse(await _gitBg(['show', '@{u}:' + pkgPath])).version || pkg; } catch {}
    res.version = _versionOf(pkg, await _gitBg(['rev-list', '--count', '@{u}']));
    res.available = true;
  } catch (e) { res.error = e.message; }
  return res;
}

// ZIP-Download ohne Git: GitHub über HTTPS fragen — ohne Anmeldung, das
// Repository ist öffentlich. HEAD ist dort der Standard-Branch. Die Antwort hat
// dieselbe Form wie bei Git, dazu der Link auf die neue ZIP.
const GITHUB_API = process.env.PLM_GITHUB_API || 'https://api.github.com';   // Tests: Schein-GitHub
async function _github(url, timeout = 10000) {
  const r = await fetch(GITHUB_API + url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PLM-ERP' }, signal: AbortSignal.timeout(timeout),
  }).catch(e => { throw new Error('GitHub nicht erreichbar: ' + (e.cause?.code || e.message)); });
  if (r.ok) return r;
  throw new Error(r.status === 404 ? 'Stand auf GitHub nicht gefunden'
    : r.status === 403 || r.status === 429 ? 'GitHub-Abfragelimit erreicht, später erneut' : 'GitHub antwortet mit ' + r.status);
}

async function checkGithubUpdate(res) {
  const m = String(require('./package.json').repository?.url || '').match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  if (!m) return { ...res, error: 'Kein GitHub-Repository in package.json' };
  const repo = m[1] + '/' + m[2];
  Object.assign(res, { upstream: 'github.com/' + repo, download: `https://github.com/${repo}/archive/HEAD.zip`, repo });
  try {
    const cmp = await (await _github(`/repos/${repo}/compare/${APP_VERSION.sha}...HEAD`)).json();
    // Anzahl Commits des neusten Stands = letzte Seite bei einem Commit pro Seite
    const link = (await _github(`/repos/${repo}/commits?sha=HEAD&per_page=1`)).headers.get('link') || '';
    const total = parseInt((link.match(/[?&]page=(\d+)>; rel="last"/) || [])[1], 10) || 1;
    res.fetched = true;
    res.behind = cmp.ahead_by || 0;   // HEAD ist „ahead“ = so viele neue Commits für diese Kopie
    // Die eigene Nummer: neuster Stand minus die neuen Commits
    const pkg = require('./package.json').version || '0.0.0';
    if (cmp.status === 'identical' || cmp.status === 'ahead') APP_VERSION.version = _versionOf(pkg, total - res.behind);
    if (!res.behind) return res;
    res.commits = (cmp.commits || []).slice(-20).reverse().map(c => ({
      commit: c.sha.slice(0, 7), date: c.commit?.committer?.date || null, subject: String(c.commit?.message || '').split('\n')[0],
    }));
    // Versionsnummer wie oben, mit Major.Minor aus der neuen package.json
    let next = pkg;
    try {
      const f = await (await _github(`/repos/${repo}/contents/backend/package.json?ref=HEAD`)).json();
      next = JSON.parse(Buffer.from(f.content, 'base64').toString()).version || pkg;
    } catch {}
    res.version = _versionOf(next, total);
    res.available = true;
  } catch (e) { res.error = e.message; }
  return res;
}

function updateStatus() {
  // Ein Fehler in der Prüfung darf PLM nie mitreissen — dann eben keine Meldung
  if (!_update || Date.now() - _update.at > UPDATE_MAX_AGE) _update = { at: Date.now(), promise: checkForUpdate()
    .catch(e => ({ available: false, behind: 0, version: null, commits: [], fetched: false, error: e.message })) };
  return _update.promise;
}

app.get('/api/update', async (req, res) => {
  const u = await updateStatus();
  // Installieren nur vom PC aus, und im Git-Checkout nur ohne eigene Änderungen
  const local = _isLocalRequest(req);
  res.json({ ...u, local, installable: !!u.available && local && (!!u.download || !APP_VERSION.dirty) });
});

// ── UPDATE INSTALLIEREN ───────────────────────────────────────
// „Jetzt installieren" im Update-Dialog: neuen Stand holen (git merge
// --ff-only bzw. ZIP von GitHub entpacken), bei geänderten Paketen
// npm install, dann Neustart. Geht vorher etwas schief, läuft die bisherige
// Version weiter. Daten und plm.config liegen nicht im Repository und
// bleiben unberührt.
const RESTART_EXIT_CODE = 75;   // START-PLM.bat und start-plm.sh starten dann neu
let _installing = false;

function _npmInstall() {
  return new Promise((resolve, reject) => {
    // npm ist unter Windows npm.cmd — das startet nur über die Shell
    require('child_process').exec('npm install --omit=dev --no-audit --no-fund', {
      cwd: path.join(REPO_DIR, 'backend'), timeout: 5 * 60 * 1000, windowsHide: true,
    }, (err, out, errOut) => err
      ? reject(new Error(String(errOut).trim().split('\n').pop() || err.message)) : resolve());
  });
}

async function installGitUpdate() {
  if (await _gitBg(['status', '--porcelain', '--untracked-files=no']))
    throw new Error('Im PLM-Ordner gibt es eigene Änderungen — bitte selbst mit git pull aktualisieren');
  await _gitFetch().catch(e => { throw new Error('Remote nicht erreichbar: ' + e.message); });
  const before = await _gitBg(['rev-parse', 'HEAD']);
  await _gitBg(['merge', '--ff-only', '--quiet', '@{u}'])
    .catch(e => { throw new Error('Nachziehen nicht möglich (eigene Commits?): ' + e.message); });
  const pkgChanged = await _gitBg(['diff', '--name-only', before, 'HEAD', '--', 'backend/package.json', 'backend/package-lock.json']);
  if (pkgChanged) await _npmInstall().catch(async e => {
    // Ohne passende Pakete startet der neue Stand nicht — zurück auf den alten
    await _gitBg(['reset', '--keep', '--quiet', before]).catch(() => {});
    throw new Error('Pakete liessen sich nicht installieren: ' + e.message);
  });
}

// Neuster Stand als ZIP über die GitHub-API — wie der Download im Browser,
// mit ausgefüllter version.json. Alles liegt in einem Ordner <repo>-<commit>/.
async function installZipUpdate(u) {
  const zip = new AdmZip(Buffer.from(await (await _github(`/repos/${u.repo}/zipball/HEAD`, 120000)).arrayBuffer()));
  const root = path.resolve(REPO_DIR);
  const files = zip.getEntries().filter(e => !e.isDirectory)
    .map(e => ({ e, dest: path.resolve(root, e.entryName.split('/').slice(1).join('/')) }));
  if (!files.some(f => f.dest === path.join(root, 'backend', 'server.js'))) throw new Error('Die ZIP enthält kein PLM');
  if (files.some(f => !f.dest.startsWith(root + path.sep))) throw new Error('Die ZIP enthält ungültige Pfade');
  const pkgFiles = ['package.json', 'package-lock.json'].map(n => path.join(root, 'backend', n));
  const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const pkgBefore = pkgFiles.map(read).join('\0');
  // Nur Geändertes schreiben — START-PLM.bat läuft gerade
  for (const f of files) {
    const data = f.e.getData();
    try { if (fs.readFileSync(f.dest).equals(data)) continue; } catch {}
    fs.mkdirSync(path.dirname(f.dest), { recursive: true });
    fs.writeFileSync(f.dest, data);
  }
  if (pkgFiles.map(read).join('\0') !== pkgBefore) await _npmInstall()
    .catch(e => { throw new Error('Neue Version entpackt, aber die Pakete liessen sich nicht installieren: ' + e.message); });
}

// Aus einem Startskript: beenden, das Skript startet neu. Sonst startet der
// neue Stand selbst — und löst diesen Prozess ab wie beim Start einer neueren
// Version (choosePort). Klappt sein Start nicht, läuft dieser einfach weiter.
function restartServer() {
  setTimeout(() => {
    if (process.env.PLM_START_SCRIPT === '1') return process.exit(RESTART_EXIT_CODE);
    try { flushDb(); } catch {}
    require('child_process').spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, PLM_OPEN_BROWSER: '', PLM_TAKEOVER: '1' },
    }).unref();
  }, 300);
}

app.post('/api/update/install', async (req, res) => {
  if (!_isLocalRequest(req)) return res.status(403).json({ error: 'Updates lassen sich nur auf dem PC installieren, auf dem das PLM läuft.' });
  if (_installing) return res.status(409).json({ error: 'Das Update wird bereits installiert' });
  _installing = true;
  try {
    const u = await updateStatus();
    if (!u.available) throw new Error('Kein Update verfügbar');
    if (u.download) await installZipUpdate(u); else await installGitUpdate();
    console.log(`  Update auf ${u.version} installiert - PLM startet neu`);
    res.json({ ok: true, version: u.version });
    restartServer();
  } catch (e) {
    _installing = false;
    res.status(500).json({ error: e.message });
  }
});

// Startbildschirm: öffnet PLM per window.open(), damit sich der Tab am Ende
// über "Beenden" wieder schliessen lässt — window.close() wirkt nur bei
// Browsing-Kontexten, die ein Skript geöffnet hat.
app.get('/launcher', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'launcher.html')));

// ==============================================================
// 3MF PARSE
// ==============================================================
const uploadMem = _keepUser(multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 }, defParamCharset: 'utf8' }));

app.post('/api/parse-3mf', uploadMem.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const result = parse3mfSettings(req.file.buffer);
  if (!result.settings) {
    const msg = result.entries
      ? 'Keine Konfiguration gefunden. ZIP-Inhalt: ' + result.entries.join(', ')
      : (result.error || 'Parse-Fehler');
    return res.status(422).json({ error: msg });
  }
  console.log('3MF parsed from:', result.source, '–', Object.keys(result.settings).length, 'keys');
  res.json({ settings: result.settings, source: result.source });
});

// STEP BOM parser
function parseStepBom(text) {
  const dataMatch = text.match(/DATA;\s*([\s\S]*?)\s*ENDSEC;/i);
  const dataSection = dataMatch ? dataMatch[1] : text;

  // Split into entity statements, respecting strings (avoid splitting on ; inside 'string')
  const statements = [];
  let buf = '', inStr = false;
  for (const ch of dataSection) {
    if (ch === "'") inStr = !inStr;
    buf += ch;
    if (ch === ';' && !inStr) { statements.push(buf.trim()); buf = ''; }
  }

  // Parse #id = TYPE(raw)
  const entities = {};
  for (const s of statements) {
    const m = s.match(/^#(\d+)\s*=\s*([A-Z_]+)\s*\(([\s\S]*)\)\s*;?$/);
    if (m) entities[m[1]] = { type: m[2], raw: m[3] };
  }

  const getRefs  = raw => [...raw.matchAll(/#(\d+)/g)].map(m => m[1]);
  const getFirst = raw => { const m = raw.match(/'([^']*)'/); return m ? m[1] : ''; };

  // PRODUCT id -> name
  const productName = {};
  for (const [id, e] of Object.entries(entities))
    if (e.type === 'PRODUCT') productName[id] = getFirst(e.raw) || `Part_${id}`;

  // PRODUCT_DEFINITION -> PRODUCT (follow formation chain)
  const pdToProduct = {};
  for (const [id, e] of Object.entries(entities)) {
    if (e.type !== 'PRODUCT_DEFINITION') continue;
    let cur = getRefs(e.raw)[0];
    for (let i = 0; i < 5 && cur; i++) {
      const en = entities[cur];
      if (!en) break;
      if (en.type === 'PRODUCT') { pdToProduct[id] = cur; break; }
      if (en.type.startsWith('PRODUCT_DEFINITION_FORMATION')) cur = getRefs(en.raw)[0];
      else break;
    }
  }

  // NEXT_ASSEMBLY_USAGE_OCCURENCE -> parent/child PD pairs
  const childMap = {}, childPDs = new Set();
  for (const e of Object.values(entities)) {
    if (e.type !== 'NEXT_ASSEMBLY_USAGE_OCCURENCE') continue;
    const refs = getRefs(e.raw);
    if (refs.length < 2) continue;
    const [par, ch] = refs;
    if (!childMap[par]) childMap[par] = new Map();
    childMap[par].set(ch, (childMap[par].get(ch) || 0) + 1);
    childPDs.add(ch);
  }

  const rootPDs = Object.keys(childMap).filter(pd => !childPDs.has(pd));
  if (!rootPDs.length) return null;

  function buildNode(pd, depth = 0) {
    if (depth > 30) return null;
    const name = pdToProduct[pd] ? (productName[pdToProduct[pd]] || `Part_${pdToProduct[pd]}`) : `PD_${pd}`;
    const node = { name, children: [] };
    if (childMap[pd]) {
      for (const [childPd, qty] of childMap[pd]) {
        const child = buildNode(childPd, depth + 1);
        if (child) { child.qty = qty; node.children.push(child); }
      }
    }
    return node;
  }

  const roots = rootPDs.map(pd => buildNode(pd)).filter(Boolean);
  return roots.length === 1 ? roots[0] : { name: 'Assembly', qty: 1, children: roots };
}

app.post('/api/parse-step-bom', uploadMem.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (!['.stp', '.step'].includes(ext)) return res.status(400).json({ error: 'Nur .stp / .step Dateien erlaubt' });
  try {
    const tree = parseStepBom(req.file.buffer.toString('utf8'));
    if (!tree) return res.status(422).json({ error: 'Keine Baugruppenstruktur gefunden. Ist die Datei eine Baugruppe?' });
    res.json(tree);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/revisions/:revId/bom-bulk', (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ error: 'Keine Einträge' });
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.revId]);
  if (!rev) return res.status(404).json({ error: 'Revision nicht gefunden' });
  if (rejectIfDelivered(res, rev.id)) return;
  try {
    let pos = (get('SELECT MAX(position) as m FROM bom WHERE parent_rev_id=?', [req.params.revId])?.m || 0) + 1;
    let count = 0;
    for (const e of entries) {
      try {
        run('INSERT INTO bom (parent_rev_id,child_item_id,quantity,unit,position) VALUES (?,?,?,?,?)',
          [req.params.revId, e.child_item_id, e.quantity || 1, e.unit || 'pcs', pos++]);
        count++;
      } catch {} // skip duplicates
    }
    log('revision', req.params.revId, 'BOM importiert', `${count} Positionen aus STEP importiert`);
    res.json({ success: true, count });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ==============================================================
// DELIVERIES (LIEFERSCHEINE / PRODUKTIONSBLÄTTER)
// ==============================================================
app.get('/api/deliveries', (req, res) => {
  const rows = all(`SELECT d.*,COALESCE(c.name,d.customer_name_free) as customer_name,o.number as order_number
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN orders o ON d.order_id=o.id
    ORDER BY d.number DESC`);
  rows.forEach(d => {
    d.item_count = count('SELECT COUNT(*) as c FROM delivery_items WHERE delivery_id=?', [d.id]);
  });
  res.json(rows);
});

app.post('/api/deliveries', (req, res) => {
  const { title, order_id, customer_id, customer_name_free, status, delivery_date, manufacture_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Bezeichnung fehlt' });
  const number = nextDeliveryNumber();
  const id = runGetId(`INSERT INTO deliveries (number,title,order_id,customer_id,customer_name_free,status,delivery_date,manufacture_date,notes)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [number, title, order_id||null, customer_id||null, customer_name_free||null, status||'DRAFT', delivery_date||null, manufacture_date||null, notes||'']);
  res.json(get('SELECT * FROM deliveries WHERE id=?', [id]));
});

app.get('/api/deliveries/:id', (req, res) => {
  const d = get(`SELECT d.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number,
    o.number as order_number,o.title as order_title
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN orders o ON d.order_id=o.id
    WHERE d.id=?`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Nicht gefunden' });
  // Produktionsauftrag: Fertigungs- und Kundenhinweis — der Konstruktionshinweis
  // betrifft die Fertigung nicht
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name,i.short_code,
    i.hint_production,i.hint_customer,
    rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id
    WHERE di.delivery_id=? ORDER BY di.position,di.id`, [d.id]);
  d.items.forEach(item => {
    if (item.print_settings_json) {
      try { item.print_settings = JSON.parse(item.print_settings_json); } catch(e) {}
    }
    attachDeliveredRevision(item, d.status === 'DELIVERED');
  });
  res.json(d);
});

// Revision einer Produktionsposition für die Anzeige: fixierte oder (vor der
// Lieferung) die aktive, dazu ob es inzwischen eine neuere gibt. Bei
// gelieferten Baugruppen die festgehaltene Struktur.
function attachDeliveredRevision(di, delivered) {
  if (!di.item_id) return;
  const active = getActiveRevision(di.item_id);
  const fixed = di.revision_id ? get('SELECT id, rev, status FROM revisions WHERE id=?', [di.revision_id]) : null;
  di.active_rev = active ? { id: active.id, rev: active.rev, status: active.status } : null;
  di.effective_rev = fixed || di.active_rev;
  di.rev_outdated = !!(fixed && active && fixed.id !== active.id);
  if (delivered && di.item_type === 'asm') {
    di.structure = all(`SELECT ds.*, r.status as rev_status FROM delivery_structure ds
      LEFT JOIN revisions r ON r.id=ds.revision_id
      WHERE ds.delivery_item_id=? ORDER BY ds.position`, [di.id]);
    for (const row of di.structure) {
      const a = getActiveRevision(row.item_id);
      row.active_rev = a ? a.rev : null;
      row.rev_outdated = !!(a && row.revision_id && a.id !== row.revision_id);
    }
  }
}

app.put('/api/deliveries/:id', (req, res) => {
  const { title, order_id, customer_id, customer_name_free, status, delivery_date, manufacture_date, notes } = req.body;
  const prev = get('SELECT status FROM deliveries WHERE id=?', [req.params.id]);
  if (!prev) return res.status(404).json({ error: 'Nicht gefunden' });
  tx(() => {
    run(`UPDATE deliveries SET title=?,order_id=?,customer_id=?,customer_name_free=?,status=?,delivery_date=?,manufacture_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
      [title, order_id||null, customer_id||null, customer_name_free||null, status||'DRAFT', delivery_date||null, manufacture_date||null, notes||'', req.params.id]);
    onDeliveryStatusChange(req.params.id, prev.status, status || 'DRAFT');
  });
  if (status === 'DELIVERED') autoDeliverOrder(req.params.id);
  res.json(get('SELECT * FROM deliveries WHERE id=?', [req.params.id]));
});

function autoDeliverOrder(deliveryId) {
  const d = get('SELECT order_id FROM deliveries WHERE id=?', [deliveryId]);
  if (!d?.order_id) return;
  const order = get('SELECT status FROM orders WHERE id=?', [d.order_id]);
  if (!order || order.status === 'DELIVERED' || order.status === 'INVOICED' || order.status === 'CANCELLED') return;
  const counts = get(`SELECT COUNT(*) as total, SUM(CASE WHEN status='DELIVERED' THEN 1 ELSE 0 END) as done FROM deliveries WHERE order_id=?`, [d.order_id]);
  if (counts.total > 0 && counts.total === counts.done) {
    run(`UPDATE orders SET status='DELIVERED', delivery_date=COALESCE(delivery_date,date('now')), updated_at=datetime('now') WHERE id=?`, [d.order_id]);
  }
}

// ── MATERIALVERBRAUCH EINES PRODUKTIONSAUFTRAGS ───────────────
// Rohmaterial wird in Spulen (stock_qty) gefuehrt, der Verbrauch faellt in
// Gramm an. weight_g ist das Gewicht einer vollen Spule — darueber wird
// umgerechnet. Ohne weight_g ist keine Umrechnung moeglich.
function _usedGramsPerPiece(di, item) {
  // 1. Am Produktionsposten erfasstes Filamentgewicht
  if (di.print_settings_json) {
    try {
      const o = JSON.parse(di.print_settings_json);
      const raw = o._filament_weight ?? o.filament_weight ?? null;
      if (raw != null) {
        const n = parseFloat(String(raw).replace(/[^\d.,-]/g, '').replace(',', '.'));
        if (Number.isFinite(n) && n > 0) return { grams: n, source: 'Produktionsposition' };
      }
    } catch {}
  }
  if (!item) return null;
  // 2. Druckparameter der aktiven Revision des verknuepften Teils
  const rev = getActiveRevision(item.id);
  if (rev) {
    const ps = get('SELECT filament_weight_total, part_weight FROM print_settings WHERE revision_id=?', [rev.id]);
    const w = ps?.filament_weight_total ?? ps?.part_weight ?? null;
    const n = w == null ? NaN : parseFloat(w);
    if (Number.isFinite(n) && n > 0) return { grams: n, source: 'Druckparameter' };
  }
  // 3. Hinterlegtes Teilegewicht
  const eff = getEffectiveWeight(item.id);
  if (Number.isFinite(eff) && eff > 0) return { grams: eff, source: 'Teilegewicht' };
  return null;
}

// Vorschlag berechnen — bucht nichts, zeigt nur was anfallen wuerde.
app.get('/api/deliveries/:id/material-usage', (req, res) => {
  const d = get('SELECT * FROM deliveries WHERE id=?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Nicht gefunden' });

  const rows = [];
  for (const di of all('SELECT * FROM delivery_items WHERE delivery_id=? ORDER BY position', [d.id])) {
    if (!di.raw_material_id) continue;
    const mat = get('SELECT * FROM raw_materials WHERE id=?', [di.raw_material_id]);
    if (!mat) continue;
    const item = di.item_id ? get('SELECT * FROM items WHERE id=?', [di.item_id]) : null;
    const per = _usedGramsPerPiece(di, item);
    const qty = parseFloat(di.quantity) || 0;
    const totalG = per ? per.grams * qty : null;
    const spoolG = parseFloat(mat.weight_g) || 0;
    const lots = all(`SELECT lot_number,
        SUM(CASE WHEN type='in' THEN qty ELSE -qty END) as remaining_qty,
        MAX(created_at) as last_date
      FROM raw_material_movements
      WHERE raw_material_id=? GROUP BY lot_number
      HAVING remaining_qty > 0
      ORDER BY MIN(created_at)`, [mat.id]);   // aelteste zuerst (FIFO)
    rows.push({
      delivery_item_id: di.id,
      description: di.description,
      quantity: qty,
      raw_material_id: mat.id,
      raw_material_name: mat.name,
      unit: mat.unit || 'Stk',
      spool_weight_g: spoolG || null,
      grams_per_piece: per ? per.grams : null,
      total_grams: totalG,
      // Umrechnung in die Lagereinheit; ohne Spulengewicht nicht moeglich
      qty_to_deduct: (totalG != null && spoolG > 0) ? +(totalG / spoolG).toFixed(4) : null,
      source: per ? per.source : null,
      stock_qty: mat.stock_qty,
      lots,
    });
  }
  res.json({
    delivery: { id: d.id, number: d.number, status: d.status, material_consumed: !!d.material_consumed },
    rows,
  });
});

// Verbrauch buchen. Mengen kommen aus dem Dialog und sind dort korrigierbar.
app.post('/api/deliveries/:id/consume-material', (req, res) => {
  const d = get('SELECT * FROM deliveries WHERE id=?', [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Nicht gefunden' });
  if (d.material_consumed) return res.status(400).json({ error: 'Für diesen Produktionsauftrag wurde bereits Material abgebucht.' });

  const list = Array.isArray(req.body?.consumptions) ? req.body.consumptions : [];
  const booked = [];
  for (const c of list) {
    const qty = parseFloat(c.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const mat = get('SELECT * FROM raw_materials WHERE id=?', [c.raw_material_id]);
    if (!mat) continue;
    const newQty = Math.max(0, (parseFloat(mat.stock_qty) || 0) - qty);
    run("UPDATE raw_materials SET stock_qty=?,updated_at=datetime('now') WHERE id=?", [newQty, mat.id]);
    // Rückverfolgung: Charge fest mit der Position verknüpfen. Kommt keine
    // Position mit, gilt die einzige Position mit diesem Material.
    let pos = c.delivery_item_id
      ? get('SELECT id FROM delivery_items WHERE id=? AND delivery_id=?', [c.delivery_item_id, d.id]) : null;
    if (!pos) {
      const same = all('SELECT id FROM delivery_items WHERE delivery_id=? AND raw_material_id=?', [d.id, mat.id]);
      if (same.length === 1) pos = same[0];
    }
    run('INSERT INTO raw_material_movements (raw_material_id,qty,type,notes,lot_number,delivery_id,delivery_item_id) VALUES (?,?,?,?,?,?,?)',
      [mat.id, qty, 'out', 'Verbrauch ' + d.number, c.lot_number || '', d.id, pos?.id ?? null]);
    booked.push({ raw_material_id: mat.id, name: mat.name, qty, stock_qty: newQty });
  }

  run('UPDATE deliveries SET material_consumed=1 WHERE id=?', [d.id]);
  log('delivery', d.id, 'Material abgebucht',
    booked.length ? booked.map(b => `${b.name}: ${b.qty}`).join(', ') : 'keine Positionen');
  saveDb();
  res.json({ booked });
});

app.put('/api/deliveries/:id/status', (req, res) => {
  const { status } = req.body;
  const existing = get('SELECT status, delivery_date FROM deliveries WHERE id=?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });
  let deliveryDate = null;
  tx(() => {
    if (status === 'DELIVERED' && !existing.delivery_date) {
      deliveryDate = new Date().toISOString().slice(0, 10);
      run(`UPDATE deliveries SET status=?,delivery_date=?,updated_at=datetime('now') WHERE id=?`, [status, deliveryDate, req.params.id]);
    } else {
      run(`UPDATE deliveries SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
    }
    // Beim Liefern die Revisionen fixieren, beim Zurücksetzen wieder lösen
    onDeliveryStatusChange(req.params.id, existing.status, status);
  });
  if (status === 'DELIVERED') autoDeliverOrder(req.params.id);
  res.json(deliveryDate ? { success: true, delivery_date: deliveryDate } : { success: true });
});

app.delete('/api/deliveries/:id', (req, res) => {
  tx(() => {
    run('DELETE FROM delivery_structure WHERE delivery_item_id IN (SELECT id FROM delivery_items WHERE delivery_id=?)', [req.params.id]);
    run('DELETE FROM delivery_items WHERE delivery_id=?', [req.params.id]);
    run('DELETE FROM deliveries WHERE id=?', [req.params.id]);
  });
  res.json({ success: true });
});

app.post('/api/deliveries/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, print_settings_json, notes, position, raw_material_id } = req.body;
  if (!description) return res.status(400).json({ error: 'Beschreibung fehlt' });
  const id = runGetId(`INSERT INTO delivery_items (delivery_id,item_id,description,quantity,unit,unit_price,print_settings_json,notes,position,raw_material_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [req.params.id, item_id||null, description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json||null, notes||'', position||999, raw_material_id||null]);
  // Nachträglich in einen gelieferten Auftrag aufgenommen: gleich fixieren
  if (get("SELECT 1 as y FROM deliveries WHERE id=? AND status='DELIVERED'", [req.params.id])) {
    freezeDeliveryItem(get('SELECT * FROM delivery_items WHERE id=?', [id]), 'delivery');
  }
  res.json(get('SELECT di.*, rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color FROM delivery_items di LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id WHERE di.id=?', [id]));
});

app.put('/api/delivery-items/:id', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, print_settings_json, notes, position, raw_material_id } = req.body;
  const before = get(`SELECT di.item_id, d.status as delivery_status FROM delivery_items di
    JOIN deliveries d ON d.id=di.delivery_id WHERE di.id=?`, [req.params.id]);
  if (!before) return res.status(404).json({ error: 'Position nicht gefunden' });
  run(`UPDATE delivery_items SET item_id=?,description=?,quantity=?,unit=?,unit_price=?,print_settings_json=?,notes=?,position=?,raw_material_id=? WHERE id=?`,
    [item_id||null, description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json??null, notes||'', position||999, raw_material_id||null, req.params.id]);
  // Anderes Item verknüpft: die Revision des alten gilt nicht mehr
  if ((before.item_id || null) !== (item_id || null)) {
    run('UPDATE delivery_items SET revision_id=NULL, rev_fixed=NULL WHERE id=?', [req.params.id]);
    run('DELETE FROM delivery_structure WHERE delivery_item_id=?', [req.params.id]);
    if (before.delivery_status === 'DELIVERED') {
      freezeDeliveryItem(get('SELECT * FROM delivery_items WHERE id=?', [req.params.id]), 'delivery');
    }
  }
  // Preis zurück in den verknüpften Auftrag (und weitere Produktionsaufträge) übernehmen
  let priceSynced = 0;
  const di = get('SELECT di.*, d.order_id as _order_id FROM delivery_items di JOIN deliveries d ON di.delivery_id=d.id WHERE di.id=?', [req.params.id]);
  if (di && di.unit_price != null && di._order_id) {
    let oiId = di.order_item_id;
    if (!oiId) {
      const oi = get(`SELECT id FROM order_items WHERE order_id=? AND COALESCE(item_id,-1)=COALESCE(?,-1) AND description=?`,
        [di._order_id, di.item_id ?? null, di.description]);
      if (oi) { oiId = oi.id; run('UPDATE delivery_items SET order_item_id=? WHERE id=?', [oiId, di.id]); }
    }
    if (oiId) {
      run('UPDATE order_items SET unit_price=? WHERE id=?', [di.unit_price, oiId]);
      priceSynced = 1;
      syncPriceFromOrderItem(oiId);
    }
  }
  const row = get('SELECT di.*, rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color FROM delivery_items di LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id WHERE di.id=?', [req.params.id]);
  if (row) row.price_synced = priceSynced;
  res.json(row);
});

app.delete('/api/delivery-items/:id', (req, res) => {
  run('DELETE FROM delivery_structure WHERE delivery_item_id=?', [req.params.id]);
  run('DELETE FROM delivery_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// Revision einer Produktionsposition wählen. Vor der Lieferung: rev_id = null
// heisst „folgt automatisch", sonst wird von Hand fixiert. Nach der Lieferung
// lässt sich der Stand nur noch korrigieren (falsche Revision erfasst), nicht
// mehr lösen — dafür den Status zurücksetzen.
app.put('/api/delivery-items/:id/revision', (req, res) => {
  const { rev_id } = req.body || {};
  const di = get(`SELECT di.*, d.status as delivery_status, d.id as d_id, i.item_number
    FROM delivery_items di JOIN deliveries d ON d.id=di.delivery_id
    LEFT JOIN items i ON i.id=di.item_id WHERE di.id=?`, [req.params.id]);
  if (!di) return res.status(404).json({ error: 'Position nicht gefunden' });
  if (!di.item_id) return res.status(400).json({ error: 'Die Position ist mit keinem Item verknüpft.' });
  const delivered = di.delivery_status === 'DELIVERED';

  if (rev_id == null || rev_id === '') {
    if (delivered) return res.status(400).json({ error: 'Der gelieferte Stand bleibt fixiert. Zum Lösen den Status zurücksetzen.' });
    run('UPDATE delivery_items SET revision_id=NULL, rev_fixed=NULL WHERE id=?', [di.id]);
    log('delivery', di.d_id, 'Revision', `${di.item_number}: folgt wieder automatisch`);
    return res.json({ success: true, revision_id: null });
  }

  const target = get('SELECT * FROM revisions WHERE id=? AND item_id=?', [rev_id, di.item_id]);
  if (!target) return res.status(400).json({ error: 'Revision gehört nicht zu diesem Item' });
  tx(() => {
    run("UPDATE delivery_items SET revision_id=?, rev_fixed='manual' WHERE id=?", [target.id, di.id]);
    if (delivered) {
      const item = get('SELECT item_type FROM items WHERE id=?', [di.item_id]);
      if (item?.item_type === 'asm') snapshotStructure(di.id, di.item_id, target.id);
    }
  });
  log('delivery', di.d_id, delivered ? 'Stand korrigiert' : 'Revision',
    `${di.item_number}: fest auf rev${target.rev}`);
  res.json({ success: true, revision_id: target.id, rev: target.rev, status: target.status });
});

app.get('/api/deliveries/:id/delivery-data', (req, res) => {
  const d = get(`SELECT d.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number,
    o.number as order_number,o.title as order_title
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN orders o ON d.order_id=o.id
    WHERE d.id=?`, [req.params.id]);
  if (!d) return res.status(404).json({ error: 'Nicht gefunden' });
  // Lieferschein geht an den Kunden: nur der Kundenhinweis, nie die internen
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name,i.short_code,i.hint_customer,
    rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id
    WHERE di.delivery_id=? ORDER BY di.position,di.id`, [d.id]);
  d.items.forEach(item => {
    if (item.print_settings_json) {
      try { item.print_settings = JSON.parse(item.print_settings_json); } catch(e) {}
    }
    attachDeliveredRevision(item, d.status === 'DELIVERED');
  });
  res.json(d);
});

// ==============================================================
// THERMAL PRINT (Pipsta Classic)
// ==============================================================
const { execFile, spawn } = require('child_process');
const os = require('os');
// Versuche py (Windows Launcher), dann python, dann python3
const PYTHON_CMD = process.platform === 'win32' ? 'py' : 'python3';

// Daten via stdin statt --data Argument übergeben (vermeidet Windows Quoting-Probleme)
function runPrintScript(args, data, timeout, cb) {
  const child = spawn(PYTHON_CMD, args, { windowsHide: true });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => stdout += d);
  child.stderr.on('data', d => stderr += d);
  const timer = setTimeout(() => { child.kill(); cb(new Error('Timeout'), stdout, stderr); }, timeout);
  child.on('close', code => {
    clearTimeout(timer);
    if (code !== 0) cb(new Error(`Exit ${code}`), stdout, stderr);
    else cb(null, stdout, stderr);
  });
  child.on('error', err => { clearTimeout(timer); cb(err, stdout, stderr); });
  // Daten als JSON via stdin
  child.stdin.write(JSON.stringify(data));
  child.stdin.end();
}

app.post('/api/print-receipt', (req, res) => {
  const { delivery_item_id, mode } = req.body;
  if (!delivery_item_id) return res.status(400).json({ error: 'Position fehlt' });
  const short = mode === 'short';

  const item = get(`SELECT di.*, i.item_number, i.item_type, i.name as item_name, i.default_price, i.short_code,
    d.status as delivery_status, COALESCE(c.name, d.customer_name_free) as customer_name
    FROM delivery_items di
    LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN deliveries d ON di.delivery_id=d.id
    LEFT JOIN customers c ON d.customer_id=c.id
    WHERE di.id=?`, [delivery_item_id]);
  if (!item) return res.status(404).json({ error: 'Item nicht gefunden' });
  attachDeliveredRevision(item, item.delivery_status === 'DELIVERED');
  const rev = item.effective_rev?.rev;
  const rcptSettings = Object.fromEntries(
    all("SELECT key,value FROM settings WHERE key IN ('company_name','receipt_footer','receipt_line_width','receipt_show_datetime','receipt_show_customer','receipt_show_item_number','receipt_show_notes')")
    .map(r => [r.key, r.value])
  );
  const companyName   = rcptSettings.company_name || 'PLM & ERP';
  const receiptFooter = rcptSettings.receipt_footer || '';

  // Extract key print params from stored 3MF settings
  const params = {};
  if (item.print_settings_json) {
    try {
      const s = JSON.parse(item.print_settings_json);
      const g1 = k => s[k] ? s[k].split(';')[0].trim() : null;
      const bool1 = k => { const v = g1(k); return v === '1' ? 'Ja' : v === '0' ? 'Nein' : v; };
      const add = (label, k, transform) => {
        const v = g1(k);
        if (v !== null && v !== '') params[label] = transform ? transform(v) : v;
      };
      add('Profil',      'print_settings_id');
      add('Drucker',     'printer_settings_id');
      add('Filament',    'filament_settings_id');
      add('Material',    'filament_type');
      add('Schicht mm',  'layer_height');
      add('Perimeter',   'perimeters');
      add('Infill',      'fill_density');
      add('Muster',      'fill_pattern');
      const sup = g1('support_material');
      if (sup !== null) params['Support'] = sup === '1' ? 'Ja' : 'Nein';
      add('Duese °C',    'temperature');
      add('Bett °C',     'bed_temperature');
      add('Luefter %',   'max_fan_speed');
      add('Druckzeit',   'estimated_printing_time_normal_mode');
      add('Duese mm',    'nozzle_diameter');
    } catch(e) {}
  }

  const price = item.unit_price != null ? item.unit_price
    : (item.default_price != null ? item.default_price : null);

  const printData = {
    header:          companyName,
    name:            item.item_name || item.description,
    number:          item.item_number || '',   // Revision steht im Kurzcode (K7M-2)
    code:            printCode(item.short_code, rev),
    desc:            item.item_name ? '' : (item.description || ''),
    qty:             item.quantity,
    unit:            item.unit,
    price:           price,
    customer:        item.customer_name || '',
    notes:           item.notes || '',
    footer:          receiptFooter,
    params:          short ? {} : params,
    line_width:      parseInt(rcptSettings.receipt_line_width) || 32,
    show_datetime:   rcptSettings.receipt_show_datetime !== '0',
    show_customer:   rcptSettings.receipt_show_customer !== '0',
    show_item_number:rcptSettings.receipt_show_item_number !== '0',
    show_notes:      rcptSettings.receipt_show_notes !== '0'
  };

  const scriptPath = path.join(__dirname, 'print_receipt.py');
  execFile(PYTHON_CMD, [scriptPath, '--data', JSON.stringify(printData)],
    { timeout: 20000, encoding: 'utf8', windowsHide: true },
    (error, stdout, stderr) => {
      if (error) {
        const detail = [stderr, stdout, error.message].filter(Boolean).join(' | ').trim();
        console.error('Pipsta error:', detail);
        return res.status(500).json({ error: detail || 'Unbekannter Fehler' });
      }
      console.log('Pipsta:', stdout.trim());
      res.json({ ok: true });
    }
  );
});

// Rohmaterial-Etikett — identischer Mechanismus wie /api/print-receipt
app.post('/api/print-label', (req, res) => {
  const d      = req.body;
  const artNr  = (d.article_number || '').trim();
  const lot    = (d.lot_number || '').trim();
  const w      = parseInt(d.line_width) || 32;

  const rcptSettings = Object.fromEntries(
    all("SELECT key,value FROM settings WHERE key IN ('company_name','receipt_line_width','label_show_qr')")
    .map(r => [r.key, r.value])
  );

  // Gleiche Struktur wie build_receipt — nur Text, keine Sonderzeichen
  const printData = {
    header:           artNr || 'Rohmaterial',
    name:             d.name || '',
    number:           artNr,
    desc:             lot ? `LOT: ${lot}` : '',
    qty:              null,
    unit:             '',
    price:            null,
    customer:         '',
    notes:            '',
    footer:           '',
    params:           {},
    line_width:       parseInt(rcptSettings.receipt_line_width) || w,
    show_datetime:    false,
    show_customer:    false,
    show_item_number: !!artNr,
    show_notes:       false,
    show_qr:          rcptSettings.label_show_qr !== '0',
  };

  const scriptPath = path.join(__dirname, 'print_receipt.py');
  execFile(PYTHON_CMD, [scriptPath, '--mode', 'label', '--data', JSON.stringify(printData)],
    { timeout: 20000, encoding: 'utf8', windowsHide: true },
    (error, stdout, stderr) => {
      if (error) {
        const detail = [stderr, stdout, error.message].filter(Boolean).join(' | ').trim();
        console.error('Pipsta label error:', detail);
        return res.status(500).json({ error: detail || 'Unbekannter Fehler' });
      }
      console.log('Pipsta label:', stdout.trim());
      res.json({ ok: true });
    }
  );
});

app.post('/api/print-receipt-delivery', (req, res) => {
  const { delivery_id, mode } = req.body;
  if (!delivery_id) return res.status(400).json({ error: 'Produktionsauftrag fehlt' });
  const short = mode === 'short';

  const delivery = get(`SELECT d.*, COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.id=?`, [delivery_id]);
  if (!delivery) return res.status(404).json({ error: 'Produktionsauftrag nicht gefunden' });

  const rows = all(`SELECT di.*, i.item_number, i.item_type, i.name as item_name, i.default_price, i.short_code
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    WHERE di.delivery_id=? ORDER BY di.position, di.id`, [delivery_id]);

  const rcptSettings = Object.fromEntries(
    all("SELECT key,value FROM settings WHERE key IN ('company_name','receipt_footer','receipt_line_width','receipt_show_datetime','receipt_show_customer','receipt_show_item_number','receipt_show_notes')")
    .map(r => [r.key, r.value])
  );
  const companyName   = rcptSettings.company_name || 'PLM & ERP';
  const receiptFooter = rcptSettings.receipt_footer || '';

  let total = null;
  const items = rows.map(item => {
    const price = item.unit_price != null ? item.unit_price : (item.default_price != null ? item.default_price : null);
    if (price != null) total = (total || 0) + price * item.quantity;
    attachDeliveredRevision(item, delivery.status === 'DELIVERED');
    const rev = item.effective_rev?.rev;
    return {
      name:   item.item_name || item.description,
      number: item.item_number || '',   // Revision steht im Kurzcode
      code:   printCode(item.short_code, rev),
      qty:    item.quantity,
      unit:   item.unit,
      price:  price != null ? price * item.quantity : null,
      notes:  item.notes || ''
    };
  });

  const printData = {
    header:           companyName,
    customer:         delivery.customer_name || '',
    items, total,
    footer:           receiptFooter,
    line_width:       parseInt(rcptSettings.receipt_line_width) || 32,
    show_datetime:    rcptSettings.receipt_show_datetime !== '0',
    show_customer:    rcptSettings.receipt_show_customer !== '0',
    show_item_number: rcptSettings.receipt_show_item_number !== '0',
    show_notes:       rcptSettings.receipt_show_notes !== '0'
  };
  const scriptPath = require('path').join(__dirname, 'print_receipt.py');
  const { execFile } = require('child_process');
  execFile(PYTHON_CMD, [scriptPath, '--mode', 'multi', '--data', JSON.stringify(printData)],
    { timeout: 20000, encoding: 'utf8', windowsHide: true },
    (error, stdout, stderr) => {
      if (error) {
        const detail = [stderr, stdout, error.message].filter(Boolean).join(' | ').trim();
        return res.status(500).json({ error: detail || 'Unbekannter Fehler' });
      }
      res.json({ ok: true });
    }
  );
});

// -- SHARED HELPERS --------------------------------------------
function attachSubItems(positions) {
  positions.forEach(p => {
    if (p.item_id && p.item_type === 'asm') {
      const rev = getActiveRevision(p.item_id);
      if (rev) p.sub_items = all('SELECT b.quantity,b.unit,i.item_number,i.name,i.item_type FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
    }
  });
}

function computeTotals(doc) {
  doc.subtotal = doc.positions.reduce((s, p) => s + (p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100)), 0);
  doc.discount_amount = doc.subtotal * (doc.discount_pct||0) / 100;
  doc.net = doc.subtotal - doc.discount_amount;
  doc.tax_amount = doc.include_tax ? doc.net * (doc.tax_rate||0) / 100 : 0;
  doc.total = doc.net + doc.tax_amount;
}

// -- ORDER → DELIVERY ------------------------------------------
app.post('/api/orders/:id/to-delivery', (req, res) => {
  const o = get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Nicht gefunden' });
  const delivId = tx(() => {
    const number = nextDeliveryNumber();
    const id = runGetId(
      `INSERT INTO deliveries (number,title,order_id,customer_id,customer_name_free,status,delivery_date,notes)
       VALUES (?,?,?,?,?,?,?,?)`,
      [number, o.title, o.id, o.customer_id||null, o.customer_name_free||null,
       'DRAFT', o.delivery_date||null, o.notes||'']
    );
    const oItems = all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    oItems.forEach((oi, idx) => {
      run(`INSERT INTO delivery_items (delivery_id,item_id,description,quantity,unit,unit_price,notes,position,order_item_id)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, oi.item_id||null, oi.description, oi.quantity, oi.unit||'Stk',
         oi.unit_price||null, oi.notes||'', idx + 1, oi.id]);
    });
    // Wer einen Produktionsauftrag erzeugt, hat den Auftrag faktisch bestaetigt.
    // Den Status dafuer von Hand nachzuziehen ist eine Fehlerquelle.
    if (o.status === 'DRAFT') {
      run("UPDATE orders SET status='CONFIRMED',updated_at=datetime('now') WHERE id=?", [o.id]);
      log('order', o.id, 'Bestätigt', 'automatisch beim Erzeugen von ' + number);
    }

    if (req.body.include_time) {
      const hourlyRateRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
      const hourlyRate = parseFloat(hourlyRateRow?.value) || 0;
      const billable = all("SELECT * FROM time_entries WHERE order_id=? AND billable=1 ORDER BY date,id", [o.id]);
      const basePos = oItems.length + 1;
      billable.forEach((te, idx) => {
        const desc = ['Arbeitszeit', te.date, te.description].filter(Boolean).join(' – ');
        run(`INSERT INTO delivery_items (delivery_id,description,quantity,unit,unit_price,notes,position)
             VALUES (?,?,?,?,?,?,?)`,
          [id, desc, te.hours, 'h', hourlyRate || null, '', basePos + idx]);
      });
    }
    return id;
  });
  res.json(get('SELECT * FROM deliveries WHERE id=?', [delivId]));
});

// -- INVOICE DATA ----------------------------------------------
app.get('/api/orders/:id/invoice-data', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Nicht gefunden' });
  o.positions = all('SELECT oi.*,i.item_number,i.item_type FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=?', [o.id]);
  attachSubItems(o.positions);
  computeTotals(o);
  o.billable_time = all('SELECT * FROM time_entries WHERE order_id=? AND billable=1 ORDER BY date', [o.id]);
  const hrRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
  o.hourly_rate = hrRow ? parseFloat(hrRow.value) || 0 : 0;
  res.json(o);
});

// -- QUOTE DATA ------------------------------------------------
app.get('/api/quotes/:id/quote-data', (req, res) => {
  const q = get(`SELECT q.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id WHERE q.id=?`, [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Nicht gefunden' });
  q.positions = all('SELECT qi.*,i.item_number,i.item_type FROM quote_items qi LEFT JOIN items i ON qi.item_id=i.id WHERE qi.quote_id=?', [q.id]);
  attachSubItems(q.positions);
  computeTotals(q);
  const hrRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
  q.hourly_rate = hrRow ? parseFloat(hrRow.value) || 0 : 0;
  res.json(q);
});

// Angebotsdaten aus einem Auftrag in der Phase QUOTE. Gleiche Form wie
// /api/quotes/:id/quote-data, damit der PDF-Renderer unveraendert bleibt.
app.get('/api/orders/:id/order-quote-data', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Nicht gefunden' });
  o.quote_date = o.order_date;
  o.positions = all('SELECT oi.*,i.item_number,i.item_type FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=? ORDER BY COALESCE(oi.position,oi.id),oi.id', [o.id]);
  attachSubItems(o.positions);
  computeTotals(o);
  const hrRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
  o.hourly_rate = hrRow ? parseFloat(hrRow.value) || 0 : 0;
  res.json(o);
});

// -- EXPORT (ZIP) ----------------------------------------------
const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
  return t;
})();
function crc32buf(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (c >>> 8) ^ CRC32_TABLE[(c ^ b) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildZip(entries) {
  const parts = []; const cds = []; let off = 0;
  for (const { name, data } of entries) {
    const nb = Buffer.from(name); const crc = crc32buf(data);
    const lh = Buffer.alloc(30 + nb.length);
    lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6);
    lh.writeUInt16LE(0,8); lh.writeUInt32LE(0,10); lh.writeUInt32LE(crc,14);
    lh.writeUInt32LE(data.length,18); lh.writeUInt32LE(data.length,22);
    lh.writeUInt16LE(nb.length,26); lh.writeUInt16LE(0,28); nb.copy(lh,30);
    const cd = Buffer.alloc(46 + nb.length);
    cd.writeUInt32LE(0x02014b50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0,8); cd.writeUInt16LE(0,10); cd.writeUInt32LE(0,12); cd.writeUInt32LE(crc,16);
    cd.writeUInt32LE(data.length,20); cd.writeUInt32LE(data.length,24);
    cd.writeUInt16LE(nb.length,28); cd.writeUInt16LE(0,30); cd.writeUInt16LE(0,32);
    cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36); cd.writeUInt32LE(0,38); cd.writeUInt32LE(off,42);
    nb.copy(cd,46);
    parts.push(lh, data); cds.push(cd); off += lh.length + data.length;
  }
  const cdBuf = Buffer.concat(cds); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0); eocd.writeUInt32LE(0,4);
  eocd.writeUInt16LE(entries.length,8); eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(cdBuf.length,12); eocd.writeUInt32LE(off,16); eocd.writeUInt16LE(0,20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

app.get('/api/file-index', (req, res) => {
  const datasets = all(`
    SELECT d.id, d.filename, d.original_name, d.ds_type, d.file_size, d.uploaded_at,
      r.rev,
      i.item_number, i.name as item_name,
      p.number as project_number, p.name as project_name
    FROM datasets d
    JOIN revisions r ON d.revision_id = r.id
    JOIN items i ON r.item_id = i.id
    JOIN projects p ON i.project_id = p.id
    ORDER BY p.number, i.item_number, r.rev, d.original_name`);

  const documents = all(`
    SELECT d.id, d.filename, d.original_name, d.doc_type as ds_type, d.file_size, d.uploaded_at,
      p.number as project_number, p.name as project_name
    FROM documents d
    JOIN projects p ON d.project_id = p.id
    ORDER BY p.number, d.name`);

  res.json({ datasets, documents });
});

function sanitizeName(s) {
  return (s||'').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80);
}

app.get('/api/export-named', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [{ name: 'plm.db', data: Buffer.from(db.export()) }];

  // Datasets: Projekte/{proj_nr} - {proj_name}/{item_nr}_rev{rev}_{original_name}
  const datasets = all(`
    SELECT d.filename, d.original_name, d.ds_type,
      r.rev, i.item_number, i.name as item_name,
      p.number as proj_nr, p.name as proj_name
    FROM datasets d
    JOIN revisions r ON d.revision_id = r.id
    JOIN items i ON r.item_id = i.id
    JOIN projects p ON i.project_id = p.id`);
  // Group datasets by (item_number, rev) to detect multiple files per revision
  const revGroups = {};
  for (const d of datasets) {
    const key = `${d.item_number}_rev${d.rev}`;
    if (!revGroups[key]) revGroups[key] = [];
    revGroups[key].push(d);
  }
  for (const d of datasets) {
    const src = path.join(FILES_DIR, d.filename);
    if (!fs.existsSync(src)) continue;
    const ext  = path.extname(d.original_name);
    const base = sanitizeName(`${d.item_number}_rev${d.rev}`);
    const key  = `${d.item_number}_rev${d.rev}`;
    const group = revGroups[key];
    const idx  = group.indexOf(d);
    // Single file → no suffix; multiple files → _1, _2, …
    const suffix = group.length > 1 ? `_${idx + 1}` : '';
    const fname  = `${base}${suffix}${ext}`;
    const projFolder = sanitizeName(`${d.proj_nr}_${d.proj_name}`);
    try { entries.push({ name: `Projekte/${projFolder}/Dateien/${fname}`, data: fs.readFileSync(src) }); } catch {}
  }

  // Project documents: Projekte/{proj_nr} - {proj_name}/Dokumente/{original_name}
  const docs = all(`
    SELECT d.filename, d.original_name,
      p.number as proj_nr, p.name as proj_name
    FROM documents d JOIN projects p ON d.project_id = p.id`);
  for (const d of docs) {
    const src = path.join(FILES_DIR, d.filename);
    if (!fs.existsSync(src)) continue;
    const projFolder = sanitizeName(`${d.proj_nr}_${d.proj_name}`);
    const fname = sanitizeName(d.original_name);
    try { entries.push({ name: `Projekte/${projFolder}/Dokumente/${fname}`, data: fs.readFileSync(src) }); } catch {}
  }

  // Standard part files: Normteile/{designation}/{original_name}
  const spFiles = all(`
    SELECT f.filename, f.original_name, sp.designation
    FROM standard_part_files f JOIN standard_parts sp ON f.std_part_id = sp.id`);
  for (const f of spFiles) {
    const src = path.join(FILES_DIR, f.filename);
    if (!fs.existsSync(src)) continue;
    const folder = sanitizeName(f.designation);
    const fname  = sanitizeName(f.original_name);
    try { entries.push({ name: `Normteile/${folder}/${fname}`, data: fs.readFileSync(src) }); } catch {}
  }

  const zip = buildZip(entries);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="plm-export-benannt-${today}.zip"`);
  res.send(zip);
});

app.get('/api/export', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [{ name: 'plm.db', data: Buffer.from(db.export()) }];
  if (fs.existsSync(FILES_DIR)) {
    for (const f of fs.readdirSync(FILES_DIR)) {
      try { entries.push({ name: 'files/' + f, data: fs.readFileSync(path.join(FILES_DIR, f)) }); } catch {}
    }
  }
  const zip = buildZip(entries);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="plm-backup-${today}.zip"`);
  res.send(zip);
});

// ==============================================================
// SICHERUNGEN WIEDERHERSTELLEN
// ==============================================================
// Jede Sicherung in backups/ ist eine vollständige plm.db. Wiederherstellen
// geht aus dieser Liste, aus einer hochgeladenen .db oder aus einem
// Gesamtexport (.zip, dann kommen fehlende Dateien gleich mit).
const BACKUP_NAME_RE = /^plm-[\w.-]+\.db$/;
function backupKind(name) {
  if (/^plm-\d{4}-\d{2}-\d{2}\.db$/.test(name)) return 'auto';
  if (name.includes('-vor-wiederherstellung')) return 'vor-wiederherstellung';
  if (name.includes('-manuell')) return 'manuell';
  return 'sonstige';
}
function timestampName(suffix) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `plm-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${suffix}.db`;
}
const STAT_TABLES = ['projects', 'items', 'revisions', 'datasets', 'orders', 'deliveries', 'customers'];
// Kennzahlen einer Datenbankdatei, ohne sie zu laden
function databaseStats(buf) {
  const tmp = new SQL.Database(buf);
  try {
    const one = sql => { try { return tmp.exec(sql)[0]?.values?.[0]?.[0] ?? null; } catch { return null; } };
    const stats = { ok: one('PRAGMA integrity_check') === 'ok', last_change: one('SELECT MAX(created_at) FROM changelog') };
    STAT_TABLES.forEach(t => { stats[t] = one(`SELECT COUNT(*) FROM ${t}`); });
    return stats;
  } finally { tmp.close(); }
}
function currentStats() {
  const stats = { last_change: get('SELECT MAX(created_at) as m FROM changelog')?.m || null };
  STAT_TABLES.forEach(t => { stats[t] = count(`SELECT COUNT(*) as c FROM ${t}`); });
  return stats;
}

// Dateien, auf die die Datenbank verweist, die aber im Dateiordner fehlen:
// aus dem Papierkorb zurückholen, den Rest melden.
function recoverFilesFromTrash() {
  const refs = [
    ...all('SELECT filename, original_name FROM datasets'),
    ...all('SELECT filename, original_name FROM documents'),
    ...all('SELECT filename, original_name FROM standard_part_files'),
  ].filter(f => f.filename);
  let restored = 0;
  const missing = [];
  for (const f of refs) {
    const dest = path.join(FILES_DIR, f.filename);
    if (fs.existsSync(dest)) continue;
    const src = path.join(TRASH_DIR, f.filename);
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, dest); } catch { try { fs.copyFileSync(src, dest); fs.unlinkSync(src); } catch {} }
      if (fs.existsSync(dest)) { restored++; continue; }
    }
    missing.push(f.original_name || f.filename);
  }
  return { restored_from_trash: restored, missing: missing.length, missing_names: missing.slice(0, 20) };
}

// Ablauf: prüfen → aktuellen Stand sichern → Dateien aus dem ZIP ergänzen →
// Datenbank tauschen und aufs aktuelle Schema bringen → fehlende Dateien aus
// dem Papierkorb holen. Scheitert der Tausch, bleibt der bisherige Stand aktiv.
function restoreDatabase(buf, source, zipFiles) {
  let stats = null;
  try { stats = databaseStats(buf); } catch {}
  if (!stats?.ok) throw new Error('Die Datei ist keine gültige PLM-Datenbank.');
  if (stats.projects == null || stats.items == null) throw new Error('Die Datenbank enthält keine PLM-Tabellen.');

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const safetyName = timestampName('vor-wiederherstellung');
  fs.writeFileSync(path.join(BACKUP_DIR, safetyName), Buffer.from(db.export()));

  // Gespeicherte Dateien tragen eindeutige Namen — vorhandene bleiben unberührt
  let extracted = 0;
  for (const e of zipFiles || []) {
    const name = path.basename(e.entryName);
    if (!name || name.startsWith('.')) continue;
    const dest = path.join(FILES_DIR, name);
    if (fs.existsSync(dest)) continue;
    fs.writeFileSync(dest, e.getData());
    extracted++;
  }

  const previous = db;
  try {
    db = new SQL.Database(buf);
    applySchema();
    log('settings', 0, 'Sicherung wiederhergestellt', `${source} · vorheriger Stand gesichert als ${safetyName}`);
    dbDirty = true;
    flushDb();
  } catch (err) {
    try { db.close(); } catch {}
    db = previous;
    throw new Error('Wiederherstellen fehlgeschlagen: ' + err.message + ' — der bisherige Stand ist weiter aktiv.');
  }
  try { previous.close(); } catch {}

  const files = recoverFilesFromTrash();
  console.log(`Sicherung wiederhergestellt: ${source} (vorher gesichert als ${safetyName})`);
  return { ok: true, source, safety_backup: safetyName, stats: currentStats(), files: { ...files, extracted } };
}

const _backupStatsCache = new Map();
app.get('/api/backups', (req, res) => {
  let names = [];
  try { names = fs.readdirSync(BACKUP_DIR).filter(f => BACKUP_NAME_RE.test(f)); } catch {}
  const backups = names.map(name => {
    const st = fs.statSync(path.join(BACKUP_DIR, name));
    const key = `${name}:${st.size}:${st.mtimeMs}`;
    let stats = _backupStatsCache.get(key);
    if (!stats) {
      try { stats = databaseStats(fs.readFileSync(path.join(BACKUP_DIR, name))); }
      catch (e) { stats = { ok: false }; }
      _backupStatsCache.set(key, stats);
    }
    return { name, kind: backupKind(name), size: st.size, modified_at: st.mtime.toISOString(), stats };
  }).sort((a, b) => b.modified_at.localeCompare(a.modified_at));
  res.json({ backups, current: currentStats(), dir: BACKUP_DIR, keep_auto: BACKUP_KEEP, trash_days: TRASH_KEEP_DAYS });
});

app.post('/api/backups', (req, res) => {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = timestampName('manuell');
  fs.writeFileSync(path.join(BACKUP_DIR, name), Buffer.from(db.export()));
  log('settings', 0, 'Sicherung erstellt', name);
  res.json({ name });
});

app.delete('/api/backups/:name', (req, res) => {
  const name = path.basename(req.params.name);
  if (!BACKUP_NAME_RE.test(name)) return res.status(400).json({ error: 'Ungültiger Name' });
  try { fs.unlinkSync(path.join(BACKUP_DIR, name)); }
  catch { return res.status(404).json({ error: 'Sicherung nicht gefunden' }); }
  res.json({ success: true });
});

app.post('/api/backups/:name/restore', (req, res) => {
  const name = path.basename(req.params.name);
  if (!BACKUP_NAME_RE.test(name)) return res.status(400).json({ error: 'Ungültiger Name' });
  const file = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Sicherung nicht gefunden' });
  try { res.json(restoreDatabase(fs.readFileSync(file), name)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

const uploadRestore = _keepUser(multer({ dest: os.tmpdir(), limits: { fileSize: 8 * 1024 * 1024 * 1024 }, defParamCharset: 'utf8' }));
app.post('/api/backups/restore-upload', uploadRestore.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    let buf, zipFiles = null;
    if (ext === '.zip') {
      const zip = new AdmZip(req.file.path);
      const entry = zip.getEntry('plm.db');
      if (!entry) throw new Error('Im ZIP fehlt die Datenbank (plm.db). Bitte den Gesamtexport verwenden.');
      buf = entry.getData();
      zipFiles = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith('files/'));
    } else if (ext === '.db') {
      buf = fs.readFileSync(req.file.path);
    } else {
      throw new Error('Bitte eine Sicherung (.db) oder einen Gesamtexport (.zip) wählen.');
    }
    res.json(restoreDatabase(buf, req.file.originalname, zipFiles));
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch {}
  }
});


// ==============================================================
// SUPPLIERS
// ==============================================================
// "Musterstrasse 1\n8000 Zürich\nSchweiz" oder "Musterstrasse 1, CH-8000 Zürich"
// → { street, postal_code, city, country }; ohne erkennbare PLZ-Zeile null
function splitAddress(text) {
  const parts = String(text || '').split(/\r?\n|,/).map(p => p.trim()).filter(Boolean);
  const re = /^(?:[A-Z]{1,2}[- ]?)?(\d{4,5})\s+(.+)$/;
  const i = parts.findIndex(p => re.test(p));
  if (i < 0) return null;
  const m = parts[i].match(re);
  return { street: parts.slice(0, i).join(', '), postal_code: m[1], city: m[2], country: parts.slice(i + 1).join(', ') };
}
// Freitext-Adresse für Belege (Bestell-PDF) aus den Einzelfeldern
function supplierAddressFields(body, current) {
  const street = body.street || '', postal_code = body.postal_code || '', city = body.city || '', country = body.country || '';
  const structured = street || postal_code || city;
  const address = structured
    ? [street, [postal_code, city].filter(Boolean).join(' '), country].filter(Boolean).join('\n')
    : (body.address ?? current?.address ?? '');
  return { street, postal_code, city, country, address };
}

// Offen = noch nicht erhalten; Volumen = tatsächlich bestellt
const PO_OPEN_STATUSES = ['DRAFT', 'ORDERED'];
const PO_VOLUME_STATUSES = ['ORDERED', 'RECEIVED'];

app.get('/api/suppliers', (req, res) => {
  const suppliers = all('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE');
  const pos = all(`
    SELECT po.supplier_id, po.status, COALESCE(po.order_date, substr(po.created_at,1,10)) as activity_date,
      COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total
    FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
    WHERE po.supplier_id IS NOT NULL GROUP BY po.id`);
  const bySupplier = {};
  pos.forEach(p => (bySupplier[p.supplier_id] ??= []).push(p));
  const invCount = Object.fromEntries(all(
    'SELECT supplier_id, COUNT(*) as n FROM inventory_items WHERE supplier_id IS NOT NULL GROUP BY supplier_id'
  ).map(r => [r.supplier_id, r.n]));
  suppliers.forEach(s => {
    const list = bySupplier[s.id] || [];
    s.po_count = list.length;
    s.open_po_count = list.filter(p => PO_OPEN_STATUSES.includes(p.status)).length;
    s.volume = list.filter(p => PO_VOLUME_STATUSES.includes(p.status)).reduce((a, p) => a + p.total, 0);
    s.last_activity = list.reduce((m, p) => (p.activity_date > m ? p.activity_date : m), '') || null;
    s.inventory_count = invCount[s.id] || 0;
  });
  res.json(suppliers);
});

app.post('/api/suppliers', (req, res) => {
  const { name, contact_person, email, phone, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const a = supplierAddressFields(req.body);
  const number = nextSupplierNumber();
  const id = runGetId(`INSERT INTO suppliers (number,name,contact_person,email,phone,address,street,postal_code,city,country,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [number, name, contact_person||'', email||'', phone||'', a.address, a.street, a.postal_code, a.city, a.country, notes||'']);
  res.json(get('SELECT * FROM suppliers WHERE id=?', [id]));
});

app.get('/api/suppliers/:id', (req, res) => {
  const s = get('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
  s.inventory_items = all('SELECT * FROM inventory_items WHERE supplier_id=? ORDER BY name', [s.id]);
  s.purchase_orders = all(`
    SELECT po.*, COUNT(poi.id) as item_count, COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total
    FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
    WHERE po.supplier_id=? GROUP BY po.id ORDER BY COALESCE(po.order_date, po.created_at) DESC, po.id DESC`, [s.id]);
  s.volume = s.purchase_orders.filter(p => PO_VOLUME_STATUSES.includes(p.status)).reduce((a, p) => a + p.total, 0);
  res.json(s);
});

app.put('/api/suppliers/:id', (req, res) => {
  const cur = get('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  if (!cur) return res.status(404).json({ error: 'Nicht gefunden' });
  const { name, contact_person, email, phone, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const a = supplierAddressFields(req.body, cur);
  run(`UPDATE suppliers SET name=?,contact_person=?,email=?,phone=?,address=?,street=?,postal_code=?,city=?,country=?,notes=? WHERE id=?`,
    [name, contact_person||'', email||'', phone||'', a.address, a.street, a.postal_code, a.city, a.country, notes||'', cur.id]);
  res.json(get('SELECT * FROM suppliers WHERE id=?', [cur.id]));
});

app.delete('/api/suppliers/:id', (req, res) => {
  const s = get('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Nicht gefunden' });
  // Wie bei Kunden: Bestellungen behalten den Namen, sonst ist der Beleg leer
  tx(() => {
    run(`UPDATE purchase_orders SET supplier_name_free=COALESCE(NULLIF(supplier_name_free,''), ?), supplier_id=NULL WHERE supplier_id=?`,
      [s.name, s.id]);
    run('UPDATE inventory_items SET supplier_id=NULL WHERE supplier_id=?', [s.id]);
    run('DELETE FROM suppliers WHERE id=?', [s.id]);
  });
  res.json({ success: true });
});

// ==============================================================
// PURCHASE ORDERS (Einkauf)
// ==============================================================
function poWithItems(po) {
  if (!po) return null;
  po.items = all(`SELECT poi.*, ii.name as inv_name, ii.stock_qty,
    rm.name as rm_name, rm.unit as rm_unit
    FROM purchase_order_items poi
    LEFT JOIN inventory_items ii ON poi.inventory_item_id=ii.id
    LEFT JOIN raw_materials rm ON poi.raw_material_id=rm.id
    WHERE poi.po_id=? ORDER BY poi.position,poi.id`, [po.id]);
  return po;
}

app.get('/api/purchase-orders', (req, res) => {
  const rows = all(`SELECT po.*, COALESCE(s.name, po.supplier_name_free) as supplier_name,
    COUNT(poi.id) as item_count,
    COALESCE(SUM(poi.quantity * poi.unit_price), 0) as total
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN purchase_order_items poi ON poi.po_id=po.id
    GROUP BY po.id ORDER BY po.id DESC`);
  res.json(rows);
});

app.post('/api/purchase-orders', (req, res) => {
  const { supplier_id, supplier_name_free, order_date, expected_date, notes } = req.body;
  const number = nextPoNumber();
  const id = runGetId('INSERT INTO purchase_orders (number,supplier_id,supplier_name_free,order_date,expected_date,notes) VALUES (?,?,?,?,?,?)',
    [number, supplier_id||null, supplier_name_free||'', order_date||null, expected_date||null, notes||'']);
  res.json(poWithItems(get('SELECT * FROM purchase_orders WHERE id=?', [id])));
});

app.get('/api/purchase-orders/:id', (req, res) => {
  const po = get(`SELECT po.*, COALESCE(s.name, po.supplier_name_free) as supplier_name, s.email as supplier_email, s.phone as supplier_phone, s.address as supplier_address
    FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?`, [req.params.id]);
  if (!po) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(poWithItems(po));
});

app.put('/api/purchase-orders/:id', (req, res) => {
  const { supplier_id, supplier_name_free, order_date, expected_date, notes } = req.body;
  run(`UPDATE purchase_orders SET supplier_id=?,supplier_name_free=?,order_date=?,expected_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [supplier_id||null, supplier_name_free||'', order_date||null, expected_date||null, notes||'', req.params.id]);
  const po = get(`SELECT po.*, COALESCE(s.name, po.supplier_name_free) as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?`, [req.params.id]);
  res.json(poWithItems(po));
});

app.put('/api/purchase-orders/:id/status', (req, res) => {
  const { status, lot_numbers } = req.body;
  const valid = ['DRAFT','ORDERED','RECEIVED','CANCELLED'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Ungültiger Status' });
  run(`UPDATE purchase_orders SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  if (status === 'RECEIVED') {
    const items = all('SELECT * FROM purchase_order_items WHERE po_id=?', [req.params.id]);
    const poNum = get('SELECT number FROM purchase_orders WHERE id=?', [req.params.id])?.number || '';
    for (const item of items) {
      // Normteile haben keinen eigenen Bestand. Beim ersten Wareneingang wird
      // ein Lagerartikel angelegt und fest mit dem Normteil verknuepft — danach
      // laeuft alles ueber den normalen Lagerweg, ohne doppelte Pflege.
      if (item.std_part_id && item.quantity > 0 && !item.inventory_item_id) {
        let inv = get('SELECT * FROM inventory_items WHERE std_part_id=?', [item.std_part_id]);
        if (!inv) {
          const sp = get('SELECT * FROM standard_parts WHERE id=?', [item.std_part_id]);
          if (sp) {
            const newId = runGetId(`INSERT INTO inventory_items (name,category,sku,unit,stock_qty,min_qty,price_per_unit,notes,std_part_id)
              VALUES (?,?,?,?,0,0,?,?,?)`,
              [sp.designation || sp.name || 'Normteil', 'Normteile', sp.std_number || '',
               item.unit || 'Stk', sp.unit_price ?? null, 'Automatisch aus Einkauf angelegt', sp.id]);
            inv = get('SELECT * FROM inventory_items WHERE id=?', [newId]);
            log('inventory', newId, 'Erstellt', `Lagerartikel für Normteil ${sp.designation} aus ${poNum}`);
          }
        }
        if (inv) {
          run('UPDATE purchase_order_items SET inventory_item_id=? WHERE id=?', [inv.id, item.id]);
          item.inventory_item_id = inv.id;
        }
      }
      if (item.inventory_item_id && item.quantity > 0) {
        run(`UPDATE inventory_items SET stock_qty=stock_qty+?,updated_at=datetime('now') WHERE id=?`, [item.quantity, item.inventory_item_id]);
        runGetId('INSERT INTO inventory_movements (item_id,type,qty,reference,notes) VALUES (?,?,?,?,?)',
          [item.inventory_item_id, 'IN', item.quantity, poNum, 'Wareneingang EK']);
      }
      if (item.raw_material_id && item.quantity > 0) {
        const lotData = lot_numbers && lot_numbers[item.id];
        // Update total stock qty once
        run(`UPDATE raw_materials SET stock_qty=stock_qty+?,updated_at=datetime('now') WHERE id=?`, [item.quantity, item.raw_material_id]);
        if (Array.isArray(lotData) && lotData.length) {
          // Group units by lot number → one movement per unique lot
          const grouped = {};
          lotData.forEach(l => { const k = l || ''; grouped[k] = (grouped[k] || 0) + 1; });
          let lastLot = '';
          for (const [lot, qty] of Object.entries(grouped)) {
            run('INSERT INTO raw_material_movements (raw_material_id,qty,type,notes,unit_price,lot_number) VALUES (?,?,?,?,?,?)',
              [item.raw_material_id, qty, 'in', 'Wareneingang ' + poNum, item.unit_price || null, lot || null]);
            if (lot) lastLot = lot;
          }
          if (lastLot) run(`UPDATE raw_materials SET lot_number=? WHERE id=?`, [lastLot, item.raw_material_id]);
        } else {
          const lotNr = (typeof lotData === 'string' ? lotData : '') || '';
          if (lotNr) run(`UPDATE raw_materials SET lot_number=? WHERE id=?`, [lotNr, item.raw_material_id]);
          run('INSERT INTO raw_material_movements (raw_material_id,qty,type,notes,unit_price,lot_number) VALUES (?,?,?,?,?,?)',
            [item.raw_material_id, item.quantity, 'in', 'Wareneingang ' + poNum, item.unit_price || null, lotNr || null]);
        }
      }
    }
  }
  res.json({ ok: true });
});

app.delete('/api/purchase-orders/:id', (req, res) => {
  run('DELETE FROM purchase_order_items WHERE po_id=?', [req.params.id]);
  run('DELETE FROM purchase_orders WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/purchase-orders/:id/items', (req, res) => {
  const { description, quantity, unit, unit_price, inventory_item_id, raw_material_id, std_part_id, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'Beschreibung fehlt' });
  const pos = (get('SELECT MAX(position) as m FROM purchase_order_items WHERE po_id=?', [req.params.id])?.m || 0) + 1;
  const iid = runGetId('INSERT INTO purchase_order_items (po_id,description,quantity,unit,unit_price,inventory_item_id,raw_material_id,std_part_id,notes,position) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, description, parseFloat(quantity)||1, unit||'Stk', unit_price!=null&&unit_price!==''?parseFloat(unit_price):null, inventory_item_id||null, raw_material_id||null, std_part_id||null, notes||'', pos]);
  res.json(get('SELECT * FROM purchase_order_items WHERE id=?', [iid]));
});

app.put('/api/purchase-orders/:id/items/:itemId', (req, res) => {
  const { description, quantity, unit, unit_price, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'Beschreibung fehlt' });
  run(`UPDATE purchase_order_items SET description=?,quantity=?,unit=?,unit_price=?,notes=? WHERE id=? AND po_id=?`,
    [description, parseFloat(quantity)||1, unit||'Stk', unit_price!=null&&unit_price!==''?parseFloat(unit_price):null, notes||'', req.params.itemId, req.params.id]);
  res.json(get('SELECT * FROM purchase_order_items WHERE id=?', [req.params.itemId]));
});

app.delete('/api/purchase-orders/:id/items/:itemId', (req, res) => {
  run('DELETE FROM purchase_order_items WHERE id=? AND po_id=?', [req.params.itemId, req.params.id]);
  res.json({ ok: true });
});

// ==============================================================
// INVENTORY
// ==============================================================
// „Geplant" sind nur Aufträge, die noch ans Lager gehen: in Arbeit, nicht
// geliefert. Angebote sind nicht zugesagt, Geliefertes und Fakturiertes ist
// schon raus, Abgelehntes und Storniertes kommt nicht.
const STOCK_PLANNED_STATUSES = ['DRAFT', 'CONFIRMED'];
const STOCK_PLANNED_SQL = STOCK_PLANNED_STATUSES.map(s => `'${s}'`).join(',');

// Stock check for a PLM item: returns linked inventory item + planned qty in open orders
app.get('/api/inventory/stock-check', (req, res) => {
  const { item_id } = req.query;
  if (!item_id) return res.json(null);
  const inv = get(`SELECT ii.* FROM inventory_items ii WHERE ii.item_id=? LIMIT 1`, [parseInt(item_id)]);
  if (!inv) return res.json(null);
  const planned = get(`
    SELECT COALESCE(SUM(oi.quantity),0) as qty
    FROM order_items oi
    JOIN orders o ON oi.order_id=o.id
    WHERE oi.item_id=? AND o.status IN (${STOCK_PLANNED_SQL})
  `, [parseInt(item_id)]);
  res.json({ ...inv, planned_qty: planned?.qty || 0 });
});

app.get('/api/inventory', (req, res) => {
  const { item_id } = req.query;
  const base = `SELECT ii.*, s.name as supplier_name, it.item_number as linked_item_number, it.name as linked_item_name,
    COALESCE((
      SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON oi.order_id=o.id
      WHERE oi.item_id=ii.item_id AND ii.item_id IS NOT NULL AND o.status IN (${STOCK_PLANNED_SQL})
    ), 0) as planned_qty
    FROM inventory_items ii
    LEFT JOIN suppliers s ON ii.supplier_id=s.id
    LEFT JOIN items it ON ii.item_id=it.id`;
  if (item_id) {
    res.json(all(base + ' WHERE ii.item_id=? ORDER BY ii.category, ii.name', [parseInt(item_id)]));
  } else {
    res.json(all(base + ' ORDER BY ii.category, ii.name'));
  }
});

app.post('/api/inventory', (req, res) => {
  const { name, category, sku, unit, min_qty, price_per_unit, supplier_id, notes, item_id, color, material } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = runGetId('INSERT INTO inventory_items (name,category,sku,unit,stock_qty,min_qty,price_per_unit,supplier_id,notes,item_id,color,material) VALUES (?,?,?,?,0,?,?,?,?,?,?,?)',
    [name, category||'Sonstiges', sku||'', unit||'Stk', parseFloat(min_qty)||0,
     price_per_unit!=null&&price_per_unit!==''?parseFloat(price_per_unit):null, supplier_id||null, notes||'',
     item_id||null, color||null, material||null]);
  res.json(get('SELECT * FROM inventory_items WHERE id=?', [id]));
});

app.get('/api/inventory/:id', (req, res) => {
  const item = get(`SELECT ii.*, s.name as supplier_name, it.item_number as linked_item_number, it.name as linked_item_name
    FROM inventory_items ii
    LEFT JOIN suppliers s ON ii.supplier_id=s.id
    LEFT JOIN items it ON ii.item_id=it.id
    WHERE ii.id=?`, [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  item.movements = all('SELECT * FROM inventory_movements WHERE item_id=? ORDER BY created_at DESC LIMIT 50', [item.id]);
  res.json(item);
});

app.put('/api/inventory/:id', (req, res) => {
  const { name, category, sku, unit, min_qty, price_per_unit, supplier_id, notes, item_id, color, material } = req.body;
  run(`UPDATE inventory_items SET name=?,category=?,sku=?,unit=?,min_qty=?,price_per_unit=?,supplier_id=?,notes=?,item_id=?,color=?,material=?,updated_at=datetime('now') WHERE id=?`,
    [name, category||'Sonstiges', sku||'', unit||'Stk', parseFloat(min_qty)||0,
     price_per_unit!=null&&price_per_unit!==''?parseFloat(price_per_unit):null, supplier_id||null, notes||'',
     item_id||null, color||null, material||null, req.params.id]);
  res.json(get('SELECT * FROM inventory_items WHERE id=?', [req.params.id]));
});

app.delete('/api/inventory/:id', (req, res) => {
  tx(() => {
    run('DELETE FROM inventory_movements WHERE item_id=?', [req.params.id]);
    run('DELETE FROM inventory_items WHERE id=?', [req.params.id]);
  });
  res.json({ success: true });
});

app.post('/api/inventory/:id/movement', (req, res) => {
  const { type, qty, reference, notes } = req.body;
  if (!type || qty == null) return res.status(400).json({ error: 'Art und Menge fehlen' });
  const item = get('SELECT * FROM inventory_items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const delta = type === 'out' ? -Math.abs(parseFloat(qty)) : Math.abs(parseFloat(qty));
  tx(() => {
    run('INSERT INTO inventory_movements (item_id,type,qty,reference,notes) VALUES (?,?,?,?,?)',
      [req.params.id, type, delta, reference||'', notes||'']);
    run(`UPDATE inventory_items SET stock_qty=stock_qty+?,updated_at=datetime('now') WHERE id=?`, [delta, req.params.id]);
  });
  res.json(get('SELECT * FROM inventory_items WHERE id=?', [req.params.id]));
});

// ==============================================================
// TIME ENTRIES
// ==============================================================
// ==============================================================
// STANDARD PARTS (Normteile)
// ==============================================================
app.get('/api/standard-parts', (req, res) => {
  res.json(all('SELECT * FROM standard_parts ORDER BY standard, std_number, size, designation'));
});

app.get('/api/standard-parts/export', (req, res) => {
  const parts = all('SELECT designation,standard,std_number,name,size,material,unit_price,notes FROM standard_parts ORDER BY standard,std_number,size,designation');
  res.setHeader('Content-Disposition', 'attachment; filename="normteile.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ version: 1, exported: new Date().toISOString(), parts }, null, 2));
});

app.post('/api/standard-parts/import', (req, res) => {
  const { parts } = req.body;
  if (!Array.isArray(parts)) return res.status(400).json({ error: 'Ungültiges Format' });
  const existing = new Set(all('SELECT designation FROM standard_parts').map(p => p.designation));
  let added = 0, skipped = 0;
  for (const p of parts) {
    if (!p.designation) continue;
    if (existing.has(p.designation)) { skipped++; continue; }
    runGetId('INSERT INTO standard_parts (designation,standard,std_number,name,size,material,unit_price,notes) VALUES (?,?,?,?,?,?,?,?)',
      [p.designation, p.standard||'', p.std_number||'', p.name||'', p.size||'', p.material||'', p.unit_price||null, p.notes||'']);
    existing.add(p.designation);
    added++;
  }
  saveDb();
  res.json({ added, skipped });
});

app.post('/api/standard-parts', (req, res) => {
  const { designation, standard, std_number, name, size, material, unit_price, notes } = req.body;
  if (!designation) return res.status(400).json({ error: 'Bezeichnung fehlt' });
  const id = runGetId('INSERT INTO standard_parts (designation,standard,std_number,name,size,material,unit_price,notes) VALUES (?,?,?,?,?,?,?,?)',
    [designation, standard||'', std_number||'', name||'', size||'', material||'', unit_price||null, notes||'']);
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [id]));
});

app.post('/api/standard-parts/:id/clone', (req, res) => {
  const p = get('SELECT * FROM standard_parts WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  const newId = runGetId('INSERT INTO standard_parts (designation,standard,std_number,name,size,material,unit_price,notes) VALUES (?,?,?,?,?,?,?,?)',
    [p.designation, p.standard||'', p.std_number||'', p.name||'', p.size||'', p.material||'', p.unit_price||null, p.notes||'']);
  saveDb();
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [newId]));
});

app.put('/api/standard-parts/:id', (req, res) => {
  const { designation, standard, std_number, name, size, material, unit_price, notes } = req.body;
  if (!designation) return res.status(400).json({ error: 'Bezeichnung fehlt' });
  run('UPDATE standard_parts SET designation=?,standard=?,std_number=?,name=?,size=?,material=?,unit_price=?,notes=? WHERE id=?',
    [designation, standard||'', std_number||'', name||'', size||'', material||'', unit_price||null, notes||'', req.params.id]);
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [req.params.id]));
});

app.delete('/api/standard-parts/:id', (req, res) => {
  // delete associated files from disk
  const files = all('SELECT * FROM standard_part_files WHERE std_part_id=?', [req.params.id]);
  files.forEach(f => trashFile(f.filename));
  run('DELETE FROM standard_parts WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/standard-parts/:id/files', (req, res) => {
  res.json(all('SELECT * FROM standard_part_files WHERE std_part_id=? ORDER BY uploaded_at DESC', [req.params.id]));
});

app.post('/api/standard-parts/:id/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
  const dsType = guessType(req.file.originalname);
  const id = runGetId('INSERT INTO standard_part_files (std_part_id,filename,original_name,file_size,ds_type,notes) VALUES (?,?,?,?,?,?)',
    [req.params.id, req.file.filename, req.file.originalname, req.file.size, dsType, req.body.notes || req.file.originalname]);
  res.json(get('SELECT * FROM standard_part_files WHERE id=?', [id]));
});

app.get('/api/standard-part-files/:id/download', (req, res) => {
  const f = get('SELECT * FROM standard_part_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: 'Nicht gefunden' });
  const fp = path.join(FILES_DIR, f.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Datei fehlt' });
  res.download(fp, f.original_name);
});

app.delete('/api/standard-part-files/:id', (req, res) => {
  const f = get('SELECT * FROM standard_part_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: 'Nicht gefunden' });
  trashFile(f.filename);
  run('DELETE FROM standard_part_files WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/revisions/:revId/bom-std', (req, res) => {
  const { std_part_id, quantity, unit, notes } = req.body;
  if (rejectIfDelivered(res, req.params.revId)) return;
  const sp = get('SELECT * FROM standard_parts WHERE id=?', [std_part_id]);
  if (!sp) return res.status(404).json({ error: 'Normteil nicht gefunden' });
  try {
    const pos = (get('SELECT MAX(position) as m FROM bom_std_parts WHERE parent_rev_id=?', [req.params.revId])?.m || 0) + 1;
    const id = runGetId('INSERT INTO bom_std_parts (parent_rev_id,std_part_id,quantity,unit,position,notes) VALUES (?,?,?,?,?,?)',
      [req.params.revId, std_part_id, quantity||1, unit||'pcs', pos, notes||'']);
    log('revision', req.params.revId, 'BOM: Position hinzugefügt', sp.designation + ' x' + (quantity||1));
    res.json({ success: true, id });
  } catch { res.status(400).json({ error: 'Bereits in der BOM vorhanden' }); }
});

app.put('/api/bom-std/:id/quantity', (req, res) => {
  const { quantity, unit } = req.body;
  if (rejectIfDelivered(res, get('SELECT parent_rev_id FROM bom_std_parts WHERE id=?', [req.params.id])?.parent_rev_id)) return;
  run('UPDATE bom_std_parts SET quantity=?, unit=? WHERE id=?', [Math.max(1, Math.round(parseFloat(quantity)||1)), unit||'Stk', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.put('/api/revisions/:revId/bom-std-reorder', (req, res) => {
  const { order } = req.body; // array of bom_std_parts ids in new order
  if (rejectIfDelivered(res, req.params.revId)) return;
  order.forEach((id, idx) => run('UPDATE bom_std_parts SET position=? WHERE id=? AND parent_rev_id=?', [idx+1, id, req.params.revId]));
  saveDb();
  res.json({ success: true });
});

app.delete('/api/bom-std/:id', (req, res) => {
  const row = get('SELECT bs.*, sp.designation FROM bom_std_parts bs JOIN standard_parts sp ON bs.std_part_id=sp.id WHERE bs.id=?', [req.params.id]);
  if (row && rejectIfDelivered(res, row.parent_rev_id)) return;
  if (row) log('revision', row.parent_rev_id, 'BOM: Position entfernt', row.designation);
  run('DELETE FROM bom_std_parts WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// RAW MATERIALS
// ==============================================================
// Artikel-Nummer einem Lot zuweisen (idempotent)
app.post('/api/raw-materials/:id/lots/assign-number', (req, res) => {
  const rmId = parseInt(req.params.id);
  const { lot_number } = req.body;
  const rm = get('SELECT * FROM raw_materials WHERE id=?', [rmId]);
  if (!rm) return res.status(404).json({ error: 'Nicht gefunden' });

  const lot = lot_number || '';

  // Existiert schon?
  const existing = get(
    `SELECT article_number FROM raw_material_movements WHERE raw_material_id=? AND lot_number=? AND article_number IS NOT NULL LIMIT 1`,
    [rmId, lot]
  );
  if (existing?.article_number) return res.json({ article_number: existing.article_number });

  // Counter sicherstellen (falls Migration noch nicht gelaufen)
  db.run(`INSERT OR IGNORE INTO counters VALUES ('rm_lot',0)`);

  // Neue Nummer generieren
  const pre = getSetting('prefix_rm_lot', 'RM');
  const yr  = getSetting('num_yearly', '1') !== '0' ? new Date().getFullYear() + '-' : '';
  const num = padN(nextCounter('rm_lot'), 'pad_rm_lot', 4);
  const articleNumber = `${pre}-${yr}${num}`;

  // Subquery statt UPDATE...LIMIT (sql.js unterstützt kein UPDATE...LIMIT)
  run(
    `UPDATE raw_material_movements SET article_number=? WHERE id=(SELECT id FROM raw_material_movements WHERE raw_material_id=? AND lot_number=? AND type='in' ORDER BY id LIMIT 1)`,
    [articleNumber, rmId, lot]
  );
  saveDb();
  log('raw_material', rmId, 'Artikel-Nr. vergeben', `${articleNumber} für Lot ${lot || '(ohne)'}`);
  res.json({ article_number: articleNumber });
});

// Label-Daten für Etikettendruck
app.get('/api/raw-materials/:id/label', (req, res) => {
  const rm  = get('SELECT * FROM raw_materials WHERE id=?', [req.params.id]);
  if (!rm) return res.status(404).json({ error: 'Nicht gefunden' });
  const lot = req.query.lot_number || '';
  const mov = get(
    `SELECT article_number FROM raw_material_movements WHERE raw_material_id=? AND lot_number=? AND article_number IS NOT NULL LIMIT 1`,
    [rm.id, lot]
  );
  const remaining = get(
    `SELECT COALESCE(SUM(CASE WHEN type='in' THEN qty ELSE -qty END),0) as qty FROM raw_material_movements WHERE raw_material_id=? AND lot_number=?`,
    [rm.id, lot]
  );
  res.json({
    article_number: mov?.article_number || null,
    name:        rm.name,
    material_type: rm.material_type,
    color:       rm.color,
    brand:       rm.brand,
    lot_number:  lot,
    remaining_qty: Math.max(0, remaining?.qty || 0),
    unit:        rm.unit,
    print_temp:  rm.print_temp,
    bed_temp:    rm.bed_temp,
    dimensions:  rm.dimensions,
  });
});

app.get('/api/raw-materials', (req, res) => {
  const mats = all('SELECT * FROM raw_materials ORDER BY material_type, color, name');
  mats.forEach(m => {
    const withLot = all(`SELECT MIN(id) as id, lot_number,
      SUM(CASE WHEN type='in' THEN qty ELSE 0 END) as qty,
      SUM(CASE WHEN type='in' THEN qty ELSE -qty END) as remaining_qty,
      MAX(CASE WHEN type='in' THEN unit_price ELSE NULL END) as unit_price,
      MAX(created_at) as last_date,
      MAX(article_number) as article_number
      FROM raw_material_movements
      WHERE raw_material_id=? AND lot_number IS NOT NULL AND lot_number!=''
      GROUP BY lot_number
      ORDER BY MAX(created_at) DESC`, [m.id]);
    const withoutLot = all(`SELECT id, '' as lot_number, qty, qty as remaining_qty, unit_price, created_at as last_date, notes, article_number
      FROM raw_material_movements
      WHERE raw_material_id=? AND type='in' AND (lot_number IS NULL OR lot_number='')
      ORDER BY created_at DESC`, [m.id]);
    m.lots = [...withLot, ...withoutLot];
  });
  res.json(mats);
});

app.post('/api/raw-materials', (req, res) => {
  const { name, material_type, color, brand, stock_qty, min_qty, unit, notes, lot_number, dimensions, weight_g, print_temp, bed_temp, nozzle } = req.body;
  if (!name) return res.status(400).json({ error: 'Name fehlt' });
  const id = runGetId('INSERT INTO raw_materials (name,material_type,color,brand,stock_qty,min_qty,unit,notes,lot_number,dimensions,weight_g,print_temp,bed_temp,nozzle) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [name, material_type||'', color||'', brand||'', parseFloat(stock_qty)||0, parseFloat(min_qty)||0, unit||'Stk', notes||'', lot_number||'', dimensions||'', weight_g!=null?parseFloat(weight_g):null, print_temp||null, bed_temp||null, nozzle||'']);
  res.json(get('SELECT * FROM raw_materials WHERE id=?', [id]));
});

app.put('/api/raw-materials/:id', (req, res) => {
  const { name, material_type, color, brand, min_qty, unit, notes, lot_number, dimensions, weight_g, print_temp, bed_temp, nozzle } = req.body;
  run(`UPDATE raw_materials SET name=?,material_type=?,color=?,brand=?,min_qty=?,unit=?,notes=?,lot_number=?,dimensions=?,weight_g=?,print_temp=?,bed_temp=?,nozzle=?,updated_at=datetime('now') WHERE id=?`,
    [name, material_type||'', color||'', brand||'', parseFloat(min_qty)||0, unit||'Stk', notes||'', lot_number||'', dimensions||'', weight_g!=null?parseFloat(weight_g):null, print_temp||null, bed_temp||null, nozzle||'', req.params.id]);
  res.json(get('SELECT * FROM raw_materials WHERE id=?', [req.params.id]));
});

app.delete('/api/raw-materials/:id', (req, res) => {
  run('DELETE FROM raw_materials WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/raw-materials/:id/adjust', (req, res) => {
  const { qty, type, notes, unit_price, lot_number } = req.body;
  const mat = get('SELECT * FROM raw_materials WHERE id=?', [req.params.id]);
  if (!mat) return res.status(404).json({ error: 'Nicht gefunden' });
  const delta = type === 'out' ? -Math.abs(parseFloat(qty)) : Math.abs(parseFloat(qty));
  const newQty = Math.max(0, mat.stock_qty + delta);
  run(`UPDATE raw_materials SET stock_qty=?,updated_at=datetime('now') WHERE id=?`, [newQty, req.params.id]);
  // Update main lot_number if a new one is provided on incoming booking
  if (type === 'in' && lot_number) run(`UPDATE raw_materials SET lot_number=? WHERE id=?`, [lot_number, req.params.id]);
  run('INSERT INTO raw_material_movements (raw_material_id,qty,type,notes,unit_price,lot_number) VALUES (?,?,?,?,?,?)',
    [req.params.id, Math.abs(parseFloat(qty)), type, notes||'', unit_price||null, lot_number||'']);
  res.json({ stock_qty: newQty });
});

app.put('/api/raw-material-movements/:id', (req, res) => {
  const { lot_number, unit_price, qty, notes } = req.body;
  run(`UPDATE raw_material_movements SET lot_number=?,unit_price=?,qty=?,notes=? WHERE id=?`,
    [lot_number||'', unit_price!=null?parseFloat(unit_price):null, parseFloat(qty)||0, notes||'', req.params.id]);
  // recalculate stock
  const mov = get('SELECT * FROM raw_material_movements WHERE id=?', [req.params.id]);
  if (mov) {
    const total = all(`SELECT SUM(CASE WHEN type='in' THEN qty ELSE -qty END) as s FROM raw_material_movements WHERE raw_material_id=?`, [mov.raw_material_id])[0]?.s || 0;
    run(`UPDATE raw_materials SET stock_qty=MAX(0,?),lot_number=COALESCE((SELECT lot_number FROM raw_material_movements WHERE raw_material_id=? AND type='in' AND lot_number!='' ORDER BY created_at DESC LIMIT 1),''),updated_at=datetime('now') WHERE id=?`,
      [total, mov.raw_material_id, mov.raw_material_id]);
  }
  res.json({ success: true });
});

app.get('/api/raw-materials/:id/movements', (req, res) => {
  const rows = all('SELECT * FROM raw_material_movements WHERE raw_material_id=? ORDER BY created_at ASC', [req.params.id]);
  // Calculate running balance
  let balance = 0;
  rows.forEach(r => { balance += r.type === 'in' ? r.qty : -r.qty; r.balance = Math.max(0, balance); });
  rows.reverse(); // newest first for display
  res.json(rows);
});

app.post('/api/checkout/normteile', (req, res) => {
  const normteileDir = path.join(getCheckoutDir(), 'normteile');
  try {
    if (!fs.existsSync(normteileDir)) fs.mkdirSync(normteileDir, { recursive: true });
  } catch(e) { return res.status(500).json({ error: 'Ordner konnte nicht erstellt werden: ' + e.message }); }

  const files = all(`SELECT spf.*, sp.designation
    FROM standard_part_files spf JOIN standard_parts sp ON spf.std_part_id=sp.id
    ORDER BY sp.standard, sp.std_number, spf.original_name`);

  if (!files.length) return res.json({ copied: [], dir: normteileDir, message: 'Keine Dateien vorhanden' });

  const copied = [], errors = [];
  for (const f of files) {
    const src = path.join(FILES_DIR, f.filename);
    // sanitize filename: keep original name as-is (user controls it)
    const dst = path.join(normteileDir, f.original_name);
    try { fs.copyFileSync(src, dst); copied.push({ name: f.original_name, designation: f.designation }); }
    catch(e) { errors.push(f.original_name); }
  }
  res.json({ copied, errors, dir: normteileDir });
});

// BOM children with full calc data for quote import
app.get('/api/items/:id/bom-for-quote', (req, res) => {
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
  const rev = getActiveRevision(item.id);
  if (!rev) return res.json([]);
  const bom = all(`SELECT b.quantity, b.unit, i.id, i.item_number, i.name, i.item_type, i.weight_g, i.default_price
    FROM bom b JOIN items i ON b.child_item_id=i.id
    WHERE b.parent_rev_id=? ORDER BY b.position`, [rev.id]);
  bom.forEach(b => { b.manufacturing_cost = calcItemCost(b.id); });
  res.json(bom);
});

app.get('/api/raw-materials/:id/prices', (req, res) => {
  const prices = all(`SELECT unit_price, notes, created_at FROM raw_material_movements
    WHERE raw_material_id=? AND type='in' AND unit_price IS NOT NULL
    ORDER BY created_at DESC`, [req.params.id]);
  // Return distinct prices (deduplicated by value)
  const seen = new Set();
  const distinct = prices.filter(p => { const k = p.unit_price; return seen.has(k) ? false : seen.add(k); });
  res.json(distinct);
});

app.get('/api/time-entries', (req, res) => {
  const { order_id, item_id } = req.query;
  if (item_id) return res.json(all('SELECT * FROM time_entries WHERE item_id=? ORDER BY date DESC, id DESC', [item_id]));
  if (!order_id) return res.status(400).json({ error: 'Auftrag oder Item fehlt' });
  res.json(all('SELECT * FROM time_entries WHERE order_id=? ORDER BY date DESC, id DESC', [order_id]));
});

// Von und Bis gelten nur zusammen und nur als HH:MM — sonst bleibt es bei der Dauer
function _timeRange({ start_time, end_time }) {
  const ok = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  return ok(start_time) && ok(end_time) ? [start_time, end_time] : [null, null];
}

app.post('/api/time-entries', (req, res) => {
  const { order_id, item_id, date, hours, description, billable } = req.body;
  if (!order_id && !item_id) return res.status(400).json({ error: 'Auftrag oder Item fehlt' });
  if (hours == null) return res.status(400).json({ error: 'Stunden fehlen' });
  const id = runGetId(
    'INSERT INTO time_entries (order_id,item_id,date,hours,description,billable,start_time,end_time) VALUES (?,?,?,?,?,?,?,?)',
    [order_id||null, item_id||null, date||new Date().toISOString().slice(0,10), parseFloat(hours), description||'', billable?1:0, ..._timeRange(req.body)]
  );
  res.json(get('SELECT * FROM time_entries WHERE id=?', [id]));
});

app.put('/api/time-entries/:id', (req, res) => {
  const { date, hours, description, billable } = req.body;
  run('UPDATE time_entries SET date=?,hours=?,description=?,billable=?,start_time=?,end_time=? WHERE id=?',
    [date, parseFloat(hours), description||'', billable?1:0, ..._timeRange(req.body), req.params.id]);
  res.json(get('SELECT * FROM time_entries WHERE id=?', [req.params.id]));
});

app.delete('/api/time-entries/:id', (req, res) => {
  run('DELETE FROM time_entries WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// CLONE ORDER
// ==============================================================
app.post('/api/orders/:id/clone', (req, res) => {
  const o = get('SELECT * FROM orders WHERE id=?', [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Nicht gefunden' });
  const number = nextOrderNumber();
  const newId = runGetId('INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,tax_rate,discount_pct,payment_terms,include_tax) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [number, o.customer_id||null, o.customer_name_free||null, o.title, o.notes||'',
     new Date().toISOString().slice(0,10), o.tax_rate??0, o.discount_pct||0, o.payment_terms||'', o.include_tax||0]);
  all('SELECT * FROM order_items WHERE order_id=?', [o.id]).forEach((oi, idx) => {
    run('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,position) VALUES (?,?,?,?,?,?,?,?,?)',
      [newId, oi.item_id||null, oi.description, oi.quantity, oi.unit||'Stk', oi.unit_price||0, oi.discount_pct||0, oi.notes||'', idx+1]);
  });
  saveDb();
  res.json(get('SELECT * FROM orders WHERE id=?', [newId]));
});

app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// -- START ------------------------------------------------------
// Erst den Port wählen, dann die Datenbank öffnen: Zwei Server auf derselben
// Datei überschreiben sich gegenseitig.
// - Läuft PLM mit denselben Daten schon (irgendwo im Portbereich), wird derselbe
//   Stand weiterbenutzt, ein älterer über „Beenden“ abgelöst.
// - Ein PLM mit anderen Daten oder ein fremdes Programm bleibt in Ruhe; PLM
//   nimmt den nächsten freien Port und merkt ihn sich in plm.config. Der
//   Browser speichert Ansichten pro Port — ein wechselnder Port verlöre sie.
// - PLM_PORT (Tests) heisst: genau dieser Port oder ein Fehler.
// Ausgaben ohne Umlaute — die Windows-Konsole zeigt sie nicht überall richtig.
const PORT_RANGE = 20;
const PORT_FIXED = parseInt(process.env.PLM_PORT, 10) || null;
const PREFERRED_PORT = PORT_FIXED || (parseInt(_config.port, 10) > 0 ? parseInt(_config.port, 10) : 3000);
let PORT = PREFERRED_PORT;

function portFree(port) {
  return new Promise(resolve => {
    const probe = require('net').createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
}

// Welches PLM antwortet auf dem Port? null = keines (anderes Programm)
async function runningPlm(port) {
  const ask = async p => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(1500) });
    return r.ok ? await r.json() : null;
  };
  try { const v = await ask('/api/version'); if (v?.version) return v; } catch {}
  // Ältere Stände kennen /api/version noch nicht, wohl aber /api/data-path
  try { const d = await ask('/api/data-path'); if (d?.data_dir) return { version: null, data_dir: d.data_dir }; } catch {}
  return null;
}

const _cmpVersion = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const _samePath = (a, b) => process.platform === 'win32'
  ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const _startFail = msg => { console.error('\n  FEHLER: ' + msg + '\n'); process.exit(1); };

// Die Startskripte setzen PLM_OPEN_BROWSER=1 — nur der Server weiss, welchen
// Port er bekommen hat.
function openBrowser(port) {
  if (process.env.PLM_OPEN_BROWSER !== '1') return Promise.resolve();
  const url = `http://localhost:${port}/launcher`;
  const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  return launchProgram({ cmd, args: [] }, url).catch(e => console.log(`  Browser bitte selbst oeffnen: ${url} (${e.message})`));
}

async function choosePort() {
  const range = PORT_FIXED ? [PORT_FIXED] : Array.from({ length: PORT_RANGE }, (_, i) => PREFERRED_PORT + i);
  const free = new Map();
  for (const p of range) free.set(p, await portFree(p));

  for (const p of range.filter(q => !free.get(q))) {
    const other = await runningPlm(p);
    if (!other?.data_dir || !_samePath(other.data_dir, DATA_DIR)) continue;
    const label = other.version ? 'Version ' + other.version : 'eine aeltere Version';
    const identical = other.version === APP_VERSION.version && other.commit === APP_VERSION.commit
      && !other.dirty && !APP_VERSION.dirty;
    const newer = other.version && _cmpVersion(other.version, APP_VERSION.version) > 0;
    // PLM_TAKEOVER: Neustart nach einem Update — der alte Prozess geht immer.
    // Eine ZIP-Kopie kennt ihre Nummer erst nach der Prüfung bei GitHub.
    if ((identical || newer) && process.env.PLM_TAKEOVER !== '1') {
      console.log(`\n  PLM laeuft bereits (${label}${newer ? ', neuer als dieser Start' : ''}) auf http://localhost:${p}\n`);
      await openBrowser(p);
      process.exit(0);
    }
    console.log(`\n  Auf Port ${p} laeuft noch PLM ${label} mit denselben Daten - wird beendet und abgeloest.`);
    try { await fetch(`http://127.0.0.1:${p}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(3000) }); } catch {}
    for (let i = 0; i < 40 && !(await portFree(p)); i++) await new Promise(r => setTimeout(r, 250));
    if (!(await portFree(p))) _startFail(`Das laufende PLM auf Port ${p} hat sich nicht beendet. Fenster schliessen oder STOP-PLM ausfuehren.`);
    free.set(p, true);
  }

  const port = range.find(p => free.get(p));
  if (!port) {
    _startFail(PORT_FIXED ? `Port ${PORT_FIXED} ist belegt.`
      : `Kein freier Port zwischen ${range[0]} und ${range[range.length - 1]}.`);
  }
  if (port !== PREFERRED_PORT) {
    saveConfig({ port });
    console.log(`\n  Port ${PREFERRED_PORT} ist belegt - PLM nutzt Port ${port} (in plm.config gespeichert).`);
  }
  return port;
}

choosePort().then(p => { PORT = p; }).then(initDb).then(() => {
  migrateCadPath();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  PLM & ERP ' + APP_VERSION.version + (APP_VERSION.commit ? ' (' + APP_VERSION.commit
      + (APP_VERSION.dirty ? ', nicht committete Aenderungen' : '')
      + (APP_VERSION.source === 'zip' ? ', ZIP-Download' : '') + ')' : ''));
    console.log('  laeuft auf http://localhost:' + PORT);
    console.log('  Datenpfad: ' + DATA_DIR);
    console.log('');
    openBrowser(PORT);
    // Vom Startskript gestartet: gleich prüfen, damit die Antwort schon da
    // ist, wenn der Browser fragt — sonst erst beim ersten Öffnen
    if (process.env.PLM_OPEN_BROWSER === '1') updateStatus().then(u => {
      if (u.available) console.log(`  Neue Version ${u.version} auf ${u.upstream} (${u.behind} Commit${u.behind === 1 ? '' : 's'})`
        + ' - installieren in PLM: Klick auf die Version unten in der Navigation\n');
    });
  });
  server.on('error', err => {
    console.error('\n  FEHLER: ' + (err.code === 'EADDRINUSE'
      ? `Port ${PORT} wurde gerade von einem anderen Programm belegt.` : err.message) + '\n');
    process.exit(1);
  });
}).catch(err => {
  console.error('Fehler beim Starten:', err);
  process.exit(1);
});
