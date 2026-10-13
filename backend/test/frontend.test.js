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

// ── Mindmap-Layout ────────────────────────────────────────────
const MM = (0, eval)(read('js/15-mindmap.js') + '; ({ _MM, _mmLayout, _mmNodeSvg, _mmEdgeSvg })');

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

// ── Workflow-Umschaltung ──────────────────────────────────────
test('Workflow: einfacher Modus bietet "Neue Revision" statt Review', () => {
  const src = read('js/02-plm-browse.js');
  const seg = src.slice(src.indexOf('  const simple = typeof simpleWorkflow'),
                        src.indexOf('  return `\n    <!-- Rev info -->'));
  const buttonsFor = (mode, status) => {
    global.simpleWorkflow = () => mode === 'simple';
    return (0, eval)('(function(rev, item){' + seg + 'return wfBtns;})')({ status, id: 7 }, { id: 3 });
  };
  assert.match(buttonsFor('full', 'DFT'), /In Review/);
  assert.match(buttonsFor('full', 'REV'), /Freigeben/);
  assert.match(buttonsFor('simple', 'DFT'), /Neue Revision/);
  assert.match(buttonsFor('simple', 'DFT'), /createNextRevision\(3\)/);
  assert.ok(!buttonsFor('simple', 'DFT').includes('In Review'));
  assert.match(buttonsFor('simple', 'REL'), /ECO starten/, 'freigegebene Stände behalten den ECO-Weg');
  for (const mode of ['full', 'simple']) {
    for (const st of ['DFT', 'REV', 'REL', 'ECO', 'OBS']) {
      assert.ok(!buttonsFor(mode, st).includes('undefined'), `${mode}/${st}`);
    }
  }
});
