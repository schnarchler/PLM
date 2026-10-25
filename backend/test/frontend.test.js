// Tests für die Frontend-Bausteine, die reine Funktionen sind: QR-Encoder,
// URL-Absicherung, Datenblatt-Rendering, Mindmap-Layout und die
// Workflow-Umschaltung. Sie brauchen keinen Server und keinen Browser —
// die Dateien werden geladen und die Funktionen direkt aufgerufen.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FE = path.join(__dirname, '..', '..', 'frontend', 'public');
const read = f => fs.readFileSync(path.join(FE, f), 'utf8');

// Einen Ausschnitt einer Datei auswerten und benannte Werte zurückgeben.
function evalPart(file, from, to, exportExpr) {
  const src = read(file);
  const a = src.indexOf(from);
  assert.ok(a >= 0, `${from} nicht in ${file} gefunden`);
  const b = to ? src.indexOf(to) : src.length;
  assert.ok(b > a, `${to} nicht nach ${from} in ${file}`);
  return (0, eval)(src.slice(a, b) + '; ' + exportExpr);
}

// Helfer, die die Renderfunktionen aus dem globalen Scope erwarten.
function installGlobals() {
  global.esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  global.fmtN = (v, d = 2) => (parseFloat(v) || 0).toFixed(d);
  global.fmtCHF = v => 'CHF ' + global.fmtN(v);
  global.fmtChf = v => global.fmtCHF(parseFloat(v) || 0);
  global.fmtDate = d => (d ? '01.01.2026, 00:00' : '—');
  global.fmtD = d => d || '—';
  global.fmtSize = b => (!b ? '—' : b < 1024 ? b + 'B' : (b / 1024).toFixed(1) + 'KB');
  global._classChip = c => `<span class="chip">${global.esc(c)}</span>`;
  global.fileLabel = (n, t) => t;
  global.dtClass = (n, t) => 'dt-' + t;
  global.itemIsEditable = i => !(i.revisions || []).some(r => ['REL', 'OBS', 'ECO'].includes(r.status));
  global.state = { checkouts: [], item: null, settings: {} };
  global.TextEncoder = require('node:util').TextEncoder;
}
installGlobals();
global.API = '';
evalPart('js/08-ui-api.js', 'function helpTip(', 'function setLeftHeader(', 'globalThis.helpTip = helpTip');
// Rechte und Kacheln — die Freigabe-Knöpfe fragen canRelease()
const WHO = evalPart('js/16-benutzer.js', 'const ROLE_LABEL', 'async function _saveUser(',
  '({ _whoTiles, _usersPanel, currentRole, canRelease, isAdmin })');

// ── QR-Encoder ────────────────────────────────────────────────
const QR = (0, eval)(read('js/14-qr.js')
  + '; ({ _qrEcc, _qrFormatBits, _qrVersionBits, _QR_VERSIONS, _QR_ALIGN, qrMatrix, qrSvg })');
global.qrSvg = QR.qrSvg;

