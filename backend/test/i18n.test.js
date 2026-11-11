// Tests für die Übersetzung der Oberfläche (frontend/public/js/00-i18n.js und
// lang/en.js): Jeder Text, der im Code mit _t('…') steht, hat eine englische
// Übersetzung; jede Übersetzung wird noch gebraucht; Platzhalter stimmen.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FE = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = f => fs.readFileSync(path.join(FE, f), 'utf8');
const JS = fs.readdirSync(path.join(FE, 'js')).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const EN_SRC = read('lang/en.js');
const EN = (0, eval)(EN_SRC + '; I18N_EN');

// Ein String-Literal aus dem Quelltext auswerten ('…' oder "…", ohne ${})
const unquote = lit => (0, eval)(lit);
const placeholders = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

// Alle _t('…')-Aufrufe mit festem Text, auch _t(a ? '…' : '…')
function tKeys(src) {
  src = src.replace(/^\s*\/\/.*$/gm, '');   // Kommentare
  const keys = [];
  const LIT = String.raw`'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"`;
  const re = new RegExp(String.raw`(?<![\w$.])_t\(\s*(?:(?:[^'"()?,]|${LIT})*?\?\s*)?(${LIT})(?:\s*:\s*(${LIT}))?`, 'g');
  for (const m of src.matchAll(re)) for (const lit of [m[1], m[2]]) if (lit) keys.push(unquote(lit));
  return keys;
}

test('i18n: en.js ohne doppelte Schlüssel', () => {
  const keys = [...EN_SRC.matchAll(/^\s*('(?:\\.|[^'\\])*')\s*:/gm)].map(m => unquote(m[1]));
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepStrictEqual(dup, []);
  assert.strictEqual(keys.length, Object.keys(EN).length, 'jeder Schlüssel auf eigener Zeile');
});

test('i18n: Übersetzungen nicht leer, Platzhalter wie im Deutschen', () => {
  const bad = Object.entries(EN).filter(([de, en]) => typeof en !== 'string' || !en.trim()
    || placeholders(de).join() !== placeholders(en).join());
  assert.deepStrictEqual(bad, []);
});

test('i18n: jeder Text mit _t() hat eine englische Übersetzung', () => {
  const missing = [];
  for (const f of JS) for (const k of tKeys(read(f))) if (!(k in EN)) missing.push(`${f}: ${k}`);
  assert.deepStrictEqual([...new Set(missing)], [], 'in lang/en.js ergänzen');
});

test('i18n: jede Übersetzung wird noch gebraucht', () => {
  const used = new Set(JS.flatMap(f => tKeys(read(f))));
  // index.html: übersetzt werden Textknoten und title/placeholder (translateDom)
  const html = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of html.matchAll(/>([^<>]+)</g)) used.add(m[1].trim());
  for (const m of html.matchAll(/\s(?:title|placeholder)="([^"]+)"/g)) used.add(m[1]);
  const unused = Object.keys(EN).filter(k => !used.has(k));
  assert.deepStrictEqual(unused, [], 'nicht mehr gebraucht — aus lang/en.js entfernen');
});

test('i18n: _t() setzt Platzhalter ein und fällt auf Deutsch zurück', () => {
  const I = (0, eval)(read('js/00-i18n.js') + '; ({ _t, I18N, setLangForTest: l => { LANG = l; } })');
  assert.strictEqual(I._t('Speichern'), 'Speichern');
  assert.strictEqual(I._t('… und {n} weitere', { n: 3 }), '… und 3 weitere');
  I.I18N.en = EN;
  I.setLangForTest('en');
  assert.strictEqual(I._t('Speichern'), 'Save');
  assert.strictEqual(I._t('… und {n} weitere', { n: 3 }), '… and 3 more');
  assert.strictEqual(I._t('Noch nicht übersetzt'), 'Noch nicht übersetzt');
  assert.strictEqual(I._t('{x} bleibt', {}), '{x} bleibt', 'fehlender Wert lässt den Platzhalter stehen');
});

test('i18n: keine Variable heisst _t — sie würde die Übersetzung verdecken', () => {
  const decl = /(?:\b(?:const|let|var|function)\s+_t\b(?!\(s, vars\))|[(,]\s*_t\s*[,)=]|\b_t\s*=>)/;
  const bad = JS.filter(f => decl.test(read(f).replace(/^function _t\(s, vars\)/m, '')));
  assert.deepStrictEqual(bad, []);
});

test('i18n: Sprachdatei lädt vor 00-i18n.js, das vor allen anderen Scripts', () => {
  const order = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(order.slice(0, 3), ['lang/en.js', 'js/00-i18n.js', 'js/01-core.js']);
});

