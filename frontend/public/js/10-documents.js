// 10-documents.js — Itemvergleich, Revisionsvergleich, Dokumentvorlagen, PDF (Rechnung/Angebot/Lieferschein), Drucken
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// -- ITEMVERGLEICH ---------------------------------------------
let _compareSearchTimer;
function openItemCompareSearch(itemId) {
  window._compareBaseId = itemId;
  document.getElementById('cmp-search').value = '';
  document.getElementById('cmp-results').innerHTML = '';
  openModal('itemCompareModal');
  document.getElementById('cmp-search').focus();
}

function _compareSearch(q) {
  clearTimeout(_compareSearchTimer);
  const el = document.getElementById('cmp-results');
  if (!q) { el.innerHTML = ''; return; }
  _compareSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-for-bom?q=' + encodeURIComponent(q)).catch(() => []);
    const base = window._compareBaseId;
    const filtered = items.filter(i => i.id !== base);
    if (!filtered.length) { el.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>'; return; }
    el.innerHTML = filtered.map(i => `
      <div onclick="runItemCompare(${base},${i.id})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        ${_itemChip(i.item_type,16)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:12px;color:var(--t4);font-family:var(--mono)">${esc(i.project_number)}</span>
      </div>`).join('');
  }, 200);
}

async function runItemCompare(idA, idB) {
  closeModal('itemCompareModal');
  const [a, b] = await Promise.all([api('/api/items/' + idA), api('/api/items/' + idB)]);
  _renderCompare(a, b);
}

