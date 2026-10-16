// „Im Slicer öffnen": Erkennung des Slicers, Arbeitskopie mit Kurzcode im
// Namen, Schutz einer im Slicer veränderten Kopie, Fehlerfälle. Statt eines
// echten Slicers liegt ein Skript namens prusa-slicer vorn im PATH, das
// seine Argumente in eine Datei schreibt.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3993;
const BASE = `http://127.0.0.1:${PORT}`;
const skip = process.platform === 'win32' ? 'Schein-Slicer ist ein Shell-Skript' : false;
let serverProc, tmp, dataDir, cfgFile, logFile;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function apiStatus(url, method, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
async function upload(revId, name, content) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  const r = await fetch(`${BASE}/api/revisions/${revId}/datasets`, { method: 'POST', body: form });
  assert.ok(r.ok, `Upload fehlgeschlagen: ${r.status}`);
  return r.json();
}
async function waitFor(fn, ms = 3000) {
  for (let t = 0; t < ms; t += 50) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); }
  return fn();
}

const STL = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n';

before(async () => {
  if (skip) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-sl-'));
  dataDir = path.join(tmp, 'data');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(dataDir); fs.mkdirSync(bin);
  logFile = path.join(tmp, 'slicer.log');
  const fake = path.join(bin, 'prusa-slicer');
  fs.writeFileSync(fake, `#!/bin/sh\nprintf '%s\\n' "$@" > '${logFile}'\n`);
  fs.chmodSync(fake, 0o755);
  // Eigene Konfigdatei — die echte plm.config könnte auf einen echten Slicer zeigen
  cfgFile = path.join(tmp, 'plm.config');
  fs.writeFileSync(cfgFile, 'bambustudio=/gibt/es/nicht/bambu-studio\n');
  serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(PORT), PLM_CONFIG: cfgFile,
      PATH: bin + path.delimiter + process.env.PATH },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/api/stats'); return; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server startet nicht');
});

after(() => {
  serverProc?.kill();
  if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

let item, rev, stl;

test('Slicer: installierter wird gefunden und ohne Wahl genommen', { skip }, async () => {
  const st = await api('/api/slicers');
  const prusa = st.slicers.find(s => s.id === 'prusa');
  assert.strictEqual(prusa.found, true);
  assert.strictEqual(prusa.where, path.join(tmp, 'bin', 'prusa-slicer'));
  const bambu = st.slicers.find(s => s.id === 'bambu');
  assert.strictEqual(bambu.found, false, 'falscher Pfad in plm.config');
  assert.match(bambu.error, /plm\.config/);
  assert.strictEqual(st.chosen, '');
  assert.strictEqual(st.active, 'prusa');
  assert.strictEqual(st.local, true);
});

test('Slicer: Arbeitskopie trägt den Kurzcode, der Slicer bekommt sie', { skip }, async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Slicer' });
  item = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Halter links', item_type: 'prt' });
  const full = await api(`/api/items/${item.id}`);
  rev = full.revisions[0];
  stl = await upload(rev.id, 'halter.stl', STL);

  const r = await api(`/api/datasets/${stl.id}/open-in-slicer`, 'POST', {});
  assert.strictEqual(r.slicer, 'PrusaSlicer');
  assert.strictEqual(r.kept, false);
  assert.strictEqual(r.file, path.join(dataDir, 'checkout', 'Slicer', `${full.short_code}-${rev.rev}_Halter_links.stl`));
  assert.strictEqual(fs.readFileSync(r.file, 'utf8'), STL);
  const args = await waitFor(() => fs.existsSync(logFile) && fs.readFileSync(logFile, 'utf8'));
  assert.strictEqual(args, r.file + '\n', 'Pfad als ein Argument, ohne Shell');
});

test('Slicer: eine im Slicer veränderte Arbeitskopie wird nicht überschrieben', { skip }, async () => {
  const first = await api(`/api/datasets/${stl.id}/open-in-slicer`, 'POST', {});
  assert.strictEqual(first.kept, false, 'unverändert → einfach wieder öffnen');
  fs.writeFileSync(first.file, 'im Slicer gespeichert');
  const again = await api(`/api/datasets/${stl.id}/open-in-slicer`, 'POST', {});
  assert.strictEqual(again.kept, true);
  assert.strictEqual(fs.readFileSync(again.file, 'utf8'), 'im Slicer gespeichert');
});

test('Slicer: zweites Modell gleichen Typs bekommt eine Nummer', { skip }, async () => {
  const second = await upload(rev.id, 'halter-b.stl', STL + ' ');
  const r = await api(`/api/datasets/${second.id}/open-in-slicer`, 'POST', {});
  assert.match(path.basename(r.file), /_Halter_links_2\.stl$/);
});

test('Slicer: Fehlerfälle', { skip }, async () => {
  const txt = await upload(rev.id, 'notiz.txt', 'hallo');
  const wrongType = await apiStatus(`/api/datasets/${txt.id}/open-in-slicer`, 'POST');
  assert.strictEqual(wrongType.status, 400);
  assert.match(wrongType.body.error, /\.txt lässt sich im Slicer nicht öffnen/);

  await api('/api/settings', 'PUT', { slicer: 'bambu' });
  assert.strictEqual((await api('/api/slicers')).active, 'bambu', 'die Wahl gilt, auch wenn er fehlt');
  const missing = await apiStatus(`/api/datasets/${stl.id}/open-in-slicer`, 'POST');
  assert.strictEqual(missing.status, 400);
  assert.match(missing.body.error, /Bambu Studio nicht gefunden/);
  await api('/api/settings', 'PUT', { slicer: 'prusa' });
});

test('Konfigdatei: über das Datenpfad-Feld kommt keine zusätzliche Zeile hinein', { skip }, async () => {
  await api('/api/data-path', 'PUT', { data_dir: dataDir + '\nprusaslicer=/bin/sh' });
  const lines = fs.readFileSync(cfgFile, 'utf8').split('\n');
  assert.ok(!lines.some(l => l.startsWith('prusaslicer=')), lines.join(' | '));
  assert.ok(lines.includes('data_dir=' + dataDir + 'prusaslicer=/bin/sh'), 'Wert ohne Umbruch');
});
