// Absicherung der Endpunkte, die Programme starten oder mit Pfaden aus der
// Anfrage arbeiten: Check-in löscht nur Checkout-Ordner, Import liest nur
// aus dem Checkout-Verzeichnis, Programme starten ohne Shell und nur für
// Anfragen von diesem PC, der CAD-Pfad steht in plm.config.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3992;
const BASE = `http://127.0.0.1:${PORT}`;
const skip = process.platform === 'win32' ? 'Schein-CAD ist ein Shell-Skript' : false;
let serverProc, tmp, dataDir, cfgFile, victim, coDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function status(url, method, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
// Anfrage mit frei wählbaren Kopfzeilen (Host, Origin) — fetch setzt den Host selbst
function raw(url, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body ?? {});
    const req = http.request({ host: '127.0.0.1', port: PORT, path: url, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
    res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers })); });
    req.on('error', reject);
    req.end(data);
  });
}
// Wie eine Webseite nach DNS-Rebinding: fremder Name, der auf 127.0.0.1 zeigt
const foreignHost = async (url, method, body) =>
  (await raw(url, method, body, { Host: 'boese.example:' + PORT, Origin: 'http://boese.example:' + PORT })).status;
// Wie eine fremde Webseite, die per JavaScript localhost anspricht
const foreignOrigin = (url, method, body) => raw(url, method, body, { Origin: 'https://boese.example' });
async function waitFor(fn, ms = 3000) {
  for (let t = 0; t < ms; t += 50) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); }
  return fn();
}

async function startServer() {
  serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(PORT), PLM_CONFIG: cfgFile }, stdio: 'ignore',
    cwd: tmp,   // eine Shell würde "touch" hier ausführen
  });
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/stats'); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server startet nicht');
}
async function stopServer() {
  if (!serverProc) return;
  const done = new Promise(r => serverProc.once('exit', r));
  serverProc.kill();
  await done;
  serverProc = null;
}

before(async () => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-sec-'));
  dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir);
  coDir = path.join(dataDir, 'checkout');
  // Ein fremder Ordner mit einer Datei, die nichts im PLM verloren hat
  victim = path.join(tmp, 'privat');
  fs.mkdirSync(victim);
  fs.writeFileSync(path.join(victim, 'geheim.txt'), 'geheim');
  fs.writeFileSync(path.join(victim, '.checkout.json'), JSON.stringify({ item_id: 1, item_number: 'X' }));
  cfgFile = path.join(tmp, 'plm.config');
  fs.writeFileSync(cfgFile, 'data_dir=' + dataDir + '\n');
  await startServer();
});

after(async () => {
  await stopServer();
  if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('Check-in löscht keinen Ordner ausserhalb des Checkout-Verzeichnisses', { skip }, async () => {
  fs.mkdirSync(coDir, { recursive: true });
  for (const folder of [victim, path.join(coDir, '..', '..', 'privat'), coDir, tmp]) {
    const r = await status('/api/checkout/checkin', 'POST', { folder });
    assert.strictEqual(r.status, 400, folder);
  }
  assert.ok(fs.existsSync(path.join(victim, 'geheim.txt')), 'fremder Ordner ist noch da');

  // Unterordner ohne .checkout.json (z.B. der Slicer-Ordner) bleibt auch stehen
  const slicer = path.join(coDir, 'Slicer');
  fs.mkdirSync(slicer, { recursive: true });
  assert.strictEqual((await status('/api/checkout/checkin', 'POST', { folder: slicer })).status, 400);
  assert.ok(fs.existsSync(slicer));
});

test('Check-in eines echten Checkouts funktioniert weiter', { skip }, async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Sicher' });
  const teil = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Teil', item_type: 'prt' });
  const rev = (await api(`/api/items/${teil.id}`)).revisions[0];
  const form = new FormData();
  form.append('file', new Blob(['solid a\nendsolid a\n']), 'teil.stl');
  await fetch(`${BASE}/api/revisions/${rev.id}/datasets`, { method: 'POST', body: form });
  const co = await api(`/api/items/${teil.id}/checkout`, 'POST', {});
  assert.ok(co.folder.startsWith(coDir));
  await api('/api/checkout/checkin', 'POST', { folder: co.folder });
  assert.ok(!fs.existsSync(co.folder), 'Checkout-Ordner ist weg');
});

test('Import liest nur Dateien aus dem Checkout-Verzeichnis', { skip }, async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Import' });
  const teil = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Teil', item_type: 'prt' });
  const co = path.join(coDir, 'ordner');
  fs.mkdirSync(co, { recursive: true });
  const r = await api('/api/checkout/import', 'POST',
    { mode: 'item', item_id: teil.id, folder: co, files: [{ name: '../../../privat/geheim.txt' }] });
  assert.strictEqual(r.count, 0, 'Pfad mit ../ wird übergangen');
  assert.strictEqual((await status('/api/checkout/import', 'POST',
    { mode: 'item', item_id: teil.id, folder: victim, files: [{ name: 'geheim.txt' }] })).status, 400);
  const neu = await status('/api/checkout/import', 'POST', { mode: 'new',
    new_item: { project_id: proj.id, item_type: 'prt', name: 'Klau', file_path: path.join(victim, 'geheim.txt'), file_name: 'geheim.txt' } });
  assert.strictEqual(neu.status, 400);
});

