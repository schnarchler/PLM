// 02-plm-browse.js — Projektliste, Projekt-Detail (Baum), Projektdokumente, Item-Detail
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── PROJECTS LIST ─────────────────────────────────────────────
// Projekte als Liste oder Kacheln
const _projectView = () => _pref('project_view', 'list');
function setProjectView(v) {
  _setPref('project_view', v);
  renderProjectsList();
}

// Projekte und Items im Projekt nach Nummer (wie bisher) oder Name — getrennt wählbar
const _sortOf = key => _pref(key, 'number');
function setPlmSort(key, v, rerender) {
  _setPref(key, v);
  rerender();
}
const _byName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });
// Der Server liefert Items nach Typ, dann Nummer absteigend — beim Namen bleibt die Gruppierung nach Typ
const _sortItems = items => _sortOf('sort_items') === 'name' ? items.sort((a, b) => a.item_type.localeCompare(b.item_type) || _byName(a, b)) : items;
function _sortBtns(key, rerender) {
  const b = (v, label, title) => `<button class="btn btn-sm ${_sortOf(key) === v ? 'btn-primary' : 'btn-ghost'}" onclick="setPlmSort('${key}','${v}',${rerender})" title="${title}">${label}</button>`;
  return b('number', _t('Nr.'), _t('Nach Nummer sortieren')) + b('name', 'A–Z', _t('Nach Name sortieren'));
}
// Baum und Struktur-Tab neu sortieren, der offene Tab bleibt offen
function _resortProject() {
  if (!state.project) return;
  renderProjectTree(state.project);
  _rerenderProjectDetail();
}
// Projektansicht rechts neu zeichnen, falls sie offen ist — im selben Tab
function _rerenderProjectDetail() {
  if (!document.getElementById('pt-files')) return;
  const tabs = [...document.querySelectorAll('#dp-tabs .tab')];
  const active = tabs.findIndex(t => t.classList.contains('active'));
  openProjectDetail(state.project);
  if (active > 0) document.querySelectorAll('#dp-tabs .tab')[active]?.click();
}
// Nach Änderungen von ausserhalb des Projekts (Checkout-Import): Baum und
// Projektansicht neu laden — nur wenn das Projekt gerade links offen ist.
// projectId: nur dieses Projekt; ohne Angabe das offene.
async function refreshOpenProject(projectId) {
  if (!state.project || !document.getElementById('project-tree')) return;
  if (projectId != null && state.project.id != projectId) return;
  state.project = await api(`/api/projects/${state.project.id}`);
  renderProjectTree(state.project);
  _rerenderProjectDetail();
}

// ── TEILE: alle Items über alle Projekte ──────────────────────
// Eine flache Liste, gefiltert nach Text und Typ. Ein Klick öffnet das Teil
// rechts; „+ Teil“ fragt nach dem Projekt, weil die Nummer daran hängt.
let _partsAll = [], _partsQ = '', _partsType = '';
const _PARTS_TYPES = [['', _t('Alle')], ['prt', 'Parts'], ['asm', _t('Baugruppen')], ['doc', _t('Dokumente')]];

async function renderPartsList() {
  // Kein offener Projektbaum: Änderungen am Teil frischen diese Liste auf
  state.project = null;
  _partsHeader();
  if (!document.getElementById('parts-rows')) {
    setLeftBody(`<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
        <input class="fi" id="parts-q" placeholder="${_t('Filtern: Nummer, Name, Kurzcode, Projekt …')}" value="${esc(_partsQ)}"
          oninput="_partsQ=this.value;_renderPartsRows()" style="flex:1;min-width:160px">
        <span id="parts-types" style="display:inline-flex;gap:4px"></span>
      </div>
      <div id="parts-rows"><div class="empty"><div class="empty-text" style="font-size:13px">${_t('Lade…')}</div></div></div>`);
  }
  try { _partsAll = await api('/api/items'); } catch { return; }
  const badge = document.getElementById('badge-parts');
  if (badge) badge.textContent = _partsAll.length || '—';
  _renderPartsRows();
}

function _partsHeader() {
  setLeftHeader(_t('Teile'), `<span style="display:inline-flex;gap:4px;align-items:center">${_sortBtns('sort_parts', '_resortParts')}<span style="width:6px"></span>`
    + `<button class="btn btn-primary btn-sm" onclick="openItemModal(null,null,'prt')">${_t('+ Teil')}</button></span>`);
}
function _resortParts() { _partsHeader(); _renderPartsRows(); }
function _partsSetType(t) { _partsType = t; _renderPartsRows(); }

function _renderPartsRows() {
  const el = document.getElementById('parts-rows');
  if (!el) return;
  const types = document.getElementById('parts-types');
  if (types) types.innerHTML = _PARTS_TYPES.map(([t, label]) =>
    `<button class="btn btn-sm ${_partsType === t ? 'btn-primary' : 'btn-ghost'}" onclick="_partsSetType('${t}')">${label}</button>`).join('');
  if (!_partsAll.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">🔩</div><div class="empty-text">${_t('Noch keine Teile')}</div>
      <div style="margin-top:10px"><button class="btn btn-primary btn-sm" onclick="openItemModal(null,null,'prt')">${_t('+ Teil')}</button></div></div>`;
    return;
  }
  const terms = _partsQ.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = _partsAll.filter(i => (!_partsType || i.item_type === _partsType)
    && terms.every(t => [i.item_number, i.name, i.short_code, i.project_number, i.project_name, i.classification]
      .some(v => String(v || '').toLowerCase().includes(t))));
  // Der Server liefert nach Nummer; nach Name über alle Typen hinweg
  if (_sortOf('sort_parts') === 'name') rows.sort((a, b) => _byName(a, b) || a.item_number.localeCompare(b.item_number));
  const sel = state.item?.id;
  el.innerHTML = `<div style="font-size:12px;color:var(--t4);margin:0 0 4px 2px">${rows.length === _partsAll.length
      ? _t('{n} Teile', { n: rows.length }) : _t('{n} von {total} Teilen', { n: rows.length, total: _partsAll.length })}</div>`
    + (rows.length ? rows.map(i => {
      const code = printCodeOf(i, i.rev_id ? { rev: i.rev } : null);
      const co = state.checkouts.some(c => c.item_id === i.id);
      return `<div class="tree-row${i.id === sel ? ' selected' : ''}" id="tr-${i.id}" onclick="openItemDetail(${i.id})"${_thumbAttr(i.thumb_id)}>
        ${_itemChip(i.item_type, 22)}
        <span class="tree-num">${esc(i.item_number)}</span>
        ${code ? `<span class="tree-revno" title="Kurzcode · rev${esc(i.rev ?? '')}">${esc(code)}</span>`
          : i.rev ? `<span class="tree-revno">rev${esc(i.rev)}</span>` : ''}
        <span class="tree-name">${esc(i.name)}</span>
        <span class="tree-right">
          <span style="font-family:var(--mono);font-size:12px;color:var(--t4)" title="Projekt ${esc(i.project_number)} · ${esc(i.project_name)}">${esc(i.project_number)}</span>
          ${co ? '<span class="tree-co" title="' + _t('Ausgecheckt — wird gerade bearbeitet') + '">CO</span>' : ''}
          ${i.status ? `<span class="status st-${i.status} tree-rev" title="${esc(PLM_ST_LABEL[i.status] || '')}">${i.status}</span>` : ''}
        </span>
      </div>`;
    }).join('') : '<div style="color:var(--t3);font-size:13px;padding:8px 2px">' + _t('Kein Teil passt zum Filter.') + '</div>');
}

async function renderProjectsList() {
  const viewBtn = (v, icon, title) => `<button class="btn btn-sm ${_projectView() === v ? 'btn-primary' : 'btn-ghost'}" onclick="setProjectView('${v}')" title="${title}">${icon}</button>`;
  setLeftHeader(_t('Projekte'), `<span style="display:inline-flex;gap:4px;align-items:center">${_sortBtns('sort_projects', 'renderProjectsList')}<span style="width:6px"></span>${viewBtn('list', '☰', _t('Als Liste'))}${viewBtn('tiles', '▦', _t('Als Kacheln'))}
    <button class="btn btn-primary btn-sm" style="margin-left:6px" onclick="openNewProjectModal()">${_t('+ Projekt')}</button></span>`);
  const projects = await api('/api/projects');
  // Der Server liefert angeheftete zuerst, dann nach Nummer absteigend
  if (_sortOf('sort_projects') === 'name') projects.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || _byName(a, b));
  state.projects = projects;
  if (!projects.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">📂</div><div class="empty-text">${_t('Noch keine Projekte')}</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="openNewProjectModal()">${_t('Erstes Projekt anlegen')}</button></div></div>`);
    return;
  }
  const statChip = (val, label, color) => val
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:13px;color:${color}"><span style="font-family:var(--mono);font-weight:600">${val}</span><span style="color:var(--t4)">${label}</span></span>`
    : '';
  // Die Nummer steht im Kästchen — unter dem Namen nur noch der Kunde
  const badge = (p, ml) => `<div style="width:38px;height:38px;border-radius:var(--r-sm);background:${p.color ? esc(p.color)+'1f' : 'rgba(157,180,255,.1)'};border:1px solid ${p.color ? esc(p.color)+'4d' : 'rgba(157,180,255,.2)'};display:grid;place-items:center;flex-shrink:0;margin-left:${ml}" title="${esc(p.number)}">
        <span style="font-family:var(--mono);font-size:13px;font-weight:700;color:${p.color ? esc(p.color) : 'var(--blue)'}">${p.number.replace(/[^0-9]/g,'').slice(-3)||'—'}</span>
      </div>`;
  const title = p => `<div style="font-size:13.5px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em">${esc(p.name)}</div>
        ${p.customer ? `<div style="font-size:13px;color:var(--t3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.customer)}</div>` : ''}`;
  const stats = p => `${statChip(p.asm_count, 'asm', 'var(--blue)')}
        ${statChip(p.prt_count, 'prt', 'var(--teal)')}
        ${statChip(p.doc_count, 'doc', 'var(--purple)')}
        ${p.file_count ? `<span style="font-size:13px;color:var(--t4);font-family:var(--mono)">${p.file_count} <span style="font-family:var(--sans);font-weight:400">files</span></span>` : ''}`;
  const date = p => `<span style="font-size:13px;color:var(--t4);white-space:nowrap">${parseDbDate(p.created_at).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric'})}</span>`;
  const pin = p => `<button onclick="event.stopPropagation();pinProject(${p.id})" title="${p.pinned?_t('Angeheftet – klicken zum Lösen'):_t('Anpinnen')}"
          style="background:none;border:none;cursor:pointer;font-size:15px;padding:2px 4px;opacity:${p.pinned?'1':'0.3'};transition:opacity .15s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='${p.pinned?'1':'0.3'}'">
          📌
        </button>`;
  const hover = `onmouseover="this.style.borderColor='var(--line3)';this.style.background='var(--bg3)'" onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg2)'"`;

  if (_projectView() === 'tiles') {
    setLeftBody(`<div class="card-grid">${projects.map(p => `
      <div onclick="openProject(${p.id})" style="display:flex;flex-direction:column;gap:10px;padding:12px 14px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);cursor:pointer;transition:border-color .15s,background .15s;position:relative;overflow:hidden" ${hover}>
        ${p.color ? `<span style="position:absolute;left:0;right:0;top:0;height:3px;background:${esc(p.color)}"></span>` : ''}
        <div style="display:flex;align-items:center;gap:10px">
          ${badge(p, '0')}
          <div style="flex:1;min-width:0">${title(p)}</div>
          ${pin(p)}
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${stats(p)}
          <span style="margin-left:auto">${date(p)}</span>
        </div>
      </div>`).join('')}</div>`);
    return;
  }
  setLeftBody(`<div style="display:flex;flex-direction:column;gap:6px;max-width:860px">${projects.map(p => `
    <div onclick="openProject(${p.id})" style="display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);cursor:pointer;transition:border-color .15s,background .15s;position:relative;overflow:hidden" ${hover}>
      ${p.color ? `<span style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${esc(p.color)}"></span>` : ''}
      ${badge(p, p.color ? '4px' : '0')}
      <div style="flex:1;min-width:0">${title(p)}</div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        ${stats(p)}
        ${date(p)}
        ${pin(p)}
        <span style="color:var(--t4);font-size:13px">›</span>
      </div>
    </div>`).join('')}</div>`);
}

async function pinProject(id) {
  await api(`/api/projects/${id}/pin`, 'POST', {});
  renderProjectsList();
}

// ── PROJECT DETAIL (tree view) ────────────────────────────────
async function openProject(id) {
  const p = await api(`/api/projects/${id}`);
  state.project = p;
  state.item = null;
  if (state.filterBomChildren === undefined) state.filterBomChildren = true;
  document.getElementById('ni-projects').classList.add('active');
  _pushHistory({ view: 'projects', detailType: 'project', detailId: p.id });

  setLeftHeader(
    `<div class="breadcrumb"><span onclick="gotoView('projects')">${_t('Projekte')}</span><span class="sep">/</span>${
      p.color ? `<span style="width:9px;height:9px;border-radius:50%;background:${esc(p.color)};display:inline-block;margin-right:2px;flex-shrink:0"></span>` : ''
    }<strong>${esc(p.name)}</strong><span class="chip" style="margin-left:6px${p.color ? ';border-color:'+esc(p.color)+'66;color:'+esc(p.color) : ''}">${p.number}</span></div>`,
    `<button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'asm')">${_t('+ Baugruppe')}</button>
     <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'prt')">${_t('+ Part')}</button>
     <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'doc')">${_t('+ Dokument')}</button>`
  );

  renderProjectTree(p);
  openProjectDetail(p);
}

async function openProjectAndItem(projectId, itemId, revId) {
  await openProject(projectId);
  await openItemDetail(itemId, revId);
}

