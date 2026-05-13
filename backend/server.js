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

const DATA_DIR    = process.env.PLM_DATA_DIR
  ? path.resolve(process.env.PLM_DATA_DIR)
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

function migrate(sql) {
  try { db.run(sql); } catch(e) {}
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
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(item_number)
  )`);
  migrate('ALTER TABLE items ADD COLUMN source_url TEXT');
  migrate('ALTER TABLE items ADD COLUMN default_price REAL');

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
    print_duration REAL
  )`);
  migrate('ALTER TABLE print_settings ADD COLUMN printer_cost_hr REAL');
  migrate('ALTER TABLE print_settings ADD COLUMN filament_price_kg REAL');
  migrate('ALTER TABLE print_settings ADD COLUMN filament_weight_total REAL');
  migrate('ALTER TABLE print_settings ADD COLUMN part_weight REAL');
  migrate('ALTER TABLE print_settings ADD COLUMN print_duration REAL');

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
  migrate('ALTER TABLE customers ADD COLUMN street TEXT');
  migrate('ALTER TABLE customers ADD COLUMN postal_code TEXT');
  migrate('ALTER TABLE customers ADD COLUMN city TEXT');
  migrate("ALTER TABLE customers ADD COLUMN country TEXT DEFAULT 'Deutschland'");

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
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
  migrate('ALTER TABLE orders ADD COLUMN tax_rate REAL DEFAULT 19');
  migrate('ALTER TABLE orders ADD COLUMN discount_pct REAL DEFAULT 0');
  migrate('ALTER TABLE orders ADD COLUMN payment_terms TEXT');
  migrate('ALTER TABLE orders ADD COLUMN include_tax INTEGER DEFAULT 0');

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    notes TEXT
  )`);
  migrate('ALTER TABLE order_items ADD COLUMN discount_pct REAL DEFAULT 0');
  migrate('ALTER TABLE order_items ADD COLUMN notes TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    status TEXT DEFAULT 'DRAFT',
    title TEXT NOT NULL,
    notes TEXT,
    quote_date TEXT,
    valid_until TEXT,
    tax_rate REAL DEFAULT 19,
    discount_pct REAL DEFAULT 0,
    payment_terms TEXT,
    include_tax INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  migrate('ALTER TABLE quotes ADD COLUMN include_tax INTEGER DEFAULT 0');

  db.run(`CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL,
    item_id INTEGER,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'pcs',
    unit_price REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    notes TEXT
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
    status TEXT DEFAULT 'DRAFT',
    delivery_date TEXT,
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
    position INTEGER DEFAULT 999
  )`);
  migrate('ALTER TABLE delivery_items ADD COLUMN unit_price REAL');
  migrate('ALTER TABLE orders ADD COLUMN customer_name_free TEXT');
  migrate('ALTER TABLE quotes ADD COLUMN customer_name_free TEXT');
  migrate('ALTER TABLE deliveries ADD COLUMN customer_name_free TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER DEFAULT 0
  )`);
  db.run(`INSERT OR IGNORE INTO counters VALUES ('project',0),('customer',0),('order',0),('quote',0),('delivery',0)`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
  // Seed default settings if not yet present
  const defaults = {
    company_name: '', company_street: '', company_postal_code: '', company_city: '',
    company_country: 'Schweiz', company_phone: '', company_email: '', company_website: '',
    company_uid: '', bank_name: '', bank_iban: '', bank_bic: '',
    default_tax_rate: '8.1', default_payment_terms: '30 Tage netto',
    default_currency: 'CHF', quote_validity_days: '30',
    invoice_footer: 'Bitte begleichen Sie den Betrag gemäss Zahlungsbedingungen. Vielen Dank!',
    quote_footer: 'Dieses Angebot ist freibleibend. Preise exkl. MwSt., sofern nicht anders angegeben.'
  };
  Object.entries(defaults).forEach(([k, v]) => {
    db.run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', [k, v]);
  });

  saveDb();
  console.log('Datenbank bereit: ' + DB_PATH);
}

// -- HELPERS ----------------------------------------------------
function nextRev(current) {
  if (!current) return 'A';
  if (current === 'Z') return 'AA';
  if (current.length === 1) return String.fromCharCode(current.charCodeAt(0) + 1);
  const last = current[current.length - 1];
  if (last === 'Z') return current.slice(0, -1) + 'AA';
  return current.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
}