test('Import: Dateien auf oberster Ebene — neues Item, dann an das Item anhängen', { skip }, async () => {
  fs.mkdirSync(coDir, { recursive: true });
  const stl = path.join(coDir, 'Halter.stl');
  fs.writeFileSync(path.join(coDir, 'Halter.par'), 'par-inhalt');
  fs.writeFileSync(stl, 'solid halter\nendsolid halter\n');
  const neuName = async () => (await api('/api/checkout/scan')).root_files.map(f => f.name).filter(n => n.startsWith('Halter')).sort();
  assert.deepStrictEqual(await neuName(), ['Halter.par', 'Halter.stl']);

  const proj = await api('/api/projects', 'POST', { name: 'Oberste Ebene' });
  const { item_number } = await api('/api/checkout/import', 'POST', { mode: 'new', new_item: { project_id: proj.id,
    item_type: 'prt', name: 'Halter', file_path: path.join(coDir, 'Halter.par'), file_name: 'Halter.par', ds_type: 'CAD' } });
  const item = (await api('/api/items-all?q=' + encodeURIComponent(item_number)))[0];
  // So schickt es die Oberfläche: der Ordner der Datei, hier das Checkout-Verzeichnis selbst
  const r = await api('/api/checkout/import', 'POST',
    { mode: 'item', item_id: item.id, folder: coDir, files: [{ name: 'Halter.stl', ds_type: 'CAD' }] });
  assert.strictEqual(r.count, 1, 'angehängt, obwohl es keinen Ordner für das Item gibt');
  assert.strictEqual((await api(`/api/items/${item.id}`)).revisions[0].datasets.length, 2);
  assert.ok(fs.existsSync(stl), 'Datei bleibt, wo sie war');
  assert.ok(!fs.existsSync(path.join(coDir, '.checkout.json')), 'oberste Ebene wird kein Checkout');
  assert.deepStrictEqual(await neuName(), [], 'schon im PLM: nicht mehr als neu gemeldet');

  fs.writeFileSync(stl, 'solid HALTER\nendsolid halter\n');   // gleiche Grösse, anderer Inhalt
  assert.deepStrictEqual(await neuName(), ['Halter.stl'], 'geändert: wieder neu');

  const raus = await api('/api/checkout/import', 'POST',
    { mode: 'item', item_id: item.id, folder: coDir, files: [{ name: '../../privat/geheim.txt' }] });
  assert.ok(fs.existsSync(path.join(coDir, '../../privat/geheim.txt')), 'das Ziel gäbe es');
  assert.strictEqual(raus.count, 0, 'von der obersten Ebene führt kein ../ hinaus');
});

test('Ordner öffnen: nur Checkout-Ordner, nur von diesem PC', { skip }, async () => {
  assert.strictEqual((await status('/api/checkout/open', 'POST', { folder: victim })).status, 400);
  assert.strictEqual(await foreignHost('/api/checkout/open', 'POST', { folder: coDir }), 403);
});

