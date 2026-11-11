// Benutzer für die Nachvollziehbarkeit: allein ohne Auswahl, ab zwei Personen
// „Wer ist dran?", Rollen User / Superuser / Admin, PIN, Nachfragen nach
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
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { await fetch(BASE + '/api/stats'); up = true; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!up) throw new Error('Server startet nicht');
  // Standard-Pflichtpunkte ausschalten: die Tests geben auch Teile ohne Datei und Gewicht frei
  await fetch(BASE + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ release_checks: '' }) });
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
  await ok('/api/settings', { method: 'PUT', body: { theme: 'angepasst', sort_projects: 'name', sort_items: 'name', project_view: 'tiles', purchasing_tab: 'suppliers' }, cookie: ben });
  assert.strictEqual((await req(`/api/projects/${proj.id}`, { method: 'DELETE', cookie: cleo })).status, 403, 'Stammdaten löscht der Admin');
  const order = (await ok('/api/orders', { method: 'POST', body: { title: 'Weg damit' }, cookie: ben })).body;
  // ERP-Verlauf: nur Admins sehen ihn, getrennt von der PLM-Historie
  assert.strictEqual((await ok(`/api/orders/${order.id}`, { cookie: ben })).body.changelog, undefined);
  assert.strictEqual((await ok(`/api/orders/${order.id}`, { cookie: cleo })).body.changelog, undefined);
  assert.strictEqual((await req('/api/erp-log', { cookie: ben })).status, 403);
  // Ganze Datenbank, Sicherungen und Dateiablage nur für Admins
  for (const url of ['/api/export', '/api/export-named', '/api/backups', '/api/file-index']) {
    assert.strictEqual((await req(url, { cookie: cleo })).status, 403, url);
    assert.strictEqual((await req(url, { cookie: anna })).status, 200, url);
  }
  assert.strictEqual((await req('/api/erp-log')).status, 403, 'ohne Auswahl auch nicht');
  assert.strictEqual((await ok(`/api/orders/${order.id}`, { cookie: anna })).body.changelog[0].user_name, 'Ben');
  assert.ok((await ok('/api/erp-log', { cookie: anna })).body.some(e => e.entity_id === order.id && e.action === 'Erstellt'));
  assert.ok(!(await log(e => e.entity_type === 'order')), 'nicht in der PLM-Historie');
  await ok(`/api/orders/${order.id}`, { method: 'DELETE', cookie: ben });
  assert.strictEqual((await req('/api/users', { method: 'POST', body: { name: 'Dora' }, cookie: cleo })).status, 403);
  for (const body of [{ active: false }, { name: 'Umbenannt' }, { role: 'admin' }]) {
    assert.strictEqual((await req(`/api/users/${ids.ben}`, { method: 'PUT', body, cookie: cleo })).status, 403,
      'nur Admins verwalten Personen: ' + JSON.stringify(body));
  }
  assert.strictEqual((await req(`/api/users/${ids.cleo}`, { method: 'PUT', body: { role: 'admin' }, cookie: cleo })).status, 403,
    'auch sich selbst nicht zum Admin machen');
});

test('Farben: jede Person bekommt eine eigene, der Admin kann sie ändern', async () => {
  const users = (await ok('/api/users', { cookie: anna })).body.filter(u => u.active);
  const colors = users.map(u => u.color);
  assert.ok(colors.every(c => /^#[0-9a-f]{6}$/.test(c)), 'alle haben eine Farbe');
  assert.strictEqual(new Set(colors).size, colors.length, 'keine doppelt');
  assert.ok((await ok('/api/session', { cookie: anna })).body.users.every(u => u.color), 'auf den Kacheln');

  const ben0 = users.find(u => u.id === ids.ben).color;
  assert.strictEqual((await req(`/api/users/${ids.ben}`, { method: 'PUT', body: { color: 'rot' }, cookie: anna })).status, 400);
  assert.strictEqual((await req(`/api/users/${ids.ben}`, { method: 'PUT', body: { color: '#123456' }, cookie: cleo })).status, 403,
    'nur Admins');
  const b = (await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { color: '#ABCDEF' }, cookie: anna })).body;
  assert.strictEqual(b.color, '#abcdef');
  assert.strictEqual((await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { name: 'Ben' }, cookie: anna })).body.color, '#abcdef',
    'andere Änderungen lassen die Farbe');
  await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { color: ben0 }, cookie: anna });
});

