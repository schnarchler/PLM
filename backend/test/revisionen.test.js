// Tests für den gelieferten Stand (Revisionen fixieren beim Liefern),
// den Revisionsvergleich, ECO-Übernahme, Suche mit Klassifizierung und das
// Umbenennen von Klassifizierungen.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3995;
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc, dataDir;

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(BASE + url, opts);
  if (!r.ok) throw new Error(`${method} ${url} → HTTP ${r.status}: ${await r.text()}`);
  return r.json();
}
async function apiFails(url, method, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) };
  const r = await fetch(BASE + url, opts);
  return { status: r.status, text: await r.text() };
}
async function upload(revId, name, content) {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return fetch(`${BASE}/api/revisions/${revId}/datasets`, { method: 'POST', body: form });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-rev-'));
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

const item = id => api(`/api/items/${id}`);
const firstRev = async id => (await item(id)).revisions.at(-1);

// Projekt mit Bauteil und Baugruppe (Bauteil 2× verbaut) und einem
// eigenständigen Produktionsauftrag, der beides enthält.
async function setup(name) {
  const proj = await api('/api/projects', 'POST', { name });
  const teil = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Halter', item_type: 'prt' });
  const bg = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Gerät', item_type: 'asm' });
  await api(`/api/revisions/${(await firstRev(bg.id)).id}/bom`, 'POST', { child_item_id: teil.id, quantity: 2, unit: 'Stk' });
  const d = await api('/api/deliveries', 'POST', { title: 'Lieferung ' + name });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { description: 'Halter', quantity: 5, item_id: teil.id });
  await api(`/api/deliveries/${d.id}/items`, 'POST', { description: 'Gerät', quantity: 3, item_id: bg.id });
  return { proj, teil, bg, d };
}

test('Gelieferter Stand: Revision wird beim Liefern fixiert und gesperrt', async () => {
  const { teil, bg, d } = await setup('Stand');
  const r1 = await firstRev(teil.id);

  let pos = (await api(`/api/deliveries/${d.id}`)).items;
  assert.strictEqual(pos[0].revision_id, null, 'vor der Lieferung folgt die Position automatisch');
  assert.strictEqual(pos[0].effective_rev.rev, '1');

  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'DELIVERED' });
  pos = (await api(`/api/deliveries/${d.id}`)).items;
  assert.strictEqual(pos[0].revision_id, r1.id, 'Bauteil auf rev1 fixiert');
  assert.strictEqual(pos[0].rev_fixed, 'delivery');
  const asm = pos.find(p => p.item_id === bg.id);
  assert.strictEqual(asm.structure.length, 1, 'Struktur der Baugruppe festgehalten');
  assert.strictEqual(asm.structure[0].revision_id, r1.id);
  assert.strictEqual(asm.structure[0].unit_qty, 2);

  const detail = await item(teil.id);
  assert.strictEqual(detail.delivered, true);
  assert.strictEqual(detail.revisions[0].delivered[0].number, d.number);

  // Gesperrt: Dateien, Druckparameter, Löschen
  const up = await upload(r1.id, 'neu.stl', 'solid x');
  assert.strictEqual(up.status, 409, 'kein Upload in eine gelieferte Revision');
  assert.strictEqual((await apiFails(`/api/revisions/${r1.id}/print-settings`, 'PUT', { material: 'PLA' })).status, 409);
  assert.strictEqual((await apiFails(`/api/items/${teil.id}`, 'DELETE')).status, 409, 'gelieferte Items nicht normal löschbar');
  const bgRev = await firstRev(bg.id);
  const other = await api(`/api/projects/${teil.project_id}/items`, 'POST', { name: 'Zusatz', item_type: 'prt' });
  assert.strictEqual((await apiFails(`/api/revisions/${bgRev.id}/bom`, 'POST', { child_item_id: other.id })).status, 409,
    'Stückliste einer gelieferten Baugruppe ist gesperrt');

  // Weiterarbeiten in einer neuen Revision
  const r2 = await api(`/api/items/${teil.id}/revisions`, 'POST', { description: 'Verstärkt' });
  await api(`/api/revisions/${r2.id}/print-settings`, 'PUT', { material: 'PETG' });
  pos = (await api(`/api/deliveries/${d.id}`)).items;
  assert.strictEqual(pos[0].effective_rev.rev, '1', 'geliefert bleibt rev1');
  assert.strictEqual(pos[0].rev_outdated, true, 'mit Hinweis auf die neuere Revision');

  const usage = await api(`/api/items/${teil.id}/erp-usage`);
  assert.strictEqual(usage.deliveries[0].rev, '1');
  assert.strictEqual(usage.deliveries[0].rev_outdated, true);
  assert.strictEqual(usage.via_assembly.length, 1, 'auch als Teil der Baugruppe nachgewiesen');
  assert.strictEqual(usage.via_assembly[0].quantity, 6, '3 Geräte × 2 Halter');
  assert.strictEqual(usage.via_assembly[0].via_item_number, bg.item_number);

  // Zurück aus „Geliefert": Stand wird wieder gelöst
  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'READY' });
  pos = (await api(`/api/deliveries/${d.id}`)).items;
  assert.strictEqual(pos[0].revision_id, null);
  assert.ok(!pos.find(p => p.item_id === bg.id).structure, 'Strukturkopie entfällt');
  await api(`/api/revisions/${r1.id}/print-settings`, 'PUT', { material: 'PLA' });
});