async function gotoPlmItem(itemId) {
  const item = await api(`/api/items/${itemId}`);
  if (item && item.project_id) await openProjectAndItem(item.project_id, itemId);
}

async function refreshProjectTree() {
  if (!state.project) return;
  const p = await api(`/api/projects/${state.project.id}`);
  state.project = p;
  renderProjectTree(p);
}

function _treeOpenIds() {
  const open = new Set();
  document.querySelectorAll('.tree-children').forEach(el => {
    if (el.style.display !== 'none' && el.dataset.itemId) open.add(el.dataset.itemId);
  });
  return open;
}

function _treeRestoreOpen(openIds) {
  if (!openIds.size) return;
  document.querySelectorAll('.tree-children').forEach(el => {
    if (el.dataset.itemId && openIds.has(el.dataset.itemId)) {
      el.style.display = '';
      const row = el.previousElementSibling;
      if (row) { const tog = row.querySelector('.tree-tog'); if (tog) tog.textContent = '▼'; }
    }
  });
}

function renderProjectTree(p) {
  const openIds = _treeOpenIds();
  const items = p.items || [];
  if (!items.length) {
    setLeftBody(`<div class="empty" id="project-tree"><div class="empty-icon">🔩</div><div class="empty-text">${_t('Noch keine Items')}</div>
      <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
        <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'asm')">${_t('+ Baugruppe')}</button>
        <button class="btn btn-primary btn-sm" onclick="openItemModal(${p.id},null,'prt')">${_t('+ Part')}</button>
        <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'doc')">${_t('+ Dokument')}</button>
      </div></div>`);
    return;
  }

  const bomChildIds = new Set();
  items.forEach(item => (item.latest_revision?.bom || []).forEach(b => bomChildIds.add(b.child_item_id)));

  const filterOn = state.filterBomChildren !== false;
  const rootItems = items.filter(i => i.parent_id === null);
  const visibleRoots = filterOn ? rootItems.filter(i => !bomChildIds.has(i.id)) : rootItems;
  _sortItems(visibleRoots);
  const hiddenCount = rootItems.length - visibleRoots.length;

  setLeftBody(`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line)">
      <span style="font-size:13px;color:var(--t4);font-family:var(--mono)">${_t('{n} Items', { n: items.length })}</span>
      <button onclick="toggleBomFilter()" style="font-size:13px;padding:3px 9px;border-radius:var(--r-xs);cursor:pointer;font-family:var(--sans);border:1px solid ${filterOn?'rgba(157,180,255,.35)':'var(--line2)'};background:${filterOn?'rgba(157,180,255,.1)':'transparent'};color:${filterOn?'var(--blue)':'var(--t3)'}">
        ${filterOn ? _t('BOM ausgeblendet') : _t('BOM sichtbar')}${filterOn && hiddenCount ? ` (${hiddenCount})` : ''}
      </button>
      <span style="margin-left:auto;display:inline-flex;gap:4px">${_sortBtns('sort_items', '_resortProject')}</span>
    </div>
    <div id="project-tree">${renderTreeNodes(visibleRoots, items)}</div>`);
  setLeftFooter(_statusLegend());

  _treeRestoreOpen(openIds);
}

// Was die Farben der Revisions-Kennzeichen bedeuten — als Fusszeile ganz
// unten in der linken Spalte, unabhängig vom Scrollen
function _statusLegend() {
  return `<div class="status-legend">${Object.entries(PLM_ST_LABEL).map(([st, label]) =>
    `<span style="display:inline-flex;align-items:center;gap:5px"><span class="status st-${st}">${st}</span>${esc(label)}</span>`).join('')}
    <span style="display:inline-flex;align-items:center;gap:5px"><span class="tree-co">CO</span>${_t('Ausgecheckt')}</span></div>`;
}

function toggleBomFilter() {
  state.filterBomChildren = !state.filterBomChildren;
  if (state.project) renderProjectTree(state.project);
}


let _nc = 0;
function _nim() { return ++_nc; }

function renderTreeNodes(roots, allItems) {
  _nc = 0;
  const map = {};
  // support both call styles: renderTreeNodes(allItems, null) legacy OR renderTreeNodes(roots, allItems)
  if (Array.isArray(allItems)) {
    allItems.forEach(i => map[i.id] = i);
  } else {
    roots.forEach(i => map[i.id] = i);
    roots = roots.filter(i => !i.parent_id);
  }
  return _renderRootNodes(roots, map, true);
}

function _renderRootNodes(children, map, isRoot) {
  return children.map(item => _renderTreeNode(item, map, isRoot)).join('');
}

function _renderTreeNode(item, map, isRoot) {
  const rev = item.latest_revision;
  const isASM = item.item_type === 'asm';
  const isDOC = item.item_type === 'doc';
  const co = state.checkouts.some(c => c.item_id === item.id);
  const bomKids = (isASM && rev?.bom) ? rev.bom : [];
  // Ab zwei Revisionen lassen sich diese aufklappen — wie die Stückliste
  const revKids = (item.revisions || []).length > 1 ? item.revisions : [];
  const hasKids = bomKids.length > 0 || revKids.length > 0;
  const n = _nim(); const nid = `tn${n}`, tid = `tt${n}`;
  const revHtml = revKids.length ? `<div class="tree-revs">${revKids.map(r => _renderTreeRev(item, r)).join('')}</div>` : '';
  const childHtml = revHtml + bomKids.map(b => {
    const ci = map[b.child_item_id];
    return ci ? _renderTreeNode(ci, map, false) : '';
  }).join('');
  return `<div class="tree-node">
    <div class="tree-row" onclick="openItemDetail(${item.id})" ${isRoot ? `id="tr-${item.id}"` : ''}${_thumbAttr(item.thumb_id)}
      style="${co ? 'background:var(--amber-soft);box-shadow:inset 2px 0 0 var(--amber);' : ''}">
      <span class="tree-tog" id="${tid}" onclick="event.stopPropagation();togN('${nid}','${tid}')" style="color:var(--t4)" title="${revKids.length && !bomKids.length ? _t('Revisionen') : ''}">${hasKids ? '▶' : ''}</span>
      ${_itemChip(item.item_type, 22)}
      <span class="tree-num">${esc(item.item_number)}</span>
      ${printCodeOf(item, rev) ? `<span class="tree-revno" title="Kurzcode · rev${esc(rev?.rev ?? '')}">${esc(printCodeOf(item, rev))}</span>`
        : rev ? `<span class="tree-revno">rev${esc(rev.rev)}</span>` : ''}
      <span class="tree-name">${esc(item.name)}</span>
      <span class="tree-right">
        ${co ? '<span class="tree-co" title="' + _t('Ausgecheckt — wird gerade bearbeitet') + '">CO</span>' : ''}
        ${rev ? `<span class="status st-${rev.status} tree-rev" title="${esc(PLM_ST_LABEL[rev.status] || '')}">${rev.status}</span>` : ''}
      </span>
    </div>
    ${hasKids ? `<div id="${nid}" class="tree-children" data-item-id="${item.id}" style="display:none">${childHtml}</div>` : ''}
  </div>`;
}

// Eine Revision im Baum: Klick öffnet das Item mit genau dieser Revision
function _renderTreeRev(item, r) {
  const meta = [
    r.weight_g != null ? '⚖ ' + fmtN(r.weight_g, 1) + ' g' : '',
    r.default_price != null ? fmtChf(r.default_price) : '',
  ].filter(Boolean).join(' · ');
  const sel = state.item?.id === item.id && state.activeRevId === r.id;
  return `<div class="tree-row tree-rev-row${sel ? ' selected' : ''}" data-rev-row="${r.id}"
      onclick="event.stopPropagation();openItemDetail(${item.id}, ${r.id})" title="rev${esc(r.rev)} · ${esc(PLM_ST_LABEL[r.status] || r.status)}">
      <span class="tree-tog"></span>
      <span class="tree-revno">rev${esc(r.rev)}</span>
      ${meta ? `<span class="tree-rev-meta">${meta}</span>` : ''}
      <span class="tree-right"><span class="status st-${r.status} tree-rev">${r.status}</span></span>
    </div>`;
}

// Gewählte Revision im Baum markieren (Item-Zeile bleibt markiert)
function _treeMarkRev(revId) {
  document.querySelectorAll('.tree-rev-row.selected').forEach(r => r.classList.remove('selected'));
  if (revId) document.querySelectorAll(`.tree-rev-row[data-rev-row="${revId}"]`).forEach(r => r.classList.add('selected'));
}

function togN(nid, tid) {
  const n = document.getElementById(nid); const t = document.getElementById(tid);
  if (!n) return;
  const open = n.style.display !== 'none';
  n.style.display = open ? 'none' : '';
  if (t) t.textContent = open ? '▶' : '▼';
}

