// Update-Prüfung beim Öffnen: Gibt es auf dem Git-Remote neuere Commits als
// den laufenden Stand? Läuft gegen Wegwerf-Repos mit einem lokalen „origin“ —
// kein Netz, kein GitHub. PLM_REPO_DIR zeigt den Server auf das Test-Repo.
// Kopien ohne Git (ZIP-Download) fragen ein Schein-GitHub (PLM_GITHUB_API).
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const BASE_PORT = 3980;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-update-'));
const procs = [];
const fakes = [];   // Schein-GitHub-Server
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

async function startServer(repoDir, env = {}) {
  const port = nextPort++;
  const dataDir = path.join(tmp, 'data-' + port);
  fs.mkdirSync(dataDir);
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dataDir, PLM_PORT: String(port), PLM_CONFIG: dataDir + '.config', PLM_REPO_DIR: repoDir, ...env },
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
  for (const s of fakes) s.close();
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
  // version.json wie im Repository: nur Platzhalter, nicht von GitHub ausgefüllt
  fs.mkdirSync(path.join(plain, 'backend'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', 'version.json'), path.join(plain, 'backend', 'version.json'));
  const base = await startServer(plain);
  const u = await update(base);
  assert.strictEqual(u.available, false);
  assert.strictEqual(u.fetched, false);
  const v = await (await fetch(base + '/api/version')).json();
  assert.strictEqual(v.source, null);
  assert.strictEqual(v.version, require('../package.json').version);
});

// Kopie wie aus dem ZIP-Download: kein .git, version.json von GitHub ausgefüllt
const SHA = 'a31718f9b4fbec25af999b81e605bd7217e05ef8';
function zipCopy(name, stand) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'backend', 'version.json'), JSON.stringify(stand));
  return dir;
}

// Schein-GitHub: Vergleich mit HEAD, Anzahl Commits über den Link-Header
// (ein Commit pro Seite), package.json des neusten Stands
async function fakeGithub({ status, ahead = 0, total, commits = [], pkgVersion = '2.0.0' }) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url);
    const p = new URL(req.url, 'http://x').pathname;
    res.setHeader('Content-Type', 'application/json');
    if (/^\/repos\/[^/]+\/[^/]+\/compare\/[0-9a-f]{40}\.\.\.HEAD$/.test(p)) {
      return res.end(JSON.stringify({ status, ahead_by: ahead, behind_by: 0, commits }));
    }
    if (/^\/repos\/[^/]+\/[^/]+\/commits$/.test(p)) {
      res.setHeader('Link', `<http://x${p}?sha=HEAD&per_page=1&page=2>; rel="next", <http://x${p}?sha=HEAD&per_page=1&page=${total}>; rel="last"`);
      return res.end('[{}]');
    }
    if (/\/contents\/backend\/package\.json$/.test(p)) {
      return res.end(JSON.stringify({ content: Buffer.from(JSON.stringify({ version: pkgVersion })).toString('base64') }));
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  fakes.push(srv);
  return { url: `http://127.0.0.1:${srv.address().port}`, seen };
}

test('Update: ZIP-Download aktuell — Stand aus version.json, Nummer von GitHub', async () => {
  const gh = await fakeGithub({ status: 'identical', total: 312 });
  const base = await startServer(zipCopy('zip-aktuell', { commit: SHA, date: '2026-10-25T14:05:31+01:00' }),
    { PLM_GITHUB_API: gh.url });
  const u = await update(base);
  assert.strictEqual(u.fetched, true, u.error);
  assert.strictEqual(u.available, false);
  assert.strictEqual(u.upstream, 'github.com/schnarchler/PLM');
  assert.ok(gh.seen.some(s => s.includes(`/compare/${SHA}...HEAD`)), 'fragt mit dem Commit aus version.json');

  const v = await (await fetch(base + '/api/version')).json();
  assert.strictEqual(v.source, 'zip');
  assert.strictEqual(v.commit, SHA.slice(0, 7));
  assert.strictEqual(v.date, '2026-10-25T14:05:31+01:00');
  assert.match(v.version, /^\d+\.\d+\.312$/);
});

test('Update: ZIP-Download hinter GitHub — neue Commits, Version und ZIP-Link', async () => {
  const commit = (sha, message, date) => ({ sha, commit: { message, committer: { date } } });
  const gh = await fakeGithub({ status: 'ahead', ahead: 2, total: 314, pkgVersion: '2.1.0', commits: [
    commit('1'.repeat(40), 'Neue Funktion\n\nMit Details', '2026-10-26T08:00:00Z'),
    commit('2'.repeat(40), 'Fehler behoben', '2026-10-27T08:00:00Z'),
  ] });
  const base = await startServer(zipCopy('zip-alt', { commit: SHA }), { PLM_GITHUB_API: gh.url });
  const u = await update(base);
  assert.strictEqual(u.available, true, u.error);
  assert.strictEqual(u.behind, 2);
  assert.deepStrictEqual(u.commits.map(c => c.subject), ['Fehler behoben', 'Neue Funktion']);
  assert.strictEqual(u.commits[0].commit, '2222222');
  assert.strictEqual(u.version, '2.1.314', 'Major.Minor aus der neuen package.json');
  assert.strictEqual(u.download, 'https://github.com/schnarchler/PLM/archive/HEAD.zip');

  const v = await (await fetch(base + '/api/version')).json();
  assert.match(v.version, /\.312$/, 'eigene Nummer = neuster Stand minus neue Commits');
});

test('Update: ZIP-Download offline — Commit statt Nummer, kein Punkt', async () => {
  const base = await startServer(zipCopy('zip-offline', { commit: SHA }), { PLM_GITHUB_API: 'http://127.0.0.1:1' });
  const u = await update(base);
  assert.strictEqual(u.fetched, false);
  assert.strictEqual(u.available, false);
  assert.match(u.error, /GitHub nicht erreichbar/);

  const v = await (await fetch(base + '/api/version')).json();
  assert.strictEqual(v.commit, SHA.slice(0, 7));
  assert.match(v.version, /^\d+\.\d+$/, 'ohne GitHub keine Anzahl Commits');
});
