// Kurzcode zum Aufdrucken auf 3D-Druckteile: Vergabe für neue und für
// bestehende Teile (ältere Datenbank), Suche über Kurzcode oder Etiketten-QR,
// Kurzcode im Produktionsauftrag. Dazu die Übernahme der Lieferanten-Adresse
// aus dem früheren Freitextfeld — beides braucht eine ältere Datenbank.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3994;
const BASE = `http://127.0.0.1:${PORT}`;
const CODE_RE = /^[34679ACDEFHJKMNPRTUWXY]{3}$/;
let serverProc, dataDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
const search = async q => (await api('/api/search?' + new URLSearchParams({ q }))).code_match;

// Datenbank im Stand von vor dem Kurzcode: items ohne Spalte short_code
async function writeOldDatabase(file) {
  const SQL = await require('sql.js')();
  const db = new SQL.Database();
  db.run(`CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    description TEXT, customer TEXT, pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)`);
  db.run(`CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, parent_id INTEGER,
    item_type TEXT NOT NULL, item_number TEXT NOT NULL, name TEXT NOT NULL, description TEXT, source_url TEXT,
    default_price REAL, created_at TEXT, UNIQUE(item_number))`);
  db.run(`CREATE TABLE revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, rev TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DFT', description TEXT, eco_reason TEXT, released_at TEXT, released_by TEXT,
    created_at TEXT, updated_at TEXT, UNIQUE(item_id, rev))`);
  db.run(`INSERT INTO projects (number,name) VALUES ('P0001','Alt')`);
  for (const n of ['P0001-prt-001', 'P0001-prt-002', 'P0001-asm-001']) {
    db.run('INSERT INTO items (project_id,item_type,item_number,name) VALUES (1,?,?,?)', [n.includes('asm') ? 'asm' : 'prt', n, 'Alt ' + n]);
    db.run(`INSERT INTO revisions (item_id,rev) VALUES (last_insert_rowid(),'1')`);
  }
  db.run(`CREATE TABLE suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE, name TEXT NOT NULL,
    contact_person TEXT, email TEXT, phone TEXT, address TEXT, notes TEXT, created_at TEXT)`);
  for (const [n, name, address] of [['LF-0001', 'Zeilen AG', 'Industriestr. 4\nCH-8000 Zürich\nSchweiz'],
    ['LF-0002', 'Komma GmbH', 'Musterweg 1, 3011 Bern'], ['LF-0003', 'Postfach SA', 'Postfach irgendwo']]) {
    db.run('INSERT INTO suppliers (number,name,address) VALUES (?,?,?)', [n, name, address]);
  }
  fs.writeFileSync(file, Buffer.from(db.export()));
  db.close();
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-kc-'));
  await writeOldDatabase(path.join(dataDir, 'plm.db'));
  serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(PORT) }, stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/stats'); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server startet nicht');
});

after(() => {
  serverProc?.kill();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
});

test('Kurzcode: bestehende Teile bekommen beim Start einen eindeutigen Code', async () => {
  const items = await Promise.all([1, 2, 3].map(id => api(`/api/items/${id}`)));
  for (const it of items) assert.match(it.short_code, CODE_RE, it.item_number);
  assert.strictEqual(new Set(items.map(i => i.short_code)).size, 3, 'keine Doppelten');
});

test('Kurzcode: neues Teil bekommt sofort einen Code, der bleibt', async () => {
  const p = await api('/api/projects', 'POST', { name: 'Druckteile' });
  const it = await api(`/api/projects/${p.id}/items`, 'POST', { name: 'Halter', item_type: 'prt' });
  assert.match(it.short_code, CODE_RE);
  await api(`/api/items/${it.id}`, 'PUT', { name: 'Halter links', description: '', classification: null });
  assert.strictEqual((await api(`/api/items/${it.id}`)).short_code, it.short_code, 'Code ändert sich nicht beim Bearbeiten');
});