test('Gelieferter Stand: von Hand gewählte Revision bleibt, nach Lieferung nur korrigierbar', async () => {
  const { teil, d } = await setup('Manuell');
  const r1 = await firstRev(teil.id);
  const r2 = await api(`/api/items/${teil.id}/revisions`, 'POST', {});
  const di = (await api(`/api/deliveries/${d.id}`)).items[0];

  await api(`/api/delivery-items/${di.id}/revision`, 'PUT', { rev_id: r1.id });
  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'DELIVERED' });
  let pos = (await api(`/api/deliveries/${d.id}`)).items[0];
  assert.strictEqual(pos.revision_id, r1.id, 'die gewählte rev1 wird geliefert, nicht die aktive rev2');
  assert.strictEqual(pos.rev_fixed, 'manual');

  const loose = await apiFails(`/api/delivery-items/${di.id}/revision`, 'PUT', { rev_id: null });
  assert.strictEqual(loose.status, 400, 'geliefert lässt sich nicht auf automatisch stellen');
  await api(`/api/delivery-items/${di.id}/revision`, 'PUT', { rev_id: r2.id });
  assert.strictEqual((await api(`/api/deliveries/${d.id}`)).items[0].revision_id, r2.id, 'Korrektur ist möglich');

  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'READY' });
  assert.strictEqual((await api(`/api/deliveries/${d.id}`)).items[0].revision_id, r2.id, 'von Hand gewählt bleibt');

  const foreign = await firstRev((await setup('Fremd')).teil.id);
  assert.strictEqual((await apiFails(`/api/delivery-items/${di.id}/revision`, 'PUT', { rev_id: foreign.id })).status, 400);
});

test('Gelieferter Stand: Check-in legt eine neue Revision an', async () => {
  const { teil, d } = await setup('Checkin');
  const r1 = await firstRev(teil.id);
  assert.ok((await upload(r1.id, 'halter.stl', 'solid rev1')).ok);
  await api(`/api/deliveries/${d.id}/status`, 'PUT', { status: 'DELIVERED' });

  const co = await api(`/api/items/${teil.id}/checkout`, 'POST', {});
  assert.ok(co.folder, 'Checkout-Ordner angelegt');
  fs.writeFileSync(path.join(co.folder, 'halter.stl'), 'solid geaendert');
  await api('/api/checkout/checkin', 'POST', { folder: co.folder });

  const fresh = await item(teil.id);
  assert.strictEqual(fresh.revisions.length, 2, 'neue Revision statt Überschreiben');
  const old = fresh.revisions.find(r => r.id === r1.id);
  assert.strictEqual(old.datasets.length, 1, 'rev1 bleibt unverändert');
  assert.ok(fresh.revisions[0].datasets.length >= 1, 'Dateien landen in rev2');
});