test('Rückmeldungen: jeder reicht ein, nur Admins sehen und erledigen sie', async () => {
  const sent = { kind: 'BUG', text: 'Dropdown abgeschnitten\nim Dialog',
    context: { view: 'Projekte', item: '003-prt-003 – Abdeckung', errors: ['GET /api/x → 500 kaputt'], pin_hash: 'nicht übernehmen' } };
  const { id } = (await ok('/api/feedback', { method: 'POST', body: sent, cookie: ben })).body;
  await ok('/api/feedback', { method: 'POST', body: { kind: 'IDEA', text: 'Dunkles Logo' }, cookie: cleo });
  assert.strictEqual((await req('/api/feedback', { method: 'POST', body: { kind: 'IDEA', text: '  ' }, cookie: ben })).status, 400);
  assert.strictEqual((await req('/api/feedback', { method: 'POST', body: { kind: 'LOB', text: 'x' }, cookie: ben })).status, 400);

  // Auf dem Dashboard nur für Admins
  assert.deepStrictEqual((await ok('/api/dashboard', { cookie: cleo })).body.openFeedback, []);
  const dash = (await ok('/api/dashboard', { cookie: anna })).body.openFeedback;
  assert.deepStrictEqual(dash.map(f => f.kind), ['IDEA', 'BUG'], 'neueste zuerst');

  assert.strictEqual((await req('/api/feedback', { cookie: cleo })).status, 403);
  const f = (await ok('/api/feedback', { cookie: anna })).body.find(x => x.id === id);
  assert.deepStrictEqual([f.user_name, f.status, f.context.view, f.context.item, f.context.errors],
    ['Ben', 'OPEN', 'Projekte', '003-prt-003 – Abdeckung', ['GET /api/x → 500 kaputt']]);
  assert.ok(f.context.version, 'Version vom Server');
  assert.ok(!('pin_hash' in f.context), 'nur bekannte Felder');

  assert.strictEqual((await req(`/api/feedback/${id}`, { method: 'PUT', body: { done: true }, cookie: ben })).status, 403);
  const done = (await ok(`/api/feedback/${id}`, { method: 'PUT', body: { done: true }, cookie: anna })).body;
  assert.deepStrictEqual([done.status, done.done_by], ['DONE', 'Anna Muster']);
  const after = (await ok('/api/dashboard', { cookie: anna })).body;
  assert.deepStrictEqual([after.openFeedback.length, after.doneFeedback], [1, 1], 'erledigte nur noch gezählt');
  assert.strictEqual((await ok('/api/dashboard', { cookie: cleo })).body.doneFeedback, 0);
  assert.strictEqual((await req(`/api/feedback/${id}`, { method: 'DELETE', cookie: cleo })).status, 403);
  await ok(`/api/feedback/${id}`, { method: 'DELETE', cookie: anna });
  assert.ok(!(await ok('/api/feedback', { cookie: anna })).body.some(x => x.id === id));
});

test('Freigabe: direkt aus dem Entwurf, mit Vier-Augen-Prinzip über eine zweite Person', async () => {
  const proj = (await ok('/api/projects', { method: 'POST', body: { name: 'Vier Augen' }, cookie: ben })).body;
  const neu = async (name, cookie) => {
    const t = (await ok(`/api/projects/${proj.id}/items`, { method: 'POST', body: { name, item_type: 'prt' }, cookie })).body;
    return { id: t.id, rev: (await ok(`/api/items/${t.id}`)).body.revisions[0].id };
  };
  const status = (rev, s, cookie) => req(`/api/revisions/${rev}/status`, { method: 'PUT', body: { status: s }, cookie });

  // Ohne Vier-Augen-Prinzip: direkt freigeben
  const direkt = await neu('Direkt', ben);
  assert.strictEqual((await status(direkt.rev, 'REL', cleo)).status, 200);

  await ok('/api/settings', { method: 'PUT', body: { release_four_eyes: '1' }, cookie: anna });
  try {
    const a = await neu('Geprüft', ben);
    const r = await status(a.rev, 'REL', cleo);
    assert.strictEqual(r.status, 400, 'nicht direkt aus dem Entwurf');
    assert.match(r.body.error, /in Review setzen/);
    assert.strictEqual((await status(a.rev, 'REV', ben)).status, 200);
    assert.strictEqual((await ok(`/api/items/${a.id}`)).body.revisions[0].submitted_by.name, 'Ben');
    assert.strictEqual((await status(a.rev, 'REL', cleo)).status, 200, 'eine andere Person gibt frei');

    const b = await neu('Selbst', cleo);
    await status(b.rev, 'REV', cleo);
    const self = await status(b.rev, 'REL', cleo);
    assert.strictEqual(self.status, 403, 'wer eingereicht hat, gibt nicht selbst frei');
    assert.match(self.body.error, /zweite Person/);
    assert.strictEqual((await status(b.rev, 'REL', anna)).status, 200);

    // Admins sind ausgenommen: direkt aus dem Entwurf und nach eigenem Review
    const c = await neu('Admin direkt', anna);
    assert.strictEqual((await status(c.rev, 'REL', anna)).status, 200);
    const d = await neu('Admin Review', anna);
    await status(d.rev, 'REV', anna);
    assert.strictEqual((await status(d.rev, 'REL', anna)).status, 200);
  } finally {
    await ok('/api/settings', { method: 'PUT', body: { release_four_eyes: '0' }, cookie: anna });
  }
});

