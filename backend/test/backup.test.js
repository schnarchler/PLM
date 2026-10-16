// Tests für Sicherungen: von Hand anlegen, auflisten, wiederherstellen (aus
// der Liste, als hochgeladene .db und als Gesamtexport-ZIP) und das
// Zurückholen gelöschter Dateien aus dem Papierkorb.
// Eigener Server, weil das Wiederherstellen die ganze Datenbank tauscht.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3996;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc, dataDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function uploadRestore(name, data) {
  const form = new FormData();
  form.append('file', new Blob([data]), name);
  const r = await fetch(`${BASE}/api/backups/restore-upload`, { method: 'POST', body: form });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-bak-'));
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

const projectNames = async () => (await api('/api/projects')).map(p => p.name);

test('Sicherung anlegen, wiederherstellen und gelöschte Datei zurückholen', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Vorher' });
  const it = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Teil', item_type: 'prt' });
  const rev = (await api(`/api/items/${it.id}`)).revisions[0];
  const form = new FormData();
  form.append('file', new Blob(['solid wichtig']), 'teil.stl');
  const ds = await (await fetch(`${BASE}/api/revisions/${rev.id}/datasets`, { method: 'POST', body: form })).json();

  const { name } = await api('/api/backups', 'POST');
  const list = await api('/api/backups');
  const entry = list.backups.find(b => b.name === name);
  assert.ok(entry, 'Sicherung erscheint in der Liste');
  assert.strictEqual(entry.kind, 'manuell');
  assert.strictEqual(entry.stats.ok, true);
  assert.strictEqual(entry.stats.projects, 1);

  // Danach: neues Projekt, Datei gelöscht (wandert in den Papierkorb)
  await api('/api/projects', 'POST', { name: 'Nachher' });
  await api(`/api/datasets/${ds.id}`, 'DELETE');
  assert.ok(fs.existsSync(path.join(dataDir, 'papierkorb', ds.filename)), 'gelöschte Datei liegt im Papierkorb');

  const res = await api(`/api/backups/${encodeURIComponent(name)}/restore`, 'POST');
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(await projectNames(), ['Vorher'], 'Stand der Sicherung ist zurück');
  assert.strictEqual(res.files.restored_from_trash, 1, 'Datei aus dem Papierkorb zurückgeholt');
  assert.strictEqual(res.files.missing, 0);
  const dl = await fetch(`${BASE}/api/datasets/${ds.id}/download`);
  assert.strictEqual(await dl.text(), 'solid wichtig');

  const after = await api('/api/backups');
  const safety = after.backups.find(b => b.name === res.safety_backup);
  assert.ok(safety && safety.kind === 'vor-wiederherstellung', 'vorheriger Stand wurde gesichert');
  assert.strictEqual(safety.stats.projects, 2);

  const history = await api('/api/changelog');
  assert.ok(history.some(h => h.action === 'Sicherung wiederhergestellt'), 'Wiederherstellen steht in der Historie');
});

test('Wiederherstellen aus Gesamtexport (ZIP) und Ablehnen ungültiger Dateien', async () => {
  const zip = Buffer.from(await (await fetch(`${BASE}/api/export`)).arrayBuffer());
  await api('/api/projects', 'POST', { name: 'Nach dem Export' });

  const bad = await uploadRestore('kaputt.db', 'keine Datenbank');
  assert.strictEqual(bad.status, 400);
  assert.ok((await projectNames()).includes('Nach dem Export'), 'ungültige Datei ändert nichts');
  assert.strictEqual((await uploadRestore('notiz.txt', 'x')).status, 400, 'falsches Format wird abgewiesen');

  const ok = await uploadRestore('plm-backup.zip', zip);
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(!(await projectNames()).includes('Nach dem Export'), 'Stand des Exports ist zurück');
});

test('Ältere Sicherung bekommt beim Wiederherstellen das aktuelle Schema', async () => {
  // Gelieferten Produktionsauftrag anlegen, dann eine Sicherung so
  // zurückbauen, als stamme sie aus der Zeit vor dem Fixieren.
  const proj = await api('/api/projects', 'POST', { name: 'Altbestand' });
  const it = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Altteil', item_type: 'prt' });
  const d = await api('/api/deliveries', 'POST', { title: 'Alte Lieferung' });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { description: 'Altteil', item_id: it.id });
  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'DELIVERED' });
  const { name } = await api('/api/backups', 'POST');

  const SQL = await require('sql.js')();
  const old = new SQL.Database(fs.readFileSync(path.join(dataDir, 'backups', name)));
  old.run('UPDATE delivery_items SET revision_id=NULL, rev_fixed=NULL');
  old.run("DELETE FROM applied_migrations WHERE key IN ('delivered-revisions-v1','changelog-german-v1','changelog-bom-v1')");
  // Historie wie vor der Umstellung (englisch) und wie nach einem Zwischenstand
  old.run("INSERT INTO changelog (entity_type,entity_id,action,details) VALUES ('revision',1,'BOM Add','alt'),('revision',1,'Stückliste: Revision','zwischen')");
  const buf = Buffer.from(old.export());
  old.close();

  const res = await uploadRestore('alt.db', buf);
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const pos = (await api(`/api/deliveries/${d.id}`)).items[0];
  assert.ok(pos.revision_id, 'Stand wird nachträglich ermittelt');
  assert.strictEqual(pos.rev_fixed, 'migration');
  const actions = (await api('/api/changelog?limit=500')).map(h => h.action);
  assert.ok(actions.includes('BOM: Position hinzugefügt'), 'englischer Eintrag übersetzt, BOM bleibt');
  assert.ok(actions.includes('BOM: Revision'), 'Zwischenstand „Stückliste: …“ zurück auf BOM');
  assert.ok(!actions.some(a => a.startsWith('Stückliste')));
});

test('Sicherung löschen', async () => {
  const { name } = await api('/api/backups', 'POST');
  await api(`/api/backups/${encodeURIComponent(name)}`, 'DELETE');
  assert.ok(!(await api('/api/backups')).backups.some(b => b.name === name));
  const r = await fetch(`${BASE}/api/backups/${encodeURIComponent('../plm.db')}`, { method: 'DELETE' });
  assert.notStrictEqual(r.status, 200, 'Pfade ausserhalb des Sicherungsordners sind tabu');
});
