// Update-Prüfung beim Öffnen: Gibt es auf dem Git-Remote neuere Commits als
// den laufenden Stand? Läuft gegen Wegwerf-Repos mit einem lokalen „origin“ —
// kein Netz, kein GitHub. PLM_REPO_DIR zeigt den Server auf das Test-Repo.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE_PORT = 3980;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-update-'));
const procs = [];
let nextPort = BASE_PORT;

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args],
  { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
function commit(repo, msg) {
  fs.writeFileSync(path.join(repo, 'datei.txt'), msg + '\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', msg);
}

// origin (bare) + „PLM-Checkout“ + zweiter Klon, aus dem neue Commits kommen
const origin = path.join(tmp, 'origin.git');
const plm = path.join(tmp, 'plm');
const dev = path.join(tmp, 'dev');
git(tmp, 'init', '-q', '--bare', '-b', 'main', origin);
git(tmp, 'clone', '-q', origin, plm);
commit(plm, 'Erster Stand');
git(plm, 'push', '-q', '-u', 'origin', 'HEAD:main');
git(tmp, 'clone', '-q', origin, dev);

async function startServer(repoDir) {
  const port = nextPort++;
  const dataDir = path.join(tmp, 'data-' + port);
  fs.mkdirSync(dataDir);
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(port), PLM_CONFIG: dataDir + '.config', PLM_REPO_DIR: repoDir },
    stdio: 'ignore',
  });
  procs.push(proc);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + '/api/stats'); return base; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  throw new Error('Server startet nicht');
}
const update = async base => (await fetch(base + '/api/update')).json();

after(async () => {
  for (const p of procs) p.kill();
  await new Promise(r => setTimeout(r, 300));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

test('Update: aktueller Stand meldet nichts', async () => {
  const u = await update(await startServer(plm));
  assert.strictEqual(u.fetched, true, u.error);
  assert.strictEqual(u.upstream, 'origin/main');
  assert.strictEqual(u.available, false);
  assert.strictEqual(u.behind, 0);
});

test('Update: neue Commits auf dem Remote werden mit Version und Liste gemeldet', async () => {
  commit(dev, 'Neue Funktion');
  commit(dev, 'Fehler behoben');
  git(dev, 'push', '-q', 'origin', 'HEAD:main');

  const base = await startServer(plm);
  const u = await update(base);
  assert.strictEqual(u.fetched, true, u.error);
  assert.strictEqual(u.available, true);
  assert.strictEqual(u.behind, 2);
  assert.deepStrictEqual(u.commits.map(c => c.subject), ['Fehler behoben', 'Neue Funktion']);
  // Gleiches Schema wie /api/version: Major.Minor, dahinter die Anzahl Commits
  const v = await (await fetch(base + '/api/version')).json();
  assert.strictEqual(u.version, v.version.replace(/\.\d+$/, '.3'));
  assert.strictEqual(v.version.split('.').pop(), '1', 'es läuft weiter der alte Stand');
});

test('Update: Remote nicht erreichbar — es zählt der Stand vom letzten Abruf', async () => {
  const stale = path.join(tmp, 'stale');
  git(tmp, 'clone', '-q', origin, stale);
  git(stale, 'reset', '-q', '--hard', 'HEAD~2');   // läuft zwei Commits hinterher
  git(stale, 'remote', 'set-url', 'origin', path.join(tmp, 'gibt-es-nicht.git'));

  const u = await update(await startServer(stale));
  assert.strictEqual(u.fetched, false);
  assert.match(u.error, /Remote nicht erreichbar/);
  assert.strictEqual(u.available, true);
  assert.strictEqual(u.behind, 2);
});

test('Update: ohne Git bleibt es still', async () => {
  const plain = path.join(tmp, 'ohne-git');
  fs.mkdirSync(plain);
  const u = await update(await startServer(plain));
  assert.strictEqual(u.available, false);
  assert.strictEqual(u.fetched, false);
});