test('QR: Reed-Solomon stimmt mit dem Referenzvektor aus ISO/IEC 18004', () => {
  const data = [16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17];
  assert.deepStrictEqual(QR._qrEcc(data, 10), [165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
});

test('QR: Versionstabelle ist in sich schlüssig', () => {
  for (const [v, spec] of Object.entries(QR._QR_VERSIONS)) {
    const blocks = spec.blocks.reduce((s, [n]) => s + n, 0);
    const data = spec.blocks.reduce((s, [n, k]) => s + n * k, 0);
    assert.strictEqual(data + blocks * spec.ecPerBlock, spec.total, `Version ${v}`);
  }
});

test('QR: Formatbits entsprechen der Normtabelle (Level M)', () => {
  const ref = [0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0];
  for (let mask = 0; mask < 8; mask++) assert.strictEqual(QR._qrFormatBits(mask), ref[mask], `Maske ${mask}`);
});

test('QR: Versionsbits ab V7 entsprechen der Norm', () => {
  for (const [v, exp] of Object.entries({ 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 })) {
    assert.strictEqual(QR._qrVersionBits(Number(v)), exp, `V${v}`);
  }
});

test('QR: Matrix hat Suchmuster, Taktmuster und Dunkelmodul', () => {
  const m = QR.qrMatrix('P1042-asm-001-prt-0012');
  const n = m.length;
  assert.ok([21, 25, 29, 33, 37, 41, 45, 49, 53, 57].includes(n), 'Größe 17+4v');
  for (const [br, bc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const want = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) ? 1 : 0;
      assert.strictEqual(m[br + r][bc + c], want, `Suchmuster ${br},${bc} bei ${r},${c}`);
    }
  }
  for (let i = 8; i < n - 8; i++) {
    assert.strictEqual(m[6][i], i % 2 === 0 ? 1 : 0, 'waagerechtes Taktmuster');
    assert.strictEqual(m[i][6], i % 2 === 0 ? 1 : 0, 'senkrechtes Taktmuster');
  }
  assert.strictEqual(m[n - 8][8], 1, 'Dunkelmodul');
});

test('QR: beide Formatkopien tragen denselben Wert', () => {
  const m = QR.qrMatrix('002-prt-001');
  const n = m.length;
  const P1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
  const P2 = [];
  for (let k = 0; k < 7; k++) P2.push([n - 1 - k, 8]);
  for (let k = 0; k < 8; k++) P2.push([8, n - 8 + k]);
  const readAt = POS => POS.reduce((fb, [r, c], i) => fb | (m[r][c] << (14 - i)), 0);
  assert.strictEqual(readAt(P1), readAt(P2));
});

test('QR: zu langer Text wird abgewiesen, SVG bleibt dann leer', () => {
  assert.throws(() => QR.qrMatrix('x'.repeat(500)));
  assert.strictEqual(QR.qrSvg('x'.repeat(500)), '');
  assert.match(QR.qrSvg('P1042-asm-001', 120), /^<svg[\s\S]*<path[\s\S]*<\/svg>$/);
});

// ── URL-Absicherung ───────────────────────────────────────────
const safeLinkHost = evalPart('js/01-core.js', 'function safeLinkHost', 'function fmtN', 'safeLinkHost');
global.safeLinkHost = safeLinkHost;

test('Quellen-Links: nur http und https werden verlinkt', () => {
  assert.strictEqual(safeLinkHost('https://www.igus.ch/p/1'), 'igus.ch');
  assert.strictEqual(safeLinkHost('http://intranet/teil?id=5'), 'intranet');
  for (const bad of ['javascript:alert(1)', 'JavaScript:alert(1)', '  javascript:alert(1)',
                     'data:text/html,<script>x</script>', 'vbscript:msgbox(1)', 'file:///etc/passwd',
                     'kein-link', '', null, undefined]) {
    assert.strictEqual(safeLinkHost(bad), null, `blockiert: ${bad}`);
  }
});

// ── Datenblatt ────────────────────────────────────────────────
evalPart('js/02-plm-browse.js', '// ── DATENBLATT-TAB', 'function renderVariantsSection(',
  'globalThis.renderItemSheet = renderItemSheet');

function demoItem(extra = {}) {
  return Object.assign({
    id: 7, item_type: 'prt', item_number: 'P1042-asm-001-prt-0012', name: 'Klemmbacke links',
    description: 'Erste Zeile\nZweite Zeile', source_url: 'https://www.igus.ch/p/1',
    classification: 'Bauteil', default_price: 59.48, weight_g: 184, effective_weight_g: 184,
    created_at: '2026-10-09T14:22:00Z', project: { number: 'P1042', name: 'Spannvorrichtung' },
    variants: [], inventory: [], changelog: [],
    revisions: [{ id: 31, rev: '2', status: 'DFT', description: 'Passung korrigiert', datasets: [] }],
  }, extra);
}

test('Datenblatt: zeigt Beschreibung, Quelle und Kennzahlen', () => {
  const item = demoItem();
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.match(h, /Zweite Zeile/);
  assert.match(h, /white-space:pre-wrap/, 'Zeilenumbrüche bleiben erhalten');
  assert.match(h, /href="https:\/\/www\.igus\.ch\/p\/1"/);
  assert.match(h, /CHF 59\.48/);
  assert.match(h, /184\.0 g/);
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

test('Datenblatt: gefährliche Quelle wird nicht verlinkt', () => {
  const item = demoItem({ source_url: 'javascript:alert(1)', description: '<img src=x onerror=alert(1)>' });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.ok(!h.includes('href="javascript:'), 'kein ausführbarer Link');
  assert.match(h, /kein Web-Link/);
  assert.ok(!h.includes('<img src=x'), 'Beschreibung wird escaped');
});

test('Datenblatt: QR-Code klein im Kopf, ein Klick zeigt ihn gross', () => {
  const item = demoItem();
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.match(h, /onclick="showItemQr\(\)" title="QR-Code vergrössern"[^>]*cursor:zoom-in[^>]*><svg[^>]*width="64"/);
  assert.ok(!h.includes('width="104"'), 'nicht mehr gross im Kopf');
  let modal = '';
  global._showDynModal = html => { modal = html; };
  try { showItemQr(); } finally { delete global._showDynModal; }
  assert.match(modal, /<svg[^>]*width="240"/, 'gross zum Scannen');
  assert.ok(modal.includes('>P1042-asm-001-prt-0012<'), 'Teilenummer darunter');
});

test('Datenblatt: leeres Teil zeigt Hinweise statt leerer Felder', () => {
  const item = { id: 1, item_type: 'asm', item_number: 'X', name: 'Y', revisions: [] };
  global.state.item = item;
  const h = renderItemSheet(item, null);
  for (const hint of ['Keine Beschreibung hinterlegt', 'Keine Quelle hinterlegt',
                      'Keine Revision vorhanden', 'Noch keine Dateien']) {
    assert.match(h, new RegExp(hint));
  }
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

test('Datenblatt: freigegebene Teile sind nicht bearbeitbar', () => {
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'REL', datasets: [] }] });
  global.state.item = item;
  assert.ok(!renderItemSheet(item, 31).includes('✏ Bearbeiten'));
});

test('Datenblatt: ohne Quelle — bei freigegebenen Teilen ausgeblendet, sonst „Jetzt ergänzen“', () => {
  const dft = demoItem({ source_url: null });
  global.state.item = dft;
  assert.match(renderItemSheet(dft, 31), />Quelle<\/div>\s*<div[^>]*>Keine Quelle hinterlegt\. <span[^>]*>Jetzt ergänzen/);
  const rel = demoItem({ source_url: null, revisions: [{ id: 31, rev: '2', status: 'REL', datasets: [] }] });
  global.state.item = rel;
  assert.ok(!renderItemSheet(rel, 31).includes('>Quelle<'), 'kein leerer Abschnitt');
  const relSrc = demoItem({ revisions: [{ id: 31, rev: '2', status: 'REL', datasets: [] }] });
  global.state.item = relSrc;
  assert.match(renderItemSheet(relSrc, 31), /href="https:\/\/www\.igus\.ch\/p\/1"/, 'vorhandene Quelle bleibt');
});

test('Hinweise: Banner nur mit Hinweisen, Text escaped, Link solange keiner da ist', () => {
  const { _itemHintsBanner } = evalPart('js/02-plm-browse.js', 'function _itemHintsBanner(',
    'function itemIsEditable(', '({ _itemHintsBanner })');
  assert.strictEqual(_itemHintsBanner(demoItem()), '');
  const b = _itemHintsBanner(demoItem({ hint_production: 'PETG <only>', hint_customer: 'Max. 60 °C' }));
  assert.match(b, /class="important-note"/);
  // Alle Arten gleich: Bezeichnung + Ort in derselben Auszeichnung
  assert.match(b, /<div class="important-note-title">Fertigungshinweis <span class="important-note-sub">· intern, im Produktionsauftrag<\/span><\/div>\s*<div class="important-note-text">PETG &lt;only&gt;/);
  assert.match(b, /<div class="important-note-title">Kundenhinweis <span class="important-note-sub">· im Produktionsauftrag und auf dem Lieferschein<\/span><\/div>/);
  assert.ok(!b.includes('Konstruktionshinweis'), 'leere Arten fallen weg');
  assert.match(b, /onclick="openItemHintsModal\(7\)"/);
  const item = demoItem();
  global.state.item = item;
  assert.match(renderItemSheet(item, 31), /⚠ Hinweis hinzufügen/);
  const withHint = demoItem({ hint_design: 'x' });
  global.state.item = withHint;
  assert.ok(!renderItemSheet(withHint, 31).includes('Hinweis hinzufügen'));
});

test('Hinweise: alle Arten stehen rot auf dem Datenblatt-PDF', () => {
  global.state.settings = {};
  assert.ok(!pdfOf(demoItem(), 31).includes('class="warn"'));
  const h = pdfOf(demoItem({ hint_design: 'Nicht tragend', hint_customer: 'Schutzbrille <tragen>' }), 31);
  assert.match(h, /<div class="warn"><b>⚠ Konstruktionshinweis<\/b><br>Nicht tragend<\/div><div class="warn"><b>⚠ Kundenhinweis<\/b><br>Schutzbrille &lt;tragen&gt;<\/div>/);
});

test('Datenblatt: Kurzcode kompakt, die Anleitung steht nur im ?', () => {
  const item = demoItem({ short_code: 'K7M' });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.match(h, /class="print-code-val">K7M-2</);
  assert.match(h, /class="help-q"[^>]*>\?<span class="help-pop" role="tooltip">Im Slicer mit dem Textwerkzeug/);
  assert.ok(!h.includes('print-code-hint'), 'kein sichtbarer Absatz mehr');
});

test('Datenblatt: 3D-Vorschau und Slicer nur, wenn die Revision ein Modell hat', () => {
  const plain = demoItem();
  global.state.item = plain;
  const none = renderItemSheet(plain, 31);
  assert.ok(!none.includes('3D-Vorschau') && !none.includes('Slicer öffnen'));

  const stl = { id: 5, ds_type: 'STL', original_name: 'P1042_rev2.stl' };
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'DFT', datasets: [stl] }] });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.match(h, /3D-Vorschau/);
  assert.match(h, /id="stl-c-sheet31" data-stl-url="\/api\/datasets\/5\/download"/);
  assert.match(h, /Slicer öffnen/);
});

test('Datenblatt: Slicer-Knopf ist ausgegraut, solange keiner nutzbar ist', () => {
  const stl = { id: 5, ds_type: 'STL', original_name: 'P1042_rev2.stl' };
  const tmf = { id: 6, ds_type: 'CAD', original_name: 'P1042_rev2.3mf' };
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'DFT', datasets: [stl, tmf] }] });
  global.state.item = item;
  const prusa = found => ({ id: 'prusa', name: 'PrusaSlicer', found });
  const cases = [
    [{ local: true, active: '', slicers: [prusa(false)] }, /Kein Slicer installiert/],
    [{ local: true, active: 'prusa', slicers: [prusa(false)] }, /PrusaSlicer ist nicht installiert/],
    [{ local: false, active: 'prusa', slicers: [prusa(true)] }, /Nur auf dem PC möglich/],
  ];
  try {
    for (const [st, why] of cases) {
      global.state.slicer = st;
      const h = renderItemSheet(item, 31);
      assert.match(h, new RegExp(`<span title="${why.source}[^"]*" style="display:inline-flex"><button class="btn btn-ghost btn-sm" disabled>🖨 Im Slicer öffnen`));
      assert.ok(!h.includes('openInSlicer('));
    }
    global.state.slicer = { local: true, active: 'prusa', slicers: [prusa(true)] };
    const h = renderItemSheet(item, 31);
    assert.match(h, /onclick="openInSlicer\(6\)"[^>]*>🖨 In PrusaSlicer öffnen/, 'das 3MF-Projekt vor dem STL');
    assert.match(h, /data-stl-url="\/api\/datasets\/5\/download"/, 'Vorschau bleibt beim STL');
  } finally { global.state.slicer = null; }
});

// ── 3D-Vorschau: isometrische Startansicht ────────────────────
const STLV = evalPart('js/02-plm-browse.js', '// Isometrische Ansicht wie im CAD', 'function initSTLViewer(', '({ STL_ISO, _stlRotation })');
const applyRot = (m, [x, y, z]) => [0, 1, 2].map(i => m[i] * x + m[4 + i] * y + m[8 + i] * z);

