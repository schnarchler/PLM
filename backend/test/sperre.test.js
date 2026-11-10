// Geteiltes Datenverzeichnis (Netzlaufwerk, mehrere PCs): Es arbeitet immer
// nur ein PLM mit den Daten. Ein zweites wartet, bis es übernimmt; das erste
// speichert danach nichts mehr. Wurde plm.db von aussen geändert, wird sie
// nicht überschrieben — Ungespeichertes landet als Sicherung in backups/.
// Das Checkout-Verzeichnis steht pro PC in plm.config.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Eigener Bereich, weit weg von den Ports der anderen Testdateien
const BASE_PORT = 4200;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-sperre-'));
const procs = [];

function start(dataDir, port, cfg = dataDir + '.config') {
  fs.mkdirSync(dataDir, { recursive: true });
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(port), PLM_CONFIG: cfg, PLM_OPEN_BROWSER: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const s = { proc, port, out: '', base: `http://127.0.0.1:${port}` };
  proc.stdout.on('data', d => { s.out += d; });
  proc.stderr.on('data', d => { s.out += d; });
  s.exited = new Promise(r => proc.once('exit', r));
  procs.push(proc);
  return s;
}
// Der Server lauscht auch, wenn er auf die Sperre wartet
async function up(s) {
  for (let i = 0; i < 100; i++) {
    if (s.proc.exitCode !== null) throw new Error('Server beendet: ' + s.out);
    if (/laeuft auf http/.test(s.out)) return s;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht: ' + s.out);
}
async function stop(s) { if (s.proc.exitCode === null) { s.proc.kill(); await s.exited; } }
async function call(s, url, method = 'GET', body) {
  const r = await fetch(s.base + url, { method, body: body && JSON.stringify(body),
    headers: body ? { 'Content-Type': 'application/json' } : {} });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function ok(s, url, method = 'GET', body) {
  const r = await call(s, url, method, body);
  assert.strictEqual(r.status, 200, `${method} ${url}: ${JSON.stringify(r.body)}`);
  return r.body;
}
const names = async s => (await ok(s, '/api/projects')).map(p => p.name).sort();
async function until(fn, ms = 5000) {
  for (let t = 0; t < ms; t += 50) { const v = await fn(); if (v) return v; await new Promise(r => setTimeout(r, 50)); }
  return fn();
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Die Ausgabe kommt in Stücken — auf die Zeile warten, nicht nur nachsehen
async function printed(s, re) {
  await until(() => re.test(s.out), 3000);
  assert.match(s.out, re);
}

// plm.db direkt lesen und ändern — wie ein anderer PC über das Netzlaufwerk
let SQL;
const sqlJs = async () => SQL || (SQL = await require('sql.js')());
async function dbNames(file) {
  const db = new (await sqlJs()).Database(fs.readFileSync(file));
  try { return (db.exec('SELECT name FROM projects')[0]?.values || []).map(r => r[0]).sort(); }
  finally { db.close(); }
}
// Die geänderte Fassung vorbereiten; geschrieben wird sie erst beim Aufruf
// der zurückgegebenen Funktion — dann geht es schnell (neue Datei, umbenennen)
async function foreignDb(file, stmt) {
  const db = new (await sqlJs()).Database(fs.readFileSync(file));
  db.run(stmt);
  const buf = Buffer.from(db.export());
  db.close();
  return () => { fs.writeFileSync(file + '.fremd', buf); fs.renameSync(file + '.fremd', file); };
}
const editDb = async (file, stmt) => (await foreignDb(file, stmt))();

after(async () => {
  for (const p of procs) if (p.exitCode === null) p.kill();
  await new Promise(r => setTimeout(r, 300));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('Sperre: ein zweites PLM wartet, Übernehmen lädt den aktuellen Stand, das erste speichert nichts mehr', async () => {
  const dir = path.join(tmp, 'geteilt');
  const dbFile = path.join(dir, 'plm.db');
  const a = await up(start(dir, BASE_PORT));
  await ok(a, '/api/projects', 'POST', { name: 'Von A' });
  await until(async () => fs.existsSync(dbFile) && (await dbNames(dbFile)).includes('Von A'));

  const b = await up(start(dir, BASE_PORT + 1, path.join(tmp, 'geteilt-b.config')));
  await printed(b, /Die Daten sind in Benutzung: PLM auf diesem PC/);
  const waiting = await call(b, '/api/stats');
  assert.strictEqual(waiting.status, 409);
  assert.deepStrictEqual([waiting.body.lock.mode, waiting.body.lock.holder.port, waiting.body.lock.holder.this_pc],
    ['waiting', a.port, true]);
  assert.strictEqual((await call(b, '/api/version')).status, 200, 'Version geht auch beim Warten');

  assert.strictEqual((await ok(b, '/api/lock/takeover', 'POST')).mode, 'own');
  assert.deepStrictEqual(await names(b), ['Von A']);
  await ok(b, '/api/projects', 'POST', { name: 'Von B' });
  await until(async () => (await dbNames(dbFile)).includes('Von B'));

  // Zurück am ersten PC: schon das Lesen merkt es — der Stand dort ist alt
  const read = await call(a, '/api/projects');
  assert.deepStrictEqual([read.status, read.body.lock.mode], [409, 'lost']);
  const lost = await ok(a, '/api/lock');
  assert.deepStrictEqual([lost.mode, lost.reason, lost.holder.port], ['lost', 'takeover', b.port]);
  const refused = await call(a, '/api/projects', 'POST', { name: 'Zu spät' });
  assert.deepStrictEqual([refused.status, refused.body.lock.mode], [409, 'lost']);

  // Zurück am ersten PC: „Hier weiterarbeiten“ lädt, was B gespeichert hat
  assert.strictEqual((await ok(a, '/api/lock/takeover', 'POST')).mode, 'own');
  assert.deepStrictEqual(await names(a), ['Von A', 'Von B']);
  assert.strictEqual((await ok(b, '/api/lock')).mode, 'lost');

  // Beenden gibt die Sperre nur frei, wenn sie einem gehört
  await stop(b);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'plm.lock'), 'utf8')).port, a.port);
  await stop(a);
  assert.ok(!fs.existsSync(path.join(dir, 'plm.lock')), 'Sperre freigegeben');
  assert.deepStrictEqual(await dbNames(dbFile), ['Von A', 'Von B']);
});

test('Sperre: plm.db von aussen geändert — nichts überschreiben, Ungespeichertes als Sicherung', async () => {
  const dir = path.join(tmp, 'sync');
  const dbFile = path.join(dir, 'plm.db');
  const s = await up(start(dir, BASE_PORT + 2));
  await ok(s, '/api/projects', 'POST', { name: 'Gespeichert' });
  await until(async () => fs.existsSync(dbFile) && (await dbNames(dbFile)).includes('Gespeichert'));

  // Noch nicht gespeichert (PLM wartet 500 ms) — da schreibt ein anderer PC plm.db
  const writeForeign = await foreignDb(dbFile, "INSERT INTO projects (number, name) VALUES ('900', 'Von aussen')");
  await ok(s, '/api/projects', 'POST', { name: 'Ungespeichert' });
  writeForeign();
  const l = await until(async () => { const x = await ok(s, '/api/lock'); return x.mode === 'lost' && x; });
  assert.strictEqual(l.reason, 'changed');
  assert.match(l.saved_as, /^plm-.+-nicht-gespeichert\.db$/);
  await new Promise(r => setTimeout(r, 700));   // ein Speichern stünde jetzt an
  assert.deepStrictEqual(await dbNames(dbFile), ['Gespeichert', 'Von aussen'], 'nichts überschrieben');
  assert.deepStrictEqual(await dbNames(path.join(dir, 'backups', l.saved_as)), ['Gespeichert', 'Ungespeichert']);
  assert.strictEqual((await call(s, '/api/projects', 'POST', { name: 'Weiter' })).status, 409);

  // Hier weiterarbeiten: lädt den Stand von aussen; die Sicherung steht in der Liste
  await ok(s, '/api/lock/takeover', 'POST');
  assert.deepStrictEqual(await names(s), ['Gespeichert', 'Von aussen']);
  const backups = (await ok(s, '/api/backups')).backups;
  assert.ok(backups.some(b => b.name === l.saved_as && b.kind === 'nicht-gespeichert'));
  await ok(s, '/api/projects', 'POST', { name: 'Weiter' });
  await stop(s);
  assert.deepStrictEqual(await dbNames(dbFile), ['Gespeichert', 'Von aussen', 'Weiter']);
});

test('Sperre beim Start: verwaist oder abgestürzt wird genommen, ein anderer PC eben noch aktiv nicht', async () => {
  const dir = path.join(tmp, 'start');
  const lockFile = path.join(dir, 'plm.lock');
  fs.mkdirSync(dir, { recursive: true });
  const lock = (host, pid, ageMs) => {
    const at = new Date(Date.now() - ageMs).toISOString();
    fs.writeFileSync(lockFile, JSON.stringify({ id: 'fremd', host, pid, port: 3000, version: '2.0.1', since: at, beat: at }));
  };

  // Anderer PC, seit einer Stunde still: ausgeschaltet oder im Ruhezustand
  lock('ANDERER-PC', 4242, 3600e3);
  let s = await up(start(dir, BASE_PORT + 3));
  await printed(s, /Sperre von PLM auf ANDERER-PC war verwaist/);
  assert.strictEqual((await call(s, '/api/stats')).status, 200);
  assert.strictEqual(JSON.parse(fs.readFileSync(lockFile, 'utf8')).port, BASE_PORT + 3);
  await stop(s);
  assert.ok(!fs.existsSync(lockFile));

  // Abgestürztes PLM auf diesem PC: Der Prozess lebt nicht mehr
  const dead = spawn(process.execPath, ['-e', '']);
  await new Promise(r => dead.once('exit', r));
  lock(os.hostname(), dead.pid, 1000);
  s = await up(start(dir, BASE_PORT + 3));
  assert.strictEqual((await call(s, '/api/stats')).status, 200);
  await stop(s);

  // Anderer PC, eben noch aktiv: warten, bis hier jemand übernimmt
  lock('ANDERER-PC', 4242, 1000);
  s = await up(start(dir, BASE_PORT + 3));
  await printed(s, /Die Daten sind in Benutzung: PLM auf ANDERER-PC/);
  const l = await ok(s, '/api/lock');
  assert.deepStrictEqual([l.mode, l.holder.host, l.holder.this_pc, l.local], ['waiting', 'ANDERER-PC', false, true]);
  assert.strictEqual((await call(s, '/api/projects')).status, 409);
  assert.strictEqual((await ok(s, '/api/lock/takeover', 'POST')).mode, 'own');
  assert.strictEqual((await call(s, '/api/stats')).status, 200);
  await stop(s);
  assert.ok(!fs.existsSync(lockFile), 'nach dem Übernehmen gehört sie diesem PLM und wird freigegeben');
});

test('Checkout-Verzeichnis steht pro PC in plm.config; der frühere Eintrag wandert, wenn es ihn hier gibt', async () => {
  const dir = path.join(tmp, 'checkout');
  const cfg = dir + '.config';
  const dbFile = path.join(dir, 'plm.db');
  const mine = path.join(tmp, 'CAD-Checkout');
  fs.mkdirSync(mine);

  // Ein PLM von früher: Der Ordner stand in der Datenbank
  let s = await up(start(dir, BASE_PORT + 4));
  await stop(s);
  await editDb(dbFile, `INSERT INTO settings (key, value) VALUES ('checkout_dir', '${mine}')`);
  s = await up(start(dir, BASE_PORT + 4));
  assert.match(fs.readFileSync(cfg, 'utf8'), new RegExp('^checkout_dir=' + escapeRe(mine) + '$', 'm'));
  let c = await ok(s, '/api/checkout-dir');
  assert.deepStrictEqual([c.dir, c.effective, c.legacy_path, c.local], [mine, mine, null, true]);

  // Auschecken landet dort
  const proj = await ok(s, '/api/projects', 'POST', { name: 'CAD' });
  const item = await ok(s, `/api/projects/${proj.id}/items`, 'POST', { name: 'Halter', item_type: 'prt' });
  const rev = (await ok(s, `/api/items/${item.id}`)).revisions[0].id;
  const form = new FormData();
  form.append('file', new Blob(['solid h\nendsolid h\n']), 'halter.stl');
  assert.ok((await fetch(`${s.base}/api/revisions/${rev}/datasets`, { method: 'POST', body: form })).ok);
  const co = await ok(s, `/api/items/${item.id}/checkout`, 'POST', {});
  assert.strictEqual(path.dirname(co.folder), mine);

  // Nur vollständige Pfade. Leer heisst Standard — und bleibt leer
  assert.strictEqual((await call(s, '/api/checkout-dir', 'PUT', { dir: 'relativ/ordner' })).status, 400);
  c = await ok(s, '/api/checkout-dir', 'PUT', { dir: '' });
  assert.deepStrictEqual([c.dir, c.effective], ['', path.join(dir, 'checkout')]);
  await stop(s);
  s = await up(start(dir, BASE_PORT + 4));
  assert.strictEqual((await ok(s, '/api/checkout-dir')).dir, '', 'der frühere Eintrag kommt nicht zurück');
  await stop(s);

  // Der Ordner eines anderen PCs gibt es hier nicht: bleibt draussen, wird angezeigt
  const foreign = path.join(tmp, 'gibt-es-nicht', 'auch-nicht', 'Checkout');
  fs.writeFileSync(cfg, `data_dir=${dir}\n`);
  await editDb(dbFile, `UPDATE settings SET value='${foreign}' WHERE key='checkout_dir'`);
  s = await up(start(dir, BASE_PORT + 4));
  c = await ok(s, '/api/checkout-dir');
  assert.deepStrictEqual([c.dir, c.effective, c.legacy_path], ['', path.join(dir, 'checkout'), foreign]);
  assert.doesNotMatch(fs.readFileSync(cfg, 'utf8'), /checkout_dir/);
  await stop(s);
});

test('Daten verschieben: Sperre und plm.db am neuen Ort gehören weiter diesem PLM', async () => {
  const from = path.join(tmp, 'alt');
  const to = path.join(tmp, 'neu');
  const s = await up(start(from, BASE_PORT + 5));
  await ok(s, '/api/projects', 'POST', { name: 'Vor dem Umzug' });
  await ok(s, '/api/data-path/move', 'POST', { target_dir: to, keep_source: true });
  const m = await until(async () => { const x = await ok(s, '/api/data-path/move-status'); return !x.running && x; }, 15000);
  assert.ok(m.done, m.error);

  await ok(s, '/api/projects', 'POST', { name: 'Nach dem Umzug' });
  assert.strictEqual((await ok(s, '/api/lock')).mode, 'own');
  await until(async () => (await dbNames(path.join(to, 'plm.db'))).includes('Nach dem Umzug'));
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(to, 'plm.lock'), 'utf8')).port, s.port);
  assert.ok(!fs.existsSync(path.join(from, 'plm.lock')), 'die alte Kopie ist wieder frei');
  await stop(s);
  assert.ok(!fs.existsSync(path.join(to, 'plm.lock')));
});