function _renderCompare(a, b) {
  const revA = a.revisions?.[0], revB = b.revisions?.[0];

  const metaRow = (label, vA, vB) => {
    const diff = String(vA||'') !== String(vB||'');
    const hi = diff ? 'background:#fef3c7' : '';
    return `<tr>
      <td style="color:#6b7280;font-weight:600;width:110px;padding:5px 8px;border:1px solid #e5e7eb;font-size:13px">${label}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;${hi}">${vA||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:13px;${hi}">${vB||'—'}</td>
    </tr>`;
  };

  const metaHtml = `<table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <thead><tr>
      <th style="padding:6px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;width:110px">Eigenschaft</th>
      <th style="padding:6px 8px;background:#eff6ff;border:1px solid #e5e7eb;font-size:13px;color:#1d4ed8;font-weight:700">${escHtml(a.item_number)}</th>
      <th style="padding:6px 8px;background:#f0fdf4;border:1px solid #e5e7eb;font-size:13px;color:#16a34a;font-weight:700">${escHtml(b.item_number)}</th>
    </tr></thead>
    <tbody>
      ${metaRow('Name', escHtml(a.name), escHtml(b.name))}
      ${metaRow('Typ', a.item_type.toUpperCase(), b.item_type.toUpperCase())}
      ${metaRow('Projekt', a.project?.number, b.project?.number)}
      ${metaRow('Klassifizierung', a.classification, b.classification)}
      ${metaRow('Gewicht (g)', a.effective_weight_g != null ? fmtN(a.effective_weight_g,1) : null, b.effective_weight_g != null ? fmtN(b.effective_weight_g,1) : null)}
      ${metaRow('Preis (CHF)', a.default_price != null ? fmtN(a.default_price,2) : null, b.default_price != null ? fmtN(b.default_price,2) : null)}
      ${metaRow('Akt. Revision', revA ? 'rev'+revA.rev+' ('+revA.status+')' : null, revB ? 'rev'+revB.rev+' ('+revB.status+')' : null)}
    </tbody></table>`;

  // BOM diff (only if both are ASM)
  let bomHtml = '';
  if (a.item_type === 'asm' && b.item_type === 'asm') {
    const bomA = revA?.bom || [], bomB = revB?.bom || [];
    const mapA = new Map(bomA.map(r => [r.child_item_id, r]));
    const mapB = new Map(bomB.map(r => [r.child_item_id, r]));
    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

    const rows = [...allIds].map(id => {
      const ra = mapA.get(id), rb = mapB.get(id);
      const item = ra || rb;
      const onlyA = ra && !rb, onlyB = !ra && rb;
      const qtyDiff = ra && rb && ra.quantity !== rb.quantity;
      const bg = onlyA ? '#fef2f2' : onlyB ? '#f0fdf4' : qtyDiff ? '#fef3c7' : '';
      return `<tr style="background:${bg}">
        <td style="font-family:monospace;font-size:12px;padding:4px 8px;border:1px solid #e5e7eb;color:#1d4ed8">${escHtml(item.item_number)}</td>
        <td style="font-size:13px;padding:4px 8px;border:1px solid #e5e7eb">${escHtml(item.name)}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace">${ra ? fmtN(ra.quantity,0)+' '+ra.unit : '<span style="color:#d1d5db">—</span>'}</td>
        <td style="text-align:center;padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace">${rb ? fmtN(rb.quantity,0)+' '+rb.unit : '<span style="color:#d1d5db">—</span>'}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:12px;color:${onlyA?'#dc2626':onlyB?'#16a34a':qtyDiff?'#d97706':'#9ca3af'}">${onlyA?'nur A':onlyB?'nur B':qtyDiff?'Mengenabw.':'='}</td>
      </tr>`;
    }).join('');

    bomHtml = `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin:16px 0 6px">Stückliste</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr>
        <th style="padding:5px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:11px;text-align:left;color:#6b7280">Item-Nummer</th>
        <th style="padding:5px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:11px;text-align:left;color:#6b7280">Name</th>
        <th style="padding:5px 8px;background:#eff6ff;border:1px solid #e5e7eb;font-size:11px;color:#1d4ed8">Menge A</th>
        <th style="padding:5px 8px;background:#f0fdf4;border:1px solid #e5e7eb;font-size:11px;color:#16a34a">Menge B</th>
        <th style="padding:5px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:11px;color:#6b7280">Diff</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="padding:8px;color:#9ca3af;text-align:center;border:1px solid #e5e7eb">Beide BOMs leer</td></tr>'}</tbody>
    </table>
    <div style="display:flex;gap:16px;font-size:12px;color:#6b7280">
      <span style="background:#fef2f2;padding:2px 8px;border-radius:4px">Rot = nur in A</span>
      <span style="background:#f0fdf4;padding:2px 8px;border-radius:4px">Grün = nur in B</span>
      <span style="background:#fef3c7;padding:2px 8px;border-radius:4px">Gelb = Mengenabweichung</span>
    </div>`;
  }

  // Datasets diff
  const dsA = (revA?.datasets || []).map(d => d.ds_type + ':' + (d.original_filename || d.filename));
  const dsB = (revB?.datasets || []).map(d => d.ds_type + ':' + (d.original_filename || d.filename));
  const allDs = [...new Set([...dsA, ...dsB])].sort();
  const dsHtml = allDs.length ? `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin:16px 0 6px">Dateien (aktive Revision)</div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:5px 8px;background:#f3f4f6;border:1px solid #e5e7eb;font-size:11px;text-align:left;color:#6b7280">Datei</th>
        <th style="padding:5px 8px;background:#eff6ff;border:1px solid #e5e7eb;font-size:11px;color:#1d4ed8;width:60px">A</th>
        <th style="padding:5px 8px;background:#f0fdf4;border:1px solid #e5e7eb;font-size:11px;color:#16a34a;width:60px">B</th>
      </tr></thead>
      <tbody>${allDs.map(f => {
        const inA = dsA.includes(f), inB = dsB.includes(f);
        const bg = !inA ? '#f0fdf4' : !inB ? '#fef2f2' : '';
        const [typ, name] = f.split(':');
        return `<tr style="background:${bg}">
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:12px;font-family:monospace">${escHtml(typ)} · ${escHtml(name)}</td>
          <td style="text-align:center;padding:4px 8px;border:1px solid #e5e7eb">${inA?'✓':''}</td>
          <td style="text-align:center;padding:4px 8px;border:1px solid #e5e7eb">${inB?'✓':''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>` : '';

  const html = `<!DOCTYPE html><html lang="de-CH"><head><meta charset="UTF-8">
    <title>Vergleich ${escHtml(a.item_number)} ↔ ${escHtml(b.item_number)}</title>
    <style>body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:24px}
    h1{font-size:16px;font-weight:700;margin:0 0 16px;color:#111827}
    @media print{body{padding:12px}}</style>
    </head><body>
    <h1>Vergleich ↔</h1>
    ${metaHtml}${bomHtml}${dsHtml}
    <div style="margin-top:20px;font-size:12px;color:#d1d5db;text-align:right">${new Date().toLocaleDateString('de-CH')}</div>
    </body></html>`;
  const w = window.open('', '_blank', 'width=1000,height=750');
  w.document.write(html);
  w.document.close();
}

// -- REVISIONSVERGLEICH ----------------------------------------
// Zwei Revisionen desselben Items gegenüberstellen: Kopfdaten,
// Druckparameter, Stückliste, Normteile und Dateien. Die Unterschiede rechnet
// der Server aus (/api/items/:id/compare), hier stehen sie mit denselben
// Bezeichnungen wie im Datenblatt (PRINT_PARAMS, PLM_ST_LABEL).
const COMPARE_META_LABEL = {
  status: 'Status', description: 'Beschreibung', eco_reason: 'ECO-Grund',
  released_at: 'Freigegeben am', released_by: 'Freigegeben von',
};
const COMPARE_CHANGE = {
  added:   { label: 'neu',      color: 'var(--green)', bg: 'var(--green-soft)' },
  removed: { label: 'entfernt', color: 'var(--red)',   bg: 'var(--red-soft)' },
  changed: { label: 'geändert', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  same:    { label: 'gleich',   color: 'var(--t4)',    bg: 'transparent' },
};
let _cmpState = { itemId: null, onlyChanges: true, cache: {} };

async function openRevisionCompare(itemId, revA, revB) {
  const item = state.item?.id === itemId ? state.item : await api(`/api/items/${itemId}`).catch(() => null);
  if (!item) return;
  const revs = item.revisions || [];   // neueste zuerst
  if (revs.length < 2) return toast('Dieses Item hat nur eine Revision', 'err');
  // Standard: gewählte Revision gegen die nächstältere
  const bId = revB || (revs.some(r => r.id === state.activeRevId) ? state.activeRevId : revs[0].id);
  const bIdx = revs.findIndex(r => r.id === bId);
  const aId = revA || (revs[bIdx + 1] || revs[bIdx - 1]).id;
  _cmpState = { itemId, onlyChanges: _cmpState.onlyChanges, cache: {} };
  const opts = sel => revs.map(r => `<option value="${r.id}"${r.id === sel ? ' selected' : ''}>rev${esc(r.rev)} · ${r.status}${r.delivered?.length ? ' · geliefert' : ''}</option>`).join('');

  _showDynModal(`<div class="modal" style="max-width:920px;width:96vw">
    <div class="modal-head">
      <div class="modal-title" style="display:flex;align-items:center;gap:8px;min-width:0">
        <span>Revisionen vergleichen</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.item_number)} · ${esc(item.name)}</span>
      </div>
    </div>
    <div class="modal-body" style="max-height:72vh;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <select class="fs" id="cmp-rev-a" style="max-width:230px" onchange="_loadRevisionCompare()" aria-label="Revision A">${opts(aId)}</select>
        <button class="btn btn-ghost btn-sm" onclick="_swapRevisionCompare()" title="Seiten tauschen">⇄</button>
        <select class="fs" id="cmp-rev-b" style="max-width:230px" onchange="_loadRevisionCompare()" aria-label="Revision B">${opts(bId)}</select>
        <label style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:13px;color:var(--t2);cursor:pointer">
          <input type="checkbox" ${_cmpState.onlyChanges ? 'checked' : ''} style="accent-color:var(--blue)"
            onchange="_cmpState.onlyChanges=this.checked;_loadRevisionCompare()"> Nur Änderungen
        </label>
      </div>
      <div id="cmp-body"><div style="color:var(--t3);font-size:13px">Wird verglichen…</div></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Schliessen</button>
    </div>
  </div>`);
  _loadRevisionCompare();
}

function _swapRevisionCompare() {
  const a = document.getElementById('cmp-rev-a'), b = document.getElementById('cmp-rev-b');
  if (!a || !b) return;
  [a.value, b.value] = [b.value, a.value];
  _loadRevisionCompare();
}

async function _loadRevisionCompare() {
  const a = document.getElementById('cmp-rev-a')?.value, b = document.getElementById('cmp-rev-b')?.value;
  const host = document.getElementById('cmp-body');
  if (!a || !b || !host) return;
  if (a === b) { host.innerHTML = '<div style="color:var(--t3);font-size:13px">Zweimal dieselbe Revision gewählt — bitte zwei verschiedene wählen.</div>'; return; }
  const key = a + ':' + b;
  try {
    _cmpState.cache[key] = _cmpState.cache[key] || await api(`/api/items/${_cmpState.itemId}/compare?a=${a}&b=${b}`);
  } catch { host.innerHTML = '<div style="color:var(--red);font-size:13px">Vergleich fehlgeschlagen.</div>'; return; }
  host.innerHTML = _renderRevisionCompare(_cmpState.cache[key], _cmpState.onlyChanges);
}

function _renderRevisionCompare(c, only) {
  const A = 'rev' + esc(c.a.rev), B = 'rev' + esc(c.b.rev);
  const none = '<span style="color:var(--t4)">—</span>';
  const val = v => (v === null || v === undefined || v === '') ? none : esc(v);
  const chip = ch => {
    const k = COMPARE_CHANGE[ch] || COMPARE_CHANGE.same;
    return `<span class="chip" style="color:${k.color};border-color:${k.color}">${k.label}</span>`;
  };
  const tr = (change, cells) => `<tr style="background:${(COMPARE_CHANGE[change] || COMPARE_CHANGE.same).bg}">${cells.map(x => `<td style="vertical-align:top">${x}</td>`).join('')}</tr>`;
  const table = (head, rows) => rows.length
    ? `<div class="tbl-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '';
  const section = (title, changes, total, body) => `
    <div class="sep-label" style="margin-top:16px">${title}
      <span style="margin-left:8px;font-family:var(--mono);font-size:11px;text-transform:none;letter-spacing:0;color:${changes ? 'var(--amber)' : 'var(--t4)'}">${changes ? changes + ' Änderung' + (changes === 1 ? '' : 'en') : 'keine Änderung'}</span>
    </div>
    ${body || `<div style="font-size:13px;color:var(--t4);padding:2px 0 6px">${total ? 'Keine Unterschiede.' : 'In beiden Revisionen leer.'}</div>`}`;

  const head = r => `<div style="flex:1;min-width:210px;padding:9px 11px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
      <div style="display:flex;align-items:center;gap:6px">
        <span class="status st-${r.status}">rev${esc(r.rev)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(PLM_ST_LABEL[r.status] || r.status)}</span>
        ${r.delivered?.length ? `<span title="Geliefert: ${esc(r.delivered.join(', '))}">🚚</span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--t3);margin-top:4px">angelegt ${fmtDate(r.created_at)}${r.released_at ? ' · freigegeben ' + fmtDate(r.released_at) : ''}</div>
      ${r.description ? `<div style="font-size:12.5px;color:var(--t2);margin-top:3px">${esc(r.description)}</div>` : ''}
    </div>`;

  const metaRows = c.meta.filter(m => !only || m.changed).map(m => {
    const show = v => m.field.endsWith('_at') ? val(v && fmtDate(v)) : m.field === 'status' && v ? `${esc(v)} <span style="color:var(--t3)">${esc(PLM_ST_LABEL[v] || '')}</span>` : val(v);
    return tr(m.changed ? 'changed' : 'same', [esc(COMPARE_META_LABEL[m.field] || m.field), show(m.a), show(m.b), chip(m.changed ? 'changed' : 'same')]);
  });
  const psRows = c.print_settings.filter(p => !only || p.changed).map(p =>
    tr(p.changed ? 'changed' : 'same', [esc(printParamLabel(p.field)), val(fmtPrintParam(p.field, p.a)), val(fmtPrintParam(p.field, p.b)), chip(p.changed ? 'changed' : 'same')]));

  const qty = s => !s ? none : `${fmtN(s.quantity, 0)} ${esc(s.unit || 'Stk')}`
    + (s.pinned_rev ? ` <span style="font-size:11px;color:var(--t3)" title="fest auf diese Revision">🔒rev${esc(s.pinned_rev)}</span>` : '');
  const note = r => r.change !== 'changed' ? '' : ' <span style="font-size:11px;color:var(--t3)">'
    + [r.qty_changed ? 'Menge' : '', r.rev_changed ? 'Revision' : ''].filter(Boolean).join(', ') + '</span>';
  const bomRows = c.bom.filter(r => !only || r.change !== 'same').map(r => tr(r.change, [
    `${_itemChip(r.item_type, 14)} <span style="font-family:var(--mono);color:var(--blue);cursor:pointer" onclick="_hideDynModal();gotoPlmItem(${r.child_item_id})">${esc(r.item_number)}</span>`,
    esc(r.name), qty(r.a), qty(r.b), chip(r.change) + note(r)]));
  const stdRows = c.bom_std.filter(r => !only || r.change !== 'same').map(r => tr(r.change, [
    `<span style="font-family:var(--mono)">${esc(r.designation)}</span>`, esc(r.name || ''), qty(r.a), qty(r.b), chip(r.change)]));

  const file = s => !s ? none : `${esc(_cleanDsName(s.original_name))} <span style="color:var(--t4);font-size:11px;white-space:nowrap">${fmtSize(s.file_size)} · v${esc(s.version || '1')}</span>`;
  const content = r => r.content === 'identical' ? ' <span style="font-size:11px;color:var(--t4)">Inhalt gleich</span>'
    : r.content === 'different' ? ' <span style="font-size:11px;color:var(--t3)">Inhalt geändert</span>'
    : r.content === 'unknown' ? ' <span style="font-size:11px;color:var(--t4)">Inhalt nicht geprüft</span>' : '';
  const dsRows = c.datasets.filter(r => !only || r.change !== 'same').map(r => tr(r.change, [
    `<span class="ds-type ${dtClass(r.name, r.ds_type)}">${fileLabel(r.name, r.ds_type)}</span>`, file(r.a), file(r.b), chip(r.change) + content(r)]));

  const total = Object.values(c.summary).reduce((s, n) => s + n, 0);
  const isAsm = c.item.item_type === 'asm';
  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:stretch">${head(c.a)}<div style="align-self:center;color:var(--t4)">→</div>${head(c.b)}</div>
    <div style="font-size:13px;margin-top:10px;color:${total ? 'var(--t2)' : 'var(--green)'}">
      ${total ? `${total} Unterschied${total === 1 ? '' : 'e'} von ${A} nach ${B}` : `${A} und ${B} unterscheiden sich nicht.`}
    </div>
    ${section('Kopfdaten', c.summary.meta, c.meta.length, table(['Feld', A, B, ''], metaRows))}
    ${section('Druckparameter', c.summary.print_settings, c.print_settings.length, table(['Parameter', A, B, ''], psRows))}
    ${isAsm || c.bom.length ? section('Stückliste', c.summary.bom, c.bom.length, table(['Item', 'Name', A, B, ''], bomRows)) : ''}
    ${isAsm || c.bom_std.length ? section('Normteile', c.summary.bom_std, c.bom_std.length, table(['Normteil', 'Name', A, B, ''], stdRows)) : ''}
    ${section('Dateien', c.summary.datasets, c.datasets.length, table(['Typ', A, B, ''], dsRows))}
    <div style="font-size:12px;color:var(--t4);margin-top:12px">
      Dateien werden über den Namen ohne „_revN" zugeordnet; bei gleicher Grösse vergleicht PLM den Inhalt.
    </div>`;
}

// -- DOKUMENTVORLAGEN ------------------------------------------
// Briefkopf: mit Logo das Logo und der Firmenname klein darunter (Rechnungen
// brauchen den Namen, nicht jedes Logo enthält ihn) — ohne Logo wie bisher.
function _docLogo(s, nameHtml) {
  if (!s.company_logo_at) return nameHtml;
  return `<img src="${location.origin}/api/settings/logo?v=${escHtml(String(s.company_logo_at))}" alt="${escHtml(s.company_name || '')}" style="display:block;max-height:60px;max-width:220px;margin-bottom:6px">
    ${s.company_name ? `<div style="font-size:13px;font-weight:600;color:#1f2937">${escHtml(s.company_name)}</div>` : ''}`;
}