test('In Review und freigegeben ist der Inhalt gesperrt — zurück auf Entwurf geht es wieder', async () => {
  const proj = (await ok('/api/projects', { method: 'POST', body: { name: 'Gesperrt' }, cookie: ben })).body;
  const teil = (await ok(`/api/projects/${proj.id}/items`, { method: 'POST', body: { name: 'Platte', item_type: 'prt' }, cookie: ben })).body;
  const kind = (await ok(`/api/projects/${proj.id}/items`, { method: 'POST', body: { name: 'Schraube', item_type: 'prt' }, cookie: ben })).body;
  const rev = (await ok(`/api/items/${teil.id}`)).body.revisions[0].id;
  const tryUpload = async () => {
    const form = new FormData();
    form.append('file', new Blob(['solid a\nendsolid a\n']), 'platte.stl');
    const r = await fetch(`${BASE}/api/revisions/${rev}/datasets`, { method: 'POST', body: form, headers: { Cookie: ben } });
    return { status: r.status, body: await r.json() };
  };
  await ok(`/api/revisions/${rev}/status`, { method: 'PUT', body: { status: 'REV' }, cookie: ben });
  const up = await tryUpload();
  assert.strictEqual(up.status, 409);
  assert.match(up.body.error, /in Review und gesperrt.*zurück auf Entwurf/);
  assert.strictEqual((await req(`/api/revisions/${rev}/bom`, { method: 'POST', body: { child_item_id: kind.id, quantity: 1 }, cookie: ben })).status, 409);
  assert.strictEqual((await req(`/api/revisions/${rev}/print-settings`, { method: 'PUT', body: { material: 'PLA' }, cookie: ben })).status, 409);

  await ok(`/api/revisions/${rev}/status`, { method: 'PUT', body: { status: 'DFT' }, cookie: ben });
  assert.strictEqual((await tryUpload()).status, 200, 'im Entwurf wieder änderbar');
  await ok(`/api/revisions/${rev}/status`, { method: 'PUT', body: { status: 'REL' }, cookie: cleo });
  assert.match((await tryUpload()).body.error, /freigegeben und gesperrt.*neuen Revision/);

  // Wird während des Reviews geändert (Check-in, Änderungsantrag), geht die Revision zurück auf Entwurf
  const kindRev = (await ok(`/api/items/${kind.id}`)).body.revisions[0].id;
  await ok(`/api/revisions/${kindRev}/status`, { method: 'PUT', body: { status: 'REV' }, cookie: ben });
  const ecr = (await ok('/api/ecrs', { method: 'POST', body: { title: 'Kürzer', items: [{ item_id: kind.id }] }, cookie: ben })).body;
  await ok(`/api/ecrs/${ecr.id}/decision`, { method: 'PUT', body: { approve: true }, cookie: cleo });
  await ok(`/api/ecrs/${ecr.id}/implement`, { method: 'POST', cookie: ben });
  const revs = (await ok(`/api/items/${kind.id}`)).body.revisions;
  assert.deepStrictEqual(revs.map(r => [r.id, r.status]), [[kindRev, 'DFT']], 'dieselbe Revision, wieder Entwurf');
});

