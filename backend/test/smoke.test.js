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

test('Zeiterfassung: Von–Bis wird gespeichert, nur Dauer löscht die Uhrzeiten', async () => {
  const o = await api('/api/orders', 'POST', { title: 'Zeittest' });
  const te = await api('/api/time-entries', 'POST',
    { order_id: o.id, date: '2026-10-20', hours: 3.5, start_time: '08:00', end_time: '11:30', description: 'Montage' });
  assert.deepStrictEqual([te.hours, te.start_time, te.end_time], [3.5, '08:00', '11:30']);
  const upd = await api(`/api/time-entries/${te.id}`, 'PUT', { date: '2026-10-20', hours: 3, description: 'Montage' });
  assert.deepStrictEqual([upd.hours, upd.start_time, upd.end_time], [3, null, null], 'nur Dauer: keine Uhrzeiten mehr');
  const bad = await api('/api/time-entries', 'POST', { order_id: o.id, hours: 1, start_time: '8 Uhr', end_time: '09:00' });
  assert.deepStrictEqual([bad.start_time, bad.end_time], [null, null], 'ungültige Uhrzeit wird nicht gespeichert');
  assert.strictEqual((await api(`/api/time-entries?order_id=${o.id}`)).length, 2);
});

test('Programmdateien: Browser fragt immer nach, lädt Unverändertes aber nicht neu', async () => {
  for (const f of ['/js/01-core.js', '/styles.css', '/']) {
    const r = await fetch(BASE + f);
    assert.strictEqual(r.headers.get('cache-control'), 'no-cache', `${f}: nach einem Update nie veraltet`);
    const etag = r.headers.get('etag');
    assert.ok(etag, `${f}: mit ETag`);
    // Wie der Browser beim Neuladen (fetch würde sonst selbst no-cache anhängen)
    const again = await fetch(BASE + f, { headers: { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } });
    assert.strictEqual(again.status, 304, `${f}: unverändert → 304 ohne Inhalt`);
  }
});

