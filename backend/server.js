const express  = require('express');
const AdmZip   = require('adm-zip');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const cors     = require('cors');
const crypto   = require('crypto');
const initSqlJs = require('sql.js');

const app  = express();
const PORT = process.env.PLM_PORT || 3000;

// plm.config liegt an der PLM-Wurzel (eine Ebene über backend/)
// Format: Schlüssel=Wert, Zeilen mit # werden ignoriert
const PLM_CONFIG_PATH = path.join(__dirname, '..', 'plm.config');

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
  for (const [key, value] of Object.entries(obj)) {
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
const DATA_DIR    = process.env.PLM_DATA_DIR
  ? path.resolve(process.env.PLM_DATA_DIR)
  : _config.data_dir
  ? path.resolve(_config.data_dir)
  : path.join(__dirname, 'data');
const DB_PATH     = path.join(DATA_DIR, 'plm.db');
const FILES_DIR   = path.join(DATA_DIR, 'files');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');

fs.mkdirSync(DATA_DIR,  { recursive: true });
fs.mkdirSync(FILES_DIR, { recursive: true });

// -- sql.js wrapper (synchronous-style API) ---------------------
let db;
let saveTimer;

function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  }, 500);
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
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

// -- INIT DB ----------------------------------------------------
async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

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
    receipt_show_notes: '1'
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
  try { db.run('ALTER TABLE items ADD COLUMN variant_group_id INTEGER DEFAULT NULL'); } catch {}
  try { db.run('ALTER TABLE purchase_order_items ADD COLUMN raw_material_id INTEGER REFERENCES raw_materials(id)'); } catch {}

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
// Recursively sum dev hours (time_entries) for an item and all its BOM children via CTE
function calcDevHours(itemId) {
  const row = get(`
    WITH RECURSIVE tree(item_id) AS (
      SELECT ?
      UNION ALL
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
  db.run('INSERT INTO changelog (entity_type,entity_id,action,details) VALUES (?,?,?,?)', [type, id, action, details || '']);
  saveDb();
}

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
const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(FRONTEND_DIR));

// ==============================================================
// PROJECTS
// ==============================================================
app.get('/api/projects', (req, res) => {
  const projects = all('SELECT * FROM projects ORDER BY pinned DESC, number DESC');
  projects.forEach(p => {
    p.item_count = count('SELECT COUNT(*) as c FROM items WHERE project_id=?', [p.id]);
    p.asm_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='asm'", [p.id]);
    p.prt_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='prt'", [p.id]);
    p.doc_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='doc'", [p.id]);
    p.file_count = count('SELECT COUNT(*) as c FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id WHERE i.project_id=?', [p.id]);
  });
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, description, customer } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const number = nextProjectNumber();
  const id = runGetId('INSERT INTO projects (number,name,description,customer) VALUES (?,?,?,?)', [number, name, description||'', customer||'']);
  log('project', id, 'Created', number + ' - ' + name);
  res.json(get('SELECT * FROM projects WHERE id=?', [id]));
});

app.get('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
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
  const { name, description, customer } = req.body;
  run("UPDATE projects SET name=?,description=?,customer=?,updated_at=datetime('now') WHERE id=?", [name, description, customer, req.params.id]);
  log('project', req.params.id, 'Updated', name);
  res.json(get('SELECT * FROM projects WHERE id=?', [req.params.id]));
});

app.post('/api/projects/:id/pin', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const pinned = p.pinned ? 0 : 1;
  run('UPDATE projects SET pinned=? WHERE id=?', [pinned, req.params.id]);
  res.json({ pinned });
});

app.delete('/api/projects/:id', (req, res) => {
  const p = get('SELECT * FROM projects WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const revIds = all('SELECT r.id FROM revisions r JOIN items i ON r.item_id=i.id WHERE i.project_id=?', [p.id]);
  revIds.forEach(r => {
    all('SELECT filename FROM datasets WHERE revision_id=?', [r.id]).forEach(f => {
      try { fs.unlinkSync(path.join(FILES_DIR, f.filename)); } catch {}
    });
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
  res.json({ success: true });
});

// ==============================================================
// ITEMS
// ==============================================================
app.get('/api/items/:id', (req, res) => {
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  item.project = get('SELECT * FROM projects WHERE id=?', [item.project_id]);
  item.revisions = all('SELECT * FROM revisions WHERE item_id=? ORDER BY rowid DESC', [item.id]);
  item.revisions.forEach(rev => {
    rev.datasets = all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, uploaded_at', [rev.id]);
    rev.print_settings = get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]) || null;
    if (item.item_type === 'asm') {
      rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type, i.default_price FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
      rev.bom.forEach(b => { b.child_active_rev = getActiveRevision(b.child_item_id); b.dev_hours = calcDevHours(b.child_item_id); });
      rev.bom_std = all('SELECT bs.*, sp.designation, sp.name as sp_name, sp.material, sp.size, sp.unit_price, sp.standard, sp.std_number FROM bom_std_parts bs JOIN standard_parts sp ON bs.std_part_id=sp.id WHERE bs.parent_rev_id=? ORDER BY bs.position', [rev.id]);
    }
  });
  item.changelog = all("SELECT * FROM changelog WHERE entity_type='item' AND entity_id=? ORDER BY created_at DESC", [item.id]);
  item.children = all('SELECT * FROM items WHERE parent_id=?', [item.id]);
  item.effective_weight_g = getEffectiveWeight(item.id);
  item.variants = item.variant_group_id
    ? all('SELECT id,item_number,name,item_type FROM items WHERE variant_group_id=? AND id!=? ORDER BY item_number', [item.variant_group_id, item.id])
    : [];
  res.json(item);
});

app.post('/api/projects/:projectId/items', (req, res) => {
  const { name, description, item_type, parent_id, source_url, default_price } = req.body;
  if (!name || !item_type) return res.status(400).json({ error: 'name and item_type required' });
  const project = get('SELECT * FROM projects WHERE id=?', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'Project not found' });

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

  const itemId = runGetId('INSERT INTO items (project_id,parent_id,item_type,item_number,name,description,source_url,default_price) VALUES (?,?,?,?,?,?,?,?)',
    [project.id, parent_id || null, item_type, item_number, name, description || '', source_url || null, default_price != null ? parseFloat(default_price) : null]);
  run('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, firstRevLabel(), 'DFT', 'Initial revision']);
  log('item', itemId, 'Created', item_type + ' ' + item_number + ' rev1');
  res.json(get('SELECT * FROM items WHERE id=?', [itemId]));
});

app.put('/api/items/:id', (req, res) => {
  const { name, description, source_url, default_price, classification, weight_g } = req.body;
  run('UPDATE items SET name=?,description=?,source_url=?,default_price=?,classification=?,weight_g=? WHERE id=?',
    [name, description, source_url||null, default_price != null ? parseFloat(default_price) : null, classification||null, weight_g != null ? parseFloat(weight_g) : null, req.params.id]);
  log('item', req.params.id, 'Updated', name);
  res.json(get('SELECT * FROM items WHERE id=?', [req.params.id]));
});

app.post('/api/items/:id/link-variant', (req, res) => {
  const { other_item_id } = req.body;
  const a = get('SELECT id,variant_group_id FROM items WHERE id=?', [req.params.id]);
  const b = get('SELECT id,variant_group_id FROM items WHERE id=?', [other_item_id]);
  if (!a || !b || a.id === b.id) return res.status(400).json({ error: 'Invalid items' });

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
  if (!item || !item.variant_group_id) return res.status(400).json({ error: 'Not in a group' });
  run('UPDATE items SET variant_group_id=NULL WHERE id=?', [item.id]);
  log('item', item.id, 'Variante entfernt', 'aus Gruppe ' + item.variant_group_id);
  res.json({ ok: true });
});

app.get('/api/items/:id/where-used', (req, res) => {
  const rows = all(`
    SELECT i.id, i.item_number, i.name, i.item_type, i.classification,
      r.id as rev_id, r.rev, r.status,
      p.id as project_id, p.number as project_number, p.name as project_name,
      b.quantity, b.unit
    FROM bom b
    JOIN revisions r ON b.parent_rev_id = r.id
    JOIN items i ON r.item_id = i.id
    JOIN projects p ON i.project_id = p.id
    WHERE b.child_item_id = ?
    ORDER BY p.number, i.item_number, CAST(r.rev AS INTEGER)`, [req.params.id]);
  res.json(rows);
});

app.get('/api/items/:id/erp-usage', (req, res) => {
  const id = req.params.id;
  const orders = all(`
    SELECT o.id, o.number, o.title, o.status, o.order_date,
      oi.quantity, oi.unit, oi.unit_price
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE oi.item_id = ? ORDER BY o.order_date DESC, o.id DESC`, [id]);
  const quotes = all(`
    SELECT q.id, q.number, q.title, q.status, q.quote_date,
      qi.quantity, qi.unit, qi.unit_price
    FROM quote_items qi JOIN quotes q ON qi.quote_id = q.id
    WHERE qi.item_id = ? ORDER BY q.quote_date DESC, q.id DESC`, [id]);
  const deliveries = all(`
    SELECT d.id, d.number, d.title, d.status, d.delivery_date,
      di.quantity, di.unit
    FROM delivery_items di JOIN deliveries d ON di.delivery_id = d.id
    WHERE di.item_id = ? ORDER BY d.delivery_date DESC, d.id DESC`, [id]);
  res.json({ orders, quotes, deliveries });
});

app.put('/api/items/:id/move', (req, res) => {
  const { target_project_id } = req.body;
  const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
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
  if (!item) return res.status(404).json({ error: 'Not found' });
  log('project', item.project_id, 'Item gelöscht', item.item_type + ' ' + item.item_number + ' – ' + item.name);
  const revs = all('SELECT id FROM revisions WHERE item_id=?', [item.id]);
  revs.forEach(rev => {
    all('SELECT filename FROM datasets WHERE revision_id=?', [rev.id]).forEach(f => {
      try { fs.unlinkSync(path.join(FILES_DIR, f.filename)); } catch {}
    });
    run('DELETE FROM datasets WHERE revision_id=?', [rev.id]);
    run('DELETE FROM bom WHERE parent_rev_id=?', [rev.id]);
    run('DELETE FROM print_settings WHERE revision_id=?', [rev.id]);
  });
  run('DELETE FROM revisions WHERE item_id=?', [item.id]);
  run('DELETE FROM bom WHERE child_item_id=?', [item.id]);
  run('DELETE FROM changelog WHERE entity_type=? AND entity_id=?', ['item', item.id]);
  run('DELETE FROM items WHERE id=?', [item.id]);
  res.json({ success: true });
});

// ==============================================================
// REVISIONS
// ==============================================================
app.get('/api/revisions/:id', (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });
  rev.datasets = all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, uploaded_at', [rev.id]);
  rev.print_settings = get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]) || null;
  rev.item = get('SELECT * FROM items WHERE id=?', [rev.item_id]);
  if (rev.item && rev.item.item_type === 'asm') {
    rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type, i.default_price FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
    rev.bom.forEach(b => { b.dev_hours = calcDevHours(b.child_item_id); });
  }
  res.json(rev);
});

app.put('/api/revisions/:id/status', (req, res) => {
  const { status, description, eco_reason, released_by } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });

  const validTransitions = { DFT:['REV'], REV:['DFT','REL'], REL:['ECO','OBS'], ECO:['OBS'], OBS:[] };
  if (!validTransitions[rev.status]?.includes(status))
    return res.status(400).json({ error: 'Cannot transition from ' + rev.status + ' to ' + status });

  if (status === 'REL') {
    // For assemblies: all BOM children must have at least one REL revision
    const item = get('SELECT * FROM items WHERE id=?', [rev.item_id]);
    if (item && item.item_type === 'asm') {
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
      [status, released_by || 'User', description || null, rev.id]);
    run("UPDATE revisions SET status='OBS',updated_at=datetime('now') WHERE item_id=? AND status='REL' AND id!=?",
      [rev.item_id, rev.id]);
  } else if (status === 'ECO') {
    run("UPDATE revisions SET status=?,eco_reason=?,updated_at=datetime('now') WHERE id=?", [status, eco_reason || '', rev.id]);
    const lastRev = get('SELECT rev FROM revisions WHERE item_id=? ORDER BY rowid DESC LIMIT 1', [rev.item_id]);
    const newRev = nextRev(lastRev ? lastRev.rev : '0');
    const newRevId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
      [rev.item_id, newRev, 'DFT', 'ECO: ' + (eco_reason || '')]);
    const datasets = all('SELECT * FROM datasets WHERE revision_id=?', [rev.id]);
    for (const ds of datasets) {
      try {
        const ext = path.extname(ds.filename);
        const newFile = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
        fs.copyFileSync(path.join(FILES_DIR, ds.filename), path.join(FILES_DIR, newFile));
        runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
          [newRevId, ds.ds_type, newFile, ds.original_name, ds.file_size, ds.version, 'Kopiert von ' + rev.rev]);
      } catch {}
    }
    log('revision', rev.id, 'ECO', `Neue Revision ${newRev} erstellt, ${datasets.length} Datei(en) kopiert`);
  } else {
    run("UPDATE revisions SET status=?,updated_at=datetime('now') WHERE id=?", [status, rev.id]);
  }

  log('revision', rev.id, 'Status -> ' + status, description || eco_reason || '');
  res.json(get('SELECT * FROM revisions WHERE id=?', [rev.id]));
});

app.delete('/api/revisions/:id', (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });
  if (rev.status !== 'DFT')
    return res.status(400).json({ error: 'Nur DFT-Revisionen können gelöscht werden.' });
  const others = all('SELECT id FROM revisions WHERE item_id=? AND id!=?', [rev.item_id, rev.id]);
  if (!others.length)
    return res.status(400).json({ error: 'Letzte Revision kann nicht gelöscht werden — lösche das Item.' });
  const datasets = all('SELECT filename FROM datasets WHERE revision_id=?', [rev.id]);
  for (const ds of datasets) {
    try { fs.unlinkSync(path.join(FILES_DIR, ds.filename)); } catch {}
  }
  run('DELETE FROM datasets WHERE revision_id=?', [rev.id]);
  run('DELETE FROM print_settings WHERE revision_id=?', [rev.id]);
  run('DELETE FROM bom WHERE parent_rev_id=?', [rev.id]);
  run('DELETE FROM revisions WHERE id=?', [rev.id]);
  log('revision', rev.id, 'Gelöscht', `DFT Rev ${rev.rev} von Item ${rev.item_id}`);
  // If the previous revision is ECO, revert it back to REL
  const ecoRev = get("SELECT id FROM revisions WHERE item_id=? AND status='ECO' ORDER BY CAST(rev AS INTEGER) DESC LIMIT 1", [rev.item_id]);
  if (ecoRev) {
    run("UPDATE revisions SET status='REL', updated_at=datetime('now') WHERE id=?", [ecoRev.id]);
    log('revision', ecoRev.id, 'REL', 'ECO zurückgesetzt nach Löschen der DFT-Revision');
  }
  res.json({ ok: true });
});

app.put('/api/revisions/:id/print-settings', (req, res) => {
  const { material, color, layer_height, infill, supports, nozzle, print_temp, bed_temp, printer, notes,
    printer_cost_hr, filament_price_kg, filament_weight_total, part_weight, print_duration, raw_material_id } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });
  run(`INSERT INTO print_settings (revision_id,material,color,layer_height,infill,supports,nozzle,print_temp,bed_temp,printer,notes,printer_cost_hr,filament_price_kg,filament_weight_total,part_weight,print_duration,raw_material_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(revision_id) DO UPDATE SET
    material=excluded.material, color=excluded.color, layer_height=excluded.layer_height,
    infill=excluded.infill, supports=excluded.supports, nozzle=excluded.nozzle,
    print_temp=excluded.print_temp, bed_temp=excluded.bed_temp, printer=excluded.printer, notes=excluded.notes,
    printer_cost_hr=excluded.printer_cost_hr, filament_price_kg=excluded.filament_price_kg,
    filament_weight_total=excluded.filament_weight_total, part_weight=excluded.part_weight,
    print_duration=excluded.print_duration, raw_material_id=excluded.raw_material_id`,
    [rev.id, material, color, layer_height, infill, supports, nozzle, print_temp, bed_temp, printer, notes,
     printer_cost_hr||null, filament_price_kg||null, filament_weight_total||null, part_weight||null, print_duration||null,
     raw_material_id||null]);
  log('revision', rev.id, 'Druckparameter gespeichert', [material, printer].filter(Boolean).join(', '));
  res.json(get('SELECT * FROM print_settings WHERE revision_id=?', [rev.id]));
});

// ==============================================================
// BOM
// ==============================================================
app.post('/api/revisions/:revId/bom', (req, res) => {
  const { child_item_id, quantity, unit, position, notes } = req.body;
  try {
    run('INSERT INTO bom (parent_rev_id,child_item_id,quantity,unit,position,notes) VALUES (?,?,?,?,?,?)',
      [req.params.revId, child_item_id, quantity || 1, unit || 'pcs', position || 999, notes || '']);
    log('revision', req.params.revId, 'BOM Add', 'Item ' + child_item_id + ' x' + (quantity || 1));
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: 'Already in BOM or invalid' }); }
});

app.put('/api/bom/:id/quantity', (req, res) => {
  const { quantity, unit } = req.body;
  run('UPDATE bom SET quantity=?, unit=? WHERE id=?', [Math.max(1, Math.round(parseFloat(quantity)||1)), unit||'Stk', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.put('/api/revisions/:revId/bom-reorder', (req, res) => {
  const { order } = req.body; // array of bom ids in new order
  order.forEach((id, idx) => run('UPDATE bom SET position=? WHERE id=? AND parent_rev_id=?', [idx+1, id, req.params.revId]));
  saveDb();
  res.json({ success: true });
});

app.delete('/api/bom/:id', (req, res) => {
  const bom = get('SELECT b.*, i.item_number FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.id=?', [req.params.id]);
  if (bom) log('revision', bom.parent_rev_id, 'BOM Entfernt', bom.item_number + ' x' + bom.quantity);
  run('DELETE FROM bom WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// DATASETS
// ==============================================================
app.post('/api/revisions/:revId/datasets', upload.single('file'), (req, res) => {
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.revId]);
  if (!rev) return res.status(404).json({ error: 'Revision not found' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
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
  const id = runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
    [rev.id, dsType, req.file.filename, displayName, req.file.size, version || '1', notes || '']);
  log('revision', rev.id, 'Dataset Added', displayName + ' (' + dsType + ')');
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

app.post('/api/items/:id/checkout', (req, res) => {
  try {
    const { types, mode } = req.body;
    const item = get('SELECT * FROM items WHERE id=?', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });

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
      copied.push({ name, ds_type: ds.ds_type, item_number: ds.item_number, item_name: ds.item_name, readonly: ds.rev_status === 'REL' });
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

    // Root-level files (not directories, not hidden)
    for (const e of entries) {
      const p = path.join(checkoutDir, e);
      if (!e.startsWith('.') && fs.statSync(p).isFile()) {
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
    const { mode, item_id, folder, files, new_item } = req.body;

    if (mode === 'item') {
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
      for (const f of files) {
        const src = path.join(folder, f.name);
        if (!fs.existsSync(src)) continue;
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
      log('item', item_id, 'Importiert', `${imported.length} Dateien aus Checkout → Rev ${rev.rev}`);
      res.json({ success: true, count: imported.length, rev: rev.rev });

    } else if (mode === 'new') {
      // Create new item in given project
      const { project_id, item_type, name, file_path: filePath, file_name, ds_type } = new_item;
      const project = get('SELECT * FROM projects WHERE id=?', [project_id]);
      if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden' });

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
      const revId = runGetId('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, firstRevLabel(), 'DFT', 'Erstellt durch Checkout-Import']);

      if (filePath && fs.existsSync(filePath)) {
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

app.post('/api/checkout/checkin', (req, res) => {
  try {
    const { folder } = req.body;
    if (!folder) return res.status(400).json({ error: 'Kein Ordner angegeben' });
    if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Ordner nicht gefunden: ' + folder });

    // Read metadata
    let meta = null;
    try {
      const metaPath = path.join(folder, '.checkout.json');
      if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}

    const uploaded = [];
    const wasRel = meta?.rev_status === 'REL' || meta?.rev_status === 'OBS';

    if (meta?.item_id && !wasRel) {
      // Find or create active revision
      let rev = get("SELECT * FROM revisions WHERE item_id=? AND status NOT IN ('REL','OBS') ORDER BY id DESC LIMIT 1", [meta.item_id]);
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
        const ext  = path.extname(fname).toLowerCase();
        const stored = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
        fs.copyFileSync(src, path.join(FILES_DIR, stored));
        const stat = fs.statSync(src);
        const dsType = guessType(fname);
        const base = item ? `${item.item_number}_rev${rev.rev}` : path.basename(fname, ext);
        const displayName = base + ext;

        // Replace existing dataset with same name if present
        const existingDs = get('SELECT * FROM datasets WHERE revision_id=? AND original_name=?', [rev.id, displayName]);
        if (existingDs) {
          try { fs.unlinkSync(path.join(FILES_DIR, existingDs.filename)); } catch {}
          run('DELETE FROM datasets WHERE id=?', [existingDs.id]);
        }
        runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
          [rev.id, dsType, stored, displayName, stat.size, '1', 'Check-in']);
        uploaded.push(displayName);
      }
    }

    // Delete folder
    deleteFolderRecursive(folder);
    if (meta) log('item', meta.item_id, 'Eingecheckt', `${uploaded.length} Datei(en) hochgeladen, Ordner gelöscht`);
    res.json({ success: true, uploaded });
  } catch (err) {
    res.status(500).json({ error: 'Einchecken fehlgeschlagen: ' + err.message });
  }
});

app.post('/api/checkout/open', (req, res) => {
  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'Kein Ordner angegeben' });
  if (!fs.existsSync(folder)) return res.status(404).json({ error: 'Ordner nicht gefunden: ' + folder });
  const { exec } = require('child_process');
  // Pass DISPLAY so xdg-open can reach the desktop session
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
  const cmd = process.platform === 'win32' ? `explorer "${folder}"`
    : process.platform === 'darwin' ? `open "${folder}"`
    : `xdg-open "${folder}"`;
  exec(cmd, { env }, (err) => {
    if (err) console.error('xdg-open error:', err.message);
  });
  res.json({ success: true });
});

app.get('/api/datasets/:id/download', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(FILES_DIR, ds.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.download(fp, ds.original_name);
});

app.get('/api/datasets/:id/view', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(FILES_DIR, ds.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', mimeType(ds.original_name));
  res.setHeader('Content-Disposition', 'inline; filename="' + ds.original_name.replace(/"/g, '') + '"');
  res.sendFile(fp);
});

app.put('/api/datasets/:id', (req, res) => {
  const { notes, original_name } = req.body;
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  run('UPDATE datasets SET notes=?,original_name=? WHERE id=?', [notes||'', original_name||ds.original_name, req.params.id]);
  res.json(get('SELECT * FROM datasets WHERE id=?', [req.params.id]));
});

app.delete('/api/datasets/:id', (req, res) => {
  const ds = get('SELECT * FROM datasets WHERE id=?', [req.params.id]);
  if (!ds) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(FILES_DIR, ds.filename)); } catch {}
  run('DELETE FROM datasets WHERE id=?', [ds.id]);
  log('revision', ds.revision_id, 'Dataset Deleted', ds.original_name);
  res.json({ success: true });
});

// ==============================================================
// CUSTOMERS
// ==============================================================
app.get('/api/customers', (req, res) => {
  const customers = all(`
    SELECT c.*, COUNT(o.id) as order_count
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.number DESC`);
  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const { name, email, phone, street, postal_code, city, country, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const number = nextCustomerNumber();
  const id = runGetId('INSERT INTO customers (number,name,email,phone,street,postal_code,city,country,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [number, name, email||'', phone||'', street||'', postal_code||'', city||'', country||'Deutschland', notes||'']);
  res.json(get('SELECT * FROM customers WHERE id=?', [id]));
});

app.get('/api/customers/:id', (req, res) => {
  const c = get('SELECT * FROM customers WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Not found' });

  c.orders = all(`
    SELECT o.*, SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)) as total,
      COUNT(oi.id) as item_count
    FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.customer_id=? GROUP BY o.id ORDER BY o.id DESC`, [c.id]);

  c.quotes = all(`
    SELECT q.*, SUM(qi.quantity * qi.unit_price * (1 - COALESCE(qi.discount_pct,0)/100.0)) as total,
      COUNT(qi.id) as item_count
    FROM quotes q LEFT JOIN quote_items qi ON qi.quote_id = q.id
    WHERE q.customer_id=? GROUP BY q.id ORDER BY q.id DESC`, [c.id]);

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
  run('DELETE FROM customers WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// ORDERS
// ==============================================================
app.get('/api/orders', (req, res) => {
  const orders = all('SELECT o.*,COALESCE(c.name,o.customer_name_free) as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.number DESC');
  orders.forEach(o => {
    o.items = all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
    const sub = o.items.reduce((s,i) => s + i.quantity*i.unit_price*(1-(i.discount_pct||0)/100), 0);
    const disc = sub * (o.discount_pct||0) / 100;
    const net = sub - disc;
    o.computed_total = net + (o.include_tax ? net*(o.tax_rate||0)/100 : 0);
  });
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer_id, customer_name_free, title, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextOrderNumber();
  const id = runGetId('INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,delivery_date,tax_rate,discount_pct,payment_terms,include_tax,estimated_hours,include_hours,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, customer_name_free||null, title, notes||'', order_date||null, delivery_date||null, tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, status||'DRAFT']);
  res.json(get('SELECT * FROM orders WHERE id=?', [id]));
});

app.get('/api/orders/:id', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  o.items = all('SELECT oi.*,i.item_number,i.item_type,i.default_price,i.weight_g FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=? ORDER BY COALESCE(oi.position,oi.id),oi.id', [o.id]);
  o.items.forEach(li => { li.manufacturing_cost = calcLineItemCost(li) || null; });
  res.json(o);
});

app.put('/api/orders/:id', (req, res) => {
  const { customer_id, customer_name_free, title, status, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours } = req.body;
  run(`UPDATE orders SET customer_id=?,customer_name_free=?,title=?,status=?,notes=?,order_date=?,delivery_date=?,
    tax_rate=?,discount_pct=?,payment_terms=?,include_tax=?,estimated_hours=?,include_hours=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id||null, customer_name_free||null, title, status, notes, order_date, delivery_date,
     tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, parseFloat(estimated_hours)||0, include_hours?1:0, req.params.id]);
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
  run('DELETE FROM order_items WHERE order_id=?', [req.params.id]);
  run('DELETE FROM orders WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/orders/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  const id = runGetId('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null]);
  res.json(get('SELECT * FROM order_items WHERE id=?', [id]));
});