test('Checkout-Verzeichnis lässt sich nur von diesem PC aus ändern', { skip }, async () => {
  assert.strictEqual(await foreignHost('/api/settings', 'PUT', { checkout_dir: tmp }), 403);
  assert.strictEqual((await api('/api/settings')).checkout_dir ?? '', '');
});

test('Fremde Webseiten können weder lesen noch schreiben', { skip }, async () => {
  const lesen = await foreignOrigin('/api/customers', 'GET');
  assert.strictEqual(lesen.status, 403);
  assert.strictEqual(lesen.headers['access-control-allow-origin'], undefined, 'keine CORS-Freigabe');
  const vorab = await foreignOrigin('/api/projects', 'OPTIONS');
  assert.strictEqual(vorab.headers['access-control-allow-origin'], undefined, 'Preflight ohne Freigabe');

  const vorher = (await api('/api/projects')).length;
  assert.strictEqual((await foreignOrigin('/api/projects', 'POST', { name: 'Eingeschleust' })).status, 403);
  assert.strictEqual(await foreignHost('/api/projects', 'POST', { name: 'Rebinding' }), 403);
  assert.strictEqual((await api('/api/projects')).length, vorher, 'nichts angelegt');

  // Die eigene Oberfläche schickt ihre Herkunft mit — gleiche Herkunft geht durch
  const eigen = await raw('/api/projects', 'POST', { name: 'Eigene Oberfläche' }, { Origin: BASE, Host: '127.0.0.1:' + PORT });
  assert.strictEqual(eigen.status, 200);
  assert.strictEqual((await raw('/api/stats', 'GET', null, { Host: 'localhost:' + PORT })).status, 200);
});

test('CAD: Pfad aus plm.config, Start ohne Shell, nur von diesem PC', { skip }, async () => {
  assert.strictEqual((await api('/api/cad')).configured, false);
  assert.strictEqual((await status('/api/launch-cad', 'POST')).status, 400);

  // Ein Programmname mit $( ) — eine Shell führt das auch in "…" aus (so lief der alte Start)
  const log = path.join(tmp, 'cad.log');
  const pwned = path.join(tmp, 'gehackt');
  const cad = path.join(tmp, 'cad $(touch gehackt)');
  fs.writeFileSync(cad, `#!/bin/sh\necho gestartet > '${log}'\n`);
  fs.chmodSync(cad, 0o755);
  fs.appendFileSync(cfgFile, 'cad_path=' + cad + '\n');

  const st = await api('/api/cad');
  assert.deepStrictEqual([st.configured, st.found, st.where, st.local], [true, true, cad, true]);
  assert.strictEqual(await foreignHost('/api/launch-cad', 'POST'), 403);
  await api('/api/launch-cad', 'POST');
  assert.ok(await waitFor(() => fs.existsSync(log)), 'Programm wurde gestartet');
  assert.ok(!fs.existsSync(pwned), 'keine Shell');
});

test('CAD: alter Pfad aus der Datenbank wandert beim Start nach plm.config', { skip }, async () => {
  fs.writeFileSync(cfgFile, 'data_dir=' + dataDir + '\n');
  const cad = path.join(tmp, 'altes-cad');
  fs.writeFileSync(cad, '#!/bin/sh\n'); fs.chmodSync(cad, 0o755);
  await api('/api/settings', 'PUT', { cad_path: cad });
  const vorher = await api('/api/cad');
  assert.strictEqual(vorher.configured, false, 'die Datenbank zählt nicht mehr');
  assert.strictEqual(vorher.legacy_path, cad);

  await stopServer();
  await startServer();
  assert.match(fs.readFileSync(cfgFile, 'utf8'), new RegExp('^cad_path=' + cad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'));
  const nachher = await api('/api/cad');
  assert.deepStrictEqual([nachher.configured, nachher.found, nachher.legacy_path], [true, true, null]);
});

test('Version: aus package.json und Git', { skip }, async () => {
  const v = await api('/api/version');
  const pkg = require('../package.json').version.split('.').slice(0, 2).join('.');
  assert.ok(v.version === require('../package.json').version || v.version.startsWith(pkg + '.'), v.version);
  if (v.commit) assert.match(v.commit, /^[0-9a-f]{7,}$/);
  assert.strictEqual(v.data_dir, dataDir);
});
