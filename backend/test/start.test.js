// Start bei belegtem Port. PLM mit denselben Daten darf nie doppelt laufen:
// derselbe Stand wird weiterbenutzt, ein älterer abgelöst. Ein PLM mit anderen
// Daten oder ein fremdes Programm bleibt in Ruhe — PLM nimmt den nächsten
// freien Port und merkt ihn sich in plm.config. PLM_PORT heisst: genau dieser.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Eigener Bereich, weit weg von den festen Ports der anderen Testdateien
const BASE_PORT = 4100;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-start-'));
const procs = [];

const cfgOf = dataDir => dataDir + '.config';
function startServer(dataDir, env = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(cfgOf(dataDir))) fs.writeFileSync(cfgOf(dataDir), `data_dir=${dataDir}\nport=${BASE_PORT}\n`);
  const e = { ...process.env, PLM_DATA_DIR: dataDir, PLM_CONFIG: cfgOf(dataDir), ...env };
  if (!env.PLM_PORT) delete e.PLM_PORT;
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: e, stdio: ['ignore', 'pipe', 'pipe'] });
  const s = { proc, out: '', code: undefined };
  proc.stdout.on('data', d => { s.out += d; });
  proc.stderr.on('data', d => { s.out += d; });
  s.exited = new Promise(r => proc.once('exit', code => { s.code = code; r(code); }));
  procs.push(proc);
  return s;
}
// Wartet, bis der Server lauscht, und liefert Port und Versionsangaben
async function waitUp(s) {
  for (let i = 0; i < 100; i++) {
    if (s.code !== undefined) throw new Error('Server beendet: ' + s.out);
    const m = s.out.match(/laeuft auf http:\/\/localhost:(\d+)/);
    if (m) return { port: +m[1], ...(await (await fetch(`http://127.0.0.1:${m[1]}/api/version`)).json()) };
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht: ' + s.out);
}
const exitOf = s => Promise.race([s.exited,
  new Promise((_, no) => setTimeout(() => no(new Error('kein Ende: ' + s.out)), 15000))]);
async function stop(s) { if (s.code === undefined) { s.proc.kill(); await exitOf(s); } }
function fakeServer(handler) {
  const srv = http.createServer(handler);
  srv.shut = () => new Promise(r => { srv.close(r); srv.closeAllConnections(); });
  return new Promise(r => srv.listen(BASE_PORT, '0.0.0.0', () => r(srv)));
}

after(async () => {
  for (const p of procs) if (p.exitCode === null) p.kill();
  await new Promise(r => setTimeout(r, 300));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('Start: dieselben Daten laufen nie doppelt, andere Daten nehmen den nächsten Port', async () => {
  const a = startServer(path.join(tmp, 'a'));
  const va = await waitUp(a);
  assert.strictEqual(va.port, BASE_PORT);

  const again = startServer(path.join(tmp, 'a'));
  let running = a;
  if (va.dirty) {
    // Nicht committete Änderungen: nicht sicher derselbe Stand → ablösen
    assert.strictEqual(await exitOf(a), 0);
    assert.strictEqual((await waitUp(again)).port, BASE_PORT);
    assert.match(again.out, /mit denselben Daten - wird beendet und abgeloest/);
    running = again;
  } else {
    assert.strictEqual(await exitOf(again), 0);
    assert.match(again.out, /PLM laeuft bereits/);
    assert.strictEqual(a.code, undefined, 'der laufende Server bleibt');
  }

  const b = startServer(path.join(tmp, 'b'));
  const vb = await waitUp(b);
  assert.strictEqual(vb.port, BASE_PORT + 1, 'anderes PLM bleibt, nächster Port');
  assert.strictEqual(path.resolve(vb.data_dir), path.resolve(tmp, 'b'));
  assert.strictEqual(running.code, undefined, 'das andere PLM läuft weiter');
  assert.match(fs.readFileSync(cfgOf(path.join(tmp, 'b')), 'utf8'), new RegExp(`^port=${BASE_PORT + 1}$`, 'm'));

  // Zweiter Start von b findet sein PLM auf dem gemerkten Port
  if (!vb.dirty) {
    const b2 = startServer(path.join(tmp, 'b'));
    assert.strictEqual(await exitOf(b2), 0);
    assert.match(b2.out, new RegExp(`laeuft bereits .* auf http://localhost:${BASE_PORT + 1}`));
  }
  await stop(b);
  await stop(running);
});

test('Start: ältere Version mit denselben Daten wird abgelöst', async () => {
  const dir = path.join(tmp, 'c');
  let shutdown = false;
  // So antwortet ein PLM von vor der Versionsanzeige: /api/version fällt auf die Startseite
  const old = await fakeServer((req, res) => {
    if (req.url === '/api/data-path') return res.end(JSON.stringify({ data_dir: dir }));
    if (req.url === '/api/shutdown' && req.method === 'POST') {
      shutdown = true; res.end('{"ok":true}');
      return setTimeout(() => old.shut(), 100);
    }
    res.setHeader('Content-Type', 'text/html'); res.end('<!DOCTYPE html><title>PLM & ERP</title>');
  });
  const s = startServer(dir);
  const v = await waitUp(s);
  assert.ok(shutdown, 'der alte Server wurde über „Beenden“ geschlossen');
  assert.strictEqual(v.port, BASE_PORT, 'und sein Port übernommen');
  assert.match(s.out, /eine aeltere Version mit denselben Daten/);
  await stop(s);
});

test('Start: fremdes Programm — nächster freier Port, gemerkt in plm.config', async () => {
  const other = await fakeServer((req, res) => { res.statusCode = 404; res.end('nicht hier'); });
  try {
    const dir = path.join(tmp, 'd');
    const s = startServer(dir);
    assert.strictEqual((await waitUp(s)).port, BASE_PORT + 1);
    assert.match(s.out, new RegExp(`Port ${BASE_PORT} ist belegt - PLM nutzt Port ${BASE_PORT + 1}`));
    assert.match(fs.readFileSync(cfgOf(dir), 'utf8'), new RegExp(`^port=${BASE_PORT + 1}$`, 'm'));
    await stop(s);
  } finally { await other.shut(); }
});

test('Start: fester Port (PLM_PORT) belegt — Meldung ohne Stacktrace, Datenbank unberührt', async () => {
  const other = await fakeServer((req, res) => { res.statusCode = 404; res.end('nicht hier'); });
  try {
    const dir = path.join(tmp, 'e');
    const s = startServer(dir, { PLM_PORT: String(BASE_PORT) });
    assert.strictEqual(await exitOf(s), 1);
    assert.match(s.out, new RegExp(`FEHLER: Port ${BASE_PORT} ist belegt`));
    assert.ok(!/EADDRINUSE|at Server\./.test(s.out), 'kein Stacktrace');
    assert.ok(!fs.existsSync(path.join(dir, 'plm.db')), 'keine Datenbank angelegt');
    assert.ok(!fs.existsSync(path.join(dir, 'backups')), 'keine Sicherung angelegt');
  } finally { await other.shut(); }
});
