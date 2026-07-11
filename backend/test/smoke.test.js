// Smoke-Tests für die kritischen API-Abläufe.
// Startet den Server mit einer leeren Wegwerf-Datenbank (PLM_DATA_DIR in tmp)
// und spielt die wichtigsten Workflows end-to-end durch.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc;
let dataDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-test-'));
  serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(PORT) },
    stdio: 'ignore',
  });
  // Warten bis der Server antwortet
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/api/stats'); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server nicht erreichbar auf Port ' + PORT);
});

after(() => {
  serverProc?.kill();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
});

test('Kunde und Auftrag anlegen', async () => {
  const c = await api('/api/customers', 'POST', { name: 'Testkunde GmbH' });
  assert.ok(c.id, 'Kunde bekommt eine ID');
  const o = await api('/api/orders', 'POST', { title: 'Gehäuse Serie B', customer_id: c.id });
  assert.match(o.number, /^AUF-\d{4}-\d+$/, 'Auftragsnummer im Format AUF-JJJJ-nnn');
  await api(`/api/orders/${o.id}/items`, 'POST', { description: 'Deckel PA12', quantity: 10, unit: 'Stk', unit_price: 12.5 });
  await api(`/api/orders/${o.id}/items`, 'POST', { description: 'Grundplatte', quantity: 5, unit: 'Stk', unit_price: 30 });
  const loaded = await api(`/api/orders/${o.id}`);
  assert.equal(loaded.items.length, 2);
});

test('Positions-Bearbeitung behält die PLM-Verknüpfung (item_id)', async () => {
  const p = await api('/api/projects', 'POST', { name: 'Testprojekt' });
  const item = await api(`/api/projects/${p.id}/items`, 'POST', { name: 'Testteil', item_type: 'part' });
  const o = await api('/api/orders', 'POST', { title: 'Verknüpfungstest' });
  const oi = await api(`/api/orders/${o.id}/items`, 'POST', { description: 'Teil X', quantity: 1, unit: 'Stk', unit_price: 5 });
  const updated = await api(`/api/order-items/${oi.id}`, 'PUT',
    { item_id: item.id, description: 'Teil X', quantity: 1, unit: 'Stk', unit_price: 5 });
  assert.equal(updated.item_id, item.id, 'item_id wird beim PUT gespeichert');
});

test('Produktionsauftrag: Positionen werden verknüpft übernommen', async () => {
  const orders = await api('/api/orders');
  const order = orders.find(o => o.title === 'Gehäuse Serie B');
  const d = await api(`/api/orders/${order.id}/to-delivery`, 'POST', {});
  assert.equal(d.order_id, order.id);
  const loaded = await api(`/api/deliveries/${d.id}`);
  assert.equal(loaded.items.length, 2);
  for (const di of loaded.items) assert.ok(di.order_item_id, 'Produktionsposition kennt ihre Auftragsposition');
});

test('Preis-Sync: Auftrag → Produktion', async () => {
  const orders = await api('/api/orders');
  const order = await api(`/api/orders/${orders.find(o => o.title === 'Gehäuse Serie B').id}`);
  const oi = order.items.find(i => i.description === 'Deckel PA12');
  const r = await api(`/api/order-items/${oi.id}`, 'PUT',
    { description: oi.description, quantity: oi.quantity, unit: oi.unit, unit_price: 14.9 });
  assert.equal(r.price_synced, 1, 'eine Produktionsposition synchronisiert');
  const deliveries = await api('/api/deliveries');
  const d = await api(`/api/deliveries/${deliveries[0].id}`);
  assert.equal(d.items.find(i => i.description === 'Deckel PA12').unit_price, 14.9);
});

test('Preis-Sync: Produktion → Auftrag', async () => {
  const deliveries = await api('/api/deliveries');
  const d = await api(`/api/deliveries/${deliveries[0].id}`);
  const di = d.items.find(i => i.description === 'Grundplatte');
  const r = await api(`/api/delivery-items/${di.id}`, 'PUT',
    { description: di.description, quantity: di.quantity, unit: di.unit, unit_price: 27.5 });
  assert.equal(r.price_synced, 1, 'Auftragsposition synchronisiert');
  const order = await api(`/api/orders/${d.order_id}`);
  assert.equal(order.items.find(i => i.description === 'Grundplatte').unit_price, 27.5);
});

