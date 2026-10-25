// Benutzer für die Nachvollziehbarkeit: allein ohne Auswahl, ab zwei Personen
// „Wer ist dran?", Rollen User / Superuser / Admin, Admin-PIN, Nachfragen nach
// einer Pause. Die Person steht in jedem Historien-Eintrag und bei der Freigabe.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3990;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc, tmp;

// Anfrage als bestimmte Person (Cookie) — liefert Status, Antwort und neues Cookie
async function req(url, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const set = (r.headers.getSetCookie?.() || []).find(c => c.startsWith('plm_user_'));
  return { status: r.status, body: await r.json().catch(() => null), cookie: set ? set.split(';')[0] : null };
}
async function ok(url, opts) {
  const r = await req(url, opts);
  assert.ok(r.status === 200, `${opts?.method || 'GET'} ${url} → ${r.status} ${JSON.stringify(r.body)}`);
  return r;
}
const log = async pred => (await ok('/api/changelog?limit=100')).body.find(pred);
async function upload(revId, cookie) {
  const form = new FormData();
  form.append('file', new Blob(['solid a\nendsolid a\n']), 'teil.stl');
  const r = await fetch(`${BASE}/api/revisions/${revId}/datasets`, { method: 'POST', body: form, headers: { Cookie: cookie } });
  assert.strictEqual(r.status, 200);
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-user-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  fs.writeFileSync(path.join(tmp, 'plm.config'), 'data_dir=' + path.join(tmp, 'data') + '\n');
  serverProc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: path.join(tmp, 'data'), PLM_PORT: String(PORT), PLM_CONFIG: path.join(tmp, 'plm.config') },
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
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

const ids = {};
let anna, ben, cleo;   // Cookies

test('Ohne Personen: alles wie bisher, Historie ohne Namen', async () => {
  const s = (await ok('/api/session')).body;
  assert.deepStrictEqual([s.mode, s.user], ['none', null]);
  const p = (await ok('/api/projects', { method: 'POST', body: { name: 'Vorher' } })).body;
  const entry = await log(e => e.entity_type === 'project' && e.entity_id === p.id);
  assert.ok(entry, 'Eintrag da');
  assert.strictEqual(entry.user_name, null);
});

test('Allein: keine Auswahl, die Person ist Admin und steht in Historie und Freigabe', async () => {
  const a = (await ok('/api/users', { method: 'POST', body: { name: '  Anna  Muster ', role: 'user' } })).body;
  assert.deepStrictEqual([a.name, a.role], ['Anna Muster', 'admin'], 'die erste Person ist Admin');
  ids.anna = a.id;
  const s = (await ok('/api/session')).body;
  assert.deepStrictEqual([s.mode, s.user.name, s.user.role], ['single', 'Anna Muster', 'admin']);

  const proj = (await ok('/api/projects', { method: 'POST', body: { name: 'Allein' } })).body;
  const teil = (await ok(`/api/projects/${proj.id}/items`, { method: 'POST', body: { name: 'Winkel', item_type: 'prt' } })).body;
  const rev = (await ok(`/api/items/${teil.id}`)).body.revisions[0];
  await ok(`/api/revisions/${rev.id}/status`, { method: 'PUT', body: { status: 'REV' } });
  await ok(`/api/revisions/${rev.id}/status`, { method: 'PUT', body: { status: 'REL', released_by: 'Gefälscht' } });
  assert.strictEqual((await ok(`/api/items/${teil.id}`)).body.revisions[0].released_by, 'Anna Muster',
    'Name aus der Sitzung, nicht vom Browser');
  const entry = await log(e => e.entity_type === 'revision' && e.entity_id === rev.id && e.action === 'Status → REL');
  assert.strictEqual(entry.user_name, 'Anna Muster');
});