function openProjectDetail(p) {
  const docCount = (p.documents||[]).length;
  document.getElementById('dp-title').innerHTML =
    `<span style="font-family:var(--mono);font-size:13px;color:var(--blue);margin-right:6px;flex-shrink:0">${p.number}</span><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0" title="${esc(p.name)}">${esc(p.name)}</strong>`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'pt-info')">Info</button>
    <button class="tab" onclick="switchTab(this,'pt-files')">${_t('Struktur')}</button>
    <button class="tab" onclick="switchTab(this,'pt-docs')">${_t('Dokumente')}${docCount?` <span style="background:var(--blue);color:var(--bg0);border-radius:8px;font-size:11px;font-family:var(--mono);padding:1px 5px;margin-left:3px">${docCount}</span>`:''}</button>
    <button class="tab" onclick="switchTab(this,'pt-log')">Log</button>`;

  // Build files/BOM overview using BOM-based hierarchy
  _nc = 0;
  const allItems = p.items || [];
  const dpMap = {};
  allItems.forEach(i => dpMap[i.id] = i);

  function renderItemFiles(item, depth) {
    const rev = item.latest_revision;
    const datasets = rev?.datasets || [];
    const isASM = item.item_type === 'asm', isDOC = item.item_type === 'doc';
    const co = state.checkouts.some(c => c.item_id === item.id);

    const bomKids = (isASM && rev?.bom) ? rev.bom : [];
    const hasKids = bomKids.length > 0;
    const n = _nim(); const nid = `dp${n}`;
    const childHtml = hasKids ? bomKids.map(b => {
      const ci = dpMap[b.child_item_id];
      if (!ci) return '';
      const qtyBadge = (b.quantity && b.quantity !== 1) ? ` <span style="font-family:var(--mono);font-size:11px;color:var(--t4);background:var(--bg3);padding:1px 5px;border-radius:3px">×${b.quantity}</span>` : '';
      return renderItemFiles(ci, depth + 1) + (qtyBadge ? `<div style="padding:0 0 2px ${28 + depth*16}px">${qtyBadge}</div>` : '');
    }).join('') : '';
    return `<div>
      <div style="display:flex;align-items:center;gap:7px;padding:5px ${depth>0?'6px':'4px'};border-radius:var(--r-xs);cursor:pointer;transition:background .1s;${co?'background:rgba(121,221,227,.07);box-shadow:inset 2px 0 0 var(--teal);':''}" onclick="openItemDetail(${item.id})"${_thumbAttr(item.thumb_id)} onmouseover="this.style.background='${co?'rgba(121,221,227,.12)':'var(--bg3)'}'" onmouseout="this.style.background='${co?'rgba(121,221,227,.07)':''}'" >
        ${hasKids ? `<span onclick="event.stopPropagation();const e=document.getElementById('${nid}');const open=e.style.display!=='none';e.style.display=open?'none':'';this.style.transform=open?'':'rotate(90deg)'" style="color:var(--t4);font-size:11px;transition:transform .15s;flex-shrink:0;cursor:pointer">▶</span>` : '<span style="width:11px;flex-shrink:0"></span>'}
        ${_itemChip(item.item_type, 18)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${item.item_number}</span>
        <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t1)">${esc(item.name)}</span>
        ${co ? `<span style="font-family:var(--mono);font-size:11px;color:var(--teal);background:rgba(121,221,227,.12);border:1px solid rgba(121,221,227,.25);padding:1px 5px;border-radius:3px;flex-shrink:0" title="${_t('Ausgecheckt')}">CO</span>` : ''}
        ${rev ? `<span class="status st-${rev.status}" style="font-size:11px;flex-shrink:0">rev${rev.rev}</span>` : ''}
      </div>
      ${datasets.length ? `<div style="padding:2px 6px 4px ${28 + depth*16}px;display:flex;flex-direction:column;gap:2px">
        ${datasets.map(d => `<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;background:var(--bg2);border-radius:3px">
          <span class="ds-type ${dtClass(d.original_name,d.ds_type)}" style="font-size:11px">${fileLabel(d.original_name,d.ds_type)}</span>
          <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)">${esc(d.original_name)}</span>
          <a href="/api/datasets/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" style="padding:3px" title="Download" download>↓</a>
        </div>`).join('')}
      </div>` : ''}
      ${hasKids ? `<div id="${nid}" style="padding-left:${14+depth*4}px;border-left:1px solid var(--line);margin-left:${14+depth*4}px">${childHtml}</div>` : ''}
    </div>`;
  }

  const roots = _sortItems(allItems.filter(i => !i.parent_id));
  const filesHtml = roots.length
    ? roots.map(i => renderItemFiles(i, 0)).join('')
    : '<div style="color:var(--t3);font-size:13px;padding:8px 0">' + _t('Keine Items im Projekt') + '</div>';

  const asmCount = allItems.filter(i=>i.item_type==='asm').length;
  const prtCount = allItems.filter(i=>i.item_type==='prt').length;
  const docCount2 = allItems.filter(i=>i.item_type==='doc').length;

  document.getElementById('dp-body').innerHTML = `
    <div id="pt-files" style="display:none">
      <div style="display:flex;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--line)">
        ${asmCount?`<span style="font-size:13px;color:var(--blue);font-family:var(--mono)">${asmCount} <span style="color:var(--t4);font-family:var(--sans)">asm</span></span>`:''}
        ${prtCount?`<span style="font-size:13px;color:var(--teal);font-family:var(--mono)">${prtCount} <span style="color:var(--t4);font-family:var(--sans)">prt</span></span>`:''}
        ${docCount2?`<span style="font-size:13px;color:var(--purple);font-family:var(--mono)">${docCount2} <span style="color:var(--t4);font-family:var(--sans)">doc</span></span>`:''}
      </div>
      ${filesHtml}
    </div>
    <div id="pt-docs" style="display:none">
      ${renderProjectDocs(p)}
    </div>
    <div id="pt-info">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">${_t('Nummer')}</div>
          <div style="font-family:var(--mono);font-size:13px;color:var(--blue);margin-top:3px">${p.number}</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">${_t('Kunde')}</div>
          <div style="font-size:13px;color:var(--t1);margin-top:3px">${p.customer||'—'}</div>
        </div>
        ${p.description?`<div style="grid-column:span 2;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">${_t('Beschreibung')}</div>
          <div style="font-size:13px;color:var(--t2);margin-top:4px;white-space:pre-wrap;line-height:1.6">${esc(p.description)}</div>
        </div>`:''}
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">${_t('Angelegt')}</div>
          <div style="font-size:13px;color:var(--t2);margin-top:3px">${fmtDate(p.created_at)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="editProject(${p.id})">${_t('Bearbeiten')}</button>
        ${!(p.items && p.items.length) ? `<button class="btn btn-red btn-sm" onclick="deleteProject(${p.id})">${_t('Löschen')}</button>` : ''}
      </div>
    </div>
    <div id="pt-log" style="display:none">
      ${(p.changelog||[]).map(cl => `
        <div class="cl-row"><div class="cl-dot"></div>
        <div><div class="cl-action">${esc(cl.action)}</div><div class="cl-detail">${esc(cl.details||'')}</div></div>
        ${_clTime(cl)}</div>`).join('') || '<div style="color:var(--t3);font-size:13px">' + _t('Leer') + '</div>'}
    </div>`;
  showDetail();
}

// ── PROJECT DOCUMENTS ─────────────────────────────────────────
function renderProjectDocs(p) {
  const docs = p.documents || [];
  const typeLabel = { PDF:'PDF', DOC:'Word', SPREADSHEET:'Excel', IMAGE:_t('Bild'), CAD:'CAD', GCODE:'GCode', OTHER:_t('Datei') };
  const rows = docs.map(d => `
    <div class="ds-row">
      <span class="ds-type dt-${d.doc_type}">${typeLabel[d.doc_type]||d.doc_type}</span>
      <div class="ds-info" style="flex:1">
        <div class="ds-name">${esc(d.name)}</div>
        <div class="ds-meta">${fmtSize(d.file_size)} · ${fmtDate(d.uploaded_at)}${d.notes?' · <em>'+esc(d.notes)+'</em>':''}</div>
      </div>
      <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-icon btn-ghost btn-sm" title="${_t('Öffnen')}">&#x2197;</a>
      <a href="/api/documents/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="openDocEditModal(${d.id},'${esc(d.name)}','${esc(d.notes||'')}',${p.id})" title="${_t('Bearbeiten')}">✏️</button>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="delDoc(${d.id},${p.id})" title="${_t('Löschen')}">✕</button>
    </div>`).join('');

  return `
    <div style="margin-bottom:12px">
      <label class="btn btn-ghost btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        ${_t('&#x1F4CE; Dokument hochladen')}
        <input type="file" multiple style="display:none" onchange="uploadDocs(this,${p.id})">
      </label>
    </div>
    ${rows || '<div style="color:var(--t3);font-size:13px;padding:8px 0">' + _t('Noch keine Dokumente') + '</div>'}`;
}

async function uploadDocs(input, projectId) {
  const files = Array.from(input.files);
  if (!files.length) return;
  try {
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      await apiForm(`/api/projects/${projectId}/documents`, fd);
    }
  } catch { input.value = ''; return; }   // apiForm meldet den Fehler
  toast(files.length === 1 ? _t('Dokument hochgeladen') : _t('{n} Dokumente hochgeladen', { n: files.length }), 'ok');
  input.value = '';
  const p = await api(`/api/projects/${projectId}`);
  state.project = p;
  const tab = document.getElementById('pt-docs');
  if (tab) tab.innerHTML = renderProjectDocs(p);
}

function openDocEditModal(id, name, notes, projId) {
  set('doced-id', id); set('doced-name', name); set('doced-notes', notes); set('doced-projid', projId);
  openModal('docEditModal');
}

async function saveDocEdit() {
  const id = V('doced-id'); const projId = V('doced-projid');
  await api(`/api/documents/${id}`, 'PUT', { name: V('doced-name'), notes: V('doced-notes') });
  toast(_t('Gespeichert'), 'ok'); closeModal('docEditModal');
  const p = await api(`/api/projects/${projId}`);
  state.project = p;
  const tab = document.getElementById('pt-docs');
  if (tab) tab.innerHTML = renderProjectDocs(p);
}

async function delDoc(id, projectId) {
  if (!confirm(_t('Dokument löschen?'))) return;
  await api(`/api/documents/${id}`, 'DELETE');
  toast(_t('Dokument gelöscht'), 'ok');
  const p = await api(`/api/projects/${projectId}`);
  state.project = p;
  const tab = document.getElementById('pt-docs');
  if (tab) tab.innerHTML = renderProjectDocs(p);
  // Update tab badge
  openProjectDetail(p);
}

// ── ITEM DETAIL ───────────────────────────────────────────────
async function openItemDetail(itemId, revId) {
  // highlight tree row
  document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('selected'));
  const tr = document.getElementById('tr-' + itemId);
  if (tr) tr.classList.add('selected');

  const item = await api(`/api/items/${itemId}`);
  state.item = item;
  const preferredRev = revId ? item.revisions?.find(r => r.id === revId) : null;
  state.activeRevId = preferredRev?.id || item.revisions?.[0]?.id || null;
  _trackRecent('item', item.id, item.name, item.item_number, item.item_type);

  state._detailItemId = null;   // neu geöffnet → Datenblatt, nicht der zuletzt offene Tab
  _treeMarkRev(revId ? state.activeRevId : null);
  renderItemDetail(item, state.activeRevId);
  showDetail();
}
// Hinweise (Konstruktion, Fertigung, Kunde): stehen über allen Tabs, damit
// sie jeder sieht, der das Teil öffnet. Unabhängig von der Revision änderbar.
function _itemHintsBanner(item) {
  const hints = itemHints(item);
  if (!hints.length) return '';
  return `<div class="important-note">
    <span class="important-note-icon">⚠</span>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
      ${hints.map(_hintHtml).join('')}
    </div>
    <button class="btn btn-ghost btn-sm" style="padding:0 5px;font-size:12px;flex-shrink:0" onclick="openItemHintsModal(${item.id})" title="${_t('Hinweise ändern oder entfernen')}">✏</button>
  </div>`;
}

function itemIsEditable(item) {
  return !(item.revisions||[]).some(r => r.status === 'REL' || r.status === 'OBS' || r.status === 'ECO');
}


function renderItemDetail(item, activeRevId) {
  const isASM = item.item_type === 'asm';
  const isDOC = item.item_type === 'doc';
  const typeLabel = isASM ? 'ASM' : isDOC ? 'DOC' : 'PRT';
  const typeColor = isASM ? 'var(--blue)' : isDOC ? 'var(--purple)' : 'var(--teal)';
  const typeBg    = isASM ? 'rgba(157,180,255,.12)' : isDOC ? 'rgba(196,162,255,.12)' : 'rgba(121,221,227,.12)';
  const editable = itemIsEditable(item);
  // Beim Neuzeichnen desselben Items (Revision gewechselt, Datei hochgeladen …)
  // im offenen Tab bleiben; ein neu geöffnetes Item beginnt mit dem Datenblatt.
  const keepTab = state._detailItemId === item.id
    ? document.querySelector('#dp-tabs .tab.active')?.dataset.pane : null;
  state._detailItemId = item.id;
  document.getElementById('dp-title').innerHTML =
    `<span style="font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 6px;border-radius:3px;background:${typeBg};color:${typeColor};flex-shrink:0">${typeLabel}</span>`
    + `<span style="font-family:var(--mono);font-size:13px;color:${typeColor};flex-shrink:0">${item.item_number}</span>`
    // Kurzcode steht im Datenblatt, mit Revision und Kopierknopf
    // Der Name steht gross über den Tabs (dp-subtitle); der Marker hält ihn sichtbar
    + `<span data-item-title hidden></span>`
    // Knöpfe rechtsbündig, der Name nimmt den Platz dazwischen
    + `<span style="margin-left:auto;display:flex;align-items:center;gap:4px;flex-shrink:0">`
    + (editable ? `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 7px;flex-shrink:0" onclick="openEditItemModal(${item.id})" title="${_t('Bearbeiten')}">✏</button>` : '')
    + `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 7px;flex-shrink:0" onclick="openMoveItemModal(${item.id})" title="${_t('In anderes Projekt verschieben')}">↪</button>`
    + `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 7px;flex-shrink:0" onclick="openItemCompareSearch(${item.id})" title="${_t('Mit anderem Item vergleichen')}">⇄</button>`
    + `</span>`;
  // Klassifizierung nur im Datenblatt unter „Allgemein“, Mindmap über den Knopf im Datenblatt
  const sub = document.getElementById('dp-subtitle');
  if (sub) { sub.textContent = item.name; sub.title = item.name; sub.hidden = false; }

  const tabs = `
    <button class="tab active" data-pane="it-sheet" onclick="switchTab(this,'it-sheet');_initVisibleStl()">${_t('Datenblatt')}</button>
    <button class="tab" data-pane="it-revs" onclick="switchTab(this,'it-revs');_initVisibleStl()">${_t('Revisionen')}</button>
    <button class="tab" data-pane="it-log" onclick="switchTab(this,'it-log')">${_t('Historie')}</button>
    ${!isDOC ? `<button class="tab" data-pane="it-time" onclick="switchTab(this,'it-time');loadItemTimeEntries(${item.id})">${_t('Zeiten')}</button>` : ''}
    <button class="tab" data-pane="it-whereused" onclick="switchTab(this,'it-whereused');loadWhereUsed(${item.id})">${_t('Verwendung')}</button>
    <button class="tab" data-pane="it-erp" onclick="switchTab(this,'it-erp');loadErpUsage(${item.id})">${_t('Aufträge')}</button>`;
  document.getElementById('dp-tabs').innerHTML = tabs;
  if (!isDOC) {
    const activeCheckout = state.checkouts.find(c => c.item_id === item.id);
    if (activeCheckout) window._itemDetailCheckoutFolder = activeCheckout.folder;
    const coBtn = activeCheckout
      ? `<button class="btn btn-amber btn-sm" style="font-size:13px;padding:2px 8px;flex-shrink:0;margin-left:4px" onclick="doCheckin(window._itemDetailCheckoutFolder,this)">${_t('⬆ Einchecken')}</button>`
      : `<button class="btn btn-teal btn-sm" style="font-size:13px;padding:2px 8px;flex-shrink:0;margin-left:4px" onclick="openCheckoutModal(${item.id},'${esc(item.item_number)}','${item.item_type}',${(item.revisions||[]).some(r=>r.status==='REL')})">${_t('⬇ Auschecken')}</button>`;
    document.getElementById('dp-title').innerHTML += coBtn;
  }

  const rev = item.revisions?.find(r => r.id === activeRevId) || item.revisions?.[0];

  document.getElementById('dp-body').innerHTML = `
    ${_itemHintsBanner(item)}
    ${renderItemSheet(item, activeRevId)}
    <div id="it-revs" style="display:none">
      <div class="sep-label" style="margin-top:0">${_t('Revisionen')}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;align-items:center">
        ${(item.revisions||[]).map(r => `
          <div class="rev-pill ${r.id === activeRevId ? 'active-rev' : ''}" onclick="switchRev(${item.id}, ${r.id})"
            title="${esc(PLM_ST_LABEL[r.status] || r.status)}${r.delivered?.length ? ' · ' + _t('geliefert:') + ' ' + esc(r.delivered.map(d => d.number).join(', ')) : ''}">
            <span class="status st-${r.status}" style="font-size:11px">rev${r.rev}</span>
            <span style="color:var(--t3);font-size:13px">${r.status}</span>
            ${r.delivered?.length ? '<span style="font-size:12px" aria-label="geliefert">🚚</span>' : ''}
          </div>`).join('')}
        <div style="margin-left:auto;display:flex;gap:4px">
          ${(item.revisions||[]).length > 1 ? `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 7px" onclick="openRevisionCompare(${item.id})" title="${_t('Zwei Revisionen dieses Items gegenüberstellen')}">${_t('⇄ Revisionen vergleichen')}</button>` : ''}
          ${isASM ? `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 7px" onclick="openItemModal(${item.project_id},${item.id},'asm')">${_t('+ Unterbaugruppe')}</button>` : ''}
        </div>
      </div>
      ${rev ? renderRevDetail(rev, item) : '<div style="color:var(--t3)">' + _t('Keine Revision') + '</div>'}
    </div>
    <div id="it-log" style="display:none">${renderChangelogList(item.changelog)}</div>
    ${!isDOC ? `<div id="it-time" style="display:none">
      <div id="item-time-list"><div style="color:var(--t3);font-size:13px;padding:8px 0">${_t('Wird geladen…')}</div></div>
    </div>` : ''}
    <div id="it-whereused" style="display:none">
      <div id="it-whereused-list"><div style="color:var(--t3);font-size:13px;padding:8px 0">${_t('Wird geladen…')}</div></div>
    </div>
    <div id="it-erp" style="display:none">
      <div id="it-erp-list"><div style="color:var(--t3);font-size:13px;padding:8px 0">${_t('Wird geladen…')}</div></div>
    </div>`;
  if (keepTab && keepTab !== 'it-sheet') document.querySelector(`#dp-tabs .tab[data-pane="${keepTab}"]`)?.click();
  setTimeout(_initVisibleStl, 0);
}