// Prüfprotokoll: Vorlage aus den Einstellungen (PLM-Tab), ohne Eintrag
// gilt der Standard. Gespeichert als JSON unter pruef_template.
const PRUEF_DEFAULT = {
  points: ['Masshaltigkeit / Abmessungen', 'Oberflächenqualität', 'Materialprüfung',
    'Funktionsprüfung', 'Kennzeichnung / Beschriftung', 'Verpackung / Versand'].map(label => ({ label, soll: '' })),
  empty_rows: 3,
  decisions: ['Freigegeben', 'Nacharbeit', 'Ausschuss'],
  signatures: ['Geprüft durch', 'Freigegeben durch', 'Datum'],
  note: '',
};

// Fehlende oder kaputte Felder fallen einzeln auf den Standard zurück.
// Eine leere Liste bleibt leer — so lässt sich z.B. der Prüfentscheid weglassen.
function getPruefTemplate(raw = state.settings?.pruef_template) {
  let t = {};
  try { t = JSON.parse(raw || '{}') || {}; } catch {}
  const words = (v, def) => Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean) : [...def];
  const n = parseInt(t.empty_rows, 10);
  return {
    points: Array.isArray(t.points)
      ? t.points.map(p => ({ label: String(p?.label ?? '').trim(), soll: String(p?.soll ?? '').trim() })).filter(p => p.label)
      : PRUEF_DEFAULT.points.map(p => ({ ...p })),
    empty_rows: Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : PRUEF_DEFAULT.empty_rows,
    decisions: words(t.decisions, PRUEF_DEFAULT.decisions),
    signatures: words(t.signatures, PRUEF_DEFAULT.signatures),
    note: typeof t.note === 'string' ? t.note.trim() : '',
  };
}

function openDocTemplateModal(itemId) {
  window._docTemplateItem = state.item;
  const isASM = state.item?.item_type === 'asm';
  document.getElementById('dtpl-cards').innerHTML = [
    { type:'datenblatt', label:'Datenblatt', desc:'Allgemeine Informationen, Druckparameter, Revisionen, Lager, Dateien und Varianten' },
    isASM ? { type:'stueckliste', label:'Stückliste', desc:'Vollständige BOM-Tabelle mit Mengen, Preisen und Entwicklungszeit' } : null,
    { type:'pruefprotokoll', label:'Prüfprotokoll', desc:'Prüfpunkte und Unterschriften nach der Vorlage in Einstellungen → PLM' },
  ].filter(Boolean).map(t => `
    <div onclick="generateItemTemplate('${t.type}')" style="padding:14px 16px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
      <div style="font-weight:600;font-size:14px;color:var(--t1);margin-bottom:3px">${t.label}</div>
      <div style="font-size:13px;color:var(--t3)">${t.desc}</div>
    </div>`).join('');
  openModal('docTemplateModal');
}

