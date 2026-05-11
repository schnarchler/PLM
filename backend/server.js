const express  = require('express');
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
    print_duration REAL
  )`);
  // Migrate: add cost columns if they don't exist yet
  try { db.run('ALTER TABLE print_settings ADD COLUMN printer_cost_hr REAL'); } catch(e) {}
  try { db.run('ALTER TABLE print_settings ADD COLUMN filament_price_kg REAL'); } catch(e) {}
  try { db.run('ALTER TABLE print_settings ADD COLUMN filament_weight_total REAL'); } catch(e) {}
  try { db.run('ALTER TABLE print_settings ADD COLUMN part_weight REAL'); } catch(e) {}
  try { db.run('ALTER TABLE print_settings ADD COLUMN print_duration REAL'); } catch(e) {}

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
  try { db.run('ALTER TABLE customers ADD COLUMN street TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE customers ADD COLUMN postal_code TEXT'); } catch(e) {}
  try { db.run('ALTER TABLE customers ADD COLUMN city TEXT'); } catch(e) {}
  try { db.run("ALTER TABLE customers ADD COLUMN country TEXT DEFAULT 'Deutschland'"); } catch(e) {}

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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  try { db.run('ALTER TABLE orders ADD COLUMN tax_rate REAL DEFAULT 19'); } catch(e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN discount_pct REAL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE orders ADD COLUMN payment_terms TEXT'); } catch(e) {}

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
  try { db.run('ALTER TABLE order_items ADD COLUMN discount_pct REAL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE order_items ADD COLUMN notes TEXT'); } catch(e) {}

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
    notes TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER DEFAULT 0
  )`);
  db.run(`INSERT OR IGNORE INTO counters VALUES ('project',0),('customer',0),('order',0),('quote',0)`);

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

function nextAsmNumber(projectId) {
  const rows = all("SELECT item_number FROM items WHERE project_id=? AND item_type='ASM'", [projectId]);
  const nums = rows.map(r => { const m = r.item_number.match(/-ASM-(\d+)$/); return m ? parseInt(m[1]) : 0; });
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
    p.item_count = (get('SELECT COUNT(*) as c FROM items WHERE project_id=?', [p.id]) || {c:0}).c;
    p.asm_count  = (get("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='ASM'", [p.id]) || {c:0}).c;
    p.prt_count  = (get("SELECT COUNT(*) as c FROM items WHERE project_id=? AND item_type='PRT'", [p.id]) || {c:0}).c;
    p.file_count = (get('SELECT COUNT(*) as c FROM datasets d JOIN revisions r ON d.revision_id=r.id JOIN items i ON r.item_id=i.id WHERE i.project_id=?', [p.id]) || {c:0}).c;
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
  const { name, description, item_type, parent_id } = req.body;
  if (!name || !item_type) return res.status(400).json({ error: 'name and item_type required' });
  const project = get('SELECT * FROM projects WHERE id=?', [req.params.projectId]);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  let item_number;
  if (item_type === 'ASM') {
    item_number = project.number + '-ASM-' + nextAsmNumber(project.id);
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

  const itemId = runGetId('INSERT INTO items (project_id,parent_id,item_type,item_number,name,description) VALUES (?,?,?,?,?,?)',
    [project.id, parent_id || null, item_type, item_number, name, description || '']);
  run('INSERT INTO revisions (item_id,rev,status,description) VALUES (?,?,?,?)', [itemId, 'A', 'DFT', 'Initial revision']);
  log('item', itemId, 'Created', item_type + ' ' + item_number + ' Rev A');
  res.json(get('SELECT * FROM items WHERE id=?', [itemId]));
});