test('Kurzcode-Suche: Code mit Revision in allen Schreibweisen', async () => {
  const it = await api('/api/items/1');
  const code = it.short_code;
  for (const q of [`${code}-1`, `${code.toLowerCase()} 1`, `${code} rev1`, `${code}.1`, ` ${code} - 1 `]) {
    const m = await search(q);
    assert.ok(m, `Treffer für "${q}"`);
    assert.strictEqual(m.item.id, 1, q);
    assert.strictEqual(m.revision?.rev, '1', q);
  }
  const bare = await search(code);
  assert.strictEqual(bare.item.id, 1);
  assert.strictEqual(bare.revision, null, 'ohne Revision kein Revisionstreffer');
  assert.strictEqual(bare.latest_revision.rev, '1');

  const missing = await search(`${code}-9`);
  assert.strictEqual(missing.item.id, 1, 'Teil wird trotzdem gefunden');
  assert.strictEqual(missing.revision, null);
  assert.strictEqual(missing.rev_requested, '9');
});

test('Kurzcode-Suche: volle Nummer mit Revision aus dem Etiketten-QR', async () => {
  for (const q of ['P0001-prt-002 rev1', 'p0001-prt-002_rev1', 'P0001-prt-002-rev1']) {
    const m = await search(q);
    assert.strictEqual(m?.item.item_number, 'P0001-prt-002', q);
    assert.strictEqual(m.revision?.rev, '1', q);
  }
});

test('Kurzcode-Suche: normale Suchwörter lösen keinen Code-Treffer aus', async () => {
  for (const q of ['Halter', 'P0001', 'PETG schwarz', 'P0001-prt-001']) assert.strictEqual(await search(q), null, q);
  const r = await api('/api/search?' + new URLSearchParams({ q: (await api('/api/items/2')).short_code }));
  assert.ok(r.items.some(i => i.id === 2), 'Code wird auch in der normalen Teilesuche gefunden');
});

test('Kurzcode im Produktionsauftrag mit der gelieferten Revision', async () => {
  const d = await api('/api/deliveries', 'POST', { title: 'Los 1' });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { item_id: 1, description: 'Teil', quantity: 4 });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { description: 'Freitext ohne Teil', quantity: 1 });
  const data = await api(`/api/deliveries/${d.id}/delivery-data`);
  const code = (await api('/api/items/1')).short_code;
  assert.strictEqual(data.items[0].short_code, code);
  assert.strictEqual(data.items[0].effective_rev.rev, '1');
  assert.strictEqual(data.items[1].short_code, null, 'Freitext-Position ohne Code');
  assert.strictEqual((await api(`/api/deliveries/${d.id}`)).items[0].short_code, code);
});

test('Lieferanten: Freitext-Adresse aus älterer Datenbank wird in Felder übernommen', async () => {
  const list = await api('/api/suppliers');
  const by = n => list.find(s => s.name === n);
  assert.deepStrictEqual(['street', 'postal_code', 'city', 'country'].map(k => by('Zeilen AG')[k]),
    ['Industriestr. 4', '8000', 'Zürich', 'Schweiz']);
  assert.deepStrictEqual(['street', 'postal_code', 'city', 'country'].map(k => by('Komma GmbH')[k]),
    ['Musterweg 1', '3011', 'Bern', '']);
  assert.strictEqual(by('Postfach SA').city, '', 'nicht zerlegbar → bleibt Freitext');
  assert.strictEqual(by('Postfach SA').address, 'Postfach irgendwo', 'nichts geht verloren');
  assert.deepStrictEqual(list.map(s => s.name), ['Komma GmbH', 'Postfach SA', 'Zeilen AG'], 'alphabetisch');

  // Speichern ohne Adressfelder lässt den Freitext stehen
  const ps = by('Postfach SA');
  await api(`/api/suppliers/${ps.id}`, 'PUT', { name: 'Postfach SA', contact_person: 'Neu', country: 'Schweiz' });
  assert.strictEqual((await api(`/api/suppliers/${ps.id}`)).address, 'Postfach irgendwo');
});