test('Lager: Zugang, Abgang mit Referenz, Bestand korrekt', async () => {
  const inv = await api('/api/inventory', 'POST', { name: 'Schraube M4', category: 'Normteil', unit: 'Stk', min_qty: 0 });
  await api(`/api/inventory/${inv.id}/movement`, 'POST', { type: 'in', qty: 50, notes: 'Anfangsbestand' });
  await api(`/api/inventory/${inv.id}/movement`, 'POST', { type: 'out', qty: 5, reference: 'AUF-2026-001' });
  await api(`/api/inventory/${inv.id}/movement`, 'POST', { type: 'out', qty: 2, reference: 'Ausschuss Montage' });
  const item = await api(`/api/inventory/${inv.id}`);
  assert.equal(item.stock_qty, 43);
  const refs = item.movements.map(m => m.reference);
  assert.ok(refs.includes('AUF-2026-001') && refs.includes('Ausschuss Montage'));
});

test('Angebot → Auftrag konvertieren übernimmt Positionen', async () => {
  const q = await api('/api/quotes', 'POST', { title: 'Angebotstest' });
  await api(`/api/quotes/${q.id}/items`, 'POST', { description: 'Halter', quantity: 3, unit: 'Stk', unit_price: 8 });
  const o = await api(`/api/quotes/${q.id}/convert`, 'POST', {});
  const loaded = await api(`/api/orders/${o.id}`);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].unit_price, 8);
  const quote = await api(`/api/quotes/${q.id}`);
  assert.equal(quote.status, 'ACCEPTED');
});

test('Auftrag löschen entfernt auch die Positionen', async () => {
  const o = await api('/api/orders', 'POST', { title: 'Löschtest' });
  await api(`/api/orders/${o.id}/items`, 'POST', { description: 'Wegwerf', quantity: 1, unit: 'Stk', unit_price: 1 });
  await api(`/api/orders/${o.id}`, 'DELETE');
  const r = await fetch(`${BASE}/api/orders/${o.id}`);
  assert.equal(r.status, 404);
});

test('Datei-Upload hinterlegt den Original-Dateinamen als Notiz', async () => {
  const p = await api('/api/projects', 'POST', { name: 'Uploadprojekt' });
  const item = await api(`/api/projects/${p.id}/items`, 'POST', { name: 'Uploadteil', item_type: 'part' });
  const detail = await api(`/api/items/${item.id}`);
  const revId = detail.revisions[0].id;
  const fd = new FormData();
  fd.append('file', new Blob(['solid test'], { type: 'application/octet-stream' }), 'Gehäuse-Deckel_v3.stl');
  const r = await fetch(`${BASE}/api/revisions/${revId}/datasets`, { method: 'POST', body: fd });
  assert.ok(r.ok, 'Upload erfolgreich');
  const ds = await r.json();
  assert.equal(ds.notes, 'Gehäuse-Deckel_v3.stl', 'Originalname (inkl. Umlaut) als Notiz');
  assert.notEqual(ds.original_name, 'Gehäuse-Deckel_v3.stl', 'Datei wurde auf Artikelnr_revX umbenannt');
});

test('Automatisches Backup wurde beim Start angelegt', async () => {
  // Der Testserver startet mit leerer DB — Backup entsteht erst, wenn eine
  // plm.db existiert. Neustart-Szenario: zweiter Serverstart im selben DATA_DIR.
  // Erst dem ersten Server eine Schreibpause geben, damit er die DB flusht (Debounce 500ms).
  for (let i = 0; i < 30 && !fs.existsSync(path.join(dataDir, 'plm.db')); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: '3997' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch('http://127.0.0.1:3997/api/stats'); break; }
      catch { await new Promise(r => setTimeout(r, 200)); }
    }
    const backupDir = path.join(dataDir, 'backups');
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(fs.existsSync(path.join(backupDir, `plm-${today}.db`)), 'Tagesbackup existiert');
  } finally {
    proc.kill();
  }
});