test('3D-Vorschau: startet isometrisch, Z zeigt nach oben', () => {
  const m = STLV._stlRotation(STLV.STL_ISO.elev, STLV.STL_ISO.azim);
  const s = 1 / Math.sqrt(3);
  const blick = applyRot(m, [s, -s, s]);
  assert.ok(Math.abs(blick[0]) < 1e-6 && Math.abs(blick[1]) < 1e-6 && Math.abs(blick[2] - 1) < 1e-6, 'Blick von vorne rechts oben (1,-1,1)');
  const oben = applyRot(m, [0, 0, 1]);
  assert.ok(Math.abs(oben[0]) < 1e-6 && oben[1] > 0.8, 'Z zeigt auf dem Bildschirm nach oben');
  // Sichtbar sind genau Oberseite, Vorderseite und rechte Seite
  for (const [n, sichtbar] of [[[0, 0, 1], true], [[0, -1, 0], true], [[1, 0, 0], true],
                               [[0, 0, -1], false], [[0, 1, 0], false], [[-1, 0, 0], false]]) {
    assert.strictEqual(applyRot(m, n)[2] > 0, sichtbar, `Fläche ${n}`);
  }
});

test('3D-Vorschau: Drehen um die Hochachse lässt Z oben', () => {
  for (const azim of [0, 1, 2.5, -3]) {
    const oben = applyRot(STLV._stlRotation(STLV.STL_ISO.elev, azim), [0, 0, 1]);
    assert.ok(Math.abs(oben[0]) < 1e-6 && oben[1] > 0.8, `gedreht um ${azim}`);
  }
});

// ── Stücklistenposition: Revisionsanzeige ─────────────────────
const _bomRevBadge = evalPart('js/02-plm-browse.js', 'function _bomRevBadge(', 'function renderBomList(', '_bomRevBadge');