function nextCounter(key) {
  db.run('UPDATE counters SET value=value+1 WHERE key=?', [key]);
  saveDb();
  return get('SELECT value FROM counters WHERE key=?', [key]).value;
}

function nextProjectNumber() { return String(nextCounter('project')).padStart(4, '0'); }
function nextCustomerNumber() { return 'KD-' + String(nextCounter('customer')).padStart(4, '0'); }
function nextOrderNumber() { return 'AUF-' + new Date().getFullYear() + '-' + String(nextCounter('order')).padStart(4, '0'); }
function nextQuoteNumber() { return 'ANG-' + new Date().getFullYear() + '-' + String(nextCounter('quote')).padStart(4, '0'); }
function nextDeliveryNumber() { return 'LS-' + new Date().getFullYear() + '-' + String(nextCounter('delivery')).padStart(4, '0'); }

function parseIni(content) {
  const s = {};
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#') || t.startsWith('[')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k) s[k] = v;
  }
  return Object.keys(s).length ? s : null;
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

    // Find config entries: prefer known slicer names, then any .config
    const CONFIG_NAMES = ['slic3r_pe', 'prusaslicer', 'superslicer', 'slic3r', 'orcaslicer', 'bambu'];
    const configEntries = allEntries.filter(e => {
      const n = e.entryName.toLowerCase().replace(/\\/g, '/');
      return n.endsWith('.config') && !e.isDirectory;
    }).sort((a, b) => {
      const na = a.entryName.toLowerCase();
      const nb = b.entryName.toLowerCase();
      const pa = CONFIG_NAMES.findIndex(c => na.includes(c));
      const pb = CONFIG_NAMES.findIndex(c => nb.includes(c));
      const ra = pa === -1 ? 99 : pa;
      const rb = pb === -1 ? 99 : pb;
      return ra - rb;
    });

    for (const entry of configEntries) {
      const content = readZipEntry(entry);
      if (!content) {
        console.log('3MF: entry', entry.entryName, 'getData returned empty');
        continue;
      }
      console.log('3MF: trying', entry.entryName, '– first 120 chars:', content.slice(0, 120).replace(/\n/g, '↵'));
      const parsed = parseIni(content);
      if (parsed) {
        console.log('3MF: parsed', Object.keys(parsed).length, 'keys from', entry.entryName);
        return { settings: parsed, source: entry.entryName };
      }
      console.log('3MF: parseIni returned null for', entry.entryName);
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

function log(type, id, action, details) {
  db.run('INSERT INTO changelog (entity_type,entity_id,action,details) VALUES (?,?,?,?)', [type, id, action, details || '']);
  saveDb();
}

function nextItemSeq(projectId, type) {
  const rows = all('SELECT item_number FROM items WHERE project_id=? AND item_type=?', [projectId, type]);
  const re = new RegExp('-' + type + '-(\\d+)$');
  const nums = rows.map(r => { const m = r.item_number.match(re); return m ? parseInt(m[1]) : 0; });
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
function nextPrtNumber(projectId, asmNum) {
  let rows;
  if (asmNum) {
    rows = all("SELECT item_number FROM items WHERE project_id=? AND item_type='PRT' AND item_number LIKE ?", [projectId, `%-ASM-${asmNum}-PRT-%`]);
  } else {
    rows = all("SELECT item_number FROM items WHERE project_id=? AND item_type='PRT' AND item_number NOT LIKE '%-ASM-%PRT-%'", [projectId]);
  }
  const nums = rows.map(r => { const m = r.item_number.match(/-PRT-(\d+)$/); return m ? parseInt(m[1]) : 0; });
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
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
  const projects = all('SELECT * FROM projects ORDER BY number DESC');
  projects.forEach(p => {
    p.item_count = count('SELECT COUNT(*) as c FROM items WHERE project_id=?', [p.id]);
    p.asm_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='ASM'", [p.id]);
    p.prt_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='PRT'", [p.id]);
    p.doc_count  = count("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='DOC'", [p.id]);
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
  p.items = all('SELECT * FROM items WHERE project_id=? ORDER BY item_type, item_number', [p.id]);
  p.items.forEach(item => {
    item.latest_revision = getLatestRevision(item.id);
    item.active_revision = getActiveRevision(item.id);
    item.revisions = all('SELECT * FROM revisions WHERE item_id=? ORDER BY rowid DESC', [item.id]);
    if (item.latest_revision) {
      item.latest_revision.datasets = all('SELECT * FROM datasets WHERE revision_id=? ORDER BY ds_type, uploaded_at', [item.latest_revision.id]);
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
    if (item.item_type === 'ASM') {
      rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
      rev.bom.forEach(b => { b.child_active_rev = getActiveRevision(b.child_item_id); });
    }
  });
  item.changelog = all("SELECT * FROM changelog WHERE entity_type='item' AND entity_id=? ORDER BY created_at DESC", [item.id]);
  item.children = all('SELECT * FROM items WHERE parent_id=?', [item.id]);
  res.json(item);
});

app.post('/api/projects/:projectId/items', (req, res) => {
  const { name, description, item_type, parent_id, source_url, default_price } = req.body;
  if (!name || !item_type) return res.status(400).json({ error: 'name and item_type required' });
  const project = get('SELECT * FROM projects WHERE id=?', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let item_number;
  if (item_type === 'ASM') {
    item_number = project.number + '-ASM-' + nextItemSeq(project.id, 'ASM');
  } else if (item_type === 'DOC') {
    item_number = project.number + '-DOC-' + nextItemSeq(project.id, 'DOC');
  } else {
    if (parent_id) {
      const parent = get('SELECT * FROM items WHERE id=?', [parent_id]);
      const asmMatch = parent ? parent.item_number.match(/-ASM-(\d+)/) : null;
      const asmNum = asmMatch ? asmMatch[1] : null;
      item_number = asmNum
        ? project.number + '-ASM-' + asmNum + '-PRT-' + nextPrtNumber(project.id, asmNum)
        : project.number + '-PRT-' + nextPrtNumber(project.id, null);
    } else {
      item_number = project.number + '-PRT-' + nextPrtNumber(project.id, null);
    }
  }

  const itemId = runGetId('INSERT INTO items (project_id,parent_id,item_type,item_number,name,description,source_url,default_price) VALUES (?,?,?,?,?,?,?,?)',
    [project.id, parent_id || null, item_type, item_number, name, description || '', source_url || null, default_price != null ? parseFloat(default_price) : null]);
  run('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, 'A', 'DFT', 'Initial revision']);
  log('item', itemId, 'Created', item_type + ' ' + item_number + ' Rev A');
  res.json(get('SELECT * FROM items WHERE id=?', [itemId]));
});

app.put('/api/items/:id', (req, res) => {
  const { name, description, source_url, default_price } = req.body;
  run('UPDATE items SET name=?,description=?,source_url=?,default_price=? WHERE id=?',
    [name, description, source_url||null, default_price != null ? parseFloat(default_price) : null, req.params.id]);
  log('item', req.params.id, 'Updated', name);
  res.json(get('SELECT * FROM items WHERE id=?', [req.params.id]));
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
  if (rev.item && rev.item.item_type === 'ASM') {
    rev.bom = all('SELECT b.*, i.item_number, i.name, i.item_type FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
  }
  res.json(rev);
});

app.put('/api/revisions/:id/status', (req, res) => {
  const { status, description, eco_reason, released_by } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });

  const validTransitions = { DFT:['REV'], REV:['DFT','REL'], REL:['ECO','OBS'], ECO:['DFT'], OBS:[] };
  if (!validTransitions[rev.status]?.includes(status))
    return res.status(400).json({ error: 'Cannot transition from ' + rev.status + ' to ' + status });

  if (status === 'REL') {
    // For assemblies: all BOM children must have at least one REL revision
    const item = get('SELECT * FROM items WHERE id=?', [rev.item_id]);
    if (item && item.item_type === 'ASM') {
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
    const newRev = nextRev(lastRev ? lastRev.rev : 'A');
    run('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)',
      [rev.item_id, newRev, 'DFT', 'ECO: ' + (eco_reason || '')]);
    log('revision', rev.id, 'ECO', 'New revision ' + newRev + ' created');
  } else {
    run("UPDATE revisions SET status=?,updated_at=datetime('now') WHERE id=?", [status, rev.id]);
  }

  log('revision', rev.id, 'Status -> ' + status, description || eco_reason || '');
  res.json(get('SELECT * FROM revisions WHERE id=?', [rev.id]));
});

app.put('/api/revisions/:id/print-settings', (req, res) => {
  const { material, color, layer_height, infill, supports, nozzle, print_temp, bed_temp, printer, notes,
    printer_cost_hr, filament_price_kg, filament_weight_total, part_weight, print_duration } = req.body;
  const rev = get('SELECT * FROM revisions WHERE id=?', [req.params.id]);
  if (!rev) return res.status(404).json({ error: 'Not found' });
  run(`INSERT INTO print_settings (revision_id,material,color,layer_height,infill,supports,nozzle,print_temp,bed_temp,printer,notes,printer_cost_hr,filament_price_kg,filament_weight_total,part_weight,print_duration)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(revision_id) DO UPDATE SET
    material=excluded.material, color=excluded.color, layer_height=excluded.layer_height,
    infill=excluded.infill, supports=excluded.supports, nozzle=excluded.nozzle,
    print_temp=excluded.print_temp, bed_temp=excluded.bed_temp, printer=excluded.printer, notes=excluded.notes,
    printer_cost_hr=excluded.printer_cost_hr, filament_price_kg=excluded.filament_price_kg,
    filament_weight_total=excluded.filament_weight_total, part_weight=excluded.part_weight,
    print_duration=excluded.print_duration`,
    [rev.id, material, color, layer_height, infill, supports, nozzle, print_temp, bed_temp, printer, notes,
     printer_cost_hr||null, filament_price_kg||null, filament_weight_total||null, part_weight||null, print_duration||null]);
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
  const id = runGetId('INSERT INTO datasets (revision_id,ds_type,filename,original_name,file_size,version,notes) VALUES (?,?,?,?,?,?,?)',
    [rev.id, dsType, req.file.filename, req.file.originalname, req.file.size, version || '1', notes || '']);
  log('revision', rev.id, 'Dataset Added', req.file.originalname + ' (' + dsType + ')');
  res.json(get('SELECT * FROM datasets WHERE id=?', [id]));
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
app.get('/api/customers', (req, res) => res.json(all('SELECT * FROM customers ORDER BY number')));

app.post('/api/customers', (req, res) => {
  const { name, email, phone, street, postal_code, city, country, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const number = nextCustomerNumber();
  const id = runGetId('INSERT INTO customers (number,name,email,phone,street,postal_code,city,country,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [number, name, email||'', phone||'', street||'', postal_code||'', city||'', country||'Deutschland', notes||'']);
  res.json(get('SELECT * FROM customers WHERE id=?', [id]));
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
    o.computed_total = net + (o.include_tax ? net*(o.tax_rate||8.1)/100 : 0);
  });
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer_id, customer_name_free, title, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextOrderNumber();
  const id = runGetId('INSERT INTO orders (number,customer_id,customer_name_free,title,notes,order_date,delivery_date,tax_rate,discount_pct,payment_terms,include_tax) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, customer_name_free||null, title, notes||'', order_date||null, delivery_date||null, tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0]);
  res.json(get('SELECT * FROM orders WHERE id=?', [id]));
});

app.get('/api/orders/:id', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  o.items = all('SELECT oi.*,i.item_number FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=?', [o.id]);
  res.json(o);
});

app.put('/api/orders/:id', (req, res) => {
  const { customer_id, customer_name_free, title, status, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms, include_tax } = req.body;
  run(`UPDATE orders SET customer_id=?,customer_name_free=?,title=?,status=?,notes=?,order_date=?,delivery_date=?,
    tax_rate=?,discount_pct=?,payment_terms=?,include_tax=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id||null, customer_name_free||null, title, status, notes, order_date, delivery_date,
     tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, req.params.id]);
  res.json(get('SELECT * FROM orders WHERE id=?', [req.params.id]));
});

app.delete('/api/orders/:id', (req, res) => {
  run('DELETE FROM order_items WHERE order_id=?', [req.params.id]);
  run('DELETE FROM orders WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/orders/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes } = req.body;
  const id = runGetId('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes) VALUES (?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'']);
  res.json(get('SELECT * FROM order_items WHERE id=?', [id]));
});

app.put('/api/order-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, discount_pct, notes } = req.body;
  run('UPDATE order_items SET description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=? WHERE id=?',
    [description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', req.params.id]);
  res.json(get('SELECT * FROM order_items WHERE id=?', [req.params.id]));
});

app.delete('/api/order-items/:id', (req, res) => {
  run('DELETE FROM order_items WHERE id=?', [req.params.id]);
  res.json({ success: true });
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
  const { customer_id, customer_name_free, title, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms, include_tax } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextQuoteNumber();
  const id = runGetId('INSERT INTO quotes (number,customer_id,customer_name_free,title,notes,quote_date,valid_until,tax_rate,discount_pct,payment_terms,include_tax) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, customer_name_free||null, title, notes||'', quote_date||null, valid_until||null, tax_rate??19, discount_pct??0, payment_terms||'30 Tage netto', include_tax?1:0]);
  res.json(get('SELECT * FROM quotes WHERE id=?', [id]));
});

app.get('/api/quotes/:id', (req, res) => {
  const q = get(`SELECT q.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id WHERE q.id=?`, [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Not found' });
  q.items = all('SELECT qi.*,i.item_number FROM quote_items qi LEFT JOIN items i ON qi.item_id=i.id WHERE qi.quote_id=?', [q.id]);
  res.json(q);
});

app.put('/api/quotes/:id', (req, res) => {
  const { customer_id, customer_name_free, title, status, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms, include_tax } = req.body;
  run(`UPDATE quotes SET customer_id=?,customer_name_free=?,title=?,status=?,notes=?,quote_date=?,valid_until=?,
    tax_rate=?,discount_pct=?,payment_terms=?,include_tax=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id||null, customer_name_free||null, title, status, notes, quote_date, valid_until,
     tax_rate??19, discount_pct??0, payment_terms||'', include_tax?1:0, req.params.id]);
  res.json(get('SELECT * FROM quotes WHERE id=?', [req.params.id]));
});

app.delete('/api/quotes/:id', (req, res) => {
  run('DELETE FROM quote_items WHERE quote_id=?', [req.params.id]);
  run('DELETE FROM quotes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/quotes/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, discount_pct, notes } = req.body;
  const id = runGetId('INSERT INTO quote_items (quote_id,item_id,description,quantity,unit,unit_price,discount_pct,notes) VALUES (?,?,?,?,?,?,?,?)',
    [req.params.id, item_id||null, description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'']);
  res.json(get('SELECT * FROM quote_items WHERE id=?', [id]));
});

app.put('/api/quote-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, discount_pct, notes } = req.body;
  run('UPDATE quote_items SET description=?,quantity=?,unit=?,unit_price=?,discount_pct=?,notes=? WHERE id=?',
    [description, quantity||1, unit||'pcs', unit_price||0, discount_pct||0, notes||'', req.params.id]);
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
    run('INSERT INTO order_items (order_id,item_id,description,quantity,unit,unit_price,discount_pct,notes) VALUES (?,?,?,?,?,?,?,?)',
      [orderId, qi.item_id, qi.description, qi.quantity, qi.unit, qi.unit_price, qi.discount_pct, qi.notes||'']);
  });
  run("UPDATE quotes SET status='ACCEPTED',updated_at=datetime('now') WHERE id=?", [q.id]);
  res.json(get('SELECT * FROM orders WHERE id=?', [orderId]));
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
    assemblies: count("SELECT COUNT(*) as c FROM items WHERE item_type='ASM'"),
    parts:      count("SELECT COUNT(*) as c FROM items WHERE item_type='PRT'"),
    datasets:   count('SELECT COUNT(*) as c FROM datasets'),
    customers:  count('SELECT COUNT(*) as c FROM customers'),
    orders:     count('SELECT COUNT(*) as c FROM orders'),
    quotes:     count('SELECT COUNT(*) as c FROM quotes'),
    deliveries: count('SELECT COUNT(*) as c FROM deliveries'),
    by_status:  all("SELECT status, COUNT(*) as count FROM revisions GROUP BY status"),
    recent_items: recentItems,
    recent_projects: all('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 5'),
  });
});

app.get('/api/search', (req, res) => {
  const q = '%' + (req.query.q || '') + '%';
  const items = all('SELECT i.*,p.name as project_name,p.number as project_number FROM items i JOIN projects p ON i.project_id=p.id WHERE i.item_number LIKE ? OR i.name LIKE ? OR i.description LIKE ? ORDER BY i.id DESC LIMIT 30', [q,q,q]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  const projects = all('SELECT * FROM projects WHERE number LIKE ? OR name LIKE ? OR description LIKE ? LIMIT 10', [q,q,q]);
  res.json({ items, projects });
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

app.get('/api/items-all', (req, res) => {
  const q = req.query.q ? '%' + req.query.q + '%' : '%';
  const items = all(`SELECT i.id, i.item_number, i.name, i.item_type, i.default_price,
    p.name as project_name, p.number as project_number
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE i.item_number LIKE ? OR i.name LIKE ?
    ORDER BY i.item_number LIMIT 40`, [q, q]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
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
  const items = all("SELECT * FROM items WHERE project_id=? AND item_type IN ('ASM','PRT')", [req.params.id]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  res.json(items);
});

// ==============================================================
// SETTINGS
// ==============================================================
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

// -- SHUTDOWN --------------------------------------------------
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true, message: 'Server wird beendet...' });
  setTimeout(() => {
    console.log('Server wird per Browser-Befehl beendet.');
    process.exit(0);
  }, 500);
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
  const { title, order_id, customer_id, customer_name_free, status, delivery_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextDeliveryNumber();
  const id = runGetId(`INSERT INTO deliveries (number,title,order_id,customer_id,customer_name_free,status,delivery_date,notes)
    VALUES (?,?,?,?,?,?,?,?)`,
    [number, title, order_id||null, customer_id||null, customer_name_free||null, status||'DRAFT', delivery_date||null, notes||'']);
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
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    WHERE di.delivery_id=? ORDER BY di.position,di.id`, [d.id]);
  d.items.forEach(item => {
    if (item.print_settings_json) {
      try { item.print_settings = JSON.parse(item.print_settings_json); } catch(e) {}
    }
  });
  res.json(d);
});

app.put('/api/deliveries/:id', (req, res) => {
  const { title, order_id, customer_id, customer_name_free, status, delivery_date, notes } = req.body;
  run(`UPDATE deliveries SET title=?,order_id=?,customer_id=?,customer_name_free=?,status=?,delivery_date=?,notes=?,updated_at=datetime('now') WHERE id=?`,
    [title, order_id||null, customer_id||null, customer_name_free||null, status||'DRAFT', delivery_date||null, notes||'', req.params.id]);
  res.json(get('SELECT * FROM deliveries WHERE id=?', [req.params.id]));
});

app.delete('/api/deliveries/:id', (req, res) => {
  run('DELETE FROM delivery_items WHERE delivery_id=?', [req.params.id]);
  run('DELETE FROM deliveries WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/deliveries/:id/items', (req, res) => {
  const { item_id, description, quantity, unit, unit_price, print_settings_json, notes, position } = req.body;
  if (!description) return res.status(400).json({ error: 'Description required' });
  const id = runGetId(`INSERT INTO delivery_items (delivery_id,item_id,description,quantity,unit,unit_price,print_settings_json,notes,position)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.params.id, item_id||null, description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json||null, notes||'', position||999]);
  res.json(get('SELECT * FROM delivery_items WHERE id=?', [id]));
});

app.put('/api/delivery-items/:id', (req, res) => {
  const { description, quantity, unit, unit_price, print_settings_json, notes, position } = req.body;
  run(`UPDATE delivery_items SET description=?,quantity=?,unit=?,unit_price=?,print_settings_json=?,notes=?,position=? WHERE id=?`,
    [description, quantity||1, unit||'Stk',
     unit_price!=null ? parseFloat(unit_price) : null,
     print_settings_json??null, notes||'', position||999, req.params.id]);
  res.json(get('SELECT * FROM delivery_items WHERE id=?', [req.params.id]));
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
  d.items = all(`SELECT di.*,i.item_number,i.item_type,i.name as item_name
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
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
  const { delivery_item_id } = req.body;
  if (!delivery_item_id) return res.status(400).json({ error: 'delivery_item_id required' });

  const item = get(`SELECT di.*, i.item_number, i.item_type, i.name as item_name, i.default_price
    FROM delivery_items di LEFT JOIN items i ON di.item_id=i.id
    WHERE di.id=?`, [delivery_item_id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });

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
    name:   item.item_name || item.description,
    number: item.item_number || '',
    desc:   item.item_name ? item.description : '',
    qty:    item.quantity,
    unit:   item.unit,
    price:  price,
    params
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

// -- SHARED HELPERS --------------------------------------------
function attachSubItems(positions) {
  positions.forEach(p => {
    if (p.item_id && p.item_type === 'ASM') {
      const rev = getActiveRevision(p.item_id);
      if (rev) p.sub_items = all('SELECT b.quantity,b.unit,i.item_number,i.name,i.item_type FROM bom b JOIN items i ON b.child_item_id=i.id WHERE b.parent_rev_id=? ORDER BY b.position', [rev.id]);
    }
  });
}

function computeTotals(doc) {
  doc.subtotal = doc.positions.reduce((s, p) => s + (p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100)), 0);
  doc.discount_amount = doc.subtotal * (doc.discount_pct||0) / 100;
  doc.net = doc.subtotal - doc.discount_amount;
  doc.tax_amount = doc.include_tax ? doc.net * (doc.tax_rate||19) / 100 : 0;
  doc.total = doc.net + doc.tax_amount;
}

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