// opts (Vorschau aus den Einstellungen): item, pruef = ungespeicherte
// Vorlage, preview = ohne Druckdialog
function generateItemTemplate(type, opts = {}) {
  closeModal('docTemplateModal');
  const item = opts.item || window._docTemplateItem;
  if (!item) return;
  const s = state.settings || {};
  const today = new Date().toLocaleDateString('de-CH');
  // Dieselbe Revision wie am Bildschirm (Auswahl im Revisionen-Tab)
  const rev = (item.revisions || []).find(r => r.id === state.activeRevId) || item.revisions?.[0];
  const pcode = item.short_code && item.item_type !== 'doc' ? item.short_code + (rev ? '-' + rev.rev : '') : '';
  const qr = type === 'datenblatt' && typeof qrSvg === 'function'
    ? qrSvg(item.item_number, 76, { dark: '#111827', light: '#ffffff' }) : '';

  const companyLines = [s.company_street, [s.company_postal_code, s.company_city].filter(Boolean).join(' ')].filter(Boolean);
  const hdr = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #1d4ed8">
      <div>
        ${_docLogo(s, `<div style="font-size:18px;font-weight:700;color:#1d4ed8">${escHtml(s.company_name||'')}</div>`)}
        <div style="font-size:12px;color:#6b7280;margin-top:2px;line-height:1.6">${companyLines.map(l=>escHtml(l)).join(' · ')}${s.company_phone?' · '+escHtml(s.company_phone):''}${s.company_email?' · '+escHtml(s.company_email):''}</div>
      </div>
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div style="text-align:right">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:2px">${escHtml(item.item_type.toUpperCase())}</div>
          <div style="font-family:monospace;font-size:15px;font-weight:700;color:#1d4ed8">${escHtml(item.item_number)}</div>
          ${pcode ? `<div style="font-size:12px;color:#6b7280">Kurzcode <b style="font-family:monospace;color:#111827">${escHtml(pcode)}</b></div>` : ''}
          <div style="font-size:12px;color:#6b7280">${today}</div>
        </div>
        ${qr ? `<div style="line-height:0">${qr}</div>` : ''}
      </div>
    </div>
    <div style="margin-bottom:22px">
      <div style="font-size:20px;font-weight:700;color:#111827">${escHtml(item.name)}</div>
      ${item.description ? `<div style="font-size:13px;color:#6b7280;margin-top:4px">${escHtml(item.description)}</div>` : ''}
    </div>
    ${item.important_note ? `<div class="warn"><b>⚠ Wichtiger Hinweis</b><br>${escHtml(item.important_note)}</div>` : ''}`;

  const css = `body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:28px}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:6px 10px;text-align:left;border:1px solid #e5e7eb;color:#6b7280}
    td{padding:6px 10px;border:1px solid #e5e7eb;font-size:13px;vertical-align:top;overflow-wrap:anywhere}
    .kv td{width:32%}.kv td.k{width:18%;color:#6b7280;font-weight:600;overflow-wrap:normal}
    .txt{font-size:13px;line-height:1.6;color:#374151;margin-bottom:16px}
    .sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin:18px 0 6px}
    .badge{display:inline-block;padding:1px 7px;border-radius:20px;font-size:11px;font-weight:600}
    .warn{margin:-8px 0 20px;padding:9px 12px;border:2px solid #dc2626;border-radius:6px;background:#fef2f2;color:#7f1d1d;font-size:13px;line-height:1.5;white-space:pre-wrap;break-inside:avoid}
    @media print{body{padding:14px}.sec{break-after:avoid}tr{break-inside:avoid}}`;

  // Bezeichnung/Wert-Paare, zwei je Zeile. Leere Werte fallen weg; ein
  // dritter Eintrag true gibt dem Wert die ganze Breite (lange Texte).
  const kvTable = rows => {
    const keep = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (!keep.length) return '';
    const td = ([k, v]) => `<td class="k">${escHtml(k)}</td><td>${escHtml(v)}</td>`;
    const pad = '<td class="k"></td><td></td>';
    const trs = [];
    let half = null;
    for (const r of keep) {
      if (r[2]) {
        if (half) { trs.push(`<tr>${td(half)}${pad}</tr>`); half = null; }
        trs.push(`<tr><td class="k">${escHtml(r[0])}</td><td colspan="3">${escHtml(r[1])}</td></tr>`);
      } else if (half) { trs.push(`<tr>${td(half)}${td(r)}</tr>`); half = null; }
      else half = r;
    }
    if (half) trs.push(`<tr>${td(half)}${pad}</tr>`);
    return `<table class="kv"><tbody>${trs.join('')}</tbody></table>`;
  };

  let body = '';

  // Gleiche Abschnitte wie das Datenblatt am Bildschirm (renderItemSheet)
  if (type === 'datenblatt') {
    // Aussenmasse der Revision; bei mehreren STL mit verschiedenen Massen alle mit Dateinamen
    const dims = revDims(rev);
    const dimsOne = new Set(dims.map(d => d.txt)).size === 1;
    body += `<div class="sec">Allgemein</div>` + kvTable([
      ['Typ', item.item_type.toUpperCase()],
      ['Projekt', item.project ? item.project.number + ' · ' + item.project.name : null],
      ['Klassifizierung', item.classification],
      ['Gewicht', item.effective_weight_g != null
        ? fmtN(item.effective_weight_g, 1) + ' g' + (item.weight_g == null && item.item_type === 'asm' ? ' (aus BOM)' : '') : null],
      ['Aussenmasse', !dims.length ? null : dimsOne ? dims[0].txt : dims.map(d => d.name + ': ' + d.txt).join(' · '), !dimsOne],
      ['Verkaufspreis', item.default_price != null ? fmtChf(item.default_price) : null],
      ['Entwicklungszeit', _fmtHours(item.dev_hours)],
      ['Erstellt', fmtD(item.created_at, null)],
      ['Quelle', item.source_url, true],
    ]);

    if (item.notes) body += `<div class="sec">Notizen</div><div class="txt">${escHtml(item.notes)}</div>`;

    if (rev) {
      body += `<div class="sec">Revision rev${escHtml(rev.rev)}</div>` + kvTable([
        ['Status', rev.status + (PLM_ST_LABEL[rev.status] ? ' · ' + PLM_ST_LABEL[rev.status] : '')],
        ['Angelegt', fmtD(rev.created_at, null)],
        ['Freigegeben', rev.released_at ? fmtD(rev.released_at) + (rev.released_by ? ' · ' + rev.released_by : '') : null],
        ['Beschreibung', rev.description, true],
        ['ECO-Grund', rev.eco_reason, true],
      ]);
    }

    // Alle Druckparameter, nicht nur die zwölf vom Bildschirm
    const ps = rev?.print_settings;
    if (ps) {
      const psRows = PRINT_PARAMS.filter(([k]) => k !== 'notes').map(([k, label]) =>
        [label, k === 'raw_material_id' ? ps.raw_material_name || null : fmtPrintParam(k, ps[k])]);
      psRows.push(['Notizen', ps.notes, true]);
      const t = kvTable(psRows);
      if (t) body += `<div class="sec">Druckparameter rev${escHtml(rev.rev)}</div>` + t;
    }

    if (item.item_type === 'asm' && rev) {
      const bom = rev.bom || [];
      const std = rev.bom_std || [];
      if (bom.length || std.length) {
        const bomTotal = bom.reduce((s, b) => s + (b.default_price != null ? b.default_price * b.quantity : 0), 0);
        const stdTotal = std.reduce((s, b) => s + (b.unit_price || 0) * b.quantity, 0);
        const unpriced = bom.filter(b => b.default_price == null).length;
        body += `<div class="sec">Stückliste rev${escHtml(rev.rev)}</div>` + kvTable([
          ['Positionen', String(bom.length + std.length)],
          ['Eigene Teile', String(bom.length)],
          ['Normteile', String(std.length)],
          ['Teilesumme', bomTotal ? fmtChf(bomTotal) : null],
          ['Normteilsumme', stdTotal ? fmtChf(stdTotal) : null],
          ['Gesamt', (bomTotal + stdTotal) ? fmtChf(bomTotal + stdTotal) : null],
          ['Hinweis', unpriced ? `${unpriced} von ${bom.length} eigenen Teilen ohne Preis — Summe unvollständig` : null, true],
        ]);
      }
    }

    const inv = item.inventory || [];
    if (inv.length) {
      body += `<div class="sec">Lagerbestand</div><table>
        <thead><tr><th>Lagerartikel</th><th>SKU</th><th style="text-align:right">Bestand</th><th style="text-align:right">Minimum</th><th style="text-align:right">Preis</th></tr></thead>
        <tbody>${inv.map(l => `<tr>
          <td>${escHtml(l.name)}</td>
          <td style="font-family:monospace;font-size:12px">${escHtml(l.sku||'')}</td>
          <td style="text-align:right;font-family:monospace">${fmtN(l.stock_qty||0, 1)} ${escHtml(l.unit||'Stk')}</td>
          <td style="text-align:right;font-family:monospace">${l.min_qty != null ? fmtN(l.min_qty, 1) : '—'}</td>
          <td style="text-align:right;font-family:monospace">${l.price_per_unit != null ? fmtChf(l.price_per_unit) + '/' + escHtml(l.unit||'Stk') : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    if ((item.revisions||[]).length) {
      body += `<div class="sec">Revisionen</div><table>
        <thead><tr><th>Revision</th><th>Status</th><th>Beschreibung</th><th>Angelegt</th><th>Freigegeben</th></tr></thead>
        <tbody>${item.revisions.map(r=>`<tr>
          <td style="font-family:monospace;font-weight:700">rev${escHtml(r.rev)}</td>
          <td><span class="badge" style="background:#dbeafe;color:#1d4ed8">${escHtml(r.status)}</span></td>
          <td>${escHtml(r.description||'')}</td>
          <td style="color:#6b7280;font-size:12px">${fmtD(r.created_at,'')}</td>
          <td style="color:#6b7280;font-size:12px">${fmtD(r.released_at,'')}${r.released_by ? ' · ' + escHtml(r.released_by) : ''}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    // original_name ist der Name, den der Benutzer sieht; filename nur der Speichername
    const allDatasets = (item.revisions||[]).flatMap(r=>(r.datasets||[]).map(d=>({...d, rev:r.rev, revStatus:r.status})));
    if (allDatasets.length) {
      body += `<div class="sec">Dateien</div><table>
        <thead><tr><th>Revision</th><th>Typ</th><th>Dateiname</th><th>Grösse</th><th>Datum</th></tr></thead>
        <tbody>${allDatasets.map(d=>`<tr>
          <td style="font-family:monospace">rev${escHtml(d.rev)}</td>
          <td style="color:#6b7280">${escHtml(fileLabel(d.original_name, d.ds_type))}</td>
          <td style="font-family:monospace;font-size:12px">${escHtml(d.original_name||d.filename)}</td>
          <td style="color:#6b7280;white-space:nowrap">${fmtSize(d.file_size)}</td>
          <td style="color:#6b7280;font-size:12px">${fmtD(d.uploaded_at,'')}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    if ((item.variants||[]).length) {
      body += `<div class="sec">Varianten</div><table>
        <thead><tr><th>Item-Nummer</th><th>Name</th><th>Typ</th></tr></thead>
        <tbody>${item.variants.map(v=>`<tr>
          <td style="font-family:monospace;color:#1d4ed8">${escHtml(v.item_number)}</td>
          <td>${escHtml(v.name)}</td>
          <td>${escHtml(v.item_type.toUpperCase())}</td>
        </tr>`).join('')}</tbody></table>`;
    }

  } else if (type === 'stueckliste') {
    const bom = rev?.bom || [];
    const bomStd = rev?.bom_std || [];
    const totalPrice = bom.reduce((s,b) => s + (b.default_price != null ? b.default_price * b.quantity : 0), 0);
    const totalDev = bom.reduce((s,b) => s + (b.dev_hours||0), 0);

    body += `<div style="display:flex;gap:20px;margin-bottom:16px;font-size:13px;color:#6b7280">
      <span>Revision: <strong style="font-family:monospace;color:#1d4ed8">rev${rev?.rev||'—'}</strong></span>
      <span class="badge" style="background:#dbeafe;color:#1d4ed8">${rev?.status||''}</span>
    </div>`;

    if (bom.length) {
      body += `<div class="sec">Stückliste – Parts</div><table>
        <thead><tr><th style="width:30px">Pos</th><th>Item-Nummer</th><th>Name</th><th>Revision</th><th style="text-align:right">Menge</th><th>Einh.</th><th style="text-align:right">VP (CHF)</th><th style="text-align:right">⏱ Entw.h</th></tr></thead>
        <tbody>${bom.map((b,i)=>`<tr>
          <td style="color:#9ca3af">${b.position||i+1}</td>
          <td style="font-family:monospace;color:#1d4ed8">${escHtml(b.item_number)}</td>
          <td>${escHtml(b.name)}</td>
          <td style="font-family:monospace;font-size:12px">${b.child_active_rev ? 'rev'+b.child_active_rev.rev : '—'}</td>
          <td style="text-align:right;font-family:monospace">${fmtN(b.quantity,0)}</td>
          <td>${escHtml(b.unit||'pcs')}</td>
          <td style="text-align:right;font-family:monospace">${b.default_price != null ? fmtN(b.default_price * b.quantity, 2) : '—'}</td>
          <td style="text-align:right;font-family:monospace;color:#d97706">${(b.dev_hours||0) > 0 ? fmtN(b.dev_hours,2) : '—'}</td>
        </tr>`).join('')}
        <tr style="background:#f9fafb;font-weight:700">
          <td colspan="6" style="text-align:right;color:#6b7280">Total</td>
          <td style="text-align:right;font-family:monospace">${totalPrice > 0 ? fmtN(totalPrice,2) : '—'}</td>
          <td style="text-align:right;font-family:monospace;color:#d97706">${totalDev > 0 ? fmtN(totalDev,2) : '—'}</td>
        </tr></tbody></table>`;
    }

    if (bomStd.length) {
      body += `<div class="sec">Normteile</div><table>
        <thead><tr><th>Bezeichnung</th><th>Norm</th><th>Material</th><th style="text-align:right">Menge</th><th>Einh.</th></tr></thead>
        <tbody>${bomStd.map(b=>`<tr>
          <td>${escHtml(b.designation)}</td>
          <td style="font-family:monospace;font-size:12px">${escHtml(b.standard||'')} ${escHtml(b.std_number||'')}</td>
          <td>${escHtml(b.material||'')}</td>
          <td style="text-align:right;font-family:monospace">${fmtN(b.quantity,0)}</td>
          <td>${escHtml(b.unit||'pcs')}</td>
        </tr>`).join('')}</tbody></table>`;
    }

    if (!bom.length && !bomStd.length) body += '<div style="color:#9ca3af;font-size:13px">Keine Positionen.</div>';

  } else if (type === 'pruefprotokoll') {
    const tpl = opts.pruef || getPruefTemplate();
    // Leerzeilen ohne Nummer — zum Ergänzen von Hand
    const checkRows = [...tpl.points, ...Array.from({ length: tpl.empty_rows }, () => ({ label: '', soll: '' }))];
    body += `<div style="display:flex;gap:20px;margin-bottom:16px;font-size:13px;color:#6b7280">
      <span>Revision: <strong style="font-family:monospace;color:#1d4ed8">rev${rev?.rev||'—'}</strong></span>
      <span class="badge" style="background:#dbeafe;color:#1d4ed8">${rev?.status||''}</span>
      ${item.effective_weight_g != null ? `<span>Gewicht: <strong>${fmtN(item.effective_weight_g,1)} g</strong></span>` : ''}
      ${item.classification ? `<span>Klassifizierung: <strong>${escHtml(item.classification)}</strong></span>` : ''}
    </div>
    ${tpl.note ? `<div class="txt">${escHtml(tpl.note)}</div>` : ''}
    <div class="sec">Prüfpunkte</div>
    <table>
      <thead><tr><th style="width:28px">Nr</th><th>Prüfpunkt</th><th style="width:120px">Soll</th><th style="width:120px">Ist</th><th style="width:36px">OK</th><th style="width:120px">Bemerkung</th></tr></thead>
      <tbody>${checkRows.map((c,i)=>`<tr style="height:28px">
        <td style="color:#9ca3af;font-size:12px">${c.label ? i+1 : ''}</td>
        <td>${escHtml(c.label)}</td><td>${escHtml(c.soll)}</td><td></td>
        <td style="text-align:center;font-size:16px"></td>
        <td></td>
      </tr>`).join('')}</tbody>
    </table>
    ${tpl.decisions.length ? `<div class="sec" style="margin-top:24px">Prüfentscheid</div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:28px">
      ${tpl.decisions.map(d => `<label style="display:flex;align-items:center;gap:6px;font-size:13px"><span style="width:16px;height:16px;border:1px solid #9ca3af;display:inline-block;border-radius:3px"></span> ${escHtml(d)}</label>`).join('')}
    </div>` : ''}
    ${tpl.signatures.length ? `<div style="display:flex;gap:32px;margin-top:16px">
      ${tpl.signatures.map(sg => `<div style="flex:1"><div style="font-size:12px;color:#6b7280;margin-bottom:4px">${escHtml(sg)}</div><div style="border-bottom:1px solid #9ca3af;height:36px"></div></div>`).join('')}
    </div>` : ''}`;
  }

  const templateLabels = { datenblatt:'Datenblatt', stueckliste:'Stückliste', pruefprotokoll:'Prüfprotokoll' };
  const html = `<!DOCTYPE html><html lang="de-CH"><head><meta charset="UTF-8">
    <title>${templateLabels[type]||type} – ${escHtml(item.item_number)}</title>
    <style>${css}</style></head><body>
    ${hdr}${body}
    <div style="margin-top:28px;padding-top:10px;border-top:1px solid #e5e7eb;font-size:12px;color:#d1d5db;text-align:right">${escHtml(item.item_number)} · ${templateLabels[type]||type} · ${today}</div>
    ${opts.preview ? '' : '<script>window.onload=()=>window.print();<\/script>'}
    </body></html>`;
  const w = window.open('', '_blank', 'width=950,height=750');
  w.document.write(html);
  w.document.close();
}

// -- PRUEFPROTOKOLL-VORLAGE (Einstellungen → PLM) --------------
function _renderPruefSettings(tpl = getPruefTemplate()) {
  const el = document.getElementById('st-pruef-box');
  if (!el) return;
  const n = tpl.points.length;
  el.innerHTML = `
    <div id="st-pruef-points" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
      ${tpl.points.map((p, i) => `<div class="pruef-row" style="display:flex;align-items:center;gap:6px">
        <span style="font-family:var(--mono);font-size:12px;color:var(--t4);width:18px;text-align:right;flex-shrink:0">${i + 1}</span>
        <input class="fi pruef-label" value="${esc(p.label)}" placeholder="Prüfpunkt" style="flex:1;font-size:13px;padding:3px 7px;height:28px">
        <input class="fi pruef-soll" value="${esc(p.soll)}" placeholder="Soll (optional)" style="width:160px;font-size:13px;padding:3px 7px;height:28px">
        <button class="btn btn-ghost btn-icon btn-sm" onclick="_movePruefPoint(${i},-1)" title="Nach oben"${i === 0 ? ' disabled' : ''}>↑</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="_movePruefPoint(${i},1)" title="Nach unten"${i === n - 1 ? ' disabled' : ''}>↓</button>
        <button class="btn btn-red btn-icon btn-sm" onclick="_removePruefPoint(${i})" title="Entfernen">✕</button>
      </div>`).join('') || '<div style="font-size:13px;color:var(--t3)">Keine Prüfpunkte — das Protokoll hat dann nur Leerzeilen.</div>'}
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">
      <input class="fi" id="st-pruef-new" placeholder="Neuer Prüfpunkt…" style="max-width:280px" onkeydown="if(event.key==='Enter')_addPruefPoint()">
      <button class="btn btn-ghost btn-sm" onclick="_addPruefPoint()">+ Hinzufügen</button>
    </div>
    <div class="form-row cols3">
      <div class="fg"><label class="fl">Leerzeilen zum Ausfüllen</label>
        <input class="fi" id="st-pruef-empty" type="number" min="0" max="20" value="${tpl.empty_rows}"></div>
    </div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Prüfentscheid (mit Komma getrennt)</label>
        <input class="fi" id="st-pruef-dec" value="${esc(tpl.decisions.join(', '))}" placeholder="leer = kein Prüfentscheid"></div>
      <div class="fg"><label class="fl">Unterschriften (mit Komma getrennt)</label>
        <input class="fi" id="st-pruef-sig" value="${esc(tpl.signatures.join(', '))}" placeholder="leer = keine Unterschriftszeilen"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Hinweis über den Prüfpunkten (optional)</label>
        <textarea class="ft" id="st-pruef-note" rows="2" placeholder="z.B. Prüfmittel: Messschieber · Sichtprüfung bei Tageslicht">${esc(tpl.note)}</textarea></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
      <button class="btn btn-primary btn-sm" onclick="_savePruefSettings()">Speichern</button>
      <button class="btn btn-ghost btn-sm" onclick="_previewPruef()">Vorschau</button>
      <button class="btn btn-ghost btn-sm" onclick="_resetPruefSettings()">Standard einsetzen</button>
      <span id="st-pruef-msg" style="font-size:13px;color:var(--t3)"></span>
    </div>`;
}

// Formular → Vorlage, geprüft wie beim Laden. keepEmpty: beim Verschieben
// und Entfernen müssen die Indizes zu den Zeilen im Formular passen, auch
// wenn ein Prüfpunkt gerade leer ist — sonst verschöbe sich alles danach.
function _readPruefForm(keepEmpty = false) {
  const val = id => document.getElementById(id)?.value || '';
  const split = id => val(id).split(',').map(x => x.trim()).filter(Boolean);
  const points = [...document.querySelectorAll('#st-pruef-points .pruef-row')].map(r => ({
    label: r.querySelector('.pruef-label').value.trim(),
    soll:  r.querySelector('.pruef-soll').value.trim(),
  }));
  const t = getPruefTemplate(JSON.stringify({
    points, empty_rows: val('st-pruef-empty'),
    decisions: split('st-pruef-dec'), signatures: split('st-pruef-sig'), note: val('st-pruef-note'),
  }));
  if (keepEmpty) t.points = points;
  return t;
}

function _movePruefPoint(i, dir) {
  const t = _readPruefForm(true);
  const j = i + dir;
  if (j < 0 || j >= t.points.length) return;
  [t.points[i], t.points[j]] = [t.points[j], t.points[i]];
  _renderPruefSettings(t);
}
function _removePruefPoint(i) {
  const t = _readPruefForm(true);
  t.points.splice(i, 1);
  _renderPruefSettings(t);
}
function _addPruefPoint() {
  const inp = document.getElementById('st-pruef-new');
  const label = inp?.value.trim();
  if (!label) return;
  const t = _readPruefForm(true);
  t.points.push({ label, soll: '' });
  _renderPruefSettings(t);
  document.getElementById('st-pruef-new')?.focus();
}
function _resetPruefSettings() {
  _renderPruefSettings(getPruefTemplate(''));
  const msg = document.getElementById('st-pruef-msg');
  if (msg) { msg.textContent = 'Standard eingesetzt — mit Speichern übernehmen'; msg.style.color = 'var(--amber)'; }
}

// Vorschau mit einem Beispielteil und der Vorlage, wie sie gerade im Formular steht
function _previewPruef() {
  generateItemTemplate('pruefprotokoll', {
    item: { id: 0, item_type: 'prt', item_number: 'P000-prt-001', name: 'Beispielteil', description: 'Vorschau der Prüfprotokoll-Vorlage',
      classification: getClassifications()[0]?.name || null, effective_weight_g: 12.5, revisions: [{ id: 0, rev: '1', status: 'DFT' }] },
    pruef: _readPruefForm(),
    preview: true,
  });
}

async function _savePruefSettings() {
  await api('/api/settings', 'PUT', { pruef_template: JSON.stringify(_readPruefForm()) });
  state.settings = await api('/api/settings');
  _renderPruefSettings();
  const msg = document.getElementById('st-pruef-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  toast('Prüfprotokoll-Vorlage gespeichert', 'ok');
}

// -- PDF GENERATION (Rechnung + Angebot) -----------------------
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');
}

// type: 'quote' (Angebot aus dem Archiv), 'order-quote' (Angebotsphase eines
// Auftrags) oder 'invoice'. Die Angebotsvarianten liefern dieselbe Datenform,
// deshalb reicht ein Renderer.
async function generateDoc(id, type) {
  const endpoint = type === 'quote' ? `/api/quotes/${id}/quote-data`
    : type === 'order-quote' ? `/api/orders/${id}/order-quote-data`
    : `/api/orders/${id}/invoice-data`;
  const d = await api(endpoint);
  const s = state.settings;
  const today = new Date().toLocaleDateString('de-CH');
  const isQuote = type === 'quote' || type === 'order-quote';
  const docLabel = isQuote ? 'Angebot' : 'Rechnung';
  const color = '#1d4ed8';

  // Company address block from settings
  const companyLines = [
    s.company_street,
    [s.company_postal_code, s.company_city].filter(Boolean).join(' '),
    s.company_country && s.company_country !== 'Schweiz' ? s.company_country : ''
  ].filter(Boolean);

  const bankInfo = [
    s.bank_name,
    s.bank_iban ? 'IBAN: ' + s.bank_iban : '',
    s.bank_bic  ? 'BIC: '  + s.bank_bic  : ''
  ].filter(Boolean).join(' · ');

  const footer = isQuote
    ? (s.quote_footer   || 'Dieses Angebot ist freibleibend.')
    : (s.invoice_footer || 'Bitte begleichen Sie den Betrag gemäss Zahlungsbedingungen.');

  // Customer address
  const custAddrLines = [
    d.customer_street,
    d.customer_postal_code && d.customer_city ? d.customer_postal_code + ' ' + d.customer_city : (d.customer_city||''),
    d.customer_country && d.customer_country !== 'Schweiz' ? d.customer_country : ''
  ].filter(Boolean);

  // fmtP: unrounded price for line items; fmtCHF only for the grand total (5-Rappen rounding)
  const fmtP = v => 'CHF ' + fmtN(parseFloat(v) || 0);

  const hourlyRate = d.hourly_rate || 0;
  const hasDiscount = (d.discount_pct||0) > 0 || (d.positions||[]).some(p=>(p.discount_pct||0)>0);
  const cols = hasDiscount ? 5 : 4;
  const rows = (d.positions||[]).map(p => {
    const lineTotal = p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100);
    let html = '<tr style="border-bottom:1px solid #e5e7eb">'
      +'<td style="padding:8px 6px">'+escHtml(p.description)+(p.item_number?' <span style="font-size:13px;color:#6b7280">['+p.item_number+']</span>':'')
      +(p.notes?'<br><span style="font-size:13px;color:#9ca3af">'+escHtml(p.notes)+'</span>':'')+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+p.quantity+' '+p.unit+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtP(p.unit_price)+'</td>'
      +(hasDiscount?(p.discount_pct?'<td style="padding:8px 6px;text-align:right;color:#d97706">'+p.discount_pct+'%</td>':'<td style="padding:8px 6px;text-align:right;color:#9ca3af">—</td>'):'')
      +'<td style="padding:8px 6px;text-align:right;font-weight:600">'+fmtP(lineTotal)+'</td>'
      +'</tr>';
    if (p.sub_items && p.sub_items.length) {
      html += p.sub_items.map(s =>
        '<tr style="background:#f9fafb">'
        +'<td style="padding:4px 6px 4px 22px;color:#6b7280;font-size:13px">↳ '+(s.item_type==='asm'?'📦':s.item_type==='doc'?'📄':'🔩')+' '+escHtml(s.item_number)+' – '+escHtml(s.name)+'</td>'
        +'<td style="padding:4px 6px;text-align:right;font-size:13px;color:#6b7280">'+s.quantity+' '+s.unit+'</td>'
        +'<td style="padding:4px 6px"></td>'
        +(hasDiscount?'<td style="padding:4px 6px"></td>':'')
        +'<td style="padding:4px 6px"></td>'
        +'</tr>'
      ).join('');
    }
    return html;
  }).join('');

  // Document-level Arbeitszeit row (include_hours=true for both quotes and orders)
  const quoteWorkHours = d.include_hours && (d.estimated_hours||0) > 0 ? parseFloat(d.estimated_hours) : 0;
  const quoteWorkCost  = quoteWorkHours > 0 && hourlyRate > 0 ? quoteWorkHours * hourlyRate : 0;
  const quoteWorkRow   = quoteWorkCost > 0
    ? '<tr style="border-bottom:1px solid #e5e7eb">'
      +'<td style="padding:8px 6px">Arbeitszeit</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtN(quoteWorkHours,2)+' h</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtP(hourlyRate)+'/h</td>'
      +(hasDiscount?'<td style="padding:8px 6px;text-align:right;color:#9ca3af">—</td>':'')
      +'<td style="padding:8px 6px;text-align:right;font-weight:600">'+fmtP(quoteWorkCost)+'</td>'
      +'</tr>'
    : '';

  // Billable time entries (only for invoices/orders, not quotes)
  const billableTime = !isQuote && d.billable_time?.length ? d.billable_time : [];
  const timeRows = billableTime.map(t => {
    const hrs = parseFloat(t.hours) || 0;
    const cost = hrs * hourlyRate;
    return '<tr style="border-bottom:1px solid #e5e7eb">'
      +'<td style="padding:8px 6px">'+(t.description||'Arbeitszeit')+(t.date?' <span style="font-size:13px;color:#9ca3af">['+t.date+']</span>':'')+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtN(hrs,2)+' h</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtP(hourlyRate)+'/h</td>'
      +(hasDiscount?'<td style="padding:8px 6px"></td>':'')
      +'<td style="padding:8px 6px;text-align:right;font-weight:600">'+fmtP(cost)+'</td>'
      +'</tr>';
  }).join('');
  const timeTotal = billableTime.reduce((s, t) => s + (parseFloat(t.hours)||0) * hourlyRate, 0);
  // Grand total including quote-level Arbeitszeit + billable time + tax
  const allWorkTotal = quoteWorkCost + timeTotal;
  const workTaxExtra = d.include_tax ? allWorkTotal * (d.tax_rate || 0) / 100 : 0;
  const grandTotal = (d.total || 0) + allWorkTotal + workTaxExtra;

  const html = `<!DOCTYPE html>
<html lang="de-CH">
<head><meta charset="UTF-8"><title>${docLabel} ${d.number}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .company-name{font-size:22px;font-weight:700;color:${color};letter-spacing:-0.5px}
  .company-detail{font-size:13px;color:#6b7280;margin-top:2px;line-height:1.6}
  .doc-label{font-size:28px;font-weight:700;color:#111827;margin-bottom:4px}
  .meta{color:#6b7280;font-size:13px;line-height:1.7}
  .addr-block{margin:30px 0;display:flex;gap:60px}
  .addr-label{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  thead{background:#f9fafb}
  thead th{text-align:left;padding:10px 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb}
  .totals{margin-left:auto;width:300px;margin-top:10px}
  .total-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #f3f4f6}
  .total-gross{display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;border-top:2px solid ${color};margin-top:4px;color:${color}}
  .footer{margin-top:50px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#9ca3af}
  .badge{display:inline-block;background:#dbeafe;color:${color};font-size:13px;padding:2px 8px;border-radius:20px;font-weight:600}
  @media print{body{padding:20px}}
</style>
</head>
<body>
<div class="header">
  <div>
    ${_docLogo(s, `<div class="company-name">${escHtml(s.company_name || '')}</div>`)}
    <div class="company-detail">
      ${companyLines.map(l => escHtml(l)).join('<br>')}
      ${s.company_phone ? '<br>'+escHtml(s.company_phone) : ''}
      ${s.company_email ? ' · '+escHtml(s.company_email) : ''}
      ${s.company_uid   ? '<br>'+escHtml(s.company_uid)  : ''}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-label">${docLabel}</div>
    <div style="font-family:monospace;font-size:13px;color:${color}">${d.number}</div>
    <div class="meta">
      Datum: ${today}<br>
      ${isQuote && d.valid_until ? 'Gültig bis: '+fmtD(d.valid_until)+'<br>' : ''}
      ${!isQuote && d.order_date ? 'Auftragsdatum: '+fmtD(d.order_date)+'<br>' : ''}
      ${!isQuote && d.delivery_date ? 'Lieferdatum: '+fmtD(d.delivery_date)+'<br>' : ''}
      ${d.payment_terms ? 'Zahlung: '+escHtml(d.payment_terms) : ''}
    </div>
  </div>
</div>

<div class="addr-block">
  ${d.customer_name ? `<div>
    <div class="addr-label">${isQuote ? 'Angebotsempfänger' : 'Rechnungsempfänger'}</div>
    <div style="font-weight:600;font-size:13px">${escHtml(d.customer_name)}</div>
    ${d.customer_number ? '<div style="font-size:13px;color:#6b7280">'+d.customer_number+'</div>' : ''}
    <div style="margin-top:4px;line-height:1.7;color:#374151">${custAddrLines.map(l=>escHtml(l)).join('<br>')}</div>
    ${d.customer_email ? '<div style="margin-top:4px;color:#6b7280">'+escHtml(d.customer_email)+'</div>' : ''}
  </div>` : `<div><div class="addr-label">${isQuote ? 'Angebotsempfänger' : 'Rechnungsempfänger'}</div><div style="color:#9ca3af">Kein Kunde zugewiesen</div></div>`}
  <div>
    <div class="addr-label">${isQuote ? 'Betreff' : 'Auftrag'}</div>
    <div style="font-weight:600">${escHtml(d.title)}</div>
    <div style="margin-top:4px"><span class="badge">${d.status}</span></div>
    ${d.notes ? '<div style="margin-top:6px;font-size:13px;color:#6b7280">'+escHtml(d.notes)+'</div>' : ''}
  </div>
</div>

<table>
  <thead><tr>
    <th>Beschreibung</th>
    <th style="text-align:right">Menge</th>
    <th style="text-align:right">Einzelpreis</th>
    ${hasDiscount ? '<th style="text-align:right">Rabatt</th>' : ''}
    <th style="text-align:right">Total</th>
  </tr></thead>
  <tbody>${rows || `<tr><td colspan="${cols}" style="padding:20px;text-align:center;color:#9ca3af">Keine Positionen</td></tr>`}${quoteWorkRow}${timeRows}</tbody>
</table>

<div class="totals">
  ${(d.discount_pct||0)>0 ? '<div class="total-row"><span>Zwischentotal</span><span>'+fmtP(d.subtotal)+'</span></div>'
    +'<div class="total-row" style="color:#d97706"><span>Rabatt '+d.discount_pct+'%</span><span>-'+fmtP(d.discount_amount)+'</span></div>' : ''}
  <div class="total-row"><span>Positionen Netto</span><span>${fmtP(d.net)}</span></div>
  ${quoteWorkCost > 0 ? '<div class="total-row"><span>Arbeitszeit</span><span>'+fmtP(quoteWorkCost)+'</span></div>' : ''}
  ${billableTime.length && hourlyRate > 0 ? '<div class="total-row"><span>Arbeitszeit (verrechenbar)</span><span>'+fmtP(timeTotal)+'</span></div>' : ''}
  ${d.include_tax ? '<div class="total-row"><span>MwSt. '+(d.tax_rate ?? 0)+'%</span><span>'+fmtP(d.tax_amount + workTaxExtra)+'</span></div>' : ''}
  <div class="total-gross"><span>Gesamtbetrag</span><span>${fmtCHF(grandTotal)}</span></div>
</div>

<div class="footer">
  <div style="margin-bottom:4px">${escHtml(footer)}</div>
  ${bankInfo ? '<div>'+escHtml(bankInfo)+'</div>' : ''}
  <div style="margin-top:6px;color:#d1d5db">${today}</div>
</div>
<script>window.onload = () => window.print();<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(html);
  w.document.close();

  // Der Rechnungsdruck ist der Moment des Fakturierens — den Status danach
  // von Hand nachzuziehen wird regelmaessig vergessen.
  if (type === 'invoice') offerInvoicedStatus(id);
}

// Nach dem Rechnungsdruck anbieten, den Auftrag als fakturiert zu markieren.
async function offerInvoicedStatus(orderId) {
  const o = (state.orders || []).find(x => x.id === orderId)
    || await api(`/api/orders/${orderId}`).catch(() => null);
  if (!o || o.status === 'INVOICED' || o.status === 'CANCELLED') return;

  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title">Rechnung erstellt</div></div>
    <div class="modal-body" style="font-size:13px;color:var(--t2)">
      Auftrag <strong style="font-family:var(--mono);color:var(--t1)">${esc(o.number || '')}</strong>
      steht auf „${esc(ORDER_ST_LABEL[o.status] || o.status)}“.<br><br>
      Soll er als <strong>fakturiert</strong> markiert werden?
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Später</button>
      <button class="btn btn-primary" onclick="_markInvoiced(${orderId})">Als fakturiert markieren</button>
    </div>
  </div>`);
}

async function _markInvoiced(orderId) {
  _hideDynModal();
  try {
    await api(`/api/orders/${orderId}/status`, 'PUT', { status: 'INVOICED' });
    const rec = (state.orders || []).find(x => x.id === orderId);
    if (rec) rec.status = 'INVOICED';
    toast('Auftrag als fakturiert markiert', 'ok');
    if (state.view === 'orders') await renderOrders();
    else if (typeof openOrderDetail === 'function') openOrderDetail(orderId);
    loadStats();
  } catch (e) {
    toast('Status konnte nicht gesetzt werden', 'err');
  }
}


// ── THERMAL PRINT ─────────────────────────────────────────────
function showPrinterError(msg) {
  const existing = document.getElementById('printer-err-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'printer-err-banner';
  banner.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);z-index:500;background:var(--bg2);border:1px solid var(--red);border-radius:var(--r);padding:12px 16px;max-width:520px;width:calc(100vw - 32px);box-shadow:var(--sh-2)';
  banner.innerHTML = `<div style="display:flex;align-items:flex-start;gap:10px">
    <span style="color:var(--red);font-size:16px;flex-shrink:0">🖶</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;color:var(--red);margin-bottom:4px;font-size:13px">Drucker nicht erreichbar</div>
      <div style="font-size:13px;color:var(--t2);font-family:var(--mono);white-space:pre-wrap;word-break:break-word">${esc(String(msg))}</div>
    </div>
    <button onclick="document.getElementById('printer-err-banner').remove()" style="background:none;border:none;color:var(--t3);cursor:pointer;font-size:16px;padding:0;flex-shrink:0;line-height:1">✕</button>
  </div>`;
  document.body.appendChild(banner);
  setTimeout(() => banner?.remove(), 12000);
}

async function printReceiptAll(deliveryId, mode) {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = '⏳';
  btn.disabled = true;
  try {
    await api('/api/print-receipt-delivery', 'POST', { delivery_id: deliveryId, mode });
    toast('Gesamtbeleg gedruckt ✓', 'ok');
  } catch(e) {
    showPrinterError(e);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function printReceipt(deliveryItemId, mode) {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = '⏳';
  btn.disabled = true;
  try {
    await api('/api/print-receipt', 'POST', { delivery_item_id: deliveryItemId, mode });
    toast('Beleg gedruckt ✓', 'ok');
  } catch(e) {
    showPrinterError(e);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ── DELIVERY DOC (Lieferschein eines Produktionsauftrags) ──────
const SETTINGS_GROUPS_PDF = [
  { label: 'Profil', keys: [
    ['print_settings_id','Druckprofil'], ['printer_settings_id','Drucker'], ['filament_settings_id','Filamentprofil']
  ]},
  { label: 'Schichten & Wände', keys: [
    ['layer_height','Schichthöhe (mm)'], ['first_layer_height','1. Schicht (mm)'],
    ['perimeters','Perimeter'], ['top_solid_layers','Oben'], ['bottom_solid_layers','Unten'],
    ['spiral_vase','Vase-Modus']
  ]},
  { label: 'Füllung', keys: [
    ['fill_density','Füllung (%)'], ['fill_pattern','Muster'],
    ['top_fill_pattern','Oben'], ['bottom_fill_pattern','Unten']
  ]},
  { label: 'Stützen', keys: [
    ['support_material','Aktiv'], ['support_material_auto','Auto'],
    ['support_material_threshold','Überhang (°)'], ['support_material_pattern','Muster'],
    ['support_material_style','Stil'], ['raft_layers','Raft']
  ]},
  { label: 'Temperatur', keys: [
    ['temperature','Düsentemperatur (°C)'], ['first_layer_temperature','Düse 1. Schicht'],
    ['bed_temperature','Betttemperatur (°C)'], ['first_layer_bed_temperature','Bett 1. Schicht']
  ]},
  { label: 'Geschwindigkeit (mm/s)', keys: [
    ['perimeter_speed','Perimeter'], ['infill_speed','Füllung'],
    ['travel_speed','Travel'], ['first_layer_speed','1. Schicht'], ['bridge_speed','Brücken']
  ]},
  { label: 'Kühlung', keys: [
    ['fan_always_on','Immer an'], ['min_fan_speed','Min (%)'], ['max_fan_speed','Max (%)'],
    ['bridge_fan_speed','Brücken (%)'], ['disable_fan_first_layers','Aus (erste Lagen)']
  ]},
  { label: 'Filament', keys: [
    ['filament_type','Typ'], ['filament_diameter','Ø (mm)'],
    ['filament_density','Dichte (g/cm³)'], ['nozzle_diameter','Düse (mm)']
  ]},
  { label: 'Diverses', keys: [
    ['seam_position','Naht'], ['brim_width','Brim (mm)'],
    ['skirts','Skirt-Linien'], ['wipe_tower','Wipe-Tower'],
    ['ironing','Bügeln'], ['avoid_crossing_perimeters','Kreuzungen vermeiden'],
    ['estimated_printing_time_normal_mode','Druckzeit (geschätzt)']
  ]}
];

function renderSettingsTablePdf(s) {
  if (!s) return '<p style="color:#9ca3af;font-size:13px">Keine Druckeinstellungen hinterlegt.</p>';
  return SETTINGS_GROUPS_PDF.map(g => {
    const rows = g.keys.map(([k, label]) => {
      const raw = s[k];
      if (!raw) return '';
      const v = raw.split(';')[0].trim();
      if (!v) return '';
      const disp = v === '0' ? 'Nein' : v === '1' ? 'Ja' : v;
      return `<tr><td style="padding:4px 8px;color:#6b7280;width:48%;border-bottom:1px solid #f3f4f6">${label}</td>
              <td style="padding:4px 8px;font-weight:600;border-bottom:1px solid #f3f4f6">${escHtml(disp)}</td></tr>`;
    }).filter(Boolean).join('');
    if (!rows) return '';
    return `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8;margin-bottom:4px">${g.label}</div>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:4px">${rows}</table>
    </div>`;
  }).filter(Boolean).join('');
}

async function generateDeliveryDoc(id) {
  const d = await api(`/api/deliveries/${id}/delivery-data`);
  const s = state.settings;
  const today = new Date().toLocaleDateString('de-CH');
  const color = '#1d4ed8';

  const companyLines = [
    s.company_street,
    [s.company_postal_code, s.company_city].filter(Boolean).join(' ')
  ].filter(Boolean);

  const custAddrLines = [
    d.customer_street,
    d.customer_postal_code && d.customer_city ? d.customer_postal_code + ' ' + d.customer_city : (d.customer_city||'')
  ].filter(Boolean);

  const itemsHtml = (d.items||[]).map((item, idx) => {
    const hasSettings = !!item.print_settings;
    return `<div style="page-break-inside:avoid;margin-bottom:24px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">
      <div style="background:#1e40af;color:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px">
        <span style="background:rgba(255,255,255,.2);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">${idx+1}</span>
        ${item.item_number?`<span style="font-family:monospace;font-size:13px;opacity:.8">${escHtml(item.item_number)}${item.effective_rev ? ' · rev' + escHtml(item.effective_rev.rev) : ''}</span>`:''}
        <span style="font-weight:600;font-size:13px;flex:1">${escHtml(item.description)}</span>
        <span style="background:rgba(255,255,255,.15);padding:3px 10px;border-radius:20px;font-size:13px">${item.quantity} ${item.unit}</span>
      </div>
      ${item.rm_name?`<div style="padding:6px 14px;background:#f0f9ff;font-size:13px;color:#0369a1;border-bottom:1px solid #bae6fd">🧵 Rohmaterial: <strong>${escHtml(item.rm_name)}</strong>${item.rm_type?' · '+escHtml(item.rm_type):''}${item.rm_color?' · '+escHtml(item.rm_color):''}</div>`:''}
      ${item.important_note?`<div style="padding:8px 14px;background:#fef2f2;font-size:13px;color:#7f1d1d;border-bottom:2px solid #dc2626;white-space:pre-wrap"><b>⚠ Wichtiger Hinweis:</b> ${escHtml(item.important_note)}</div>`:''}
      ${item.notes?`<div style="padding:8px 14px;background:#eff6ff;font-size:13px;color:#374151;border-bottom:1px solid #dbeafe">Notiz: ${escHtml(item.notes)}</div>`:''}
      <div style="padding:12px 14px">
        ${hasSettings ? renderSettingsTablePdf(item.print_settings) : '<p style="color:#9ca3af;font-size:13px;margin:0">Keine 3MF-Druckeinstellungen hinterlegt.</p>'}
      </div>
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="de-CH">
<head><meta charset="UTF-8"><title>Lieferschein ${escHtml(d.number)}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:32px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #1d4ed8}
  .company-name{font-size:20px;font-weight:700;color:#1d4ed8}
  .doc-label{font-size:26px;font-weight:700;color:#111827;margin-bottom:4px}
  .meta{color:#6b7280;font-size:13px;line-height:1.7}
  .addr-block{display:flex;gap:48px;margin:20px 0 24px}
  .addr-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:3px}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:13px;font-weight:600}
  .sign-row{display:flex;gap:40px;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb}
  .sign-box{flex:1;border-bottom:1px solid #9ca3af;padding-bottom:2px;font-size:13px;color:#6b7280;height:40px;display:flex;align-items:flex-end}
  @media print{body{padding:16px}.header{margin-bottom:20px}}
</style>
</head>
<body>
<div class="header">
  <div>
    ${_docLogo(s, `<div class="company-name">${escHtml(s.company_name||'')}</div>`)}
    <div style="font-size:13px;color:#6b7280;margin-top:2px;line-height:1.6">
      ${companyLines.map(l=>escHtml(l)).join('<br>')}
      ${s.company_phone?' · '+escHtml(s.company_phone):''}
      ${s.company_email?' · '+escHtml(s.company_email):''}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-label">Lieferschein</div>
    <div style="font-family:monospace;font-size:13px;color:#1d4ed8;margin-bottom:4px">${escHtml(d.number)}</div>
    <div class="meta">
      Erstellt: ${today}<br>
      ${d.delivery_date?'Lieferdatum: '+fmtD(d.delivery_date)+'<br>':''}
      ${d.manufacture_date?'Herstellungsdatum: '+fmtD(d.manufacture_date)+'<br>':''}
      ${d.order_number?'Auftrag: '+escHtml(d.order_number):''}
    </div>
    <span class="badge" style="background:#dbeafe;color:#1d4ed8;margin-top:4px">${DELIVERY_ST_LABEL[d.status]||d.status}</span>
  </div>
</div>

<div class="addr-block">
  ${d.customer_name?`<div>
    <div class="addr-label">Empfänger</div>
    <div style="font-weight:600;font-size:13px">${escHtml(d.customer_name)}</div>
    ${d.customer_number?'<div style="font-size:13px;color:#6b7280">'+escHtml(d.customer_number)+'</div>':''}
    <div style="margin-top:3px;line-height:1.7;color:#374151">${custAddrLines.map(l=>escHtml(l)).join('<br>')}</div>
    ${d.customer_email?'<div style="margin-top:3px;color:#6b7280">'+escHtml(d.customer_email)+'</div>':''}
  </div>`:`<div><div class="addr-label">Empfänger</div><div style="color:#9ca3af">—</div></div>`}
  <div>
    <div class="addr-label">Auftrag / Betreff</div>
    <div style="font-weight:600">${escHtml(d.title)}</div>
    ${d.notes?`<div style="margin-top:4px;font-size:13px;color:#6b7280">${escHtml(d.notes)}</div>`:''}
  </div>
</div>

<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:12px">${(d.items||[]).length} Position(en)</div>

${itemsHtml || '<p style="color:#9ca3af">Keine Positionen</p>'}

<div class="sign-row">
  <div style="flex:1"><div style="font-size:13px;color:#6b7280;margin-bottom:6px">Übergabe durch</div><div class="sign-box"></div></div>
  <div style="flex:1"><div style="font-size:13px;color:#6b7280;margin-bottom:6px">Empfang bestätigt</div><div class="sign-box"></div></div>
  <div style="flex:1"><div style="font-size:13px;color:#6b7280;margin-bottom:6px">Datum</div><div class="sign-box"></div></div>
</div>

<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:13px;color:#d1d5db;text-align:right">${today}</div>
<script>window.onload = () => window.print();<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=950,height=750');
  w.document.write(html);
  w.document.close();
}


// ── TEILE-ETIKETTEN ───────────────────────────────────────────
// Ein Etikett pro Position für Beutel oder Kiste: Kurzcode wie auf dem Teil,
// volle Nummer mit Revision, Menge, Material und Produktionsauftrag. Der
// QR-Code enthält Nummer und Revision — in die Suche gescannt öffnet er
// genau diesen Stand. Format 70 × 37 mm, 3 × 8 Stück auf A4.
const LABELS_PER_SHEET = 24;
function partLabelHtml(d, it) {
  const rev = it.effective_rev?.rev;
  const code = it.short_code ? it.short_code + (rev ? '-' + rev : '') : '';
  const qr = it.item_number ? qrSvg(it.item_number + (rev ? ' rev' + rev : ''), 90, { quiet: 1 }) : '';
  const material = [it.rm_name, it.rm_color].filter(Boolean).join(' · ');
  const date = d.manufacture_date || d.delivery_date;
  return `<div class="label">
    <div class="txt">
      ${code ? `<div class="code">${escHtml(code)}</div>` : ''}
      <div class="name">${escHtml(it.item_name || it.description || '')}</div>
      ${it.item_number ? `<div class="num">${escHtml(it.item_number)}${rev ? ' · rev' + escHtml(rev) : ''}</div>` : ''}
      <div class="meta">${escHtml(String(it.quantity ?? ''))} ${escHtml(it.unit || 'Stk')}${material ? ' · ' + escHtml(material) : ''}</div>
      <div class="meta">${escHtml(d.number)}${date ? ' · ' + fmtD(date) : ''}</div>
    </div>
    ${qr ? `<div class="qr">${qr}</div>` : ''}
  </div>`;
}

async function printPartLabels(deliveryId) {
  const d = await api(`/api/deliveries/${deliveryId}/delivery-data`);
  const labels = (d.items || []).map(it => partLabelHtml(d, it));
  if (!labels.length) return toast('Keine Positionen', 'err');
  // "</" im Skriptblock entschärfen, damit der Browser ihn nicht vorzeitig schliesst
  const data = JSON.stringify(labels).replace(/<\//g, '<\\/');
  const html = `<!DOCTYPE html>
<html lang="de-CH">
<head><meta charset="UTF-8"><title>Etiketten ${escHtml(d.number)}</title>
<style>
  @page { size: A4; margin: 0 }
  body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #111 }
  .sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: repeat(3, 70mm);
    grid-template-rows: repeat(8, 37mm); align-content: start; padding-top: .5mm; box-sizing: border-box;
    overflow: hidden; break-after: page }
  .sheet:last-child { break-after: auto }
  .label { box-sizing: border-box; padding: 3mm 3.5mm; display: flex; gap: 2mm; align-items: center; overflow: hidden }
  .txt { flex: 1; min-width: 0 }
  .code { font-family: Consolas, 'DejaVu Sans Mono', monospace; font-size: 18pt; font-weight: 700; letter-spacing: .5pt; line-height: 1 }
  .name { font-size: 9pt; font-weight: 600; margin-top: 1.5mm }
  .num, .meta { font-size: 7pt; margin-top: .6mm }
  .num { font-family: Consolas, 'DejaVu Sans Mono', monospace }
  .meta { color: #444 }
  .name, .num, .meta { white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
  .qr svg { width: 21mm; height: 21mm; display: block }
  .bar { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; padding: 10px 14px; margin-bottom: 10mm;
    background: #fff; border-radius: 6px; font-size: 13px; box-shadow: 0 1px 4px rgba(0,0,0,.12) }
  .bar input { width: 56px; padding: 3px 6px }
  .bar button { padding: 5px 14px; font-size: 13px; cursor: pointer }
  @media screen {
    body { background: #e5e7eb; padding: 10mm }
    .sheet { background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.15); margin-bottom: 10mm }
    .label { outline: 1px dashed #cbd5e1; outline-offset: -1px }
  }
  @media print { .bar { display: none } }
</style>
</head>
<body>
<div class="bar">
  <strong>${labels.length} Etikett${labels.length === 1 ? '' : 'en'} · ${escHtml(d.number)}</strong>
  <label>Erstes freies Etikett auf dem Bogen:
    <input type="number" min="1" max="${LABELS_PER_SHEET}" value="1" oninput="render(this.value)"></label>
  <span style="color:#555">A4-Bogen 70 × 37 mm (3 × 8) — im Druckdialog Ränder «Keine», Skalierung 100 %</span>
  <button onclick="window.print()">Drucken</button>
</div>
<div id="pages"></div>
<script>
  const LABELS = ${data};
  function render(start) {
    const skip = Math.min(Math.max(parseInt(start) || 1, 1), ${LABELS_PER_SHEET}) - 1;
    const cells = Array(skip).fill('<div class="label"></div>').concat(LABELS);
    let html = '';
    for (let i = 0; i < cells.length; i += ${LABELS_PER_SHEET}) html += '<div class="sheet">' + cells.slice(i, i + ${LABELS_PER_SHEET}).join('') + '</div>';
    document.getElementById('pages').innerHTML = html;
  }
  render(1);
<\/script>
</body></html>`;
  const w = window.open('', '_blank', 'width=950,height=900');
  if (!w) return toast('Popup blockiert — bitte Popups für PLM erlauben', 'err');
  w.document.write(html);
  w.document.close();
}

// ── BOM PRINT ─────────────────────────────────────────────────
async function printBom(itemId, revId) {
  const item = await api('/api/items/' + itemId);
  const rev  = item.revisions?.find(r => r.id === revId) || item.revisions?.[0];
  if (!rev) return toast('Revision nicht gefunden', 'err');
  const s = state.settings || {};

  const plmRows = (rev.bom||[]).slice().sort((a,b) => (a.position||999)-(b.position||999));
  const stdRows = rev.bom_std||[];
  const allRows = [...plmRows.map(b=>({...b,_std:false})), ...stdRows.map(b=>({...b,_std:true}))];

  const escH = t => String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  const totalWeight = allRows.reduce((s,b) => {
    const w = b._std ? null : (b.weight_g ?? null);
    return w != null ? s + w * b.quantity : s;
  }, 0);

  const rows = allRows.map((b, idx) => `
    <tr>
      <td style="text-align:center;color:#6b7280">${idx+1}</td>
      <td style="font-family:monospace;font-size:12px;color:#1d4ed8">${b._std ? escH(b.designation) : escH(b.item_number)}</td>
      <td>${b._std
        ? `${escH(b.sp_name||b.designation)}${b.material?' <span style="color:#6b7280">'+escH(b.material)+'</span>':''}`
        : escH(b.name)}</td>
      <td style="text-align:center">${b._std
        ? '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:10px;font-size:11px">N</span>'
        : escH(b.item_type?.toUpperCase())}</td>
      <td style="text-align:right;font-family:monospace"><strong>${b.quantity}</strong> ${escH(b.unit||'Stk')}</td>
      ${b._std ? '<td style="color:#9ca3af;font-size:12px">—</td>' : `<td style="font-family:monospace;font-size:12px;color:#6b7280">${b.child_active_rev?'rev'+b.child_active_rev.rev:'—'}</td>`}
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
  <title>BOM ${escH(item.item_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 20mm 15mm; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .sub { font-size: 13px; color: #6b7280; margin-bottom: 16px; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 20px; align-items: flex-start; }
    .company { font-size: 12px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e40af; color: #fff; text-align: left; padding: 7px 10px; font-size: 12px; }
    td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) td { background: #f9fafb; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; }
    @media print { body { padding: 10mm 8mm; } }
  </style>
  </head><body>
  <div class="meta">
    <div>
      <h1>${escH(item.item_number)} — ${escH(item.name)}</h1>
      <div class="sub">Stückliste rev${rev.rev} · Status: ${rev.status}${item.classification?' · '+escH(item.classification):''}</div>
      ${_docLogo(s, s.company_name ? `<div class="company">${escH(s.company_name)}</div>` : '')}
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280">
      ${new Date().toLocaleDateString('de-CH')}<br>
      ${allRows.length} Position(en)${totalWeight>0?' · Gewicht: ~'+totalWeight.toFixed(1)+' g':''}
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="width:36px;text-align:center">Pos.</th>
      <th style="width:130px">Nummer</th>
      <th>Bezeichnung</th>
      <th style="width:50px;text-align:center">Typ</th>
      <th style="width:80px;text-align:right">Menge</th>
      <th style="width:60px">Rev.</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px">Keine Positionen</td></tr>'}</tbody>
  </table>
  <div class="footer">
    <span>${escH(item.item_number)} · BOM rev${rev.rev}</span>
    <span>Gedruckt: ${new Date().toLocaleDateString('de-CH')}</span>
  </div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(html);
  w.document.close();
}

// ── CLONE ORDER ───────────────────────────────────────────────
async function cloneOrder(id) {
  const o = await api(`/api/orders/${id}/clone`, 'POST');
  await renderOrders();
  await openOrderDetail(o.id);
  openOrderModal(o.id);
}