// ── DATENBLATT-TAB ────────────────────────────────────────────
// Kurzcode zum Aufdrucken mit der Revision nach dem Strich (JXE-1) — im
// Datenblatt und in der Projektliste. Dokumente werden nicht gedruckt und haben keinen.
function printCodeOf(item, rev) {
  return item.short_code && item.item_type !== 'doc' ? item.short_code + (rev ? '-' + rev.rev : '') : '';
}

// Was für die Freigabe noch fehlt (Einstellungen → PLM → Prüfung vor der Freigabe)
function _releaseMissingBox(rev) {
  const m = rev?.release_missing || [];
  if (!m.length) return '';
  return `<div style="font-size:13px;padding:8px 11px;margin-bottom:12px;background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);color:var(--t2)">
    <span style="color:var(--amber);font-weight:600">${_t('Für die Freigabe von rev{rev} fehlt noch:', { rev: esc(rev.rev) })}</span> ${m.map(x => esc(_t(x))).join(', ')}${
      m.some(x => ['Gewicht', 'Beschreibung', 'Klassifizierung'].includes(x)) ? ` <span style="color:var(--t3)">${_t('(Gewicht, Beschreibung und Klassifizierung im Datenblatt)')}</span>` : ''}</div>`;
}

// Liest ausschliesslich Felder, die /api/items/:id schon mitliefert —
// kein zusaetzlicher Request. Die angezeigte Revision folgt der Auswahl
// im Revisionen-Tab.
function _sheetCell(label, value, opts = {}) {
  const v = (value === null || value === undefined || value === '') ? '—' : value;
  const dim = (v === '—') ? ';color:var(--t3)' : '';
  return `<div class="ps-cell">
    <div class="ps-label">${esc(label)}</div>
    <div class="ps-val" style="word-break:break-word${dim}${opts.mono ? ';font-family:var(--mono)' : ''}">${opts.raw ? v : esc(v)}</div>
  </div>`;
}

// Bezeichnung und Wert auf einer Zeile, drei Spalten im Detailpanel —
// „Allgemein“ und Druckparameter. rows: [label, wert, rawHtml]; leer → „—“
// rows: [Bezeichnung, Wert, Wert ist HTML, HTML hinter dem Wert (z.B. ✏)]
function _sheetKv(rows) {
  return `<div class="ps-kv">${rows.map(([k, v, raw, after]) => {
    const empty = v === null || v === undefined || v === '';
    return `<div class="ps-kv-row"><span class="ps-kv-label">${esc(k)}</span>`
      + `<span class="ps-kv-val"${empty ? ' style="color:var(--t3)"' : ''}>${empty ? '—' : raw ? v : esc(v)}${after || ''}</span></div>`;
  }).join('')}</div>`;
}

// Tabelle in thematischen Blöcken: [[Titel, Zeilen wie bei _sheetKv], …].
// Leere Blöcke fallen weg.
function _sheetGroups(groups) {
  const html = groups.filter(([, rows]) => rows.length)
    .map(([title, rows]) => `<div class="ps-group"><div class="ps-group-title">${esc(title)}</div>${_sheetKv(rows)}</div>`);
  return html.length ? `<div class="ps-groups">${html.join('')}</div>` : '';
}