test('Stückliste: automatische Position zeigt kein Schloss', () => {
  const b = { id: 1, child_item_id: 9, child_active_rev: { id: 5, rev: '2', status: 'DFT' },
              child_effective_rev: { id: 5, rev: '2', status: 'DFT' }, child_pinned_rev: null, rev_outdated: false };
  const h = _bomRevBadge(b, false, 3, 4);
  assert.ok(!h.includes('🔒'));
  assert.match(h, /rev2/);
  assert.match(h, /openBomRevPicker\(/);
});

test('Stückliste: fixierte und veraltete Position wird markiert', () => {
  const b = { id: 1, child_item_id: 9, child_active_rev: { id: 6, rev: '2', status: 'DFT' },
              child_effective_rev: { id: 5, rev: '1', status: 'ECO' },
              child_pinned_rev: { id: 5, rev: '1', status: 'ECO' }, rev_outdated: true };
  const h = _bomRevBadge(b, false, 3, 4);
  assert.match(h, /🔒/);
  assert.match(h, /rev1/);
  assert.match(h, /↑rev2/, 'Hinweis auf die neuere Revision');
  assert.match(h, /var\(--amber\)/);
  assert.ok(!_bomRevBadge(b, true, 3, 4).includes('openBomRevPicker('), 'gesperrt nicht klickbar');
});

// ── Zeiterfassung: Von / Bis / Dauer in Stunden und Minuten ───
const TE = evalPart('js/11-time-checkout.js', 'function _teMinutes(', 'function openTimeModal(',
  '({ _teMinutes, _teHM, _teParseDuration, _teTimeFields, _teFromRange, _teClearRange, _teTimeValues, _teRangeLine })');

test('Zeiterfassung: Dauer aus Von–Bis in Minuten, auch über Mitternacht', () => {
  assert.strictEqual(TE._teMinutes('08:00', '11:30'), 210);
  assert.strictEqual(TE._teMinutes('08:00', '08:10'), 10, 'minutengenau, nicht gerundet');
  assert.strictEqual(TE._teMinutes('22:00', '01:30'), 210, 'über Mitternacht');
  assert.strictEqual(TE._teMinutes('08:00', ''), null, 'erst wenn beide Zeiten stehen');
  assert.deepStrictEqual([TE._teHM(210), TE._teHM(10), TE._teHM(60)], ['3:30', '0:10', '1:00']);
});

test('Zeiterfassung: Dauer eintippen als 1:30, 1h30, 90 min oder 1.5', () => {
  for (const [ein, min] of [['1:30', 90], ['0:05', 5], ['1h30', 90], ['1 h 30 min', 90], ['90 min', 90], ['45m', 45],
                            ['1.5', 90], ['1,25', 75], ['2h', 120], ['2', 120]]) {
    assert.strictEqual(TE._teParseDuration(ein), min, ein);
  }
  for (const falsch of ['', '1:75', 'abc', '1:30:00']) assert.strictEqual(TE._teParseDuration(falsch), null, falsch);
});

test('Zeiterfassung: entweder Dauer oder Von–Bis', () => {
  const f = { 'te-start': { value: '' }, 'te-end': { value: '' }, 'te-hours': { value: '' } };
  const prev = global.document;
  global.document = { getElementById: id => f[id] };
  try {
    f['te-start'].value = '08:00'; TE._teFromRange('te');
    assert.strictEqual(f['te-hours'].value, '', 'nur Von: Dauer bleibt leer');
    f['te-end'].value = '11:30'; TE._teFromRange('te');
    assert.strictEqual(f['te-hours'].value, '3:30');
    assert.deepStrictEqual(TE._teTimeValues('te'), { hours: 3.5, start_time: '08:00', end_time: '11:30' });
    f['te-hours'].value = '1:15'; TE._teClearRange('te');
    assert.deepStrictEqual(TE._teTimeValues('te'), { hours: 1.25, start_time: null, end_time: null }, 'Dauer getippt: Von/Bis weg');
    f['te-start'].value = '09:00';
    assert.deepStrictEqual(TE._teTimeValues('te'), { hours: 1.25, start_time: null, end_time: null }, 'Von allein zählt nicht');
    f['te-hours'].value = 'quatsch';
    assert.ok(Number.isNaN(TE._teTimeValues('te').hours), 'unlesbar: wird nicht gespeichert');
  } finally { global.document = prev; }
});

test('Zeiterfassung: Dialog zeigt Stunden:Minuten, Liste die Uhrzeiten', () => {
  const h = TE._teTimeFields('ite', { start_time: '08:00', end_time: '11:30', hours: 3.5 });
  assert.match(h, /id="ite-start" type="time"[^>]*value="08:00"/);
  assert.match(h, /id="ite-end" type="time"[^>]*value="11:30"/);
  assert.match(h, /id="ite-hours"[^>]*value="3:30"/);
  assert.match(TE._teTimeFields('te', { hours: 0.17 }), /value="0:10"/, 'alte Einträge mit 0.17 h');
  assert.ok(!TE._teTimeFields('te', {}).includes('undefined'), 'neuer Eintrag: leere Felder');
  assert.match(TE._teRangeLine({ start_time: '08:00', end_time: '11:30' }), />08:00–11:30</);
  assert.strictEqual(TE._teRangeLine({ hours: 2 }), '', 'nur Dauer: keine Zeile');
});

test('Zeiterfassung: Listen zeigen Stunden und Minuten statt 1.5 h', () => {
  assert.deepStrictEqual([_fmtDur(1.5), _fmtDur(0.25), _fmtDur(2), _fmtDur(0), _fmtDur(1.999)],
    ['1 h 30 min', '15 min', '2 h', '0 min', '2 h'], 'auf Minuten gerundet, nie „1 h 60 min“');
});

// ── Dashboard: Fristen ────────────────────────────────────────
const _dashDue = evalPart('js/03-dashboard.js', 'function _dashDue(', 'async function renderDashboard(', '_dashDue');

test('Dashboard: Fristen rot überfällig, gelb bald, sonst grau', () => {
  const tag = n => { const t = new Date(); t.setDate(t.getDate() + n); return t.toLocaleDateString('sv-SE'); };
  assert.match(_dashDue(tag(-2), 'delivery'), /var\(--red\);[^>]*>2 T\. überfällig/);
  assert.match(_dashDue(tag(0), 'delivery'), /var\(--amber\);[^>]*>heute fällig/);
  assert.match(_dashDue(tag(2), 'delivery'), /var\(--amber\);[^>]*>fällig in 2 T\./);
  assert.match(_dashDue(tag(10), 'order'), /var\(--t3\);[^>]*>fällig in 10 T\./);
  assert.match(_dashDue(tag(30), 'delivery'), new RegExp(`fällig ${tag(30)}`));
  assert.match(_dashDue(tag(-1), 'quote'), /var\(--red\);[^>]*>abgelaufen/);
  assert.match(_dashDue(tag(3), 'quote'), /läuft in 3 T\. ab/);
  assert.match(_dashDue(tag(40), 'quote'), /gültig bis /);
  assert.strictEqual(_dashDue(null, 'quote'), '', 'ohne Datum kein Hinweis');
});

const _dashStats = evalPart('js/03-dashboard.js', 'function _dashStats(', 'async function renderDashboard(', '_dashStats');

test('Dashboard: Kennzahlen zur Datenbank, Fehlendes als Strich', () => {
  const h = _dashStats({ projects: 12, assemblies: 4, parts: 1234, documents: 0, released: 7, revisions: 40, standard_parts: 3,
    customers: 9, orders: 21, delivered: 15, hours: 12.5, files: 88, files_bytes: 2048, db_bytes: 4096,
    last_backup: null, since: '2026-05-11', version: { version: '2.0.<b>', dirty: true } });
  for (const t of ['>Datenbank<', '>PLM<', '>ERP<', '>Daten<', '>Teile<', '1234<', '12 h 30 min', '88 · 2.0KB', '4.0KB', '2026-05-11'])
    assert.ok(h.includes(t), t);
  assert.match(h, /Letzte Sicherung<\/span><span[^>]*>—</, 'ohne Sicherung ein Strich');
  assert.match(h, /v2\.0\.&lt;b&gt; · geändert/, 'Version escaped');
  assert.strictEqual(_dashStats(undefined), '', 'ältere Antwort ohne Kennzahlen');
});

// ── Änderungsanträge und Rückverfolgung: Darstellung ──────────
global.stBadge = global.stBadge || ((t, s) => `<span class="status">${s}</span>`);
evalPart('js/17-aenderungen.js', 'const ECR_ST', '// ── Anlegen und bearbeiten', '0');
evalPart('js/18-rueckverfolgung.js', 'const INSPECTION_LABEL', 'async function loadDeliveryTrace(', '0');
evalPart('js/18-rueckverfolgung.js', 'function _rawMaterialTraceHtml(', 'async function loadRawMaterialTrace(', '0');

test('Änderungsantrag: Knöpfe je Status, Genehmigen nur mit Recht, Auswirkung sichtbar', () => {
  const e = { id: 4, number: 'ECR-2026-001', title: 'Wand', status: 'OPEN', reason: 'Bruch <innen>', description: '',
    created_by: 'Anna', created_at: '2026-10-20 10:00:00',
    items: [{ item_id: 7, item_number: 'P1-prt-001', name: 'Halter', item_type: 'prt', note: '2.4 mm',
      before: { rev: '1', status: 'REL' }, after: null,
      impact: { parents: [{ id: 9, item_number: 'P1-asm-001' }], orders: [{ id: 3, number: 'AUF-2026-001' }], production: [], stock: 12 } }] };
  const h = _ecrDetailHtml(e, true);
  assert.match(h, /_ecrDecide\(4,true\)/);
  for (const t of ['P1-asm-001', 'AUF-2026-001', 'Lagerbestand:</span> 12', 'Bruch &lt;innen&gt;']) assert.ok(h.includes(t), t);
  const ohne = _ecrDetailHtml(e, false);
  assert.ok(!ohne.includes('_ecrDecide('), 'ohne Recht nicht klickbar');
  assert.match(ohne, /Genehmigen und Ablehnen dürfen Superuser und Admins/);
  assert.match(_ecrDetailHtml({ ...e, status: 'APPROVED' }, true), /_ecrImplement\(4\)/);
  const inArbeit = { ...e, status: 'IN_WORK', items: [{ ...e.items[0], after: { rev: '2', status: 'DFT' } }] };
  assert.match(_ecrDetailHtml(inArbeit, true), /1 von 1 neuen Revisionen noch nicht freigegeben/);
  assert.match(_ecrDetailHtml(inArbeit, true), /rev1<\/span> → <span[^>]*>rev2/);
});

test('Rückverfolgung: Position mit Charge und Prüfung, rückwärts nach Charge gruppiert', () => {
  const t = { id: 5, material_consumed: true, unassigned_lots: [], positions: [
    { id: 11, description: 'Clip', item_id: 7, item_number: 'P1-prt-001', item_type: 'prt', quantity: 50, unit: 'Stk',
      revision: { rev: '2', status: 'REL', fixed: true }, lots: [{ material: 'PETG', lot_number: 'L-7', qty: 0.4, unit: 'kg' }],
      inspection: { result: 'NOK', note: 'Grat <innen>', by: 'Anna', at: '2026-10-20 10:00:00' } },
    { id: 12, description: 'Ohne', item_id: null, quantity: 1, unit: 'Stk', revision: null, lots: [], inspection: null }] };
  const h = _deliveryTraceHtml(t);
  for (const s of ['🔒 rev2', '>L-7</strong>', 'nicht in Ordnung', 'Grat &lt;innen&gt;', 'keine Charge erfasst', "_saveInspection(12,'OK',5)"])
    assert.ok(h.includes(s), s);
  const r = _rawMaterialTraceHtml([
    { lot_number: 'L-7', qty: 0.4, delivery_id: 5, delivery_number: 'LS-2026-001', customer_name: 'Muster AG', description: 'Clip',
      item_number: 'P1-prt-001', revision: { rev: '2' }, delivery_status: 'DELIVERED' },
    { lot_number: 'L-7', qty: 0.2, delivery_id: 6, delivery_number: 'LS-2026-002', customer_name: 'Beta GmbH', description: 'Clip',
      item_number: 'P1-prt-001', revision: { rev: '2' }, delivery_status: 'DRAFT' }]);
  assert.match(r, /2 Verwendungen · 2 Kunden/);
  assert.ok(r.includes('LS-2026-002') && r.includes('P1-prt-001 rev2'));
  assert.match(_rawMaterialTraceHtml([]), /noch nichts für einen Produktionsauftrag/);
});

// ── Mindmap-Layout ────────────────────────────────────────────
const MM = (0, eval)(read('js/15-mindmap.js') + '; ({ _MM, _mmLayout, _mmNodeSvg, _mmEdgeSvg, _mmNodeClick })');

function demoGraph() {
  return {
    root: 'i1',
    nodes: [
      { key: 'i1', kind: 'item', id: 1, level: 0, item_number: '001-asm-001', name: 'Baugruppe', item_type: 'asm', is_root: true, status: 'DFT', rev: '1' },
      { key: 'i2', kind: 'item', id: 2, level: 1, item_number: '001-prt-001', name: 'Teil A', item_type: 'prt', is_root: false, status: 'DFT', rev: '1' },
      { key: 'i3', kind: 'item', id: 3, level: 1, item_number: '001-prt-002', name: 'Teil B', item_type: 'prt', is_root: false, status: 'DFT', rev: '1' },
      { key: 's9@1', kind: 'std', id: 9, level: 1, item_number: 'DIN 912', name: 'Schraube', item_type: 'std', is_root: false },
    ],
    edges: [
      { from: 'i1', to: 'i2', quantity: 2, unit: 'Stk', pinned_rev: null },
      { from: 'i1', to: 'i3', quantity: 1, unit: 'Stk', pinned_rev: '1' },
      { from: 'i1', to: 's9@1', quantity: 8, unit: 'Stk', pinned_rev: null },
    ],
  };
}

test('Mindmap: jeder Knoten bekommt endliche Koordinaten ohne Überlappung', () => {
  const g = demoGraph();
  const L = MM._mmLayout(g);
  assert.ok(g.nodes.every(n => Number.isFinite(n._x) && Number.isFinite(n._y)));
  assert.ok(g.nodes.every(n => n._x === n.level * (MM._MM.NODE_W + MM._MM.GAP_X)), 'Ebene bestimmt x');
  const byLevel = {};
  g.nodes.forEach(n => (byLevel[n.level] = byLevel[n.level] || []).push(n._y));
  for (const ys of Object.values(byLevel)) {
    ys.sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= MM._MM.NODE_H, 'keine Überlappung');
  }
  assert.ok(['x0', 'x1', 'y0', 'y1'].every(k => Number.isFinite(L.bounds[k])));
});

test('Mindmap: SVG nutzt CSS-Variablen nur in style-Attributen', () => {
  const g = demoGraph();
  const L = MM._mmLayout(g);
  const svg = g.nodes.map(n => MM._mmNodeSvg(n)).join('') + g.edges.map(e => MM._mmEdgeSvg(e, L)).join('');
  assert.ok(!/(fill|stroke|font-family)="var\(/.test(svg), 'var() gehört in style, nicht in Attribute');
  assert.match(svg, />NORM</, 'Normteil markiert');
  assert.match(svg, /8 Stk/, 'Mengen beschriftet');
  assert.match(svg, /<tspan[^>]*>rev1<\/tspan>/, 'fixierte Revision hervorgehoben');
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(svg), 'kein Emoji im SVG');
  assert.ok(!svg.includes('undefined') && !svg.includes('NaN'));
});