test('Firmenlogo: hochladen, abrufen, nicht in den Einstellungen, entfernen', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
  const r = await fetch(`${BASE}/api/settings/logo`, { method: 'POST', body: form });
  assert.strictEqual(r.status, 200);
  const s = await r.json();
  assert.ok(s.company_logo_at, 'Version gesetzt');
  assert.ok(!('company_logo' in s) && !('company_logo' in await api('/api/settings')), 'Bilddaten nicht bei jedem Seitenstart');
  const logo = await fetch(`${BASE}/api/settings/logo`);
  assert.strictEqual(logo.headers.get('content-type'), 'image/png');
  assert.match(logo.headers.get('content-security-policy'), /sandbox/);
  assert.ok(Buffer.from(await logo.arrayBuffer()).equals(png));
  // Über die normalen Einstellungen lässt sich das Logo nicht setzen
  await api('/api/settings', 'PUT', { company_logo: 'data:text/html;base64,PHNjcmlwdD4=', company_logo_at: '1' });
  assert.ok(Buffer.from(await (await fetch(`${BASE}/api/settings/logo`)).arrayBuffer()).equals(png));
  assert.strictEqual((await api('/api/settings')).company_logo_at, s.company_logo_at);
  const txt = new FormData();
  txt.append('file', new Blob(['hallo'], { type: 'text/plain' }), 'x.txt');
  assert.strictEqual((await fetch(`${BASE}/api/settings/logo`, { method: 'POST', body: txt })).status, 400);
  assert.ok(!(await api('/api/settings/logo', 'DELETE')).company_logo_at);
  assert.strictEqual((await fetch(`${BASE}/api/settings/logo`)).status, 404, 'ohne Logo: Belege wie bisher');
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

test('Verkaufspreis: nach Freigabe änderbar, Protokoll mit alt → neu und Grund', async () => {
  const p = await api('/api/projects', 'POST', { name: 'Preisprojekt' });
  const item = await api(`/api/projects/${p.id}/items`, 'POST', { name: 'Zukaufteil', item_type: 'part', default_price: 12.5 });
  const revId = (await api(`/api/items/${item.id}`)).revisions[0].id;
  await api(`/api/revisions/${revId}/status`, 'PUT', { status: 'REV' });
  await api(`/api/revisions/${revId}/status`, 'PUT', { status: 'REL' });
  const base = { name: item.name, description: '', source_url: null, classification: item.classification, weight_g: null };
  await api(`/api/items/${item.id}`, 'PUT', { ...base, default_price: 14.8, price_reason: 'Zulieferer teurer' });
  const d = await api(`/api/items/${item.id}`);
  assert.strictEqual(d.default_price, 14.8);
  assert.strictEqual(d.revisions.length, 1, 'keine neue Revision');
  assert.strictEqual(d.revisions[0].status, 'REL');
  const pr = d.changelog.filter(c => c.action === 'Preis geändert');
  assert.deepStrictEqual(pr.map(c => c.details), ['VP 12.50 → 14.80 CHF · Zulieferer teurer']);
  assert.ok(!d.changelog.some(c => c.action === 'Geändert'), 'nur der Preis geändert → kein zusätzliches „Geändert“');
});

test('Hinweise: je Art speichern, bleiben bei anderen Änderungen, Lieferschein nur mit Kundenhinweis', async () => {
  const p = await api('/api/projects', 'POST', { name: 'Hinweisprojekt' });
  const item = await api(`/api/projects/${p.id}/items`, 'POST', { name: 'Halter', item_type: 'part' });
  const base = { name: 'Halter', description: '', source_url: null, classification: item.classification, weight_g: null, default_price: null };
  await api(`/api/items/${item.id}`, 'PUT', { ...base, hint_design: '  Nicht tragend  ', hint_production: 'Nur PETG', hint_customer: 'Max. 60 °C' });
  await api(`/api/items/${item.id}`, 'PUT', { ...base, notes: 'egal' });
  let d = await api(`/api/items/${item.id}`);
  assert.deepStrictEqual([d.hint_design, d.hint_production, d.hint_customer], ['Nicht tragend', 'Nur PETG', 'Max. 60 °C'],
    'getrimmt und ohne Feld im Request unverändert');

  const del = await api('/api/deliveries', 'POST', { title: 'Hinweis-Lieferung' });
  await api(`/api/deliveries/${del.id}/items`, 'POST', { item_id: item.id, description: 'Halter', quantity: 1, unit: 'Stk' });
  const pa = (await api(`/api/deliveries/${del.id}`)).items[0];
  assert.deepStrictEqual([pa.hint_production, pa.hint_customer], ['Nur PETG', 'Max. 60 °C']);
  assert.ok(!('hint_design' in pa), 'Konstruktionshinweis nicht im Produktionsauftrag');
  const ls = (await api(`/api/deliveries/${del.id}/delivery-data`)).items[0];
  assert.strictEqual(ls.hint_customer, 'Max. 60 °C');
  assert.ok(!('hint_design' in ls) && !('hint_production' in ls), 'interne Hinweise gehen nicht auf den Lieferschein');

  await api(`/api/items/${item.id}`, 'PUT', { ...base, hint_production: '' });
  d = await api(`/api/items/${item.id}`);
  assert.strictEqual(d.hint_production, null);
  const log = d.changelog.filter(c => /hinweis/.test(c.action)).map(c => [c.action, c.details]).sort();
  assert.deepStrictEqual(log, [
    ['Fertigungshinweis entfernt', 'Nur PETG'], ['Fertigungshinweis gesetzt', 'Nur PETG'],
    ['Konstruktionshinweis gesetzt', 'Nicht tragend'], ['Kundenhinweis gesetzt', 'Max. 60 °C']]);
});

// Eigener Port 3989 — die übrigen 399x gehören anderen Testdateien
test('Datenbank: nicht mehr verwendete Spalte important_note wird beim Start entfernt', async () => {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-test-'));
  // Bestehende Datenbank kopieren und die alte Spalte samt Wert hineinsetzen
  for (let i = 0; i < 30 && !fs.existsSync(path.join(dataDir, 'plm.db')); i++) await new Promise(r => setTimeout(r, 100));
  const old = new SQL.Database(fs.readFileSync(path.join(dataDir, 'plm.db')));
  old.run('ALTER TABLE items ADD COLUMN important_note TEXT');
  old.run("UPDATE items SET important_note='alt'");
  fs.writeFileSync(path.join(dir, 'plm.db'), Buffer.from(old.export()));
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dir, PLM_PORT: '3989' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch('http://127.0.0.1:3989/api/stats'); break; }
      catch { await new Promise(r => setTimeout(r, 200)); }
    }
    // Der Server speichert verzögert — beim Beenden schreibt er alles weg
    const exited = new Promise(r => proc.once('exit', r));
    proc.kill();
    await exited;
    const cols = new SQL.Database(fs.readFileSync(path.join(dir, 'plm.db')))
      .exec('PRAGMA table_info(items)')[0].values.map(r => r[1]);
    assert.ok(!cols.includes('important_note'), 'Spalte entfernt');
    assert.ok(cols.includes('hint_customer'), 'neue Spalten da');
  } finally {
    proc.kill();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test('Automatisches Backup wurde beim Start angelegt', async () => {
  // Der Testserver startet mit leerer DB — Backup entsteht erst, wenn eine
  // plm.db existiert. Neustart-Szenario: zweiter Serverstart im selben DATA_DIR.
  // Erst dem ersten Server eine Schreibpause geben, damit er die DB flusht (Debounce 500ms).
  for (let i = 0; i < 30 && !fs.existsSync(path.join(dataDir, 'plm.db')); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  // Eigener Port: 3997 gehört workflow.test.js, das parallel laufen kann
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: '3994' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch('http://127.0.0.1:3994/api/stats'); break; }
      catch { await new Promise(r => setTimeout(r, 200)); }
    }
    const backupDir = path.join(dataDir, 'backups');
    const today = new Date().toISOString().slice(0, 10);
    assert.ok(fs.existsSync(path.join(backupDir, `plm-${today}.db`)), 'Tagesbackup existiert');
  } finally {
    proc.kill();
  }
});