function _fmtHours(h) {
  const min = Math.round((parseFloat(h) || 0) * 60);
  if (!min) return null;
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh} h${mm ? ' ' + mm + ' min' : ''}` : `${mm} min`;
}
// Zeiterfassung: immer Stunden und Minuten, auch bei null
function _fmtDur(h) { return _fmtHours(h) || '0 min'; }

// ── 3D-VORSCHAU UND SLICER ────────────────────────────────────
// STL und STEP — eine STEP vernetzt der Server (/mesh). Bei Baugruppen zuerst
// die STEP: sie zeigt den Zusammenbau, eine STL oft nur ein einzelnes Teil.
const _isStep = d => ['step', 'stp'].includes(_extOf(d));
function _stlFiles(rev, item) {
  const ds = rev?.datasets || [];
  const stl = ds.filter(d => dtClass(d.original_name, d.ds_type) === 'dt-STL'), step = ds.filter(_isStep);
  return item?.item_type === 'asm' ? [...step, ...stl] : [...stl, ...step];
}

// Vorschau der STL-Dateien einer Revision. key trennt Datenblatt und
// Revisionen-Tab, die dieselbe Revision gleichzeitig enthalten.
function _stlPreview(key, stls, top = '12px') {
  if (!stls.length) return '';
  const url = d => `${API}/api/datasets/${d.id}/${_isStep(d) ? 'mesh' : 'download'}`;
  const sel = stls.length > 1
    ? `<select style="margin-left:auto;font-size:13px;background:var(--bg1);color:var(--t1);border:1px solid var(--line);border-radius:var(--r);padding:2px 6px" onchange="switchSTLViewer('${key}', this.value)">
        ${stls.map(d => `<option value="${url(d)}">${esc(d.original_name)}</option>`).join('')}</select>`
    : '';
  return `<div class="sep-label" style="margin-top:${top}">${_t('3D-Vorschau')}${sel}</div>
    <div style="position:relative;width:100%;height:220px;border-radius:var(--r);overflow:hidden;margin-bottom:10px">
      <canvas id="stl-c-${key}" data-stl-url="${url(stls[0])}" title="${_t('Ziehen: drehen · Mausrad: zoomen · Doppelklick: isometrische Ansicht')}" style="width:100%;height:100%;display:block;cursor:grab"></canvas>
      <div id="stl-load-${key}" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--t3);font-size:13px;pointer-events:none">${_t('Lade…')}</div>
    </div>`;
}

// Erst starten, wenn der Tab sichtbar ist — in einem versteckten Tab hat die
// Zeichenfläche noch keine Breite, das Modell käme verzerrt.
function _initVisibleStl() {
  document.querySelectorAll('canvas[data-stl-url]').forEach(c => {
    if (!c._stlInit && c.offsetParent !== null) { c._stlInit = true; initSTLViewer(c.id, c.dataset.stlUrl); }
  });
}

const SLICER_FILE_EXTS = ['stl', '3mf', 'obj', 'step', 'stp', 'amf'];
const _extOf = d => String(d.original_name || '').split('.').pop().toLowerCase();
function _isSlicerFile(d) { return SLICER_FILE_EXTS.includes(_extOf(d)); }
// Fürs Datenblatt: das 3MF-Projekt (mit Druckeinstellungen) vor dem nackten Modell
function _slicerModelFile(rev) {
  const files = (rev?.datasets || []).filter(_isSlicerFile);
  return files.find(d => _extOf(d) === '3mf') || files.find(d => _extOf(d) === 'stl') || files[0] || null;
}

// Ausgegraut, wenn kein Slicer installiert ist oder dieses Gerät nicht der PC mit dem PLM ist
function _slicerButton(ds, compact) {
  const st = state.slicer;
  const sl = st?.slicers?.find(s => s.id === st.active);
  const why = !st ? _t('Slicer-Status nicht geladen')
    : !st.local ? _t('Nur auf dem PC möglich, auf dem das PLM läuft')
    : !sl ? _t('Kein Slicer installiert — Einstellungen → 3D-Druck')
    : !sl.found ? _t('{name} ist nicht installiert — Einstellungen → 3D-Druck', { name: sl.name }) : '';
  const cls = compact ? 'btn btn-icon btn-ghost btn-sm' : 'btn btn-ghost btn-sm';
  const label = compact ? '🖨' : why ? _t('🖨 Im Slicer öffnen') : _t('🖨 In {name} öffnen', { name: esc(sl.name) });
  // Deaktivierte Knöpfe zeigen nicht in jedem Browser ihren title — daher am Span
  if (why) return `<span title="${esc(why)}" style="display:inline-flex"><button class="${cls}" disabled>${label}</button></span>`;
  return `<button class="${cls}" onclick="openInSlicer(${ds.id})" title="${esc(ds.original_name)} in ${esc(sl.name)} öffnen">${label}</button>`;
}

async function openInSlicer(dsId) {
  try {
    const r = await api(`/api/datasets/${dsId}/open-in-slicer`, 'POST', {});
    toast(r.kept
      ? _t('Vorhandene Arbeitskopie in {slicer} geöffnet — sie weicht von der Datei im PLM ab. Zum Neuladen die Kopie im Ordner „Slicer“ löschen.', { slicer: r.slicer })
      : _t('{slicer} wird geöffnet…', { slicer: r.slicer }), 'ok');
  } catch { /* api() meldet den Fehler */ }
}

// QR-Code der Teilenummer gross — zum Scannen direkt vom Bildschirm
function showItemQr() {
  const n = state.item?.item_number;
  if (!n || typeof qrSvg !== 'function') return;
  _showDynModal(`<div class="modal" style="max-width:320px">
    <div class="modal-head"><div class="modal-title">${_t('QR-Code')}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="background:#f4f6f8;padding:10px;border-radius:var(--r-sm);line-height:0">${qrSvg(n, 240, { dark: '#0d0f14', light: '#f4f6f8' })}</div>
      <div style="font-family:var(--mono);font-size:14px;color:var(--t2)">${esc(n)}</div>
    </div>
  </div>`);
}

function renderItemSheet(item, activeRevId) {
  const rev = (item.revisions || []).find(r => r.id === activeRevId) || (item.revisions || [])[0];
  const editable = itemIsEditable(item);
  const ergaenzen = feld => editable
    ? ` <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="openEditItemModal(${item.id})">${_t('Jetzt ergänzen')}</span>`
    : '';

  // -- Kopfzeile: Checkout-Status und QR-Code
  const checkout = (state.checkouts || []).find(c => c.item_id === item.id);
  // Auf einem anderen PC ausgecheckt — auch als Unterteil einer Baugruppe
  const elsewhere = (state.checkoutsElsewhere || []).filter(c => c.item_ids.includes(item.id));
  // Eingecheckt ist der Normalfall — der Knopf oben zeigt ihn schon
  const coBadge = (checkout
    ? `<span class="status st-REV" style="background:var(--teal-soft);color:var(--teal)">ausgecheckt</span>`
    : '') + elsewhere.map(c => `<span class="status st-REV" style="background:var(--amber-soft);color:var(--amber)"
      title="${_t('seit {date}', { date: esc(fmtDate(c.checked_out)) })}${c.item_id !== item.id ? ' · ' + _t('mit {number}', { number: esc(c.item_number) }) : ''}">${_t('ausgecheckt auf {host}', { host: esc(c.host) })}</span>`).join(' ');

  // -- Beschreibung der gewählten Revision. In jeder Revision änderbar (✏),
  // auch wenn das Teil sonst gesperrt ist — die anderen Revisionen bleiben gleich.
  const desc = revDesc(item, rev);
  const descEdit = rev
    ? ` <button class="btn btn-ghost btn-sm" style="padding:0 5px;font-size:12px" onclick="openDescModal(${item.id})" title="${_t('Beschreibung ändern — andere Revisionen bleiben, wie sie sind')}">✏</button>`
    : '';
  const descBlock = desc
    ? `<div style="font-size:13px;line-height:1.65;color:var(--t2);white-space:pre-wrap">${esc(desc)}${descEdit}</div>`
    : `<div style="font-size:13px;color:var(--t3)">${_t('Keine Beschreibung hinterlegt.')}${descEdit || ergaenzen()}</div>`;

  // -- Quelle. Pruefung zentral in safeLinkHost (01-core.js).
  let srcBlock;
  if (item.source_url) {
    const host = safeLinkHost(item.source_url);
    srcBlock = host
      ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <a href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer"
             style="font-size:13px;color:var(--blue);text-decoration:underline;word-break:break-all">${esc(item.source_url)}</a>
          <span class="chip">${esc(host)}</span>
        </div>`
      : `<div style="font-size:13px;color:var(--t2);word-break:break-all;font-family:var(--mono)">${esc(item.source_url)}
          <span class="chip" style="color:var(--amber);border-color:var(--amber-line)">${_t('kein Web-Link')}</span>
        </div>`;
  } else {
    srcBlock = `<div style="font-size:13px;color:var(--t3)">${_t('Keine Quelle hinterlegt.')}${ergaenzen()}</div>`;
  }

  // -- Allgemein
  const revCount = (item.revisions || []).length;
  const allDs = (item.revisions || []).flatMap(r => (r.datasets || []).map(d => ({ ...d, rev: r.rev })));
  const dsBytes = allDs.reduce((s, d) => s + (d.file_size || 0), 0);
  const weightTxt = revWeightTxt(item, rev);
  const priceVal = revPrice(item, rev);

  // Aussenmasse der gewählten Revision. Mehrere STL mit verschiedenen Massen:
  // die erste zeigen, alle im Tooltip.
  const dims = revDims(rev);
  const dimsN = new Set(dims.map(d => d.txt)).size;
  const dimsCell = dims.length
    ? `<span title="${esc(dims.map(d => d.name + ': ' + d.txt).join('\n'))}">${esc(dims[0].txt)}${
        dimsN > 1 ? ` <span style="color:var(--t3)">+${dimsN - 1}</span>` : ''}</span>`
    : null;

  // Gewicht und Preis der gewählten Revision direkt hier eintragen (✏).
  // Das Gewicht nur in der offenen Revision, sonst 🔒 mit dem Grund.
  const btnEdit = (fn, title) => ` <button class="btn btn-ghost btn-sm" style="padding:0 5px;font-size:12px" onclick="${fn}(${item.id})" title="${esc(title)}">✏</button>`;
  const weightLock = rev ? revWeightLock(item, rev) : _t('Keine Revision');
  const weightAfter = item.item_type === 'doc' ? ''
    : weightLock ? ` <span title="${esc(weightLock)}" style="font-size:12px">🔒</span>`
    : btnEdit('openWeightModal', _t('Gewicht dieser Revision eintragen'));
  // Baugruppe: Summe der Stückliste als Preis übernehmen
  const bomPriceTotal = item.item_type === 'asm'
    ? (rev?.bom || []).reduce((s, b) => s + (b.default_price != null ? b.default_price * b.quantity : 0), 0) : 0;
  const bomPriceBtn = bomPriceTotal > 0 && Math.abs(bomPriceTotal - (priceVal ?? 0)) > 0.005
    ? ` <button class="btn btn-ghost btn-sm" style="padding:0 6px;font-size:12px" onclick="openPriceModal(${item.id},${bomPriceTotal.toFixed(2)})" title="${_t('Summe der Stückliste als Verkaufspreis übernehmen')}">${_t('BOM {price} übernehmen', { price: fmtChf(bomPriceTotal) })}</button>`
    : '';

  // In Blöcken nach Thema. Erstellt nur mit Datum — mit Uhrzeit bräche die Zeile um
  const facts = _sheetGroups([
    [_t('Einordnung'), [
      [_t('Klassifizierung'), item.classification ? _classChip(item.classification, 12) : null, true],
      [_t('Projekt'), item.project ? item.project.number + ' · ' + item.project.name : null],
      [_t('Erstellt'), item.created_at ? fmtD(item.created_at) : null],
    ]],
    [_t('Gewicht & Masse'), [
      [_t('Gewicht'), weightTxt, false, weightAfter],
      ...(item.item_type !== 'doc' ? [[_t('Aussenmasse'), dimsCell, true]] : []),
    ]],
    [_t('Kaufmännisch'), [
      // Preis gehört zur Revision, braucht aber keine neue — ✏ auch bei freigegebenen Teilen
      [_t('Verkaufspreis'), priceVal != null ? fmtChf(priceVal) : null, false,
        btnEdit('openPriceModal', _t('Verkaufspreis dieser Revision ändern (ohne neue Revision)')) + bomPriceBtn],
      [_t('Entwicklungszeit'), _fmtHours(item.dev_hours)],
    ]],
  ]);

  // -- Gewählte Revision mit Status, oben neben Kurzcode und Checkout.
  // Revisionstext, ECO-Grund und Freigabe stehen im Tab Revisionen.
  const revBadge = rev
    ? `<span class="status st-${rev.status}" title="${esc(PLM_ST_LABEL[rev.status] || rev.status)} — Details im Tab Revisionen">rev${esc(rev.rev)} · ${rev.status}</span>`
    : '<span class="chip">' + _t('keine Revision') + '</span>';

  // -- Druckparameter der aktiven Revision
  let psBlock = '';
  const ps = rev?.print_settings;
  if (ps) {
    // In Blöcken nach Thema; Bezeichnungen und Einheiten aus PRINT_PARAMS (01-core.js)
    const label = key => printParamLabel(key);
    const cells = keys => keys.map(k => [label(k), fmtPrintParam(k, ps[k])])
      .filter(([, v]) => v !== null && v !== undefined && v !== '');
    const groups = _sheetGroups([
      [_t('Druck'), cells(['nozzle', 'layer_height', 'infill', 'infill_pattern', 'supports'])],
      [_t('Temperatur'), cells(['print_temp', 'bed_temp'])],
      [_t('Material & Gewicht'), cells(['material', 'part_weight', 'filament_weight_total'])],
      [_t('Drucker & Kosten'), cells(['printer', 'print_duration', 'filament_price_kg', 'printer_cost_hr'])],
    ]);
    if (groups) {
      psBlock = `<div class="sep-label">${_t('Druckparameter')}</div>
        ${groups}
        ${ps.notes ? `<div style="font-size:13px;color:var(--t3);margin-top:7px;white-space:pre-wrap">${esc(ps.notes)}</div>` : ''}`;
    }
  }

  // -- Stuecklisten-Kurzfassung (nur Baugruppen)
  let bomBlock = '';
  if (item.item_type === 'asm') {
    const bom = rev?.bom || [];
    const std = rev?.bom_std || [];
    const priced = bom.filter(b => b.default_price != null);
    const bomTotal = priced.reduce((s, b) => s + b.default_price * b.quantity, 0);
    const stdTotal = std.reduce((s, b) => s + ((b.unit_price || 0) * b.quantity), 0);
    const positions = bom.length + std.length;
    const bw = rev?.bom_weight || {};
    if (positions) {
      bomBlock = `<div class="sep-label">${_t('Stückliste')}</div>
        <div class="ps-grid">
          ${_sheetCell(_t('Positionen'), String(positions), { mono: true })}
          ${_sheetCell(_t('Eigene Teile'), String(bom.length), { mono: true })}
          ${_sheetCell(_t('Normteile'), String(std.length), { mono: true })}
          ${_sheetCell(_t('Teilesumme'), bomTotal ? fmtChf(bomTotal) : null, { mono: true })}
          ${_sheetCell(_t('Normteilsumme'), stdTotal ? fmtChf(stdTotal) : null, { mono: true })}
          ${_sheetCell(_t('Gesamt'), (bomTotal + stdTotal) ? fmtChf(bomTotal + stdTotal) : null, { mono: true })}
          ${_sheetCell(_t('Gewicht'), bw.total_g != null ? fmtN(bw.total_g, 1) + ' g' : null, { mono: true })}
        </div>
        ${(() => {
          const pinned = bom.filter(x => x.child_pinned_rev);
          const stale = pinned.filter(x => x.rev_outdated);
          if (!pinned.length) return '';
          return `<div style="font-size:13px;color:var(--t3);margin-top:7px">
            🔒 ${_t(pinned.length === 1 ? '1 Position auf eine feste Revision gesetzt' : '{n} Positionen auf eine feste Revision gesetzt', { n: pinned.length })}${
              stale.length ? ` · <span style="color:var(--amber)">${_t('{n} davon nicht mehr aktuell', { n: stale.length })}</span>` : ''}
          </div>`;
        })()}
        ${priced.length < bom.length
          ? `<div style="font-size:13px;color:var(--amber);margin-top:7px">⚠ ${_t('{n} von {total} eigenen Teilen ohne Preis — Summe unvollständig.', { n: bom.length - priced.length, total: bom.length })}</div>`
          : ''}
        ${bw.missing
          ? `<div style="font-size:13px;color:var(--amber);margin-top:7px">⚖ ${_t('{n} von {total} Positionen ohne Gewicht', { n: bw.missing, total: positions })} — ${bw.total_g != null ? _t('Gewicht unvollständig') : _t('kein Gewicht berechenbar')}.</div>`
          : ''}`;
    } else {
      bomBlock = `<div class="sep-label">${_t('Stückliste')}</div>
        <div style="font-size:13px;color:var(--t3)">${_t('Noch keine Positionen in rev{rev}.', { rev: rev?.rev ?? '—' })}</div>`;
    }
  }

  // -- Lagerbestand
  let invBlock = '';
  const inv = item.inventory || [];
  if (inv.length) {
    invBlock = `<div class="sep-label">${_t('Lagerbestand')}</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${inv.map(l => {
          const low = l.min_qty != null && l.stock_qty != null && l.stock_qty <= l.min_qty;
          return `<div class="ds-row" style="padding:6px 10px;margin:0">
            <span class="ds-type ${low ? 'dt-PDF' : 'dt-GCODE'}">${low ? _t('KNAPP') : _t('LAGER')}</span>
            <div class="ds-info">
              <div class="ds-name">${esc(l.name)}${l.sku ? ` <span style="color:var(--t3);font-family:var(--mono);font-size:11px">${esc(l.sku)}</span>` : ''}</div>
              <div class="ds-meta">${fmtN(l.stock_qty || 0, 1)} ${esc(_unit(l.unit))}${
                l.min_qty != null ? ` · ${_t('Min')} ${fmtN(l.min_qty, 1)}` : ''}${
                l.price_per_unit != null ? ` · ${fmtChf(l.price_per_unit)}/${esc(_unit(l.unit))}` : ''}</div>
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  // -- Dateien pro Typ
  let dsBlock = '<div style="font-size:13px;color:var(--t3)">' + _t('Noch keine Dateien angehängt.') + '</div>';
  if (allDs.length) {
    const groups = {};
    allDs.forEach(d => {
      const k = fileLabel(d.original_name, d.ds_type);
      (groups[k] = groups[k] || { cls: dtClass(d.original_name, d.ds_type), n: 0, bytes: 0 });
      groups[k].n++;
      groups[k].bytes += d.file_size || 0;
    });
    dsBlock = `<div style="display:flex;flex-wrap:wrap;gap:6px">
      ${Object.entries(groups).map(([label, g]) => `
        <div class="ds-row" style="padding:5px 9px;margin:0;gap:7px">
          <span class="ds-type ${g.cls}">${esc(label)}</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--t2)">${g.n}×</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtSize(g.bytes)}</span>
        </div>`).join('')}
    </div>
    <div style="font-size:13px;color:var(--t4);margin-top:7px">
      ${_t(revCount === 1 ? '{n} Dateien über 1 Revision · {size} gesamt' : '{n} Dateien über {revs} Revisionen · {size} gesamt', { n: allDs.length, revs: revCount, size: fmtSize(dsBytes) })}
    </div>`;
  }

  // -- Letzte Aenderung
  const lastLog = (item.changelog || [])[0];
  const logBlock = lastLog
    ? `<div class="cl-row" style="padding:0;border:none">
        <div class="cl-dot"></div>
        <div class="cl-body">
          <div class="cl-action">${lastLog.rev != null ? `<span class="chip" style="margin-right:6px">rev${esc(lastLog.rev)}</span>` : ''}${esc(lastLog.action)}</div>
          ${lastLog.details ? `<div class="cl-detail">${esc(lastLog.details)}</div>` : ''}
        </div>
        ${_clTime(lastLog)}
      </div>`
    : '<div style="font-size:13px;color:var(--t3)">' + _t('Noch keine Einträge.') + '</div>';

  // -- Notizen (freies Feld am Item)
  const notesBlock = `<textarea class="ft" id="sheet-notes-${item.id}" rows="3"
      placeholder="${_t('Freie Notizen zu diesem Teil — Bezugsquellen, Erfahrungen, offene Punkte…')}"
      style="min-height:62px"
      onblur="saveItemNotes(${item.id}, this)">${esc(item.notes || '')}</textarea>
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--t4);margin-top:4px">
      <span>${_t('Wird beim Verlassen des Feldes gespeichert.')}</span>
      ${itemHints(item).length ? '' : `<span style="color:var(--red);cursor:pointer;text-decoration:underline" onclick="openItemHintsModal(${item.id})">${_t('⚠ Hinweis hinzufügen')}</span>`}
    </div>`;

  // -- Kurzcode zum Aufdrucken: folgt der gewählten Revision
  const pcode = printCodeOf(item, rev);
  const codeBlock = pcode ? `<div class="print-code">
      <span class="print-code-label">${_t('Kurzcode')}</span>
      <span class="print-code-val">${esc(pcode)}</span>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="copyText('${esc(pcode)}','${esc(_t('{code} kopiert', { code: pcode }))}')" title="${_t('Kopieren — für das Textwerkzeug im Slicer')}">⧉</button>
      ${helpTip(_t('Im Slicer mit dem Textwerkzeug aufs Teil setzen — am besten vertieft auf der Unterseite, mindestens 3 mm hoch. Die Zahl nach dem Strich ist die Revision: Bei einer neuen Revision nur sie anpassen.'))}
    </div>` : '';

  // -- Slicer und 3D-Vorschau der gewählten Revision; ohne Datei nichts davon
  const modelFile = _slicerModelFile(rev);
  const slicerBtn = modelFile ? _slicerButton(modelFile, false) : '';
  const stlBlock = rev ? _stlPreview('sheet' + rev.id, _stlFiles(rev, item), '0') : '';

  // -- QR-Code der Teilenummer: klein im Kopf, ein Klick zeigt ihn gross
  const qr = typeof qrSvg === 'function'
    ? qrSvg(item.item_number, 64, { dark: '#0d0f14', light: '#f4f6f8' })
    : '';

  // Offene Änderungsanträge zu diesem Teil
  const ecrBanner = (item.ecrs || []).length ? `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;padding:8px 11px;margin-bottom:12px;background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm)">
      <span style="color:var(--amber);font-weight:600">${_t('🛠 In Änderung')}</span>
      ${item.ecrs.map(e => `<span style="cursor:pointer;display:inline-flex;align-items:center;gap:6px" onclick="gotoView('ecr').then(() => openEcrDetail(${e.id}))">
        <span style="font-family:var(--mono);color:var(--blue)">${esc(e.number)}</span>${esc(e.title)} ${ecrBadge(e.status)}</span>`).join('')}
    </div>` : '';

  // Eigenschaften der Klassifizierung (Einstellungen → PLM)
  const fields = classFieldsOf(item.classification);
  const attrs = item.attributes || {};
  // Im selben Block-Stil wie Allgemein und Druckparameter; der Block trägt den Namen der Klassifizierung
  const attrBlock = fields.length ? `<div class="sep-label">${_t('Eigenschaften')}</div>
    ${_sheetGroups([[item.classification, fields.map(f => [f.label, attrs[f.id] ? esc(attrs[f.id])
      : f.required ? '<span style="color:var(--amber)" title="' + _t('Pflicht für die Freigabe') + '">' + _t('fehlt (Pflicht)') + '</span>' : '', true])]])}` : '';

  return `<div id="it-sheet">
    ${ecrBanner}
    ${_releaseMissingBox(item.revisions?.[0])}
    <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          ${codeBlock}
          ${revBadge}
          ${coBadge}
          ${checkout ? `<span style="font-size:13px;color:var(--t3)">${esc(checkout.folder || '')}</span>` : ''}
        </div>
        <div class="btn-row">
          ${slicerBtn}
          <button class="btn btn-ghost btn-sm" onclick="openItemMindmap(${item.id})">${_t('⌗ Mindmap')}</button>
          <button class="btn btn-ghost btn-sm" onclick="openDocTemplateModal(${item.id})" title="${_t(item.item_type === 'asm' ? 'Datenblatt, Stückliste oder Prüfprotokoll' : 'Datenblatt oder Prüfprotokoll')}">${_t('&#128196; Als PDF…')}</button>
        </div>
      </div>
      ${qr ? `<div onclick="showItemQr()" title="${_t('QR-Code vergrössern')}" style="flex-shrink:0;background:#f4f6f8;padding:3px;border-radius:var(--r-sm);line-height:0;cursor:zoom-in">${qr}</div>` : ''}
    </div>

    ${stlBlock}

    <div class="sep-label"${stlBlock ? '' : ' style="margin-top:0"'}>${_t('Beschreibung')}</div>
    ${descBlock}

    ${item.source_url || editable ? `<div class="sep-label">${_t('Quelle')}</div>
    ${srcBlock}` : ''}

    <div class="sep-label">${_t('Allgemein')}</div>
    ${facts}
    ${attrBlock}

    <div class="sep-label">${_t('Notizen')}</div>
    ${notesBlock}

    ${psBlock}
    ${bomBlock}
    ${invBlock}

    <div class="sep-label">${_t('Dateien')}</div>
    ${dsBlock}

    <div class="sep-label">${_t('Letzte Änderung')}</div>
    ${logBlock}
    ${renderVariantsSection(item)}
  </div>`;
}