test('Zweite Person: Team-Modus, die bisherige bleibt an diesem Gerät gewählt', async () => {
  const r = await ok('/api/users', { method: 'POST', body: { name: 'Ben', role: 'user' } });
  ids.ben = r.body.id;
  assert.match(r.cookie, new RegExp(`^plm_user_${PORT}=`), 'Cookie hängt am Port');
  anna = r.cookie;
  const s = (await ok('/api/session', { cookie: anna })).body;
  assert.deepStrictEqual([s.mode, s.user.name], ['team', 'Anna Muster']);
  assert.deepStrictEqual(s.users.map(u => u.name).sort(), ['Anna Muster', 'Ben']);
  assert.ok(!('pin_hash' in s.users[0]), 'kein PIN-Hash im Browser');

  // Ohne Auswahl: lesen ja, ändern nein
  assert.strictEqual((await req('/api/projects')).status, 200);
  const nobody = await req('/api/projects', { method: 'POST', body: { name: 'Niemand' } });
  assert.deepStrictEqual([nobody.status, nobody.body.need_user], [401, true]);
  assert.strictEqual((await req('/api/parse-3mf', { method: 'POST' })).status !== 401, true, 'Auswerten ändert nichts');

  ids.cleo = (await ok('/api/users', { method: 'POST', body: { name: 'Cleo', role: 'superuser' }, cookie: anna })).body.id;
  assert.strictEqual((await req('/api/users', { method: 'POST', body: { name: 'ben' }, cookie: anna })).status, 400,
    'Name doppelt (Gross/Klein egal)');
});

test('Rollen: User ändert, Superuser gibt frei, Admin verwaltet', async () => {
  ben = (await ok('/api/session', { method: 'POST', body: { user_id: ids.ben } })).cookie;
  cleo = (await ok('/api/session', { method: 'POST', body: { user_id: ids.cleo } })).cookie;

  const proj = (await ok('/api/projects', { method: 'POST', body: { name: 'Team' }, cookie: ben })).body;
  const teil = (await ok(`/api/projects/${proj.id}/items`, { method: 'POST', body: { name: 'Lasche', item_type: 'prt' }, cookie: ben })).body;
  assert.strictEqual((await log(e => e.entity_type === 'item' && e.entity_id === teil.id)).user_name, 'Ben');
  const rev = (await ok(`/api/items/${teil.id}`)).body.revisions[0];

  await upload(rev.id, ben);
  assert.strictEqual((await log(e => e.entity_type === 'revision' && e.entity_id === rev.id && e.action === 'Datei hinzugefügt')).user_name,
    'Ben', 'auch beim Datei-Upload');

  await ok(`/api/revisions/${rev.id}/status`, { method: 'PUT', body: { status: 'REV' }, cookie: ben });
  const rel = await req(`/api/revisions/${rev.id}/status`, { method: 'PUT', body: { status: 'REL' }, cookie: ben });
  assert.strictEqual(rel.status, 403);
  assert.match(rel.body.error, /Freigeben dürfen nur Superuser und Admins/);
  await ok(`/api/revisions/${rev.id}/status`, { method: 'PUT', body: { status: 'REL' }, cookie: cleo });
  assert.strictEqual((await ok(`/api/items/${teil.id}`)).body.revisions[0].released_by, 'Cleo');

  // Änderungsantrag: anlegen darf jeder, genehmigen nur wer freigeben darf
  const ecr = (await ok('/api/ecrs', { method: 'POST', body: { title: 'Lasche kürzen', items: [{ item_id: teil.id }] }, cookie: ben })).body;
  assert.strictEqual(ecr.created_by, 'Ben');
  assert.strictEqual((await req(`/api/ecrs/${ecr.id}/decision`, { method: 'PUT', body: { approve: true }, cookie: ben })).status, 403);
  assert.strictEqual((await ok(`/api/ecrs/${ecr.id}/decision`, { method: 'PUT', body: { approve: true }, cookie: cleo })).body.decided_by, 'Cleo');

  assert.strictEqual((await req('/api/settings', { method: 'PUT', body: { company_name: 'X' }, cookie: cleo })).status, 403);
  await ok('/api/settings', { method: 'PUT', body: { font_scale: '1.1' }, cookie: ben });
  await ok('/api/settings', { method: 'PUT', body: { theme: 'angepasst' }, cookie: ben });
  assert.strictEqual((await req(`/api/projects/${proj.id}`, { method: 'DELETE', cookie: cleo })).status, 403, 'Stammdaten löscht der Admin');
  const order = (await ok('/api/orders', { method: 'POST', body: { title: 'Weg damit' }, cookie: ben })).body;
  await ok(`/api/orders/${order.id}`, { method: 'DELETE', cookie: ben });
  assert.strictEqual((await req('/api/users', { method: 'POST', body: { name: 'Dora' }, cookie: cleo })).status, 403);
  for (const body of [{ active: false }, { name: 'Umbenannt' }, { role: 'admin' }]) {
    assert.strictEqual((await req(`/api/users/${ids.ben}`, { method: 'PUT', body, cookie: cleo })).status, 403,
      'nur Admins verwalten Personen: ' + JSON.stringify(body));
  }
  assert.strictEqual((await req(`/api/users/${ids.cleo}`, { method: 'PUT', body: { role: 'admin' }, cookie: cleo })).status, 403,
    'auch sich selbst nicht zum Admin machen');
});