test('Revisionen vergleichen: Stückliste, Druckparameter und Dateien', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Vergleich' });
  const mk = (n, t = 'prt') => api(`/api/projects/${proj.id}/items`, 'POST', { name: n, item_type: t });
  const a = await mk('A'), b = await mk('B'), c = await mk('C'), bg = await mk('Baugruppe', 'asm');
  const r1 = await firstRev(bg.id);
  await api(`/api/revisions/${r1.id}/bom`, 'POST', { child_item_id: a.id, quantity: 2, unit: 'Stk' });
  await api(`/api/revisions/${r1.id}/bom`, 'POST', { child_item_id: b.id, quantity: 1, unit: 'Stk' });
  await api(`/api/revisions/${r1.id}/print-settings`, 'PUT', { material: 'PLA', layer_height: '0.2' });
  assert.ok((await upload(r1.id, 'deckel.stl', 'solid deckel')).ok);
  assert.ok((await upload(r1.id, 'zeichnung.pdf', '%PDF alt')).ok);

  const r2 = await api(`/api/items/${bg.id}/revisions`, 'POST', {});
  const rev2 = (await item(bg.id)).revisions.find(r => r.id === r2.id);
  const rowA = rev2.bom.find(x => x.child_item_id === a.id), rowB = rev2.bom.find(x => x.child_item_id === b.id);
  await api(`/api/bom/${rowA.id}/quantity`, 'PUT', { quantity: 3, unit: 'Stk' });
  await api(`/api/bom/${rowB.id}`, 'DELETE');
  await api(`/api/revisions/${r2.id}/bom`, 'POST', { child_item_id: c.id, quantity: 1, unit: 'Stk' });
  await api(`/api/revisions/${r2.id}/print-settings`, 'PUT', { material: 'PETG', layer_height: 0.2 });
  const pdf = rev2.datasets.find(x => x.original_name.endsWith('.pdf'));
  await api(`/api/datasets/${pdf.id}`, 'DELETE');
  assert.ok((await upload(r2.id, 'zeichnung.pdf', '%PDF neu und länger')).ok);

  const cmp = await api(`/api/items/${bg.id}/compare?a=${r1.id}&b=${r2.id}`);
  const by = (list, key, val) => list.find(x => x[key] === val);
  assert.strictEqual(by(cmp.bom, 'child_item_id', a.id).change, 'changed');
  assert.strictEqual(by(cmp.bom, 'child_item_id', a.id).qty_changed, true);
  assert.strictEqual(by(cmp.bom, 'child_item_id', b.id).change, 'removed');
  assert.strictEqual(by(cmp.bom, 'child_item_id', c.id).change, 'added');
  assert.strictEqual(by(cmp.print_settings, 'field', 'material').changed, true);
  assert.strictEqual(by(cmp.print_settings, 'field', 'layer_height').changed, false, '0.2 und "0.2" sind gleich');
  const stl = cmp.datasets.find(x => x.ds_type === 'CAD');
  assert.strictEqual(stl.change, 'same', 'kopierte Datei ist unverändert');
  assert.strictEqual(stl.content, 'identical');
  assert.strictEqual(cmp.datasets.find(x => x.ds_type === 'PDF').change, 'changed', 'neue Zeichnung erkannt');
  assert.strictEqual(cmp.summary.bom, 3);

  const foreign = await firstRev(a.id);
  assert.strictEqual((await fetch(`${BASE}/api/items/${bg.id}/compare?a=${r1.id}&b=${foreign.id}`)).status, 400,
    'fremde Revision wird abgewiesen');
});

test('ECO übernimmt Stückliste und Druckparameter in die neue Revision', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'ECO' });
  const teil = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Teil', item_type: 'prt' });
  const bg = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'BG', item_type: 'asm' });
  const tr = await firstRev(teil.id), br = await firstRev(bg.id);
  await api(`/api/revisions/${br.id}/bom`, 'POST', { child_item_id: teil.id, quantity: 4, unit: 'Stk' });
  await api(`/api/revisions/${br.id}/print-settings`, 'PUT', { material: 'ASA' });
  for (const rev of [tr, br]) {
    await api(`/api/revisions/${rev.id}/status`, 'PUT', { status: 'REV' });
    await api(`/api/revisions/${rev.id}/status`, 'PUT', { status: 'REL', released_by: 'Test' });
  }
  await api(`/api/revisions/${br.id}/status`, 'PUT', { status: 'ECO', eco_reason: 'Neue Bohrung' });
  const fresh = (await item(bg.id)).revisions[0];
  assert.strictEqual(fresh.status, 'DFT');
  assert.strictEqual(fresh.bom.length, 1, 'Stückliste übernommen');
  assert.strictEqual(fresh.bom[0].quantity, 4);
  assert.strictEqual(fresh.print_settings.material, 'ASA', 'Druckparameter übernommen');
});