// Notizen speichern — eigener Aufruf, damit andere Felder nicht ueberschrieben werden
async function saveItemNotes(itemId, el) {
  const value = el.value;
  if (el.dataset.saved === value) return;
  const it = state.item;
  if (!it || it.id !== itemId) return;
  try {
    await api(`/api/items/${itemId}`, 'PUT', {
      name: it.name, description: it.description, source_url: it.source_url,
      classification: it.classification, notes: value,
    });
    it.notes = value;
    el.dataset.saved = value;
    el.style.borderColor = 'var(--green-line)';
    setTimeout(() => { el.style.borderColor = ''; }, 1200);
  } catch (e) {
    toast(_t('Notiz konnte nicht gespeichert werden'), 'err');
  }
}


// ── REVISION EINER STUECKLISTENPOSITION WAEHLEN ───────────────
// Standard ist "automatisch": die Position folgt immer der aktiven Revision.
// Fixieren braucht man vor allem dort, wo ein realer Stand dokumentiert wird
// (z.B. ein Fahrzeug, in dem noch die alte Revision verbaut ist).
// Eine Zeile in den Revisions-Auswahldialogen (Stückliste, Produktion)
function _revPickRow(sel, label, sub, onclick, extra = '') {
  return `
    <div onclick="${onclick}" style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;
      border:1px solid ${sel ? 'var(--blue)' : 'var(--line)'};border-radius:var(--r-sm);
      background:${sel ? 'var(--blue-glow)' : 'var(--bg2)'};margin-bottom:6px"
      onmouseover="if(!${sel})this.style.background='var(--bg3)'"
      onmouseout="if(!${sel})this.style.background='var(--bg2)'">
      <span style="width:14px;flex-shrink:0;color:var(--blue)">${sel ? '●' : '○'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--t1)">${label}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:1px">${sub}</div>
      </div>
      ${extra}
    </div>`;
}
// Revisionen eines Items als Auswahlzeilen; markiert die gewählte und die aktive
function _revPickList(revs, selectedId, activeId, onclickFor) {
  return revs.map(r => _revPickRow(selectedId === r.id, `rev${esc(r.rev)}`,
    esc(r.description || '—') + (r.released_at ? ' · ' + _t('freigegeben {date}', { date: fmtDate(r.released_at) }) : ''),
    onclickFor(r),
    `<span class="status st-${r.status}" style="flex-shrink:0;font-size:11px" title="${esc(PLM_ST_LABEL[r.status] || '')}">${r.status}</span>`
    + (r.id === activeId ? '<span class="chip" style="flex-shrink:0;margin-left:5px">' + _t('aktuell') + '</span>' : ''))).join('');
}

async function openBomRevPicker(bomId, childItemId, parentItemId, parentRevId) {
  let child;
  try { child = await api(`/api/items/${childItemId}`); }
  catch { return toast(_t('Item konnte nicht geladen werden'), 'err'); }

  const revs = child.revisions || [];
  if (!revs.length) return toast(_t('Keine Revisionen vorhanden'), 'err');

  // aktuell fixierte Revision aus der Elternstückliste lesen
  const parent = state.item && state.item.id === parentItemId ? state.item : null;
  const prow = parent?.revisions?.find(r => r.id === parentRevId)?.bom?.find(x => x.id === bomId);
  const pinnedId = prow?.child_rev_id || null;
  const activeId = (prow?.child_active_rev || revs[0])?.id;
  const row = _revPickRow;

  const autoSub = activeId
    ? _t('Aktuell: rev{rev} — neue Revisionen werden automatisch übernommen', { rev: revs.find(r => r.id === activeId)?.rev ?? '—' })
    : _t('Neue Revisionen werden automatisch übernommen');

  _showDynModal(`<div class="modal" style="max-width:520px">
    <div class="modal-head">
      <div class="modal-title" style="display:flex;align-items:center;gap:8px;min-width:0">
        <span>${_t('Revision in der Stückliste')}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(child.item_number)}</span>
      </div>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        ${esc(child.name)}
      </div>
      ${row(!pinnedId, _t('Automatisch'), autoSub, `_setBomRev(${bomId},null,${parentItemId})`,
        '<span class="chip" style="flex-shrink:0">' + _t('Standard') + '</span>')}
      <div class="sep-label">${_t('Fest auf Revision')}</div>
      ${_revPickList(revs, pinnedId, activeId, r => `_setBomRev(${bomId},${r.id},${parentItemId})`)}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
    </div>
  </div>`);
}

async function _setBomRev(bomId, revId, parentItemId) {
  _hideDynModal();
  try {
    await api(`/api/bom/${bomId}/revision`, 'PUT', { rev_id: revId });
    toast(revId ? _t('Revision fixiert') : _t('Folgt wieder automatisch'), 'ok');
    const fresh = await api(`/api/items/${parentItemId}`);
    state.item = fresh;
    renderItemDetail(fresh, state.activeRevId);
  } catch (e) {
    toast(_t('Konnte nicht gespeichert werden'), 'err');
  }
}

function renderVariantsSection(item) {
  const variants = item.variants || [];
  const chips = variants.map(v =>
    `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg3);border:1px solid var(--line2);border-radius:var(--r-sm);padding:3px 8px;cursor:pointer"
       onclick="openItemDetail(${v.id})">
      ${_itemChip(v.item_type, 14)}
      <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(v.item_number)}</span>
      <span style="font-size:13px;color:var(--t2)">${esc(v.name)}</span>
      <button onclick="event.stopPropagation();unlinkVariant(${item.id})" title="${_t('Aus Variantengruppe entfernen')}"
        style="background:none;border:none;cursor:pointer;color:var(--t4);font-size:13px;padding:0 0 0 4px;line-height:1" hidden>✕</button>
    </div>`).join('');

  return `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--t4)">${_t('Varianten')}</span>
      <button class="btn btn-ghost btn-sm" style="font-size:13px;padding:1px 7px" onclick="openLinkVariantModal(${item.id})">${_t('+ Verknüpfen')}</button>
      ${item.variant_group_id ? `<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:1px 7px;color:var(--red)" onclick="unlinkVariant(${item.id})">${_t('Aus Gruppe entfernen')}</button>` : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${chips || '<span style="font-size:13px;color:var(--t4)">' + _t('Keine Varianten verknüpft') + '</span>'}
    </div>
  </div>`;
}

let _variantSearchTimer;
async function openLinkVariantModal(itemId) {
  window._linkVariantItemId = itemId;
  document.getElementById('lv-search').value = '';
  document.getElementById('lv-results').innerHTML = '';
  openModal('linkVariantModal');
  document.getElementById('lv-search').focus();
}

async function _variantSearch(q) {
  clearTimeout(_variantSearchTimer);
  const res = document.getElementById('lv-results');
  if (!q) { res.innerHTML = ''; return; }
  _variantSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-for-bom?q=' + encodeURIComponent(q)).catch(() => []);
    const sourceId = window._linkVariantItemId;
    const filtered = items.filter(i => i.id !== sourceId);
    if (!filtered.length) { res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">' + _t('Keine Treffer') + '</div>'; return; }
    res.innerHTML = filtered.map(i => `
      <div onclick="doLinkVariant(${i.id})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        ${_itemChip(i.item_type, 16)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:12px;color:var(--t4);font-family:var(--mono)">${esc(i.project_number)}</span>
      </div>`).join('');
  }, 200);
}

async function doLinkVariant(otherId) {
  const id = window._linkVariantItemId;
  await api(`/api/items/${id}/link-variant`, 'POST', { other_item_id: otherId });
  toast(_t('Variante verknüpft'), 'ok');
  closeModal('linkVariantModal');
  const fresh = await api('/api/items/' + id);
  state.item = fresh;
  renderItemDetail(fresh, state.activeRevId);
}

async function unlinkVariant(itemId) {
  await api(`/api/items/${itemId}/variant-group`, 'DELETE');
  toast(_t('Aus Variantengruppe entfernt'), 'ok');
  const fresh = await api('/api/items/' + itemId);
  state.item = fresh;
  renderItemDetail(fresh, state.activeRevId);
}

function parseSTL(buf) {
  const pos = [], nrm = [];
  let binary = false;
  if (buf.byteLength >= 84) {
    const cnt = new DataView(buf).getUint32(80, true);
    if (buf.byteLength === 84 + cnt * 50) binary = true;
  }
  if (binary) {
    const dv = new DataView(buf), cnt = dv.getUint32(80, true);
    for (let i = 0; i < cnt; i++) {
      const o = 84 + i * 50;
      const nx=dv.getFloat32(o,true), ny=dv.getFloat32(o+4,true), nz=dv.getFloat32(o+8,true);
      for (let v = 0; v < 3; v++) {
        const vo = o + 12 + v * 12;
        pos.push(dv.getFloat32(vo,true), dv.getFloat32(vo+4,true), dv.getFloat32(vo+8,true));
        nrm.push(nx,ny,nz);
      }
    }
  } else {
    const txt = new TextDecoder().decode(new Uint8Array(buf));
    const re = /facet normal\s+(\S+)\s+(\S+)\s+(\S+)[\s\S]*?vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)\s+vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    let m;
    while ((m = re.exec(txt)) !== null) {
      pos.push(+m[4],+m[5],+m[6], +m[7],+m[8],+m[9], +m[10],+m[11],+m[12]);
      nrm.push(+m[1],+m[2],+m[3], +m[1],+m[2],+m[3], +m[1],+m[2],+m[3]);
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
}

// Isometrische Ansicht wie im CAD: STL aus CAD und Slicer haben Z nach oben,
// der Blick kommt von vorne rechts oben (Richtung 1, -1, 1).
const STL_ISO = { elev: Math.atan(Math.SQRT1_2), azim: -Math.PI / 4 };
function _mul4(a, b) {
  const r = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j*4+i] += a[k*4+i] * b[j*4+k];
  return r;
}
// Z nach oben stellen, um die Hochachse drehen (Drehteller), dann von oben neigen
function _stlRotation(elev, azim) {
  const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); };
  const Ry = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); };
  return _mul4(Rx(elev), _mul4(Ry(azim), Rx(-Math.PI / 2)));
}

function initSTLViewer(canvasId, url) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const loadDiv = document.getElementById('stl-load-' + canvasId.replace('stl-c-',''));
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { if (loadDiv) loadDiv.textContent = _t('WebGL nicht verfügbar'); return; }
  fetch(url).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(buf => {
    const { pos, nrm } = parseSTL(buf);
    if (loadDiv) loadDiv.style.display = 'none';
    if (!pos.length) return;
    let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
    for (let i = 0; i < pos.length; i+=3) {
      x0=Math.min(x0,pos[i]);   x1=Math.max(x1,pos[i]);
      y0=Math.min(y0,pos[i+1]); y1=Math.max(y1,pos[i+1]);
      z0=Math.min(z0,pos[i+2]); z1=Math.max(z1,pos[i+2]);
    }
    const sc = 1.8 / Math.max(x1-x0, y1-y0, z1-z0, 1e-9);
    const cx=(x0+x1)/2, cy=(y0+y1)/2, cz=(z0+z1)/2;
    // Umkugel des Modells: so passt es in jeder Drehung ganz ins Bild
    const rad = 0.5 * Math.hypot(x1-x0, y1-y0, z1-z0) * sc;
    const VS = 'attribute vec3 aP,aN;uniform mat4 uM;uniform mat3 uN;uniform vec3 uC;uniform float uS;varying vec3 vN;void main(){gl_Position=uM*vec4((aP-uC)*uS,1.);vN=normalize(uN*aN);}';
    // Licht von leicht rechts oben vorne: in der Isometrie drei klar verschiedene Flächen
    const FS = 'precision mediump float;varying vec3 vN;void main(){float d=clamp(dot(normalize(vN),normalize(vec3(.2,.6,1.))),0.,1.)*.7+.3;gl_FragColor=vec4(.3*d,.55*d,.9*d,1.);}';
    function mk(type, src) { const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
    const prog = gl.createProgram();
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog); gl.useProgram(prog);
    [['aP',pos],['aN',nrm]].forEach(([attr,data]) => {
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, attr);
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 3, gl.FLOAT, false, 0, 0);
    });
    const uM=gl.getUniformLocation(prog,'uM'), uN=gl.getUniformLocation(prog,'uN');
    const uC=gl.getUniformLocation(prog,'uC'), uS=gl.getUniformLocation(prog,'uS');
    gl.uniform3f(uC,cx,cy,cz); gl.uniform1f(uS,sc);
    let rX=STL_ISO.elev, rY=STL_ISO.azim, zoom=1, drag=false, lx=0, ly=0;
    // Neigen höchstens senkrecht von oben oder unten — das Teil steht nie auf dem Kopf
    const tilt=d=>{rX=Math.max(-Math.PI/2,Math.min(Math.PI/2,rX+d));};
    const Tr=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
    // Parallelprojektion wie die ISO-Ansicht im CAD: Kanten bleiben parallel
    const Or=(a)=>{const s=rad*1.08/zoom, w=a>=1?s*a:s, h=a>=1?s:s/a, n=0.1, f=10;
      return new Float32Array([1/w,0,0,0, 0,1/h,0,0, 0,0,-2/(f-n),0, 0,0,-(f+n)/(f-n),1]);};
    const m3=(m)=>new Float32Array([m[0],m[1],m[2],m[4],m[5],m[6],m[8],m[9],m[10]]);
    function draw() {
      canvas.width=canvas.clientWidth||400; canvas.height=canvas.clientHeight||220;
      const W=canvas.width, H=canvas.height;
      gl.viewport(0,0,W,H);
      gl.clearColor(0.11,0.12,0.14,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const mod=_stlRotation(rX,rY);
      gl.uniformMatrix4fv(uM,false,_mul4(Or(W/H),_mul4(Tr(0,0,-3.2),mod)));
      gl.uniformMatrix3fv(uN,false,m3(mod));
      gl.drawArrays(gl.TRIANGLES,0,pos.length/3);
    }
    canvas.onmousedown = e=>{drag=true;lx=e.clientX;ly=e.clientY;canvas.style.cursor='grabbing';e.preventDefault();};
    canvas.ondblclick = ()=>{rX=STL_ISO.elev;rY=STL_ISO.azim;zoom=1;draw();};
    window.addEventListener('mousemove', e=>{if(!drag||!document.getElementById(canvasId))return;rY+=(e.clientX-lx)*0.01;tilt((e.clientY-ly)*0.01);lx=e.clientX;ly=e.clientY;draw();});
    window.addEventListener('mouseup', ()=>{if(drag){drag=false;const c=document.getElementById(canvasId);if(c)c.style.cursor='grab';}});
    canvas.addEventListener('wheel', e=>{zoom*=e.deltaY>0?0.92:1.09;zoom=Math.max(0.2,Math.min(6,zoom));draw();e.preventDefault();},{passive:false});
    let t0=[];
    canvas.addEventListener('touchstart',e=>{t0=[...e.touches];e.preventDefault();},{passive:false});
    canvas.addEventListener('touchmove',e=>{
      e.preventDefault();
      if(e.touches.length===1&&t0.length){rY+=(e.touches[0].clientX-t0[0].clientX)*0.01;tilt((e.touches[0].clientY-t0[0].clientY)*0.01);}
      else if(e.touches.length===2&&t0.length===2){const d0=Math.hypot(t0[0].clientX-t0[1].clientX,t0[0].clientY-t0[1].clientY),d1=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);zoom*=d1/Math.max(d0,1);zoom=Math.max(0.2,Math.min(6,zoom));}
      t0=[...e.touches];draw();
    },{passive:false});
    // Das Detailpanel fährt beim ersten Öffnen auf (CSS-Übergang der Breite).
    // Lädt das Modell schneller, wäre das erste Bild mit der Zwischenbreite
    // gerechnet und danach in die Breite gezogen — darum bei jeder
    // Grössenänderung neu zeichnen.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        if (!canvas.isConnected) { ro.disconnect(); return; }
        if (canvas.clientWidth && (canvas.clientWidth !== canvas.width || canvas.clientHeight !== canvas.height)) draw();
      });
      ro.observe(canvas);
    }
    draw();
  }).catch(e=>{if(loadDiv)loadDiv.textContent=_t('Fehler beim Laden: {error}', { error: e.message });console.error('STL viewer:',e);});
}

function switchSTLViewer(key, url) {
  const canvasId = 'stl-c-' + key;
  const old = document.getElementById(canvasId);
  if (!old) return;
  const loadDiv = document.getElementById('stl-load-' + key);
  if (loadDiv) { loadDiv.style.display = ''; loadDiv.textContent = _t('Lade…'); }
  const nc = document.createElement('canvas');
  nc.id = canvasId; nc.title = old.title; nc.style.cssText = 'width:100%;height:100%;display:block;cursor:grab';
  nc.dataset.stlUrl = url;
  nc._stlInit = true;
  old.replaceWith(nc);
  initSTLViewer(canvasId, url);
}

// Revisionsanzeige einer Stuecklistenposition.
// Ohne Fixierung folgt die Position automatisch der aktiven Revision —
// das ist der Normalfall und wird schlicht dargestellt. Fixierte Positionen
// bekommen ein Schloss, veraltete zusaetzlich eine Warnfarbe.
function _bomRevBadge(b, locked, itemId, parentRevId) {
  const eff = b.child_effective_rev || b.child_active_rev;
  if (!eff) return '';
  const pinned = !!b.child_pinned_rev;
  const outdated = !!b.rev_outdated;
  const newest = b.child_active_rev ? 'rev' + b.child_active_rev.rev : '—';

  const title = pinned
    ? (outdated
        ? _t('Fest auf rev{rev} — aktuell wäre {newest}. Klicken zum Ändern.', { rev: eff.rev, newest })
        : _t('Fest auf rev{rev}. Klicken zum Ändern.', { rev: eff.rev }))
    : _t('Folgt automatisch der aktuellen Revision ({newest}). Klicken zum Fixieren.', { newest });

  const inner = `<span class="status st-${eff.status}" style="flex-shrink:0;font-size:11px">`
    + `${pinned ? '🔒 ' : ''}rev${eff.rev}</span>`
    + (outdated ? `<span style="font-size:10px;font-family:var(--mono);color:var(--amber);flex-shrink:0">↑${newest}</span>` : '');

  if (locked) return `<span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0" title="${esc(title)}">${inner}</span>`;
  return `<span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;cursor:pointer"
    title="${esc(title)}" onclick="event.stopPropagation();openBomRevPicker(${b.id},${b.child_item_id},${itemId},${parentRevId})">${inner}</span>`;
}

