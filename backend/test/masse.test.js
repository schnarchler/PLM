// Aussenmasse aus STL-Dateien fürs Datenblatt: ASCII und binär (auch mit
// „solid" im Kopf), unlesbare Dateien, andere Dateitypen, Übernahme in eine
// neue Revision.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3991;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc, dataDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function upload(revId, name, content) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  const r = await fetch(`${BASE}/api/revisions/${revId}/datasets`, { method: 'POST', body: form });
  assert.ok(r.ok, `Upload fehlgeschlagen: ${r.status}`);
  return r.json();
}
const dimsOf = (item, dsId) => item.revisions.flatMap(r => r.datasets).find(d => d.id === dsId)?.dims;

// Binäre STL; der Kopf beginnt absichtlich mit „solid" wie bei vielen Exporten
function binarySTL(tris) {
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write('solid binaer aus dem CAD', 0, 'latin1');
  buf.writeUInt32LE(tris.length, 80);
  tris.forEach((t, i) => t.flat().forEach((v, k) => buf.writeFloatLE(v, 84 + i * 50 + 12 + k * 4)));
  return buf;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-ms-'));
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

test('Aussenmasse: ASCII- und binäre STL, unlesbare und andere Dateien', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Masse' });
  const item = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Lagerdeckel', item_type: 'prt' });
  const rev = (await api(`/api/items/${item.id}`)).revisions[0];

  const ascii = await upload(rev.id, 'deckel.stl',
    'solid t\nfacet normal 0 0 1\nouter loop\nvertex -21 -21 0\nvertex 21 -21 0\nvertex 0 21 6.5\nendloop\nendfacet\nendsolid t\n');
  const bin = await upload(rev.id, 'halter.stl', binarySTL([
    [[-10, 0, 0], [20, 0, 0], [0, 5, 0]],
    [[0, 0, 0], [0, 5, 12.25], [5, 5, 3]],
  ]));
  const kaputt = await upload(rev.id, 'leer.stl', 'solid leer\nendsolid leer\n');
  const pdf = await upload(rev.id, 'zeichnung.pdf', '%PDF-1.4 nichts');

  const full = await api(`/api/items/${item.id}`);
  assert.deepStrictEqual(dimsOf(full, ascii.id), [42, 42, 6.5]);
  assert.deepStrictEqual(dimsOf(full, bin.id), [30, 5, 12.25]);
  assert.strictEqual(dimsOf(full, kaputt.id), null);
  assert.strictEqual(dimsOf(full, pdf.id), null);

  // Zweiter Abruf liest aus der DB und liefert dasselbe
  assert.deepStrictEqual(dimsOf(await api(`/api/items/${item.id}`), ascii.id), [42, 42, 6.5]);

  // Neue Revision: die kopierte STL hat dieselben Masse
  const rev2 = await api(`/api/items/${item.id}/revisions`, 'POST', {});
  const after2 = await api(`/api/items/${item.id}`);
  const copied = after2.revisions.find(r => r.id === rev2.id).datasets.filter(d => d.dims);
  assert.deepStrictEqual(copied.map(d => d.dims).sort((a, b) => a[0] - b[0]), [[30, 5, 12.25], [42, 42, 6.5]]);
});