test('Mindmap: Klick stellt auf das Teil um, Doppelklick öffnet es', async () => {
  const calls = [];
  global._mmRefocus = id => calls.push('umstellen ' + id);
  global._mmOpen = id => calls.push('öffnen ' + id);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    MM._mmNodeClick({ detail: 1 }, 7);
    assert.deepStrictEqual(calls, [], 'wartet erst, ob ein zweiter Klick folgt');
    await wait(350);
    assert.deepStrictEqual(calls, ['umstellen 7']);

    calls.length = 0;
    MM._mmNodeClick({ detail: 1 }, 8);
    MM._mmNodeClick({ detail: 2 }, 8);
    await wait(350);
    assert.deepStrictEqual(calls, ['öffnen 8'], 'Doppelklick öffnet, ohne vorher umzustellen');

    // Zweiter Klick erst nach dem Umstellen — unter der Maus liegt jetzt ein anderer Knoten
    calls.length = 0;
    MM._mmNodeClick({ detail: 1 }, 9);
    await wait(350);
    MM._mmNodeClick({ detail: 2 }, 42);
    assert.deepStrictEqual(calls, ['umstellen 9', 'öffnen 9'], 'gemeint ist das Teil vom ersten Klick');
  } finally {
    delete global._mmRefocus;
    delete global._mmOpen;
  }
});

// ── Workflow-Umschaltung ──────────────────────────────────────
test('Workflow: einfacher Modus bietet "Neue Revision" statt Review', () => {
  const src = read('js/02-plm-browse.js');
  const seg = src.slice(src.indexOf('  const simple = typeof simpleWorkflow'),
                        src.indexOf('  return `\n    <!-- Rev info -->'));
  const buttonsFor = (mode, status, delivered = []) => {
    global.simpleWorkflow = () => mode === 'simple';
    const rev = { status, id: 7, delivered };
    return (0, eval)('(function(rev, item){' + seg + 'return wfBtns;})')(rev, { id: 3, revisions: [rev] });
  };
  assert.match(buttonsFor('full', 'DFT'), /In Review/);
  assert.match(buttonsFor('full', 'REV'), /Freigeben/);
  assert.match(buttonsFor('simple', 'DFT'), /Neue Revision/);
  assert.match(buttonsFor('simple', 'DFT'), /createNextRevision\(3\)/);
  assert.ok(!buttonsFor('simple', 'DFT').includes('In Review'));
  assert.ok(!buttonsFor('full', 'DFT').includes('Neue Revision'), 'ohne Lieferung führt der Weg über In Review');
  assert.match(buttonsFor('full', 'DFT', [{ id: 1, number: 'LS-2026-0001' }]), /Neue Revision/,
    'gelieferter Entwurf ist fixiert — weiter geht es mit einer neuen Revision');
  assert.strictEqual((buttonsFor('simple', 'DFT', [{ id: 1 }]).match(/Neue Revision/g) || []).length, 1, 'nicht doppelt');
  assert.match(buttonsFor('simple', 'REL'), /ECO starten/, 'freigegebene Stände behalten den ECO-Weg');
  for (const mode of ['full', 'simple']) {
    for (const st of ['DFT', 'REV', 'REL', 'ECO', 'OBS']) {
      assert.ok(!buttonsFor(mode, st).includes('undefined'), `${mode}/${st}`);
    }
  }
});

// ── Gelieferter Stand und Revisionsvergleich ──────────────────
evalPart('js/01-core.js', 'const PLM_ST_LABEL', '// Statusbadge',
  'globalThis.PLM_ST_LABEL = PLM_ST_LABEL; globalThis.HINT_KINDS = HINT_KINDS; globalThis.itemHints = itemHints; globalThis._hintHtml = _hintHtml');
evalPart('js/01-core.js', '// Druckparameter einer Revision', '// ── ITEM TYPE ICONS', 'globalThis.PRINT_PARAMS = PRINT_PARAMS');
evalPart('js/01-core.js', '// ── ITEM TYPE ICONS', 'function _classColor', '0');
evalPart('js/02-plm-browse.js', 'function _cleanDsName', 'function renderDatasets', '0');
const _deliveryRevBadge = evalPart('js/09-production.js', 'const REV_FIXED_LABEL',
  '// Gelieferte Struktur einer Baugruppe', '_deliveryRevBadge');
const _renderRevisionCompare = evalPart('js/10-documents.js', 'const COMPARE_META_LABEL',
  '// -- DOKUMENTVORLAGEN', '_renderRevisionCompare');

test('Produktion: Position zeigt automatische, feste und gelieferte Revision', () => {
  const auto = _deliveryRevBadge({ id: 1, item_id: 5, revision_id: null,
    effective_rev: { rev: '2', status: 'DFT' }, active_rev: { id: 9, rev: '2' } }, 4, false);
  assert.match(auto, /rev2/);
  assert.ok(!auto.includes('🔒'), 'automatisch ohne Schloss');
  assert.match(auto, /Folgt automatisch/);
  assert.match(auto, /openDeliveryRevPicker\(1,4\)/);

  const shipped = _deliveryRevBadge({ id: 2, item_id: 5, revision_id: 8, rev_fixed: 'delivery',
    effective_rev: { rev: '1', status: 'REL' }, active_rev: { id: 9, rev: '2' }, rev_outdated: true,
    structure: [{ item_id: 6 }, { item_id: 7 }] }, 4, true);
  assert.match(shipped, /🔒 rev1/);
  assert.match(shipped, /↑rev2/, 'neuere Revision wird angezeigt');
  assert.match(shipped, /Geliefert als rev1 \(beim Liefern fixiert\)/);
  assert.match(shipped, /2 Teile/, 'gelieferte Struktur der Baugruppe');

  assert.strictEqual(_deliveryRevBadge({ id: 3, item_id: null }, 4, false), '', 'ohne Item kein Kennzeichen');
  assert.match(_deliveryRevBadge({ id: 4, item_id: 5, revision_id: 8, rev_fixed: 'migration',
    effective_rev: { rev: '1', status: 'DFT' } }, 4, true), /ermittelt/);
});