test('Admin-PIN, mindestens ein Admin, Deaktivieren beendet die Auswahl', async () => {
  const a = (await ok(`/api/users/${ids.anna}`, { method: 'PUT', body: { pin: '2468' }, cookie: anna })).body;
  assert.strictEqual(a.has_pin, true);
  const ohne = await req('/api/session', { method: 'POST', body: { user_id: ids.anna } });
  assert.deepStrictEqual([ohne.status, ohne.body.pin_required], [403, true]);
  assert.strictEqual((await req('/api/session', { method: 'POST', body: { user_id: ids.anna, pin: '1111' } })).status, 403);
  anna = (await ok('/api/session', { method: 'POST', body: { user_id: ids.anna, pin: '2468' } })).cookie;

  const letzte = await req(`/api/users/${ids.anna}`, { method: 'PUT', body: { role: 'superuser' }, cookie: anna });
  assert.strictEqual(letzte.status, 400);
  assert.match(letzte.body.error, /mindestens einen aktiven Admin/);
  assert.strictEqual((await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { pin: '1234' }, cookie: anna })).body.has_pin, false,
    'PIN gibt es nur für Admins');

  await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { active: false }, cookie: anna });
  assert.strictEqual((await req('/api/projects', { method: 'POST', body: { name: 'Ben weg' }, cookie: ben })).status, 401);
  assert.ok(!(await ok('/api/session', { cookie: anna })).body.users.some(u => u.id === ids.ben), 'nicht mehr zur Auswahl');
  const geaendert = await log(e => e.entity_type === 'user' && e.entity_id === ids.ben && e.action === 'Person geändert');
  assert.match(geaendert.details, /deaktiviert/);
  assert.strictEqual(geaendert.user_name, 'Anna Muster');
});

test('Nach einer Pause fragt PLM bei der nächsten Änderung nach — Lesen zählt als Aktivität', async () => {
  await ok('/api/settings', { method: 'PUT', body: { user_idle_minutes: '0.002' }, cookie: anna });   // 120 ms
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    await wait(250);
    const r = await req('/api/projects', { method: 'POST', body: { name: 'Nach Pause' }, cookie: anna });
    assert.deepStrictEqual([r.status, r.body.confirm_user, r.body.user.name], [428, true, 'Anna Muster']);
    // Dieselbe Person macht weiter: ohne PIN
    anna = (await ok('/api/session', { method: 'POST', body: { user_id: ids.anna }, cookie: anna })).cookie;
    await ok('/api/projects', { method: 'POST', body: { name: 'Nach Pause' }, cookie: anna });

    await wait(80); await ok('/api/projects', { cookie: anna });
    await wait(80); await ok('/api/projects', { cookie: anna });
    await ok('/api/projects', { method: 'POST', body: { name: 'Beim Lesen' }, cookie: anna });
  } finally {
    await req('/api/settings', { method: 'PUT', body: { user_idle_minutes: '30' }, cookie: anna });
  }
});

test('Zurück auf eine Person: wieder allein, ohne Auswahl — und wieder Team beim Aktivieren', async () => {
  // Stand: Anna (Admin, PIN) und Cleo aktiv, Ben deaktiviert
  await ok(`/api/users/${ids.cleo}`, { method: 'PUT', body: { active: false }, cookie: anna });
  const s = (await ok('/api/session')).body;
  assert.deepStrictEqual([s.mode, s.user.name, s.user.role], ['single', 'Anna Muster', 'admin'], 'ohne Cookie: allein');
  const p = (await ok('/api/projects', { method: 'POST', body: { name: 'Wieder allein' } })).body;
  assert.strictEqual((await log(e => e.entity_type === 'project' && e.entity_id === p.id)).user_name, 'Anna Muster');
  assert.strictEqual((await req('/api/settings', { method: 'PUT', body: { company_name: 'Allein GmbH' } })).status, 200,
    'allein darf man alles, auch ohne PIN');

  await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { active: true } });
  assert.strictEqual((await ok('/api/session')).body.mode, 'team');
  assert.strictEqual((await req('/api/projects', { method: 'POST', body: { name: 'Wer?' } })).status, 401, 'wieder fragen');
});