test('Suche: mehrere Wörter und Filter nach Klassifizierung', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Suche' });
  const mk = (name, classification, description = '') =>
    api(`/api/projects/${proj.id}/items`, 'POST', { name, item_type: 'prt', classification, description });
  const links = await mk('Wandhalter links', 'Kaufteil', 'aus PETG gedruckt');
  await mk('Wandhalter rechts', 'Eigenteil', 'aus PLA');
  await mk('Gehäusedeckel', 'Kaufteil');
  const lower = await mk('Kabelclip', ' kaufteil ');
  assert.strictEqual(lower.classification, 'Kaufteil', 'Schreibweise wird auf die Liste gezogen');

  const words = await api('/api/search?q=' + encodeURIComponent('Wandhalter PETG'));
  assert.deepStrictEqual(words.items.map(i => i.id), [links.id], 'alle Wörter müssen vorkommen');

  const cls = await api('/api/search?q=&class=Kaufteil');
  assert.strictEqual(cls.items.length, 3, 'Filter ohne Suchwort listet die ganze Klasse');
  assert.strictEqual(cls.orders.length, 0, 'andere Bereiche entfallen beim Klassenfilter');

  const counts = await api('/api/search?q=Wandhalter');
  const n = name => counts.class_counts.find(c => c.name === name)?.count || 0;
  assert.strictEqual(n('Kaufteil'), 1);
  assert.strictEqual(n('Eigenteil'), 1);

  const none = await mk('Unbestimmt', '');
  const empty = await api('/api/search?class=__none__');
  assert.ok(empty.items.some(i => i.id === none.id), 'Filter „ohne Klassifizierung"');

  const exact = await api('/api/search?q=' + encodeURIComponent(links.item_number));
  assert.strictEqual(exact.items[0].id, links.id, 'exakte Nummer steht vorne');

  const oese = await mk('Öse M5', 'Normteil');
  const umlaut = await api('/api/search?q=' + encodeURIComponent('öse'));
  assert.ok(umlaut.items.some(i => i.id === oese.id), 'Umlaut unabhängig von Gross-/Kleinschreibung');
});

test('Klassifizierung umbenennen überträgt den Namen auf die Items', async () => {
  const proj = await api('/api/projects', 'POST', { name: 'Umbenennen' });
  const x = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'X', item_type: 'prt', classification: 'Halbzeug' });
  const y = await api(`/api/projects/${proj.id}/items`, 'POST', { name: 'Y', item_type: 'prt', classification: 'Rohmaterial' });

  const r = await api('/api/classifications/rename', 'POST',
    { renames: [{ from: 'Halbzeug', to: 'Rohmaterial' }, { from: 'Rohmaterial', to: 'Halbzeug' }] });
  assert.ok(r.renamed >= 2);
  assert.strictEqual((await item(x.id)).classification, 'Rohmaterial', 'Tausch A↔B überschreibt nichts');
  assert.strictEqual((await item(y.id)).classification, 'Halbzeug');

  await api('/api/settings', 'PUT', { default_class_own: 'Halbzeug' });
  await api('/api/classifications/rename', 'POST', { renames: [{ from: 'Halbzeug', to: 'Profil' }] });
  assert.strictEqual((await api('/api/settings')).default_class_own, 'Profil', 'Voreinstellung zieht mit');
  await api('/api/settings', 'PUT', { default_class_own: '' });
  const usage = await api('/api/classifications/usage');
  const profil = usage.usage.find(u => u.name === 'Profil');
  assert.ok(profil && profil.count >= 1);
  assert.strictEqual(profil.in_list, false, 'nicht in der Liste wird gemeldet');

  await api('/api/classifications/rename', 'POST', { renames: [{ from: 'Profil', to: '' }] });
  assert.strictEqual((await item(y.id)).classification, null, 'leerer Name entfernt die Klassifizierung');
});