test('Revisionsvergleich: Änderungen werden markiert, Gleiches lässt sich ausblenden', () => {
  const c = {
    item: { item_type: 'asm' },
    a: { rev: '1', status: 'REL', created_at: '2026-10-01', delivered: ['LS-2026-0001'] },
    b: { rev: '2', status: 'DFT', created_at: '2026-10-10', delivered: [] },
    meta: [{ field: 'status', a: 'REL', b: 'DFT', changed: true }],
    print_settings: [
      { field: 'layer_height', a: 0.2, b: '0.2', changed: false },
      { field: 'material', a: 'PLA', b: 'PETG', changed: true },
    ],
    bom: [
      { child_item_id: 3, item_number: 'X-prt-001', name: 'Halter', item_type: 'prt',
        a: { quantity: 2, unit: 'Stk' }, b: { quantity: 3, unit: 'Stk' }, change: 'changed', qty_changed: true },
      { child_item_id: 4, item_number: 'X-prt-002', name: 'Clip', item_type: 'prt',
        a: null, b: { quantity: 1, unit: 'Stk', pinned_rev: '3' }, change: 'added' },
    ],
    bom_std: [],
    datasets: [{ ds_type: 'CAD', name: 'x_rev2.stl', change: 'same', content: 'identical',
      a: { original_name: 'x_rev1.stl', file_size: 10, version: '1' }, b: { original_name: 'x_rev2.stl', file_size: 10, version: '1' } }],
    summary: { meta: 1, print_settings: 1, bom: 2, bom_std: 0, datasets: 0 },
  };
  const only = _renderRevisionCompare(c, true);
  assert.match(only, /4 Unterschiede von rev1 nach rev2/);
  assert.match(only, /Material/);
  assert.match(only, /PETG/);
  assert.ok(!only.includes('Schichthöhe'), 'unveränderte Parameter ausgeblendet');
  assert.match(only, />neu</);
  assert.match(only, />geändert</);
  assert.match(only, /Menge/, 'Art der Änderung steht dabei');
  assert.match(only, /🔒rev3/, 'fixierte Revision in der Stückliste');
  assert.match(only, /🚚/, 'gelieferte Revision gekennzeichnet');

  const full = _renderRevisionCompare(c, false);
  assert.match(full, /Schichthöhe/, 'Bezeichnung wie im Datenblatt');
  assert.match(full, /Inhalt gleich/);
  for (const h of [only, full]) assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

// Kunden und Lieferanten teilen sich die Darstellung (GESCHÄFTSPARTNER).
// Die Helfer sind im Browser globale Konstanten; hier aus dem Ausschnitt holen.
Object.assign(global, evalPart('js/01-core.js', 'const _pref =', 'function _setPref', '({ _pref })'));
const PARTNER = evalPart('js/05-erp-views.js', '// ── GESCHÄFTSPARTNER', '// Auftragsphasen',
  '({ _visiblePartners, _partnerCard, _partnerTable, _partner, _mailLink, _telLink, _pill })');
Object.assign(global, { _mailLink: PARTNER._mailLink, _telLink: PARTNER._telLink, _pill: PARTNER._pill });
evalPart('js/13-normteile-einkauf.js', '// ── LIEFERANTEN', 'function _renderSupplierTab', '0');
const ids = kind => PARTNER._visiblePartners(kind).map(p => p.id);

test('Kunden: alphabetisch als Standard, Suche mit mehreren Wörtern, Filter und Sortierung', () => {
  global.state.customers = [
    { id: 1, number: 'KD001', name: 'Muster AG', city: 'Zürich', email: 'info@muster.ch', order_count: 3,
      open_order_count: 1, open_quote_count: 0, revenue: 500, last_activity: '2026-09-01' },
    { id: 2, number: 'KD002', name: 'muster GmbH', city: 'Bern', order_count: 0,
      open_order_count: 0, open_quote_count: 0, revenue: 0, last_activity: null, created_at: '2026-10-01 08:00:00' },
    { id: 3, number: 'KD010', name: 'Alpha SA', city: 'Genf', order_count: 1,
      open_order_count: 0, open_quote_count: 1, revenue: 900, last_activity: '2026-07-15' },
  ];
  const { filter } = PARTNER._partner.customer;
  // Die Wahl kommt aus den Einstellungen, wie sie _partnerSetSort speichert
  const sortBy = sort => { global.state.settings.customer_view = JSON.stringify({ view: 'cards', sort, sortChosen: true }); };
  assert.strictEqual(PARTNER._partner.customer.prefs.sort, 'name', 'ohne eigene Wahl nach Name');
  assert.deepStrictEqual(ids('customer'), [3, 1, 2], 'Gross-/Kleinschreibung spielt keine Rolle');
  Object.assign(filter, { text: 'muster zürich', show: '' });
  assert.deepStrictEqual(ids('customer'), [1], 'alle Wörter müssen passen');
  Object.assign(filter, { text: '', show: 'open' });
  assert.deepStrictEqual(ids('customer'), [3, 1], 'offene Aufträge oder Angebote');
  Object.assign(filter, { text: '', show: 'none' });
  assert.deepStrictEqual(ids('customer'), [2]);
  Object.assign(filter, { text: '', show: '' });
  sortBy('recent');
  assert.deepStrictEqual(ids('customer'), [2, 1, 3], 'neuer Kunde ohne Auftrag zählt mit Anlagedatum');
  sortBy('value');
  assert.deepStrictEqual(ids('customer'), [3, 1, 2]);
  sortBy('number');
  assert.deepStrictEqual(ids('customer'), [3, 2, 1], 'KD010 vor KD002');
  delete global.state.settings.customer_view;
});

test('Kunden: Karte zeigt Kontakt, offene Vorgänge und Umsatz, Namen werden escaped', () => {
  const card = PARTNER._partnerCard('customer', { id: 7, number: 'KD007', name: 'Böse <b>AG</b>', postal_code: '8000', city: 'Zürich',
    email: 'a@b.ch', phone: '044 123 45 67', order_count: 2, open_order_count: 2, open_quote_count: 1,
    revenue: 1200, last_activity: '2026-10-01' });
  assert.ok(!card.includes('<b>AG</b>'), 'kein HTML aus dem Namen');
  assert.match(card, /title="Böse &lt;b&gt;AG&lt;\/b&gt;"/);
  assert.match(card, /href="mailto:a@b\.ch"/);
  assert.match(card, /href="tel:0441234567"/);
  assert.match(card, /2 offene Aufträge/);
  assert.match(card, /1 Angebot offen/);
  assert.match(card, /CHF 1200\.00/);
  assert.match(card, /8000 Zürich/);
  assert.match(card, /openOrderModal\(null,\{customerId:7\}\)/, 'Schnellaktion legt Auftrag für den Kunden an');

  const leer = PARTNER._partnerCard('customer', { id: 8, number: 'KD008', name: 'Neu', order_count: 0, open_order_count: 0, open_quote_count: 0, revenue: 0 });
  assert.match(leer, /Keine Kontaktdaten/);
  assert.match(leer, /Noch keine Aufträge/);
  assert.ok(!leer.includes('partner-value'), 'kein Umsatz ohne Aufträge');
  assert.match(PARTNER._partnerTable('customer', [{ id: 9, number: 'KD009', name: 'X', order_count: 0, revenue: 0 }]), /data-id="9"/);
});

test('Lieferanten: gleiche Karten wie Kunden, mit Kontaktperson, offenen Bestellungen und Volumen', () => {
  global.state.suppliers = [
    { id: 5, number: 'LF-0002', name: 'Zeta Filament', contact_person: 'Anna Keller', email: 'a@zeta.ch', city: 'Basel', postal_code: '4051',
      po_count: 4, open_po_count: 1, volume: 820, inventory_count: 3, last_activity: '2026-10-02' },
    { id: 6, number: 'LF-0001', name: 'Alu Profil AG', address: 'Werkstr. 9\nirgendwo', po_count: 0, open_po_count: 0, volume: 0 },
  ];
  assert.deepStrictEqual(ids('supplier'), [6, 5], 'alphabetisch');
  PARTNER._partner.supplier.filter.show = 'open';
  assert.deepStrictEqual(ids('supplier'), [5]);
  PARTNER._partner.supplier.filter.show = '';
  PARTNER._partner.supplier.filter.text = 'anna';
  assert.deepStrictEqual(ids('supplier'), [5], 'Suche über die Kontaktperson');
  PARTNER._partner.supplier.filter.text = '';

  const card = PARTNER._partnerCard('supplier', global.state.suppliers[0]);
  assert.match(card, /partner-card/, 'dieselbe Karte wie bei Kunden');
  assert.match(card, /👤 Anna Keller/);
  assert.match(card, /1 offene Bestellung</);
  assert.match(card, /3 Lagerartikel/);
  assert.match(card, /CHF 820\.00/);
  assert.match(card, /4051 Basel/);
  assert.match(card, /openPoModal\(null,\{supplierId:5\}\)/);
  assert.match(PARTNER._partnerCard('supplier', global.state.suppliers[1]), /Noch keine Bestellungen/);
});

// ── Benutzer ──────────────────────────────────────────────────

test('Benutzer: Kacheln escapen Namen, beim Nachfragen steht die bisherige Person vorne', () => {
  const users = [{ id: 1, name: 'Anna', role: 'admin', has_pin: true }, { id: 2, name: '<b>Ben</b>', role: 'user' },
    { id: 3, name: 'Cleo', role: 'superuser' }];
  const h = WHO._whoTiles(users, 3);
  assert.ok(!h.includes('<b>Ben'), 'Name escaped');
  assert.ok(h.indexOf('data-id="3"') < h.indexOf('data-id="1"'), 'bisherige Person zuerst');
  assert.match(h, /who-tile current" data-id="3"/);
  assert.match(h, /Admin · PIN/);
  assert.match(h, /Superuser/);
  assert.ok(WHO._whoTiles(users, null).indexOf('data-id="1"') < WHO._whoTiles(users, null).indexOf('data-id="3"'),
    'ohne bisherige Person: Reihenfolge vom Server');
});

test('Benutzer: allein darf man alles, im Team gilt die Rolle', () => {
  const was = global.state.session;
  const as = (mode, role) => { global.state.session = { mode, user: role ? { name: 'X', role } : null }; };
  try {
    global.state.session = null;
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [true, true], 'ohne Personen wie bisher');
    as('single', 'admin');
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [true, true]);
    as('team', 'user');
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [false, false]);
    as('team', 'superuser');
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [true, false]);
    as('team', 'admin');
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [true, true]);
    as('team', null);
    assert.deepStrictEqual([WHO.canRelease(), WHO.isAdmin()], [false, false], 'niemand gewählt');
  } finally { global.state.session = was; }
});