// Stückgewicht einer Position — fehlt es, zählt die Position nicht ins Baugruppengewicht
const _bomWeightTag = b => b.weight_g > 0
  ? `<span style="font-size:11px;font-family:var(--mono);color:var(--t4);flex-shrink:0" title="${_t('Gewicht pro Stück')}">⚖ ${fmtN(b.weight_g, 1)} g</span>`
  : `<span style="font-size:11px;color:var(--t4);flex-shrink:0;opacity:.6" title="${_t('Kein Gewicht — zählt nicht ins Baugruppengewicht')}">⚖ —</span>`;

function renderBomList(rev, item, locked) {
  const plmRows = (rev.bom||[]).map(b => ({ ...b, _std: false })).sort((a,b) => (a.position||999)-(b.position||999));
  const stdRows = (rev.bom_std||[]).map(b => ({ ...b, _std: true }));
  if (!plmRows.length && !stdRows.length)
    return '<div style="padding:12px;color:var(--t3);font-size:13px;text-align:center">' + _t('Noch keine Positionen') + '</div>';

  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const totalDevHours = plmRows.reduce((s, b) => s + (b.dev_hours || 0), 0);

  const plmHtml = plmRows.map((b, idx) => `
    <div class="bom-row${locked ? '' : ' bom-draggable'}" data-bom-id="${b.id}" data-rev-id="${rev.id}"${_thumbAttr(b.thumb_id)}
      ${locked ? '' : 'draggable="true" ondragstart="_bomDragStart(event)" ondragover="_bomDragOver(event)" ondrop="_bomDrop(event,'+rev.id+')" ondragend="_bomDragEnd()"'}>
      ${locked ? '' : '<span style="color:var(--t4);cursor:grab;padding:0 4px;font-size:13px;flex-shrink:0">⠿</span>'}
      <span style="color:var(--t4);font-size:12px;width:20px;text-align:right;flex-shrink:0">${idx+1}</span>
      <span>${_itemChip(b.item_type,16)}</span>
      <span class="bom-num">${esc(b.item_number)}</span>
      <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
      ${_bomRevBadge(b, locked, item.id, rev.id)}
      ${(b.dev_hours||0) > 0 ? `<span style="font-size:11px;font-family:var(--mono);color:var(--amber);flex-shrink:0" title="${_t('Entwicklungszeit')}">⏱ ${fmtN(b.dev_hours,2)} h</span>` : ''}
      ${_bomWeightTag(b)}
      ${locked
        ? `<span class="bom-qty">${b.quantity} ${_unit(b.unit)}</span>`
        : `<span class="bom-qty" style="display:flex;align-items:center;gap:4px">
            <input type="number" value="${Math.round(b.quantity)}" min="1" step="1"
              style="width:52px;font-size:13px;font-family:var(--mono);text-align:right;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:2px 4px;color:var(--t1)"
              onkeydown="if(event.key==='.'||event.key===','||event.key==='-')event.preventDefault()"
              onchange="saveBomQty(${b.id},'${rev.id}',this.value,'${b.unit||'pcs'}',${item.id})" onclick="event.stopPropagation()">
            <span style="font-size:13px;color:var(--t3)">${_unit(b.unit)}</span>
           </span>`}
      ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="event.stopPropagation();delBom(${b.id},${item.id},${rev.id})">✕</button>`}
    </div>`).join('');

  const stdRows2 = stdRows.slice().sort((a,b) => (a.position||999)-(b.position||999));
  const stdHtml = stdRows2.length ? `
    <div style="padding:5px 10px 3px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--t4);border-top:1px solid var(--line)">${_t('Normteile')}</div>
    <div id="bom-std-list-${rev.id}">
    ${stdRows2.map((b, idx) => `
    <div class="bom-row${locked ? '' : ' bom-draggable bom-std-draggable'}" data-bom-std-id="${b.id}" data-rev-id="${rev.id}"
      ${locked ? '' : `draggable="true" ondragstart="_bomStdDragStart(event)" ondragover="_bomDragOver(event)" ondrop="_bomStdDrop(event,${rev.id})" ondragend="_bomDragEnd()"`}>
      ${locked ? '' : '<span style="color:var(--t4);cursor:grab;padding:0 4px;font-size:13px;flex-shrink:0">⠿</span>'}
      <span style="color:var(--t4);font-size:12px;width:20px;text-align:right;flex-shrink:0">${plmRows.length + idx + 1}</span>
      <span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(157,180,255,.15);color:var(--blue);flex-shrink:0">N</span>
      <span class="bom-num" style="color:var(--t2)">${esc(b.designation)}</span>
      <span style="flex:1;font-size:13px;color:var(--t3)">${b.material ? esc(b.material) : ''}</span>
      ${_bomWeightTag(b)}
      ${locked
        ? `<span class="bom-qty">${b.quantity} ${_unit(b.unit)}</span>`
        : `<span class="bom-qty" style="display:flex;align-items:center;gap:4px">
            <input type="number" value="${Math.round(b.quantity)}" min="1" step="1"
              style="width:52px;font-size:13px;font-family:var(--mono);text-align:right;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:2px 4px;color:var(--t1)"
              onkeydown="if(event.key==='.'||event.key===','||event.key==='-')event.preventDefault()"
              onchange="saveBomStdQty(${b.id},this.value,'${b.unit||'pcs'}')" onclick="event.stopPropagation()">
            <span style="font-size:13px;color:var(--t3)">${_unit(b.unit)}</span>
           </span>`}
      ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="event.stopPropagation();delBomStd(${b.id},${item.id},${rev.id})">✕</button>`}
    </div>`).join('')}
    </div>` : '';

  const devSummary = totalDevHours > 0 ? (() => {
    const cost = hourlyRate > 0 ? totalDevHours * hourlyRate : null;
    return `<div style="padding:7px 12px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;font-size:13px;background:rgba(245,192,97,.05)">
      <span style="color:var(--amber)">⏱</span>
      <span style="color:var(--t3)">${_t('Entwicklungszeit Total:')}</span>
      <span style="font-family:var(--mono);font-weight:600;color:var(--amber)">${fmtN(totalDevHours,2)} h</span>
      ${cost !== null ? `<span style="color:var(--t4)">·</span><span style="font-family:var(--mono);color:var(--t2)">${fmtCHF(cost)}</span>` : ''}
    </div>`;
  })() : '';

  return plmHtml + stdHtml + devSummary;
}

async function saveBomQty(bomId, revId, qty, unit, itemId) {
  await api(`/api/bom/${bomId}/quantity`, 'PUT', { quantity: Math.max(1, Math.round(parseFloat(qty)||1)), unit });
}

async function saveBomStdQty(bomStdId, qty, unit) {
  await api(`/api/bom-std/${bomStdId}/quantity`, 'PUT', { quantity: Math.max(1, Math.round(parseFloat(qty)||1)), unit });
}

let _bomDragSrc = null;
let _bomStdDragSrc = null;

function _bomStdDragStart(e) {
  _bomStdDragSrc = e.currentTarget;
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

async function _bomStdDrop(e, revId) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_bomStdDragSrc || _bomStdDragSrc === target) return;
  const list = target.closest('#bom-std-list-' + revId);
  if (!list) return;
  const rows = [...list.querySelectorAll('.bom-std-draggable')];
  const srcIdx = rows.indexOf(_bomStdDragSrc);
  const tgtIdx = rows.indexOf(target);
  if (srcIdx < 0 || tgtIdx < 0) return;
  if (srcIdx < tgtIdx) target.after(_bomStdDragSrc);
  else target.before(_bomStdDragSrc);
  const order = [...list.querySelectorAll('.bom-std-draggable')].map(r => parseInt(r.dataset.bomStdId));
  await api(`/api/revisions/${revId}/bom-std-reorder`, 'PUT', { order });
}