// ── Server: Einstellung ui_lang ──────────────────────────────────
// Eigener Port 3979 — die übrigen 39xx gehören anderen Testdateien
const os = require('node:os');
const { spawn } = require('node:child_process');
const PORT = 3979;
async function startServer(dir) {
  const proc = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PLM_DATA_DIR: dir, PLM_PORT: String(PORT), PLM_CONFIG: path.join(dir, 'plm.config') }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/api/stats`); return proc; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  proc.kill();
  throw new Error('Server nicht erreichbar auf Port ' + PORT);
}
async function stopServer(proc) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise(r => proc.once('exit', r));
  proc.kill();
  await exited;   // beim Beenden schreibt der Server die Datenbank
}
const settings = () => fetch(`http://127.0.0.1:${PORT}/api/settings`).then(r => r.json());

test('i18n: neue Installation folgt dem Browser, bestehende Daten behalten Deutsch', async () => {
  const SQL = await require('sql.js')();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-test-'));
  let proc = await startServer(dir);
  try {
    // Leere Datenbank: keine Sprache eingetragen, jede Person darf sie wählen
    assert.strictEqual((await settings()).ui_lang, undefined);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/settings`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify({ ui_lang: 'en' }) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual((await settings()).ui_lang, 'en');
    await stopServer(proc);

    // Datenbank aus der Zeit vor der Übersetzung: Daten da, keine Sprache, Migration nie gelaufen
    const db = new SQL.Database(fs.readFileSync(path.join(dir, 'plm.db')));
    db.run("DELETE FROM settings WHERE key='ui_lang'");
    db.run("DELETE FROM applied_migrations WHERE key='ui-lang-existing-v1'");
    db.run("INSERT INTO customers (number, name) VALUES ('KD-0001', 'Muster AG')");
    fs.writeFileSync(path.join(dir, 'plm.db'), Buffer.from(db.export()));
    proc = await startServer(dir);
    assert.strictEqual((await settings()).ui_lang, 'de');
  } finally {
    await stopServer(proc).catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test('Einheiten: Datenbank speichert Codes, Migration stellt alte Werte um', async () => {
  const SQL = await require('sql.js')();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-test-'));
  const post = (url, body) => fetch(`http://127.0.0.1:${PORT}${url}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${PORT}` }, body: JSON.stringify(body) }).then(r => r.json());
  const get = url => fetch(`http://127.0.0.1:${PORT}${url}`).then(r => r.json());
  let proc = await startServer(dir);
  try {
    // Beim Speichern: Stk, Stück, Pauschal, Set → Code; Freitext und g bleiben
    const units = {};
    for (const u of ['Stk', 'Stück', 'pcs', '', 'Pauschal', 'Set', 'Rolle', 'g']) {
      const inv = await post('/api/inventory', { name: 'Test ' + u, unit: u });
      units[u] = (await get('/api/inventory')).find(i => i.id === inv.id).unit;
    }
    assert.deepStrictEqual(units, { Stk: 'pcs', 'Stück': 'pcs', pcs: 'pcs', '': 'pcs', Pauschal: 'flat', Set: 'set', Rolle: 'Rolle', g: 'g' });
    await stopServer(proc);

    // Alte Datenbank mit deutschen Einheiten: beim Start umgestellt
    const db = new SQL.Database(fs.readFileSync(path.join(dir, 'plm.db')));
    db.run("UPDATE inventory_items SET unit='Stk' WHERE unit='pcs'");
    db.run("UPDATE inventory_items SET unit='Pauschal' WHERE unit='flat'");
    db.run("DELETE FROM applied_migrations WHERE key='unit-codes-v1'");
    fs.writeFileSync(path.join(dir, 'plm.db'), Buffer.from(db.export()));
    proc = await startServer(dir);
    const after = [...new Set((await get('/api/inventory')).map(i => i.unit))].sort();
    assert.deepStrictEqual(after, ['Rolle', 'flat', 'g', 'pcs', 'set']);
  } finally {
    await stopServer(proc).catch(() => {});
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

test('Einheiten: _unit() zeigt Codes übersetzt, Freitext unverändert', () => {
  const I = (0, eval)(read('js/00-i18n.js') + '; ({ _unit, I18N, setLangForTest: l => { LANG = l; } })');
  assert.deepStrictEqual(['pcs', '', undefined, 'set', 'flat', 'g', 'Rolle'].map(I._unit), ['Stk', 'Stk', 'Stk', 'Set', 'Pauschal', 'g', 'Rolle']);
  I.I18N.en = EN;
  I.setLangForTest('en');
  assert.deepStrictEqual(['pcs', 'flat', 'kg'].map(I._unit), ['pcs', 'Flat rate', 'kg']);
});