test('Historie: Name der Person steht dabei, escaped', () => {
  assert.strictEqual(_clUser({}), '', 'ältere Einträge ohne Namen');
  assert.match(_clUser({ user_name: '<i>x</i>' }), /&lt;i&gt;x&lt;\/i&gt;/);
  const item = demoItem({ changelog: [{ action: 'Erstellt', details: '', user_name: 'Anna', created_at: '2026-10-16 10:00:00' }] });
  global.state.item = item;
  assert.match(renderItemSheet(item, 31), /Erstellt <span class="cl-user">Anna<\/span>/, 'auch unter „Letzte Änderung“');
});

test('Benutzer verwalten: nur Admins, der einzige Admin bleibt Admin', () => {
  const users = [{ id: 1, name: 'Anna', role: 'admin', active: 1, has_pin: false },
    { id: 2, name: '<b>Ben</b>', role: 'user', active: 1 }, { id: 3, name: 'Cleo', role: 'superuser', active: 0 }];
  const team = { mode: 'team', idle_minutes: 30 };

  const asAdmin = WHO._usersPanel(users, team, true);
  assert.ok(!asAdmin.includes('<b>Ben'), 'Namen escaped');
  assert.match(asAdmin, /einziger Admin/);
  assert.ok(!asAdmin.includes('_saveUser(1, { active: false })'), 'einziger Admin nicht deaktivierbar');
  assert.ok(!/_saveUser\(1, \{ role:/.test(asAdmin), 'einziger Admin nicht herabstufbar');
  assert.match(asAdmin, /_saveUser\(2, \{ active: false \}\)/, 'andere schon');
  assert.match(asAdmin, /Ohne PIN kann jede Person die Admin-Kachel wählen/);
  assert.match(asAdmin, /_saveUser\(3, \{ active: true \}\)/, 'Deaktivierte lassen sich aktivieren');

  const zweiAdmins = WHO._usersPanel([...users, { id: 4, name: 'Dora', role: 'admin', active: 1, has_pin: true }], team, true);
  assert.match(zweiAdmins, /_saveUser\(1, \{ active: false \}\)/, 'mit zweitem Admin wieder möglich');

  const asUser = WHO._usersPanel(users, team, false);
  assert.match(asUser, /Personen verwalten dürfen nur Admins/);
  for (const action of ['_saveUser(', '_addUser(', '_setUserPin(', '_saveIdleMinutes(']) {
    assert.ok(!asUser.includes(action), `kein ${action} für Nicht-Admins`);
  }
  assert.match(asUser, /Nach 30 Minuten ohne Aktivität fragt PLM/);
});

// ── Druckparameter im Datenblatt und als PDF ──────────────────
const PS_DEMO = { revision_id: 31, material: 'PETG', color: 'Schwarz', layer_height: '0.2', infill: '20', infill_pattern: 'gyroid',
  supports: 0, nozzle: '0.4', print_temp: '240', bed_temp: '85', printer: 'Original Prusa MK4S',
  part_weight: 41.5, filament_weight_total: 45.2, print_duration: 2.5, filament_price_kg: 24,
  printer_cost_hr: 1.2, raw_material_id: 3, raw_material_name: 'Prusament PETG Jet Black', notes: 'Naht hinten' };

test('Datenblatt: Druckparameter kompakt, eine Zeile je Wert', () => {
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'DFT', datasets: [], print_settings: PS_DEMO }] });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  const ps = h.slice(h.indexOf('Druckparameter'));
  assert.match(ps, /class="ps-kv"/);
  assert.match(ps, /<span class="ps-kv-label">Düse<\/span><span class="ps-kv-val">0.4 mm<\/span>/);
  assert.match(ps, /Druckdauer[\s\S]*2 h 30 min/);
  assert.match(ps, /<span class="ps-kv-label">Füllmuster<\/span><span class="ps-kv-val">Gyroid<\/span>/, 'Füllmuster statt Farbe');
  assert.ok(!ps.includes('Farbe') && !ps.includes('Schwarz'));
  assert.ok(!ps.slice(0, ps.indexOf('Naht hinten')).includes('ps-cell'), 'keine Kacheln mehr');
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

test('Füllmuster: Slicer-Schlüssel werden zu lesbaren Namen', () => {
  assert.strictEqual(fmtPrintParam('infill_pattern', 'gyroid'), 'Gyroid');
  assert.strictEqual(fmtPrintParam('infill_pattern', 'zig-zag'), 'Geradlinig', 'so heisst es in Orca und Bambu');
  assert.strictEqual(fmtPrintParam('infill_pattern', 'AdaptiveCubic'), 'Adaptiv kubisch');
  assert.strictEqual(fmtPrintParam('infill_pattern', 'lateral-lattice'), 'Lateral-lattice', 'unbekannt: wie im Slicer');
  assert.strictEqual(printParamLabel('infill_pattern'), 'Füllmuster');
  assert.ok(!PRINT_PARAMS.slice(0, 12).some(([k]) => k === 'color'), 'Farbe nicht mehr im Datenblatt');
});

evalPart('js/10-documents.js', 'function escHtml(', '// type:', 'globalThis.escHtml = escHtml');
const { generateItemTemplate, getPruefTemplate } = evalPart('js/10-documents.js', '// -- DOKUMENTVORLAGEN',
  '// -- PDF GENERATION', '({ generateItemTemplate, getPruefTemplate })');

function pdfOf(item, activeRevId, type = 'datenblatt', opts) {
  let html = '';
  global.closeModal = () => {};
  global.window = { _docTemplateItem: item, open: () => ({ document: { write: h => { html += h; }, close() {} } }) };
  global.state.activeRevId = activeRevId;
  try { generateItemTemplate(type, opts); } finally { delete global.window; global.state.activeRevId = null; }
  return html;
}

test('PDF-Datenblatt: enthält Druckparameter, Notizen, Lager und echte Dateinamen', () => {
  const item = demoItem({
    short_code: 'K7M', notes: 'Nur in Schwarz liefern', dev_hours: 3.25, weight_g: 184,
    inventory: [{ name: 'Klemmbacke links', sku: 'KB-L', unit: 'Stk', stock_qty: 12, min_qty: 5, price_per_unit: 9.9 }],
    revisions: [
      { id: 32, rev: '3', status: 'DFT', description: 'Neu', datasets: [] },
      { id: 31, rev: '2', status: 'REL', description: 'Passung korrigiert', eco_reason: 'Zu eng',
        released_at: '2026-10-10 08:00:00', released_by: 'Anna', print_settings: PS_DEMO,
        datasets: [{ ds_type: 'CAD', filename: '1779473701990-1e39bb2a.3mf', original_name: 'P1042_rev2.3mf', file_size: 204800, uploaded_at: '2026-10-09' }] },
    ],
  });
  const h = pdfOf(item, 31);
  assert.match(h, /Revision rev2/, 'gewählte Revision, nicht die neuste');
  assert.match(h, /Kurzcode <b[^>]*>K7M-2</);
  assert.match(h, /<svg/, 'QR-Code im Kopf');
  for (const v of ['PETG', 'Gyroid', '0.4 mm', '240 °C', '85 °C', 'Original Prusa MK4S', '45.2 g', '2 h 30 min',
                   '24.00 CHF/kg', '1.20 CHF/h', 'Prusament PETG Jet Black', 'Naht hinten']) {
    assert.ok(h.includes(v), `Druckparameter: ${v}`);
  }
  assert.match(h, /Nur in Schwarz liefern/);
  assert.match(h, /Zu eng/);
  assert.match(h, /3 h 15 min/, 'Entwicklungszeit');
  assert.match(h, /KB-L/);
  assert.match(h, /P1042_rev2\.3mf/);
  assert.ok(!h.includes('1779473701990'), 'nicht der interne Speichername');
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

test('Briefkopf: mit Logo das Logo und der Firmenname, ohne Logo wie bisher', () => {
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'DFT', datasets: [] }] });
  global.location = { origin: 'http://plm' };
  try {
    global.state.settings = { company_name: 'Muster AG' };
    const ohne = pdfOf(item, 31);
    assert.ok(!ohne.includes('/api/settings/logo'), 'ohne Logo kein Bild');
    assert.match(ohne, /font-size:18px;font-weight:700;color:#1d4ed8">Muster AG</, 'bisheriger Kopf');
    global.state.settings = { company_name: 'Muster <AG>', company_logo_at: '1792491433174' };
    const mit = pdfOf(item, 31);
    assert.match(mit, /<img src="http:\/\/plm\/api\/settings\/logo\?v=1792491433174" alt="Muster &lt;AG&gt;"/);
    assert.match(mit, />Muster &lt;AG&gt;</, 'Firmenname bleibt, escaped');
    assert.ok(!mit.includes('font-size:18px;font-weight:700;color:#1d4ed8">'), 'Logo ersetzt den grossen Namen');
  } finally { global.state.settings = {}; delete global.location; }
});