app.put('/api/items/:id', (req, res) => {
  const { name, description } = req.body;
  run('UPDATE items SET name=?,description=? WHERE id=?', [name, description, req.params.id]);
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
  const orders = all('SELECT o.*,c.name as customer_name FROM orders o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.number DESC');
  orders.forEach(o => { o.items = all('SELECT * FROM order_items WHERE order_id=?', [o.id]); });
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer_id, title, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextOrderNumber();
  const id = runGetId('INSERT INTO orders (number,customer_id,title,notes,order_date,delivery_date,tax_rate,discount_pct,payment_terms) VALUES (?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, title, notes||'', order_date||null, delivery_date||null, tax_rate??19, discount_pct??0, payment_terms||'']);
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
  const { customer_id, title, status, notes, order_date, delivery_date, tax_rate, discount_pct, payment_terms } = req.body;
  run(`UPDATE orders SET customer_id=?,title=?,status=?,notes=?,order_date=?,delivery_date=?,
    tax_rate=?,discount_pct=?,payment_terms=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id, title, status, notes, order_date, delivery_date,
     tax_rate??19, discount_pct??0, payment_terms||'', req.params.id]);
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
  const quotes = all('SELECT q.*,c.name as customer_name FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id ORDER BY q.number DESC');
  quotes.forEach(q => { q.items = all('SELECT * FROM quote_items WHERE quote_id=?', [q.id]); });
  res.json(quotes);
});

app.post('/api/quotes', (req, res) => {
  const { customer_id, title, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const number = nextQuoteNumber();
  const id = runGetId('INSERT INTO quotes (number,customer_id,title,notes,quote_date,valid_until,tax_rate,discount_pct,payment_terms) VALUES (?,?,?,?,?,?,?,?,?)',
    [number, customer_id||null, title, notes||'', quote_date||null, valid_until||null, tax_rate??19, discount_pct??0, payment_terms||'30 Tage netto']);
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
  const { customer_id, title, status, notes, quote_date, valid_until, tax_rate, discount_pct, payment_terms } = req.body;
  run(`UPDATE quotes SET customer_id=?,title=?,status=?,notes=?,quote_date=?,valid_until=?,
    tax_rate=?,discount_pct=?,payment_terms=?,updated_at=datetime('now') WHERE id=?`,
    [customer_id, title, status, notes, quote_date, valid_until,
     tax_rate??19, discount_pct??0, payment_terms||'', req.params.id]);
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
  const orderId = runGetId(`INSERT INTO orders (number,customer_id,title,notes,order_date,tax_rate,discount_pct,payment_terms)
    VALUES (?,?,?,?,date('now'),?,?,?)`,
    [number, q.customer_id, q.title, q.notes||'', q.tax_rate, q.discount_pct, q.payment_terms||'']);
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
    projects:   (get('SELECT COUNT(*) as c FROM projects') || {c:0}).c,
    items:      (get('SELECT COUNT(*) as c FROM items') || {c:0}).c,
    assemblies: (get("SELECT COUNT(*) as c FROM items WHERE item_type='ASM'") || {c:0}).c,
    parts:      (get("SELECT COUNT(*) as c FROM items WHERE item_type='PRT'") || {c:0}).c,
    datasets:   (get('SELECT COUNT(*) as c FROM datasets') || {c:0}).c,
    customers:  (get('SELECT COUNT(*) as c FROM customers') || {c:0}).c,
    orders:     (get('SELECT COUNT(*) as c FROM orders') || {c:0}).c,
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
  const items = all(`SELECT i.id, i.item_number, i.name, i.item_type,
    p.name as project_name, p.number as project_number
    FROM items i JOIN projects p ON i.project_id=p.id
    WHERE i.item_number LIKE ? OR i.name LIKE ?
    ORDER BY i.item_number LIMIT 40`, [q, q]);
  items.forEach(i => { i.latest_revision = getLatestRevision(i.id); });
  res.json(items);
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
  const rows = all('SELECT key, value FROM settings');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

app.put('/api/settings', (req, res) => {
  const entries = Object.entries(req.body);
  entries.forEach(([k, v]) => {
    db.run('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v??'')]);
  });
  saveDb();
  const rows = all('SELECT key, value FROM settings');
  const obj = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

// -- SHUTDOWN --------------------------------------------------
app.post('/api/shutdown', (req, res) => {
  res.json({ ok: true, message: 'Server wird beendet...' });
  setTimeout(() => {
    console.log('Server wird per Browser-Befehl beendet.');
    process.exit(0);
  }, 500);
});

// -- INVOICE DATA ----------------------------------------------
app.get('/api/orders/:id/invoice-data', (req, res) => {
  const o = get(`SELECT o.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM orders o LEFT JOIN customers c ON o.customer_id=c.id WHERE o.id=?`, [req.params.id]);
  if (!o) return res.status(404).json({ error: 'Not found' });
  o.positions = all('SELECT oi.*,i.item_number FROM order_items oi LEFT JOIN items i ON oi.item_id=i.id WHERE oi.order_id=?', [o.id]);
  o.subtotal = o.positions.reduce((s, p) => s + (p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100)), 0);
  o.discount_amount = o.subtotal * (o.discount_pct||0) / 100;
  o.net = o.subtotal - o.discount_amount;
  o.tax_amount = o.net * (o.tax_rate||19) / 100;
  o.total = o.net + o.tax_amount;
  res.json(o);
});

// -- QUOTE DATA ------------------------------------------------
app.get('/api/quotes/:id/quote-data', (req, res) => {
  const q = get(`SELECT q.*,c.name as customer_name,c.email as customer_email,
    c.street as customer_street,c.postal_code as customer_postal_code,
    c.city as customer_city,c.country as customer_country,c.number as customer_number
    FROM quotes q LEFT JOIN customers c ON q.customer_id=c.id WHERE q.id=?`, [req.params.id]);
  if (!q) return res.status(404).json({ error: 'Not found' });
  q.positions = all('SELECT qi.*,i.item_number FROM quote_items qi LEFT JOIN items i ON qi.item_id=i.id WHERE qi.quote_id=?', [q.id]);
  q.subtotal = q.positions.reduce((s, p) => s + (p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100)), 0);
  q.discount_amount = q.subtotal * (q.discount_pct||0) / 100;
  q.net = q.subtotal - q.discount_amount;
  q.tax_amount = q.net * (q.tax_rate||19) / 100;
  q.total = q.net + q.tax_amount;
  res.json(q);
});

app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// -- START ------------------------------------------------------
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  3D-PLM v2 laeuft auf http://localhost:' + PORT);
    console.log('  Datenpfad: ' + DATA_DIR);
    console.log('');
  });
}).catch(err => {
  console.error('Fehler beim Starten:', err);
  process.exit(1);
});