test('PIN, mindestens ein Admin, Deaktivieren beendet die Auswahl', async () => {
  const a = (await ok(`/api/users/${ids.anna}`, { method: 'PUT', body: { pin: '2468' }, cookie: anna })).body;
  assert.strictEqual(a.has_pin, true);
  const ohne = await req('/api/session', { method: 'POST', body: { user_id: ids.anna } });
  assert.deepStrictEqual([ohne.status, ohne.body.pin_required], [403, true]);
  assert.strictEqual((await req('/api/session', { method: 'POST', body: { user_id: ids.anna, pin: '1111' } })).status, 403);
  anna = (await ok('/api/session', { method: 'POST', body: { user_id: ids.anna, pin: '2468' } })).cookie;

  const letzte = await req(`/api/users/${ids.anna}`, { method: 'PUT', body: { role: 'superuser' }, cookie: anna });
  assert.strictEqual(letzte.status, 400);
  assert.match(letzte.body.error, /mindestens einen aktiven Admin/);
  // Admin setzt und entfernt die PIN einer anderen Person (z. B. vergessen)
  assert.strictEqual((await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { pin: '1234' }, cookie: anna })).body.has_pin, true);
  assert.strictEqual((await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { pin: null }, cookie: anna })).body.has_pin, false);

  // Eigene PIN: auch als Superuser, ändern und entfernen nur mit der bisherigen
  assert.strictEqual((await ok('/api/session/pin', { method: 'PUT', body: { pin: '1357' }, cookie: cleo })).body.has_pin, true);
  assert.deepStrictEqual((await req('/api/session', { method: 'POST', body: { user_id: ids.cleo } })).body.pin_required, true,
    'wer zu Cleo wechselt, braucht die PIN');
  assert.strictEqual((await req('/api/session/pin', { method: 'PUT', body: { pin: '9999' }, cookie: cleo })).status, 403);
  assert.strictEqual((await req('/api/session/pin', { method: 'PUT', body: { pin: '12', current_pin: '1357' }, cookie: cleo })).status, 400);
  assert.strictEqual((await req('/api/session/pin', { method: 'PUT', body: { pin: '1357' } })).status, 401, 'ohne Auswahl nicht');
  cleo = (await ok('/api/session', { method: 'POST', body: { user_id: ids.cleo, pin: '1357' } })).cookie;
  assert.strictEqual((await ok('/api/session/pin', { method: 'PUT', body: { pin: null, current_pin: '1357' }, cookie: cleo })).body.has_pin, false);
  assert.match((await log(e => e.entity_type === 'user' && e.entity_id === ids.cleo && /PIN entfernt/.test(e.details))).user_name, /Cleo/);

  await ok(`/api/users/${ids.ben}`, { method: 'PUT', body: { active: false }, cookie: anna });
  assert.strictEqual((await req('/api/projects', { method: 'POST', body: { name: 'Ben weg' }, cookie: ben })).status, 401);
  assert.ok(!(await ok('/api/session', { cookie: anna })).body.users.some(u => u.id === ids.ben), 'nicht mehr zur Auswahl');
  const geaendert = await log(e => e.entity_type === 'user' && e.entity_id === ids.ben && e.action === 'Person geändert');
  assert.match(geaendert.details, /deaktiviert/);
  assert.strictEqual(geaendert.user_name, 'Anna Muster');
});

test('Nach einer Pause fragt PLM bei der nächsten Änderung nach — Lesen zählt als Aktivität', async () => {
  await ok('/api/settings', { method: 'PUT', body: { user_idle_minutes: '0.01' }, cookie: anna });   // 600 ms — Spielraum, falls der Rechner ausgelastet ist
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    await wait(900);
    const r = await req('/api/projects', { method: 'POST', body: { name: 'Nach Pause' }, cookie: anna });
    assert.deepStrictEqual([r.status, r.body.confirm_user, r.body.user.name], [428, true, 'Anna Muster']);
    // Dieselbe Person macht weiter: ohne PIN
    anna = (await ok('/api/session', { method: 'POST', body: { user_id: ids.anna }, cookie: anna })).cookie;
    await ok('/api/projects', { method: 'POST', body: { name: 'Nach Pause' }, cookie: anna });

    await wait(300); await ok('/api/projects', { cookie: anna });
    await wait(300); await ok('/api/projects', { cookie: anna });
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