function _bomDragStart(e) {
  _bomDragSrc = e.currentTarget;
  e.currentTarget.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}
function _bomDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget;
  document.querySelectorAll('.bom-draggable').forEach(r => r.style.outline = '');
  if (row !== _bomDragSrc) row.style.outline = '2px solid var(--blue)';
}
function _bomDragEnd() {
  document.querySelectorAll('.bom-draggable').forEach(r => { r.style.opacity=''; r.style.outline=''; });
}
async function _bomDrop(e, revId) {
  e.preventDefault();
  const target = e.currentTarget;
  if (!_bomDragSrc || _bomDragSrc === target) return;
  const list = target.closest('#bom-list-' + revId);
  if (!list) return;
  const rows = [...list.querySelectorAll('.bom-draggable')];
  const srcIdx = rows.indexOf(_bomDragSrc);
  const tgtIdx = rows.indexOf(target);
  if (srcIdx < 0 || tgtIdx < 0) return;
  // Reorder DOM
  if (srcIdx < tgtIdx) target.after(_bomDragSrc);
  else target.before(_bomDragSrc);
  // Update position numbers
  [...list.querySelectorAll('.bom-draggable')].forEach((r, i) => {
    const numEl = r.querySelector('span[style*="width:20px"]');
    if (numEl) numEl.textContent = i + 1;
  });
  // Save to backend
  const order = [...list.querySelectorAll('.bom-draggable')].map(r => parseInt(r.dataset.bomId));
  await api(`/api/revisions/${revId}/bom-reorder`, 'PUT', { order });
}

function renderRevDetail(rev, item) {
  const isASM = item.item_type === 'asm';
  const isDOC = item.item_type === 'doc';
  // Geliefert heisst fixiert: wie eine Freigabe gesperrt, auch im Entwurf.
  // In Review ist ebenfalls gesperrt — geprüft wird, was eingereicht wurde.
  const delivered = rev.delivered || [];
  const released = rev.status === 'REL' || rev.status === 'OBS' || rev.status === 'ECO';
  const locked = released || rev.status === 'REV' || delivered.length > 0;
  const lockLabel = released ? _t('Gesperrt ({status})', { status: rev.status }) : rev.status === 'REV' ? _t('Gesperrt (in Review)') : _t('Gesperrt (geliefert)');
  const deliveredBox = delivered.length ? `
    <div style="display:flex;gap:10px;align-items:flex-start;padding:9px 11px;margin-bottom:10px;background:var(--teal-soft);border:1px solid var(--teal-line);border-radius:var(--r-sm);font-size:13px">
      <span style="font-size:15px;line-height:1.2">🚚</span>
      <div style="min-width:0">
        <div style="color:var(--t1);font-weight:600">${_t('Geliefert — rev{rev} ist fixiert', { rev: esc(rev.rev) })}</div>
        <div style="color:var(--t2);margin-top:2px;line-height:1.55">
          ${delivered.map(d => `<span style="font-family:var(--mono);color:var(--blue);cursor:pointer" onclick="gotoView('deliveries');openDeliveryDetail(${d.id})">${esc(d.number)}</span>${d.customer_name ? ' · ' + esc(d.customer_name) : ''}${d.delivery_date ? ' · ' + fmtD(d.delivery_date) : ''}`).join('<br>')}
        </div>
        <div style="color:var(--t3);margin-top:4px">${_t('Dateien, Stückliste und Druckparameter bleiben so, wie sie geliefert wurden. Änderungen gehen in eine neue Revision.')}</div>
      </div>
    </div>` : '';
  // Im einfachen Workflow (Einstellungen → PLM) gibt es keine Freigabe:
  // statt REV/REL legt man direkt die naechste Revision an.
  const simple = typeof simpleWorkflow === 'function' && simpleWorkflow();
  const wfMap = simple ? {
    DFT: [{s:'_NEWREV',label:_t('＋ Neue Revision'),cls:'btn-green'},{s:'OBS',label:_t('Als veraltet markieren (OBS)'),cls:'btn-ghost'}],
    REV: [{s:'DFT',label:_t('← Zurück zu Entwurf'),cls:'btn-ghost'}],
    REL: [{s:'ECO',label:_t('⚡ ECO starten'),cls:'btn-purple'},{s:'OBS',label:_t('Als veraltet markieren (OBS)'),cls:'btn-ghost'}],
    ECO: [{s:'OBS',label:_t('Als veraltet markieren (OBS)'),cls:'btn-ghost'}],
    OBS: []
  } : {
    // Ohne Vier-Augen-Prinzip gibt man direkt frei; REV nur, wenn eine zweite
    // Person prüft. Admins dürfen beides: selbst freigeben oder prüfen lassen.
    DFT: !reviewRequired() ? [{s:'REL',label:_t('✓ Freigeben'),cls:'btn-green'}]
      : isAdmin() ? [{s:'REV',label:_t('→ In Review'),cls:'btn-amber'},{s:'REL',label:_t('✓ Freigeben'),cls:'btn-green'}]
      : [{s:'REV',label:_t('→ In Review'),cls:'btn-amber'}],
    REV: [{s:'DFT',label:_t('← Zurück zu Entwurf'),cls:'btn-ghost'},{s:'REL',label:_t('✓ Freigeben'),cls:'btn-green'}],
    REL: [{s:'ECO',label:_t('⚡ ECO starten'),cls:'btn-purple'},{s:'OBS',label:_t('Als veraltet markieren (OBS)'),cls:'btn-ghost'}],
    ECO: [{s:'OBS',label:_t('Als veraltet markieren (OBS)'),cls:'btn-ghost'}],
    OBS: []
  };
  // Eine gelieferte Entwurfs-Revision lässt sich nicht mehr ändern — der Weg
  // weiter ist eine neue Revision, auch im Workflow mit Freigabe.
  const actions = (wfMap[rev.status] || []).slice();
  if ((rev.delivered || []).length && (item.revisions || [])[0]?.id === rev.id
      && (rev.status === 'DFT' || rev.status === 'REV') && !actions.some(a => a.s === '_NEWREV')) {
    actions.unshift({ s: '_NEWREV', label: _t('＋ Neue Revision'), cls: 'btn-green' });
  }
  // Freigeben und Veralten dürfen Superuser und Admins (allein: man selbst)
  const missing = rev.release_missing || [];
  // Vier-Augen-Prinzip: wer eingereicht hat, gibt nicht selbst frei — ausser Admins
  const ownReview = reviewRequired() && !isAdmin() && rev.status === 'REV' && rev.submitted_by?.id
    && rev.submitted_by.id === state.session?.user?.id;
  const wfBtns = actions.map(b => b.s === '_NEWREV'
    ? `<button class="btn btn-sm ${b.cls}" onclick="createNextRevision(${item.id})">${b.label}</button>`
    : b.s === 'REL' && ownReview
      ? `<span title="${_t('Du hast die Revision eingereicht — freigeben muss eine zweite Person')}" style="display:inline-flex"><button class="btn btn-sm ${b.cls}" disabled>${b.label}</button></span>`
    : b.s === 'REL' && missing.length
      ? `<span title="Für die Freigabe fehlt: ${esc(missing.join(', '))}" style="display:inline-flex"><button class="btn btn-sm ${b.cls}" disabled>${b.label}</button></span>`
    : (['REL', 'OBS'].includes(b.s) && !canRelease()
      ? `<span title="${_t('Freigeben dürfen nur Superuser und Admins')}" style="display:inline-flex"><button class="btn btn-sm ${b.cls}" disabled>${b.label}</button></span>`
      : `<button class="btn btn-sm ${b.cls}" onclick="openStatusModal(${rev.id},'${b.s}')">${b.label}</button>`)).join('');

  return `
    <!-- Rev info -->
    ${deliveredBox}
    <div class="sep-label">${_t('rev{rev} – Details', { rev: rev.rev })}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:13px">
      <div><div class="ps-label">Status</div><span class="status st-${rev.status}" title="${esc(PLM_ST_LABEL[rev.status] || '')}">${rev.status}</span> <span style="color:var(--t3)">${esc(PLM_ST_LABEL[rev.status] || '')}</span></div>
      <div><div class="ps-label">${_t('Erstellt')}</div>${fmtDate(rev.created_at)}</div>
      ${rev.released_at ? `<div><div class="ps-label">${_t('Freigegeben')}</div>${fmtDate(rev.released_at)}</div>` : ''}
      ${rev.released_by ? `<div><div class="ps-label">${_t('Freigegeben von')}</div>${esc(rev.released_by)}</div>` : ''}
      ${rev.submitted_by?.name ? `<div><div class="ps-label">${_t('In Review gesetzt von')}</div>${esc(rev.submitted_by.name)}</div>` : ''}
      ${rev.description ? `<div style="grid-column:span 2"><div class="ps-label">${_t('Beschreibung')}</div>${esc(rev.description)}</div>` : ''}
      ${rev.eco_reason ? `<div style="grid-column:span 2"><div class="ps-label">${_t('ECO-Grund')}</div><span style="color:var(--purple)">${esc(rev.eco_reason)}</span></div>` : ''}
    </div>
    ${_releaseMissingBox(rev)}

    ${isASM ? `
    <!-- BOM -->
    <div class="sep-label">${_t('Stückliste (BOM)')}</div>
    <div id="bom-list-${rev.id}" style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
      ${renderBomList(rev, item, locked)}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" onclick="printBom(${item.id},${rev.id})">${_t('🖨 Drucken')}</button>
      ${locked ? '' : `
        <button class="btn btn-ghost btn-sm" onclick="openBomModal(${rev.id},${item.project_id})">${_t('+ Position hinzufügen')}</button>
        <button class="btn btn-ghost btn-sm" onclick="openStepBomImport(${rev.id},${item.project_id})">${_t('📐 BOM aus STEP')}</button>
      `}
    </div>
    ` : ''}

    ${_stlPreview(rev.id, _stlFiles(rev, item))}

    <!-- Dateien -->
    <div class="sep-label" style="margin-top:12px">Dateien
      ${locked ? '<span style="font-size:13px;color:var(--t3);margin-left:auto;font-family:var(--mono)">&#128274; '+lockLabel+'</span>'
               : '<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openUploadModal('+rev.id+',\''+item.item_number+'\',\''+rev.rev+'\')">' + _t('+ Datei') + '</button>'}
    </div>
    <div id="ds-list-${rev.id}">
      ${renderDatasets(rev.datasets||[], rev.id, locked)}
    </div>


    <!-- Workflow -->
    <div class="wf-strip" style="margin-top:16px">
      <div class="wf-label">${simple ? _t('Revisionen') : _t('Freigabe-Workflow')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${wfBtns || '<span style="color:var(--t3);font-size:13px">' + _t('Keine weiteren Aktionen möglich') + '</span>'}
      </div>
    </div>

    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      ${itemIsEditable(item) && !item.delivered
        ? `<button class="btn btn-red btn-sm" onclick="deleteItem(${item.id})">${_t('🗑 Item löschen')}</button>`
        : `<span style="font-size:13px;color:var(--t3);font-family:var(--mono)">🔒 ${_t('Item löschen nur unter Einstellungen → Admin')}${item.delivered ? ' ' + _t('(geliefert)') : ''}</span>`}
      ${rev.status === 'DFT' && !delivered.length
        ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:var(--red)" onclick="deleteRevision(${rev.id},${item.id})">${_t('Revision löschen')}</button>`
        : ''}
    </div>`;
}

function fileLabel(originalName, dsType) {
  if (!originalName || !originalName.includes('.')) return dsType;
  const ext = originalName.split('.').pop().toUpperCase();
  if (dsType === 'PDF') return 'PDF';
  if (dsType === 'CAD') {
    const specific = ['STL','OBJ','3MF','STEP','STP','IGES','IGS','F3D','JT','X_T','X_B'];
    return specific.includes(ext) ? ext : 'CAD';
  }
  return ext;
}
function dtClass(originalName, dsType) {
  if (dsType === 'CAD' && originalName && originalName.split('.').pop().toUpperCase() === 'STL') return 'dt-STL';
  return 'dt-' + dsType;
}

function _cleanDsName(name) {
  // Strip trailing _NNN or _NN before extension: file_001.step → file.step
  return name.replace(/(_\d{1,4})(\.[^.]+)$/, '$2');
}

function renderDatasets(datasets, revId, locked) {
  if (!datasets.length) return `<div style="color:var(--t3);font-size:13px">${_t('Noch keine Dateien angehängt.')}</div>`;
  const groups = {};
  datasets.forEach(d => { (groups[d.ds_type] = groups[d.ds_type]||[]).push(d); });
  return Object.entries(groups).map(([type, files]) =>
    `<div style="margin-bottom:4px">
      ${files.map(f => `
        <div class="ds-row">
          <span class="ds-type ${dtClass(f.original_name, type)}">${fileLabel(f.original_name, type)}</span>
          <div class="ds-info">
            <div class="ds-name">${esc(_cleanDsName(f.original_name))}</div>
            <div class="ds-meta">v${f.version} · ${fmtSize(f.file_size)} · ${fmtDate(f.uploaded_at)}${f.notes?' · '+esc(f.notes):''}</div>
          </div>
          ${_isSlicerFile(f) ? _slicerButton(f, true) : ''}
          <a href="${API}/api/datasets/${f.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a>
          ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="openEditDatasetModal(${f.id},'${esc(f.original_name)}','${esc(f.notes||'')}')" title="${_t('Info bearbeiten')}">✏️</button>`}
          ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="delDataset(${f.id},${revId})" title="${_t('Löschen')}">&#x2715;</button>`}
        </div>`).join('')}
    </div>`
  ).join('');
}

async function switchRev(itemId, revId) {
  state.activeRevId = revId;
  _treeMarkRev(revId);
  const item = await api(`/api/items/${itemId}`);
  state.item = item;
  renderItemDetail(item, revId);
}