test('PDF-Datenblatt: Teil ohne Angaben zeigt keine leeren Abschnitte', () => {
  const h = pdfOf({ id: 1, item_type: 'prt', item_number: 'X', name: 'Y', revisions: [] }, null);
  for (const sec of ['Druckparameter', 'Notizen', 'Lagerbestand', 'Dateien']) {
    assert.ok(!h.includes(`class="sec">${sec}`), `kein Abschnitt ${sec}`);
  }
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

// ── Prüfprotokoll-Vorlage aus den Einstellungen ───────────────
test('Prüfprotokoll-Vorlage: ohne Einstellung gilt der bisherige Standard', () => {
  for (const raw of [undefined, '', '{kaputt']) {
    const t = getPruefTemplate(raw);
    assert.deepStrictEqual(t.points.map(p => p.label), ['Masshaltigkeit / Abmessungen', 'Oberflächenqualität',
      'Materialprüfung', 'Funktionsprüfung', 'Kennzeichnung / Beschriftung', 'Verpackung / Versand'], `raw=${raw}`);
    assert.strictEqual(t.empty_rows, 3);
    assert.deepStrictEqual(t.decisions, ['Freigegeben', 'Nacharbeit', 'Ausschuss']);
    assert.deepStrictEqual(t.signatures, ['Geprüft durch', 'Freigegeben durch', 'Datum']);
  }
});

test('Prüfprotokoll-Vorlage: eigene Werte, fehlende Felder vom Standard, leere Listen bleiben leer', () => {
  const t = getPruefTemplate(JSON.stringify({
    points: [{ label: ' Gewinde M5 ', soll: 'Lehre gut' }, { label: '', soll: 'ohne Prüfpunkt' }, null],
    empty_rows: 99, decisions: [],
  }));
  assert.deepStrictEqual(t.points, [{ label: 'Gewinde M5', soll: 'Lehre gut' }], 'Zeilen ohne Prüfpunkt fallen weg');
  assert.strictEqual(t.empty_rows, 20, 'höchstens 20 Leerzeilen');
  assert.deepStrictEqual(t.decisions, [], 'Prüfentscheid bewusst weggelassen');
  assert.deepStrictEqual(t.signatures, ['Geprüft durch', 'Freigegeben durch', 'Datum']);
  assert.strictEqual(getPruefTemplate('{"empty_rows":-4}').empty_rows, 0);
});

test('Prüfprotokoll: Standard sieht aus wie bisher und öffnet den Druckdialog', () => {
  global.state.settings = {};
  const h = pdfOf(demoItem(), 31, 'pruefprotokoll');
  assert.match(h, /<td style="color:#9ca3af;font-size:12px">6<\/td>\s*<td>Verpackung \/ Versand<\/td>/);
  assert.strictEqual((h.match(/<tr style="height:28px">/g) || []).length, 9, '6 Prüfpunkte + 3 Leerzeilen');
  for (const v of ['Prüfentscheid', 'Nacharbeit', 'Ausschuss', 'Geprüft durch', 'Freigegeben durch']) assert.ok(h.includes(v), v);
  assert.match(h, /window\.print\(\)/);
  assert.ok(!h.includes('undefined') && !h.includes('NaN'));
});

test('Prüfprotokoll: folgt der gespeicherten Vorlage', () => {
  global.state.settings = { pruef_template: JSON.stringify({
    points: [{ label: 'Gewinde <M5>', soll: 'Lehre gut' }, { label: 'Gewicht', soll: '12 ± 0.5 g' }],
    empty_rows: 1, decisions: [], signatures: ['Prüfer'], note: 'Prüfmittel: Messschieber\nbei Tageslicht' }) };
  try {
    const h = pdfOf(demoItem(), 31, 'pruefprotokoll');
    assert.match(h, /<td>Gewinde &lt;M5&gt;<\/td><td>Lehre gut<\/td>/, 'Soll vorgedruckt, Text escaped');
    assert.match(h, /<td>Gewicht<\/td><td>12 ± 0.5 g<\/td>/);
    assert.strictEqual((h.match(/<tr style="height:28px">/g) || []).length, 3, '2 Prüfpunkte + 1 Leerzeile');
    assert.ok(!h.includes('Prüfentscheid'), 'ohne Entscheid kein Abschnitt');
    assert.match(h, />Prüfer<\/div>/);
    assert.ok(!h.includes('Freigegeben durch'));
    assert.match(h, /Prüfmittel: Messschieber<br>bei Tageslicht/);
    assert.ok(!h.includes('Masshaltigkeit'));
  } finally { global.state.settings = {}; }
});

test('Prüfprotokoll: Vorschau aus den Einstellungen ohne Druckdialog', () => {
  const item = { id: 0, item_type: 'prt', item_number: 'P000-prt-001', name: 'Beispielteil', revisions: [{ id: 0, rev: '1', status: 'DFT' }] };
  const h = pdfOf(null, null, 'pruefprotokoll', { item, pruef: getPruefTemplate('{"points":[{"label":"Probe"}]}'), preview: true });
  assert.match(h, /P000-prt-001/);
  assert.match(h, /<td>Probe<\/td>/);
  assert.ok(!h.includes('window.print'), 'kein Druckdialog in der Vorschau');
});

test('Datenblatt: „Allgemein“ im selben kompakten Stil wie die Druckparameter', () => {
  const item = demoItem({ default_price: null, dev_hours: 1.5 });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  const allg = h.slice(h.indexOf('>Allgemein<'), h.indexOf('>Notizen<'));
  assert.match(allg, /class="ps-kv"/);
  assert.ok(!allg.includes('ps-cell'), 'keine Kacheln mehr');
  assert.match(allg, /<span class="ps-kv-label">Gewicht<\/span><span class="ps-kv-val">184\.0 g<\/span>/);
  assert.match(allg, /<span class="ps-kv-label">Klassifizierung<\/span><span class="ps-kv-val"><span class="chip">Bauteil<\/span><\/span>/, 'Chip als HTML');
  assert.match(allg, /<span class="ps-kv-label">Verkaufspreis<\/span><span class="ps-kv-val" style="color:var\(--t3\)">— <button/, 'fehlender Wert gedimmt');
  assert.match(allg, /Entwicklungszeit<\/span><span class="ps-kv-val">1 h 30 min</);
});

test('Datenblatt: Verkaufspreis bleibt bei freigegebener Revision änderbar', () => {
  const item = demoItem({ revisions: [{ id: 31, rev: '2', status: 'REL', description: 'Freigabe', datasets: [] }] });
  global.state.item = item;
  const h = renderItemSheet(item, 31);
  assert.ok(!h.includes('Jetzt ergänzen') && !h.includes('openEditItemModal'), 'übrige Felder gesperrt');
  assert.match(h, /CHF 59\.48 <button[^>]*onclick="openPriceModal\(7\)"/, '✏ direkt hinter dem Preis');
});

test('Version: Punkt blau bei Update, grün wenn aktuell, grau wenn der Stand unbekannt ist', () => {
  const { _markUpdate } = evalPart('js/01-core.js', 'function _markUpdate(', 'const UPDATE_CHECK_MS', '({ _markUpdate })');
  const cls = new Set();
  const el = { dataset: { title: 'Stand 25.10.2026 · 077524c' }, title: '',
    classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } };
  global.document = { getElementById: () => el };
  const dot = update => { global.state.update = update; _markUpdate(); return [...cls].join(' '); };
  try {
    assert.strictEqual(dot(undefined), '', 'vor der ersten Prüfung kein Punkt');
    assert.strictEqual(dot({ available: true, fetched: true, version: '2.0.315', behind: 1 }), 'has-update');
    assert.strictEqual(dot({ available: false, fetched: true, upstream: 'origin/main' }), 'up-to-date');
    assert.strictEqual(dot({ available: false, fetched: false, error: 'Remote nicht erreichbar: offline' }), 'update-unknown');
    assert.match(el.title, /Update-Prüfung nicht möglich: Remote nicht erreichbar/);
    assert.match(el.title, /077524c/, 'Stand bleibt im Tooltip');
    // Offline, aber vom letzten Abruf ist ein Update bekannt: weiter blau
    assert.strictEqual(dot({ available: true, fetched: false, version: '2.0.315', behind: 1 }), 'has-update');
  } finally {
    delete global.document;
    delete global.state.update;
  }
});