app.put('/api/order-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  run('UPDATE order_items SET description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=?,raw_material_id=?,estimated_hours=?,printer_name=?,estimated_print_hours=? WHERE id=?',
    [description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null, req.params.id]);
  res.json(get('SELECT * FROM order_items WHERE id=?', [req.params.id]));
});

app.delete('/api/order-items/:id', (req, res) => {
  run('DELETE FROM order_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.put('/api/order-items/:id/move', (req, res) => {
  const { direction } = req.body;
  const item = get('SELECT * FROM order_items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
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
  if (!item) return res.status(404).json({ error: 'Not found' });
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
  quotes.forEach(q => { q.items = all('SELECT * FROM quote_items WHERE quote_id=?', [q.id]); });
  res.json(quotes);
});

app.post('/api/quotes', (req, res) => {
  const { customer_id, customer_name_free, title, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms, include_tax, estimated_hours, include_hours, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
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
  if (!q) return res.status(404).json({ error: 'Not found' });
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
  run('DELETE FROM quote_items WHERE quote_id=?', [req.params.id]);
  run('DELETE FROM quotes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/quotes/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  const id = runGetId('INSERT INTO quote_items (quote_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null]);
  res.json(get('SELECT * FROM quote_items WHERE id=?', [id]));
});

app.put('/api/quote-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, discount_pct, notes, raw_material_id, estimated_hours, printer_name, estimated_print_hours } = req.body;
  run('UPDATE quote_items SET description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=?,raw_material_id=?,estimated_hours=?,printer_name=?,estimated_print_hours=? WHERE id=?',
    [description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', raw_material_id||null, estimated_hours||null, printer_name||'', estimated_print_hours||null, req.params.id]);
  res.json(get('SELECT * FROM quote_items WHERE id=?', [req.params.id]));
});

app.delete('/api/quote-items/:id', (req, res) => {
  run('DELETE FROM quote_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/quotes/:id/convert', (req, res) => {
  const q = get('SELECT * FROM quotes WHERE id=?', [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Not found' });
  const number = nextOrderNumber();
  const orderId = runGetId(`INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,tax_rate,discount_pct,payment_terms,include_tax)
    VALUES (?,?,?,?,?,date('now'),?,?,?,?)`,
    [number, q.customer_id, q.customer_name_free||null, q.title, q.notes||'', q.tax_rate, q.discount_pct, q.payment_terms||'', q.include_tax||0]);
  const qItems = all('SELECT * FROM quote_items WHERE quote_id=?', [q.id]);
  qItems.forEach(qi => {
    run('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes,raw_material_id,estimated_hours,printer_name,estimated_print_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [orderId, qi.item_id, qi.description, qi.quantity, qi.unit, qi.unit_price, qi.discount_pct, qi.notes||'', qi.raw_material_id||null, qi.estimated_hours||null, qi.printer_name||'', qi.estimated_print_hours||null]);
  });
  run("UPDATE quotes SET status='ACCEPTED',updated_at=datetime('now') WHERE id=?", [q.id]);
  res.json(get('SELECT * FROM orders WHERE id=?', [orderId]));
});

// ==============================================================
// DASHBOARD
// ==============================================================
app.get('/api/dashboard', (req, res) => {
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Open orders (DRAFT + CONFIRMED)
  const openOrders = all(`
    SELECT o.*, COALESCE(c.name, o.customer_name_free) as customer_name,
      COUNT(oi.id) as item_count,
      SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)) as total
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('DRAFT','CONFIRMED')
    GROUP BY o.id ORDER BY o.id DESC`);

  // Open quotes (DRAFT + SENT)
  const openQuotes = all(`
    SELECT q.*, COALESCE(c.name, q.customer_name_free) as customer_name,
      COUNT(qi.id) as item_count,
      SUM(qi.quantity * qi.unit_price * (1 - COALESCE(qi.discount_pct,0)/100.0)) as total
    FROM quotes q
    LEFT JOIN customers c ON q.customer_id = c.id
    LEFT JOIN quote_items qi ON qi.quote_id = q.id
    WHERE q.status IN ('DRAFT','SENT')
    GROUP BY q.id ORDER BY q.id DESC`);

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

  // Recent deliveries with order + customer link
  const recentDeliveries = all(`
    SELECT d.*, COALESCE(c.name, d.customer_name_free) as customer_name,
      o.number as order_number, o.title as order_title,
      COUNT(di.id) as item_count,
      SUM(di.quantity * COALESCE(di.unit_price,0)) as total
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN orders o ON d.order_id = o.id
    LEFT JOIN delivery_items di ON di.delivery_id = d.id
    GROUP BY d.id ORDER BY d.id DESC LIMIT 8`);

  // Revenue this month (CONFIRMED + INVOICED + DELIVERED orders)
  const revMonth = get(`
    SELECT COALESCE(SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)), 0) as total
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED','INVOICED','DELIVERED')
    AND o.created_at LIKE ?`, [thisMonth + '%']);

  // Revenue total (all confirmed+)
  const revTotal = get(`
    SELECT COALESCE(SUM(oi.quantity * oi.unit_price * (1 - COALESCE(oi.discount_pct,0)/100.0)), 0) as total
    FROM order_items oi JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED','INVOICED','DELIVERED')`);

  // Active production: delivery_items linked to PLM items, delivery not yet DELIVERED
  const inProduction = all(`
    SELECT di.id, di.description, di.quantity, di.unit, di.unit_price,
      d.id as delivery_id, d.number as delivery_number, d.status as delivery_status,
      COALESCE(c.name, d.customer_name_free) as customer_name,
      i.item_number, i.name as item_name, i.item_type, i.project_id,
      p.number as project_number
    FROM delivery_items di
    JOIN deliveries d ON di.delivery_id = d.id
    LEFT JOIN customers c ON d.customer_id = c.id
    LEFT JOIN items i ON di.item_id = i.id
    LEFT JOIN projects p ON i.project_id = p.id
    WHERE d.status != 'DELIVERED' AND di.item_id IS NOT NULL
    ORDER BY d.id DESC LIMIT 20`);

  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14*86400000).toISOString().slice(0, 10);

  // Deliveries due within 14 days (not yet delivered)
  const dueSoon = all(`
    SELECT d.id, d.number, d.title, d.status, d.delivery_date,
      COALESCE(c.name, d.customer_name_free) as customer_name,
      COUNT(di.id) as item_count
    FROM deliveries d
    LEFT JOIN customers c ON d.customer_id=c.id
    LEFT JOIN delivery_items di ON di.delivery_id=d.id
    WHERE d.status != 'DELIVERED' AND d.delivery_date IS NOT NULL
      AND d.delivery_date <= ? AND d.delivery_date >= date(?,'-3 days')
    GROUP BY d.id ORDER BY d.delivery_date ASC`, [in14, today]);

  // Quotes expiring within 14 days
  const quotesExpiring = all(`
    SELECT q.id, q.number, q.title, q.status, q.valid_until,
      COALESCE(c.name, q.customer_name_free) as customer_name,
      SUM(qi.quantity * qi.unit_price * (1 - COALESCE(qi.discount_pct,0)/100.0)) as total
    FROM quotes q
    LEFT JOIN customers c ON q.customer_id=c.id
    LEFT JOIN quote_items qi ON qi.quote_id=q.id
    WHERE q.status IN ('DRAFT','SENT') AND q.valid_until IS NOT NULL AND q.valid_until <= ?
    GROUP BY q.id ORDER BY q.valid_until ASC`, [in14]);

  // Raw material stats
  const rawMats = all('SELECT * FROM raw_materials');
  const rawMatCount = rawMats.length;
  const rawMatActive = rawMats.filter(m => m.stock_qty > 0).length;
  // Total purchase value: for each material, sum (latest price per lot × remaining qty) for active lots
  let rawMatValue = 0;
  for (const m of rawMats) {
    const lots = all(`SELECT lot_number,
      SUM(CASE WHEN type='in' THEN qty ELSE -qty END) as remaining_qty,
      MAX(CASE WHEN type='in' THEN unit_price ELSE NULL END) as unit_price
      FROM raw_material_movements WHERE raw_material_id=? AND lot_number IS NOT NULL AND lot_number!=''
      GROUP BY lot_number`, [m.id]);
    for (const l of lots) {
      const rem = Math.max(0, l.remaining_qty || 0);
      if (rem > 0 && l.unit_price) rawMatValue += rem * l.unit_price;
    }
  }

  res.json({ openOrders, openQuotes, inReview, recentDeliveries, inProduction,
    revenueMonth: revMonth?.total || 0, revenueTotal: revTotal?.total || 0,
    dueSoon, quotesExpiring,
    rawMatCount, rawMatActive, rawMatValue });
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
    by_status:     all(`SELECT r.status, COUNT(*) as count FROM revisions r JOIN items i ON r.item_id=i.id WHERE r.id=(SELECT MAX(r2.id) FROM revisions r2 WHERE r2.item_id=r.item_id) GROUP BY r.status ORDER BY r.status`),
    recent_items:  recentItems,
    recent_projects: all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 5'),
  });
});

app.get('/api/search', (req, res) => {
  const q = '%' + (req.query.q || '') + '%';

  const items = all('SELECT i.*,p.name as project_name,p.number as project_number FROM items i JOIN projects p ON i.project_id=p.id WHERE i.item_number LIKE ? OR i.name LIKE ? OR i.description LIKE ? OR i.classification LIKE ? ORDER BY i.id DESC LIMIT 30', [q,q,q,q]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });

  const projects = all('SELECT * FROM projects WHERE number LIKE ? OR name LIKE ? OR description LIKE ? OR customer LIKE ? LIMIT 10', [q,q,q,q]);

  const datasets = all(`SELECT d.id, d.original_name, d.ds_type, d.file_size,
    r.rev, i.item_number, i.id as item_id, i.project_id,
    p.number as project_number, p.name as project_name
    FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id JOIN projects p ON i.project_id=p.id
    WHERE d.original_name LIKE ? OR d.notes LIKE ? ORDER BY d.id DESC LIMIT 20`, [q, q]);

  const orders = all(`SELECT o.id, o.number, o.title, o.status, o.order_date, o.delivery_date,
    COALESCE(c.name, o.customer_name_free) as customer_name
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id
    WHERE o.number LIKE ? OR o.title LIKE ? OR COALESCE(c.name,o.customer_name_free,'') LIKE ?
    ORDER BY o.id DESC LIMIT 15`, [q,q,q]);

  const quotes = all(`SELECT q.id, q.number, q.title, q.status, q.quote_date, q.valid_until,
    COALESCE(c.name, q.customer_name_free) as customer_name
    FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id
    WHERE q.number LIKE ? OR q.title LIKE ? OR COALESCE(c.name,q.customer_name_free,'') LIKE ?
    ORDER BY q.id DESC LIMIT 15`, [q,q,q]);

  const customers = all(`SELECT id, number, name, email, city, phone FROM customers
    WHERE number LIKE ? OR name LIKE ? OR email LIKE ? OR city LIKE ?
    ORDER BY id DESC LIMIT 10`, [q,q,q,q]);

  const deliveries = all(`SELECT d.id, d.number, d.title, d.status, d.delivery_date,
    COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d LEFT JOIN customers c ON d.customer_id=c.id
    WHERE d.number LIKE ? OR d.title LIKE ? OR COALESCE(c.name,d.customer_name_free,'') LIKE ?
    ORDER BY d.id DESC LIMIT 10`, [q,q,q]);

  res.json({ items, projects, datasets, orders, quotes, customers, deliveries });
});

app.get('/api/changelog', (req, res) => {
  const limit = parseInt(req.query.limit) || 150;
  const rows = all('SELECT * FROM changelog ORDER BY created_at DESC LIMIT ?', [limit]);
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
    }
  });
  res.json(rows);
});

app.get('/api/items-released', (req, res) => {
  try {
    const items = all(`
      SELECT DISTINCT i.id, i.item_number, i.name, i.item_type, p.number as project_number
      FROM items i
      JOIN projects p ON i.project_id = p.id
      JOIN revisions r ON r.item_id = i.id
      WHERE r.status IN ('REL','OBS')
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
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { name, notes } = req.body;
  const docType = guessType(req.file.originalname);
  const displayName = name || req.file.originalname;
  const id = runGetId('INSERT INTO documents (project_id,name,filename,original_name,file_size,doc_type,notes) VALUES (?,?,?,?,?,?,?)',
    [p.id, displayName, req.file.filename, req.file.originalname, req.file.size, docType, notes||'']);
  log('project', p.id, 'Dokument hochgeladen', displayName + ' (' + docType + ')');
  res.json(get('SELECT * FROM documents WHERE id=?', [id]));
});

app.get('/api/documents/:id/download', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(FILES_DIR, doc.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.download(fp, doc.original_name);
});

app.get('/api/documents/:id/view', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(FILES_DIR, doc.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.setHeader('Content-Type', mimeType(doc.original_name));
  res.setHeader('Content-Disposition', 'inline; filename="' + doc.original_name.replace(/"/g, '') + '"');
  res.sendFile(fp);
});

app.put('/api/documents/:id', (req, res) => {
  const { name, notes } = req.body;
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  run('UPDATE documents SET name=?,notes=? WHERE id=?', [name||doc.name, notes??doc.notes, req.params.id]);
  res.json(get('SELECT * FROM documents WHERE id=?', [req.params.id]));
});

app.delete('/api/documents/:id', (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(FILES_DIR, doc.filename)); } catch {}
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

app.get('/api/settings', (req, res) => {
  res.json(Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value])));
});

app.put('/api/settings', (req, res) => {
  Object.entries(req.body).forEach(([k, v]) => {
    db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v??'')]);
  });
  saveDb();
  res.json(Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value])));
});

// -- DATA PATH -------------------------------------------------
app.get('/api/data-path', (req, res) => {
  const cfg = loadConfig();
  res.json({ data_dir: DATA_DIR, db_path: DB_PATH, files_dir: FILES_DIR, config_file: PLM_CONFIG_PATH, configured: !!cfg.data_dir });
});

app.put('/api/data-path', (req, res) => {
  const { data_dir } = req.body;
  if (!data_dir || typeof data_dir !== 'string') return res.status(400).json({ error: 'data_dir required' });
  const cfg = loadConfig();
  cfg.data_dir = data_dir.trim();
  saveConfig(cfg);
  res.json({ ok: true, message: 'Pfad gespeichert. Bitte Server neu starten damit die Änderung wirksam wird.' });
});

// -- PRINTERS --------------------------------------------------
app.get('/api/printers', (req, res) => res.json(all('SELECT * FROM printers ORDER BY name')));
app.post('/api/printers', (req, res) => {
  const { name, cost_per_hour } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
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
  if (!size) return res.status(400).json({ error: 'size required' });
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
  if (!name) return res.status(400).json({ error: 'name required' });
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
app.post('/api/launch-cad', (req, res) => {
  const cadPath = get("SELECT value FROM settings WHERE key='cad_path'")?.value;
  if (!cadPath) return res.status(400).json({ error: 'Kein CAD-Pfad konfiguriert' });
  const { exec } = require('child_process');
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' };
  const cmd = process.platform === 'win32' ? `"${cadPath}"` : `"${cadPath}"`;
  exec(cmd, { env, detached: true }, (err) => {
    if (err) console.error('CAD launch error:', err.message);
  });
  res.json({ success: true });
});

app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true, message: 'Server wird beendet...' });
  setTimeout(() => {
    console.log('Server wird per Browser-Befehl beendet.');
    process.exit(0);
  }, 500);
});

// Launcher-Seite: öffnet PLM per window.open() damit window.close() funktioniert
app.get('/launcher', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PLM starten…</title>
  <style>body{background:#0a0b0d;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#4a5470}</style>
  </head><body><div>PLM & ERP wird gestartet…</div>
  <script>
    var w = window.open('/', '_blank', 'width='+screen.availWidth+',height='+screen.availHeight+',left=0,top=0');
    if(w) { window.close(); } else { window.location.href = '/'; }
  <\/script></body></html>`);
});

// ==============================================================
// 3MF PARSE
// ==============================================================
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

app.post('/api/parse-3mf', uploadMem.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
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
    log('revision', req.params.revId, 'BOM Import', `${count} Einträge aus STEP importiert`);
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
  if (!title) return res.status(400).json({ error: 'Title required' });
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
  if (!d) return res.status(404).json({ error: 'Not found' });
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name,
    rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id
    WHERE di.delivery_id=? ORDER BY di.position,di.id`, [d.id]);
  d.items.forEach(item => {
    if (item.print_settings_json) {
      try { item.print_settings = JSON.parse(item.print_settings_json); } catch(e) {}
    }
  });
  res.json(d);
});

app.put('/api/deliveries/:id', (req, res) => {
  const { title, order_id, customer_id, customer_name_free, status, delivery_date, manufacture_date, notes } = req.body;
  run(`UPDATE deliveries SET title=?,order_id=?,customer_id=?,customer_name_free=?,status=?,delivery_date=?,manufacture_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [title, order_id||null, customer_id||null, customer_name_free||null, status||'DRAFT', delivery_date||null, manufacture_date||null, notes||'', req.params.id]);
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

app.put('/api/deliveries/:id/status', (req, res) => {
  const { status } = req.body;
  if (status === 'DELIVERED') {
    const existing = get('SELECT delivery_date FROM deliveries WHERE id=?', [req.params.id]);
    if (!existing?.delivery_date) {
      const today = new Date().toISOString().slice(0, 10);
      run(`UPDATE deliveries SET status=?,delivery_date=?,updated_at=datetime('now') WHERE id=?`, [status, today, req.params.id]);
      autoDeliverOrder(req.params.id);
      return res.json({ success: true, delivery_date: today });
    }
  }
  run(`UPDATE deliveries SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  if (status === 'DELIVERED') autoDeliverOrder(req.params.id);
  res.json({ success: true });
});

app.delete('/api/deliveries/:id', (req, res) => {
  run('DELETE FROM delivery_items WHERE delivery_id=?', [req.params.id]);
  run('DELETE FROM deliveries WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/deliveries/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, print_settings_json, notes, position, raw_material_id } = req.body;
  if (!description) return res.status(400).json({ error: 'Description required' });
  const id = runGetId(`INSERT INTO delivery_items (delivery_id,item_id,description,quantity,unit,unit_price,print_settings_json,notes,position,raw_material_id)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [req.params.id, item_id||null, description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json||null, notes||'', position||999, raw_material_id||null]);
  res.json(get('SELECT di.*, rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color FROM delivery_items di LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id WHERE di.id=?', [id]));
});

app.put('/api/delivery-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, print_settings_json, notes, position, raw_material_id } = req.body;
  run(`UPDATE delivery_items SET description=?,quantity=?,unit=?,unit_price=?,print_settings_json=?,notes=?,position=?,raw_material_id=? WHERE id=?`,
    [description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json??null, notes||'', position||999, raw_material_id||null, req.params.id]);
  res.json(get('SELECT di.*, rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color FROM delivery_items di LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id WHERE di.id=?', [req.params.id]));
});

app.delete('/api/delivery-items/:id', (req, res) => {
  run('DELETE FROM delivery_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
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
  if (!d) return res.status(404).json({ error: 'Not found' });
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name,
    rm.name as rm_name, rm.material_type as rm_type, rm.color as rm_color
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN raw_materials rm ON di.raw_material_id=rm.id
    WHERE di.delivery_id=? ORDER BY di.position,di.id`, [d.id]);
  d.items.forEach(item => {
    if (item.print_settings_json) {
      try { item.print_settings = JSON.parse(item.print_settings_json); } catch(e) {}
    }
  });
  res.json(d);
});

// ==============================================================
// THERMAL PRINT (Pipsta Classic)
// ==============================================================
const { execFile } = require('child_process');
const PYTHON_CMD = process.platform === 'win32' ? 'py' : 'python3';

app.post('/api/print-receipt', (req, res) => {
  const { delivery_item_id, mode } = req.body;
  if (!delivery_item_id) return res.status(400).json({ error: 'delivery_item_id required' });
  const short = mode === 'short';

  const item = get(`SELECT di.*, i.item_number, i.item_type, i.name as item_name, i.default_price,
    COALESCE(c.name, d.customer_name_free) as customer_name
    FROM delivery_items di
    LEFT JOIN items i ON di.item_id=i.id
    LEFT JOIN deliveries d ON di.delivery_id=d.id
    LEFT JOIN customers c ON d.customer_id=c.id
    WHERE di.id=?`, [delivery_item_id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
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
    number:          item.item_number || '',
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

app.post('/api/print-receipt-delivery', (req, res) => {
  const { delivery_id, mode } = req.body;
  if (!delivery_id) return res.status(400).json({ error: 'delivery_id required' });
  const short = mode === 'short';

  const delivery = get(`SELECT d.*, COALESCE(c.name, d.customer_name_free) as customer_name
    FROM deliveries d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.id=?`, [delivery_id]);
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });

  const rows = all(`SELECT di.*, i.item_number, i.name as item_name, i.default_price
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
    return {
      name:   item.item_name || item.description,
      number: item.item_number || '',
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
  if (!o) return res.status(404).json({ error: 'Not found' });
  const number = nextDeliveryNumber();
  const delivId = runGetId(
    `INSERT INTO deliveries (number,title,order_id,customer_id,customer_name_free,status,delivery_date,notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [number, o.title, o.id, o.customer_id||null, o.customer_name_free||null,
     'DRAFT', o.delivery_date||null, o.notes||'']
  );
  const oItems = all('SELECT * FROM order_items WHERE order_id=?', [o.id]);
  oItems.forEach((oi, idx) => {
    run(`INSERT INTO delivery_items (delivery_id,item_id,description,quantity,unit,unit_price,notes,position)
         VALUES (?,?,?,?,?,?,?,?)`,
      [delivId, oi.item_id||null, oi.description, oi.quantity, oi.unit||'Stk',
       oi.unit_price||null, oi.notes||'', idx + 1]);
  });
  if (req.body.include_time) {
    const hourlyRateRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
    const hourlyRate = parseFloat(hourlyRateRow?.value) || 0;
    const billable = all("SELECT * FROM time_entries WHERE order_id=? AND billable=1 ORDER BY date,id", [o.id]);
    const basePos = oItems.length + 1;
    billable.forEach((te, idx) => {
      const desc = ['Arbeitszeit', te.date, te.description].filter(Boolean).join(' – ');
      run(`INSERT INTO delivery_items (delivery_id,description,quantity,unit,unit_price,notes,position)
           VALUES (?,?,?,?,?,?,?)`,
        [delivId, desc, te.hours, 'h', hourlyRate || null, '', basePos + idx]);
    });
  }
  saveDb();
  res.json(get('SELECT * FROM deliveries WHERE id=?', [delivId]));
});

// -- INVOICE DATA ----------------------------------------------
app.get('/api/orders/:id/invoice-data', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
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
  if (!q) return res.status(404).json({ error: 'Not found' });
  q.positions = all('SELECT qi.*,i.item_number,i.item_type FROM quote_items qi LEFT JOIN items i ON qi.item_id=i.id WHERE qi.quote_id=?', [q.id]);
  attachSubItems(q.positions);
  computeTotals(q);
  const hrRow = get("SELECT value FROM settings WHERE key='hourly_rate'");
  q.hourly_rate = hrRow ? parseFloat(hrRow.value) || 0 : 0;
  res.json(q);
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

app.get('/launcher', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PLM startet…</title>
  <style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0c10;color:#4a9eff;font-family:monospace;font-size:14px}</style>
  </head><body>PLM &amp; ERP wird geöffnet…
  <script>var w=window.open('http://localhost:${PORT}/','_blank');if(!w){location.href='http://localhost:${PORT}/';}else{window.close();}</script>
  </body></html>`);
});

// ==============================================================
// SUPPLIERS
// ==============================================================
app.get('/api/suppliers', (req, res) => res.json(all('SELECT * FROM suppliers ORDER BY number')));

app.post('/api/suppliers', (req, res) => {
  const { name, contact_person, email, phone, address, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const number = nextSupplierNumber();
  const id = runGetId('INSERT INTO suppliers (number,name,contact_person,email,phone,address,notes) VALUES (?,?,?,?,?,?,?)',
    [number, name, contact_person||'', email||'', phone||'', address||'', notes||'']);
  res.json(get('SELECT * FROM suppliers WHERE id=?', [id]));
});

app.get('/api/suppliers/:id', (req, res) => {
  const s = get('SELECT * FROM suppliers WHERE id=?', [req.params.id]);
  if (!s) return res.status(404).json({ error: 'Not found' });
  s.inventory_items = all('SELECT * FROM inventory_items WHERE supplier_id=? ORDER BY name', [s.id]);
  res.json(s);
});

app.put('/api/suppliers/:id', (req, res) => {
  const { name, contact_person, email, phone, address, notes } = req.body;
  run('UPDATE suppliers SET name=?,contact_person=?,email=?,phone=?,address=?,notes=? WHERE id=?',
    [name, contact_person||'', email||'', phone||'', address||'', notes||'', req.params.id]);
  res.json(get('SELECT * FROM suppliers WHERE id=?', [req.params.id]));
});

app.delete('/api/suppliers/:id', (req, res) => {
  run('UPDATE inventory_items SET supplier_id=NULL WHERE supplier_id=?', [req.params.id]);
  run('DELETE FROM suppliers WHERE id=?', [req.params.id]);
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
  if (!po) return res.status(404).json({ error: 'Not found' });
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
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  run(`UPDATE purchase_orders SET status=?,updated_at=datetime('now') WHERE id=?`, [status, req.params.id]);
  if (status === 'RECEIVED') {
    const items = all('SELECT * FROM purchase_order_items WHERE po_id=?', [req.params.id]);
    const poNum = get('SELECT number FROM purchase_orders WHERE id=?', [req.params.id])?.number || '';
    for (const item of items) {
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
  const { description, quantity, unit, unit_price, inventory_item_id, raw_material_id, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
  const pos = (get('SELECT MAX(position) as m FROM purchase_order_items WHERE po_id=?', [req.params.id])?.m || 0) + 1;
  const iid = runGetId('INSERT INTO purchase_order_items (po_id,description,quantity,unit,unit_price,inventory_item_id,raw_material_id,notes,position) VALUES (?,?,?,?,?,?,?,?,?)',
    [req.params.id, description, parseFloat(quantity)||1, unit||'Stk', unit_price!=null&&unit_price!==''?parseFloat(unit_price):null, inventory_item_id||null, raw_material_id||null, notes||'', pos]);
  res.json(get('SELECT * FROM purchase_order_items WHERE id=?', [iid]));
});

app.put('/api/purchase-orders/:id/items/:itemId', (req, res) => {
  const { description, quantity, unit, unit_price, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'description required' });
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
// Stock check for a PLM item: returns linked inventory item + planned qty in open orders
app.get('/api/inventory/stock-check', (req, res) => {
  const { item_id } = req.query;
  if (!item_id) return res.json(null);
  const inv = get(`SELECT ii.* FROM inventory_items ii WHERE ii.item_id=? LIMIT 1`, [parseInt(item_id)]);
  if (!inv) return res.json(null);
  // Planned = sum of quantities in orders that are not DELIVERED or CANCELLED
  const planned = get(`
    SELECT COALESCE(SUM(oi.quantity),0) as qty
    FROM order_items oi
    JOIN orders o ON oi.order_id=o.id
    WHERE oi.item_id=? AND o.status NOT IN ('DELIVERED','CANCELLED')
  `, [parseInt(item_id)]);
  res.json({ ...inv, planned_qty: planned?.qty || 0 });
});

app.get('/api/inventory', (req, res) => {
  const { item_id } = req.query;
  const base = `SELECT ii.*, s.name as supplier_name, it.item_number as linked_item_number, it.name as linked_item_name,
    COALESCE((
      SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON oi.order_id=o.id
      WHERE oi.item_id=ii.item_id AND ii.item_id IS NOT NULL AND o.status NOT IN ('DELIVERED','CANCELLED')
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
  if (!name) return res.status(400).json({ error: 'Name required' });
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
  if (!item) return res.status(404).json({ error: 'Not found' });
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
  run('DELETE FROM inventory_movements WHERE item_id=?', [req.params.id]);
  run('DELETE FROM inventory_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/inventory/:id/movement', (req, res) => {
  const { type, qty, reference, notes } = req.body;
  if (!type || qty == null) return res.status(400).json({ error: 'type and qty required' });
  const item = get('SELECT * FROM inventory_items WHERE id=?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const delta = type === 'out' ? -Math.abs(parseFloat(qty)) : Math.abs(parseFloat(qty));
  run('INSERT INTO inventory_movements (item_id,type,qty,reference,notes) VALUES (?,?,?,?,?)',
    [req.params.id, type, delta, reference||'', notes||'']);
  run(`UPDATE inventory_items SET stock_qty=stock_qty+?,updated_at=datetime('now') WHERE id=?`, [delta, req.params.id]);
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
  if (!designation) return res.status(400).json({ error: 'Bezeichnung erforderlich' });
  const id = runGetId('INSERT INTO standard_parts (designation,standard,std_number,name,size,material,unit_price,notes) VALUES (?,?,?,?,?,?,?,?)',
    [designation, standard||'', std_number||'', name||'', size||'', material||'', unit_price||null, notes||'']);
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [id]));
});

app.post('/api/standard-parts/:id/clone', (req, res) => {
  const p = get('SELECT * FROM standard_parts WHERE id=?', [req.params.id]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const newId = runGetId('INSERT INTO standard_parts (designation,standard,std_number,name,size,material,unit_price,notes) VALUES (?,?,?,?,?,?,?,?)',
    [p.designation, p.standard||'', p.std_number||'', p.name||'', p.size||'', p.material||'', p.unit_price||null, p.notes||'']);
  saveDb();
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [newId]));
});

app.put('/api/standard-parts/:id', (req, res) => {
  const { designation, standard, std_number, name, size, material, unit_price, notes } = req.body;
  if (!designation) return res.status(400).json({ error: 'Bezeichnung erforderlich' });
  run('UPDATE standard_parts SET designation=?,standard=?,std_number=?,name=?,size=?,material=?,unit_price=?,notes=? WHERE id=?',
    [designation, standard||'', std_number||'', name||'', size||'', material||'', unit_price||null, notes||'', req.params.id]);
  res.json(get('SELECT * FROM standard_parts WHERE id=?', [req.params.id]));
});

app.delete('/api/standard-parts/:id', (req, res) => {
  // delete associated files from disk
  const files = all('SELECT * FROM standard_part_files WHERE std_part_id=?', [req.params.id]);
  files.forEach(f => { try { fs.unlinkSync(path.join(FILES_DIR, f.filename)); } catch {} });
  run('DELETE FROM standard_parts WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/standard-parts/:id/files', (req, res) => {
  res.json(all('SELECT * FROM standard_part_files WHERE std_part_id=? ORDER BY uploaded_at DESC', [req.params.id]));
});

app.post('/api/standard-parts/:id/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const dsType = guessType(req.file.originalname);
  const id = runGetId('INSERT INTO standard_part_files (std_part_id,filename,original_name,file_size,ds_type,notes) VALUES (?,?,?,?,?,?)',
    [req.params.id, req.file.filename, req.file.originalname, req.file.size, dsType, req.body.notes||'']);
  res.json(get('SELECT * FROM standard_part_files WHERE id=?', [id]));
});

app.get('/api/standard-part-files/:id/download', (req, res) => {
  const f = get('SELECT * FROM standard_part_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: 'Not found' });
  const fp = path.join(FILES_DIR, f.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'File missing' });
  res.download(fp, f.original_name);
});

app.delete('/api/standard-part-files/:id', (req, res) => {
  const f = get('SELECT * FROM standard_part_files WHERE id=?', [req.params.id]);
  if (!f) return res.status(404).json({ error: 'Not found' });
  try { fs.unlinkSync(path.join(FILES_DIR, f.filename)); } catch {}
  run('DELETE FROM standard_part_files WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/revisions/:revId/bom-std', (req, res) => {
  const { std_part_id, quantity, unit, notes } = req.body;
  const sp = get('SELECT * FROM standard_parts WHERE id=?', [std_part_id]);
  if (!sp) return res.status(404).json({ error: 'Normteil nicht gefunden' });
  try {
    const pos = (get('SELECT MAX(position) as m FROM bom_std_parts WHERE parent_rev_id=?', [req.params.revId])?.m || 0) + 1;
    const id = runGetId('INSERT INTO bom_std_parts (parent_rev_id,std_part_id,quantity,unit,position,notes) VALUES (?,?,?,?,?,?)',
      [req.params.revId, std_part_id, quantity||1, unit||'pcs', pos, notes||'']);
    log('revision', req.params.revId, 'BOM Add', sp.designation + ' x' + (quantity||1));
    res.json({ success: true, id });
  } catch { res.status(400).json({ error: 'Bereits in BOM vorhanden' }); }
});

app.put('/api/bom-std/:id/quantity', (req, res) => {
  const { quantity, unit } = req.body;
  run('UPDATE bom_std_parts SET quantity=?, unit=? WHERE id=?', [Math.max(1, Math.round(parseFloat(quantity)||1)), unit||'Stk', req.params.id]);
  saveDb();
  res.json({ success: true });
});

app.put('/api/revisions/:revId/bom-std-reorder', (req, res) => {
  const { order } = req.body; // array of bom_std_parts ids in new order
  order.forEach((id, idx) => run('UPDATE bom_std_parts SET position=? WHERE id=? AND parent_rev_id=?', [idx+1, id, req.params.revId]));
  saveDb();
  res.json({ success: true });
});

app.delete('/api/bom-std/:id', (req, res) => {
  const row = get('SELECT bs.*, sp.designation FROM bom_std_parts bs JOIN standard_parts sp ON bs.std_part_id=sp.id WHERE bs.id=?', [req.params.id]);
  if (row) log('revision', row.parent_rev_id, 'BOM Entfernt', row.designation);
  run('DELETE FROM bom_std_parts WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ==============================================================
// RAW MATERIALS
// ==============================================================
app.get('/api/raw-materials', (req, res) => {
  const mats = all('SELECT * FROM raw_materials ORDER BY material_type, color, name');
  mats.forEach(m => {
    const withLot = all(`SELECT MIN(id) as id, lot_number,
      SUM(CASE WHEN type='in' THEN qty ELSE 0 END) as qty,
      SUM(CASE WHEN type='in' THEN qty ELSE -qty END) as remaining_qty,
      MAX(CASE WHEN type='in' THEN unit_price ELSE NULL END) as unit_price,
      MAX(created_at) as last_date
      FROM raw_material_movements
      WHERE raw_material_id=? AND lot_number IS NOT NULL AND lot_number!=''
      GROUP BY lot_number
      ORDER BY MAX(created_at) DESC`, [m.id]);
    const withoutLot = all(`SELECT id, '' as lot_number, qty, qty as remaining_qty, unit_price, created_at as last_date, notes
      FROM raw_material_movements
      WHERE raw_material_id=? AND type='in' AND (lot_number IS NULL OR lot_number='')
      ORDER BY created_at DESC`, [m.id]);
    m.lots = [...withLot, ...withoutLot];
  });
  res.json(mats);
});

app.post('/api/raw-materials', (req, res) => {
  const { name, material_type, color, brand, stock_qty, min_qty, unit, notes, lot_number, dimensions, weight_g, print_temp, bed_temp, nozzle } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
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
  if (!item) return res.status(404).json({ error: 'Not found' });
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
  if (!order_id) return res.status(400).json({ error: 'order_id or item_id required' });
  res.json(all('SELECT * FROM time_entries WHERE order_id=? ORDER BY date DESC, id DESC', [order_id]));
});

app.post('/api/time-entries', (req, res) => {
  const { order_id, item_id, date, hours, description, billable } = req.body;
  if (!order_id && !item_id) return res.status(400).json({ error: 'order_id or item_id required' });
  if (hours == null) return res.status(400).json({ error: 'hours required' });
  const id = runGetId(
    'INSERT INTO time_entries (order_id,item_id,date,hours,description,billable) VALUES (?,?,?,?,?,?)',
    [order_id||null, item_id||null, date||new Date().toISOString().slice(0,10), parseFloat(hours), description||'', billable?1:0]
  );
  res.json(get('SELECT * FROM time_entries WHERE id=?', [id]));
});

app.put('/api/time-entries/:id', (req, res) => {
  const { date, hours, description, billable } = req.body;
  run('UPDATE time_entries SET date=?,hours=?,description=?,billable=? WHERE id=?',
    [date, parseFloat(hours), description||'', billable?1:0, req.params.id]);
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
  if (!o) return res.status(404).json({ error: 'Not found' });
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
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  PLM & ERP laeuft auf http://localhost:' + PORT);
    console.log('  Datenpfad: ' + DATA_DIR);
    console.log('');
  });
}).catch(err => {
  console.error('Fehler beim Starten:', err);
  process.exit(1);
});
