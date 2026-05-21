const API = '';
const ORDER_ST_MAP   = {DRAFT:'st-DFT',CONFIRMED:'st-REL',DELIVERED:'st-REV',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
const ORDER_ST_LABEL = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
const QUOTE_ST_MAP   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
const QUOTE_ST_LABEL = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};

function _stSel(type, id, current) {
  const maps   = {order:ORDER_ST_MAP,   quote:QUOTE_ST_MAP,   delivery:DELIVERY_ST_MAP  };
  const labels = {order:ORDER_ST_LABEL, quote:QUOTE_ST_LABEL, delivery:DELIVERY_ST_LABEL};
  const m = maps[type]||{}; const l = labels[type]||{};
  const opts = Object.keys(m).map(s=>`<option value="${s}"${s===current?' selected':''}>${l[s]||s}</option>`).join('');
  return `<select class="status-sel ${m[current]||''}" title="Status ändern"
    onclick="event.stopPropagation()"
    onchange="setDocStatus('${type}',${id},this.value,this)">${opts}</select>`;
}
async function setDocStatus(type, id, status, el) {
  const prevValue = el.value;
  const prevClass = el.className;
  try {
    const endpoint = type === 'delivery' ? 'deliveries' : type + 's';
    const r = await api(`/api/${endpoint}/${id}/status`, 'PUT', { status });
    const m = type==='order' ? ORDER_ST_MAP : type==='quote' ? QUOTE_ST_MAP : DELIVERY_ST_MAP;
    el.className = 'status-sel ' + (m[status]||'');

    const arr = type==='order' ? state.orders : type==='quote' ? state.quotes : state.deliveries;
    const rec = arr.find(x => x.id === id);
    if (rec) rec.status = status;

    if (type === 'order' && r.delivery_date) {
      if (rec) rec.delivery_date = r.delivery_date;
      const ddEl = document.getElementById('od-delivery-date');
      if (ddEl) ddEl.textContent = r.delivery_date;
    }
    if (type === 'delivery') {
      if (r.delivery_date && rec) rec.delivery_date = r.delivery_date;
      // Refresh detail so delivery_date and linked order status update
      openDeliveryDetail(id);
      // If all deliveries for an order are now delivered, reload orders list
      if (status === 'DELIVERED') { await renderOrders(); }
    }
    toast('Status gespeichert', 'ok');
    loadStats();
  } catch(e) {
    // Revert dropdown on failure
    el.value = prevValue;
    el.className = prevClass;
    toast('Status konnte nicht gespeichert werden', 'err');
  }
}
let state = { view: 'projects', projects: [], project: null, item: null, activeRevId: null, customers: [], orders: [], quotes: [], deliveries: [], searchResults: null, settings: {}, printers: [], nozzles: [], materialPresets: [], _psConfigLoaded: false, checkouts: [] };

async function loadCheckouts() {
  try {
    state.checkouts = await api('/api/checkout/list');
    await _scanCheckoutFolder();
    _updateCheckoutBadge();
  } catch {}
}

let _scanResult = { item_files: [], root_files: [] };

async function _scanCheckoutFolder() {
  try {
    _scanResult = await api('/api/checkout/scan');
  } catch { _scanResult = { item_files: [], root_files: [] }; }
}

function _scanNewCount() {
  return _scanResult.item_files.reduce((s, g) => s + g.new_files.length, 0) + _scanResult.root_files.length;
}

function _updateCheckoutBadge() {
  const total = state.checkouts.reduce((s, c) => s + (c.files?.length || 0), 0);
  const newCount = _scanNewCount();
  const btn = document.getElementById('tb-checkout-btn');
  if (!btn) return;
  let badges = '';
  if (total > 0) badges += `<span style="background:var(--teal);color:var(--bg0);border-radius:8px;font-family:var(--mono);font-size:9px;padding:1px 6px;margin-left:3px">${total}</span>`;
  if (newCount > 0) badges += `<span style="background:var(--amber);color:var(--bg0);border-radius:8px;font-family:var(--mono);font-size:9px;padding:1px 6px;margin-left:3px">+${newCount} neu</span>`;
  btn.innerHTML = `⬆ Checkouts${badges}`;
  btn.style.color = newCount > 0 ? 'var(--amber)' : total > 0 ? 'var(--teal)' : '';
  btn.style.borderColor = newCount > 0 ? 'var(--amber-line)' : total > 0 ? 'var(--teal-line)' : '';
}

function fmtN(v, dec = 2) {
  const n = parseFloat(v) || 0;
  const [intPart, decPart] = n.toFixed(dec).split('.');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (decPart !== undefined ? '.' + decPart : '');
}
function rnd5(v) { return Math.floor((parseFloat(v) || 0) * 20) / 20; }
function fmtCHF(v) { return 'CHF ' + fmtN(rnd5(v)); }

// ── ITEM TYPE ICONS ───────────────────────────────────────────
const _SVG_ASM = '📦';
const _SVG_PRT = '🔩';
const _SVG_DOC = '📄';
function _itemSvg(t)   { return t==="asm" ? _SVG_ASM : t==="doc" ? _SVG_DOC : _SVG_PRT; }
function _itemColor(t) { return t==="asm" ? "var(--blue)" : t==="doc" ? "var(--purple)" : "var(--teal)"; }
function _itemBg(t)    { return t==="asm" ? "rgba(142,163,255,.12)" : t==="doc" ? "rgba(180,140,255,.12)" : "rgba(106,208,214,.12)"; }
function _itemChip(t, sz=20) { return `<span style="font-size:${Math.round(sz*0.75)}px;line-height:1;flex-shrink:0">${_itemSvg(t)}</span>`; }

const _CLASS_PALETTE = [
  ['var(--blue)','rgba(142,163,255,.12)'],['var(--teal)','rgba(106,208,214,.12)'],
  ['var(--amber)','rgba(239,177,74,.12)'],['var(--purple)','rgba(180,140,255,.12)'],
  ['var(--green)','rgba(91,211,138,.12)'],['var(--red)','rgba(241,120,120,.12)'],
  ['var(--t3)','rgba(100,100,110,.12)']
];
function _classColor(cls) {
  const list = getClassifications();
  const i = list.indexOf(cls);
  return _CLASS_PALETTE[i >= 0 ? i % _CLASS_PALETTE.length : _CLASS_PALETTE.length - 1];
}
function _classChip(cls) {
  if (!cls) return '';
  const [color, bg] = _classColor(cls);
  return `<span style="font-family:var(--mono);font-size:8px;padding:1px 5px;border-radius:3px;background:${bg};color:${color};flex-shrink:0">${esc(cls)}</span>`;
}

// ── INIT ──────────────────────────────────────────────────────
// ── RECENTLY VIEWED ───────────────────────────────────────────
const _MAX_RECENT = 8;
let _recentItems = JSON.parse(localStorage.getItem('plm_recent') || '[]');

function _trackRecent(type, id, label, sub, itemType) {
  _recentItems = _recentItems.filter(r => !(r.type === type && r.id === id));
  _recentItems.unshift({ type, id, label, sub, itemType, ts: Date.now() });
  if (_recentItems.length > _MAX_RECENT) _recentItems = _recentItems.slice(0, _MAX_RECENT);
  localStorage.setItem('plm_recent', JSON.stringify(_recentItems));
  _renderRecent();
}

function _renderRecent() {
  const el = document.getElementById('nav-recent');
  if (!el) return;
  if (!_recentItems.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = _recentItems.map(r => {
    const icon = r.type === 'order' ? '📋' : r.type === 'quote' ? '📄' : r.type === 'delivery' ? '🚚' : r.type === 'customer' ? '👤' : r.type === 'project' ? '📁' : r.itemType ? _itemSvg(r.itemType) : '🔩';
    return `<button class="nav-item" style="font-size:11px;padding:4px 12px 4px 16px;gap:6px" onclick="_openRecent(${JSON.stringify(r).replace(/"/g,'&quot;')})">
      <span style="font-size:12px;flex-shrink:0">${icon}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${esc(r.label)}</span>
      ${r.sub ? `<span style="font-size:9px;color:var(--t4);flex-shrink:0;font-family:var(--mono)">${esc(r.sub)}</span>` : ''}
    </button>`;
  }).join('');
}

function _openRecent(r) {
  if (r.type === 'order') { gotoView('orders'); openOrderDetail(r.id); }
  else if (r.type === 'quote') { gotoView('quotes'); openQuoteDetail(r.id); }
  else if (r.type === 'delivery') { gotoView('deliveries'); openDeliveryDetail(r.id); }
  else if (r.type === 'customer') { gotoView('customers'); openCustomerDetail(r.id); }
  else if (r.type === 'project') { gotoView('projects'); openProject(r.id); }
  else if (r.type === 'item') { gotoPlmItem(r.id); }
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Ctrl+K / Cmd+K → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const s = document.getElementById('globalSearch');
    if (s) { s.focus(); s.select(); }
    return;
  }
  // Escape → close modal or detail panel
  if (e.key === 'Escape') {
    const dyn = document.getElementById('dynModal');
    if (dyn) { _hideDynModal(); return; }
    const openModal = document.querySelector('.overlay.open');
    if (openModal) { openModal.classList.remove('open'); return; }
    const detail = document.getElementById('detail-panel');
    if (detail && !detail.classList.contains('hidden')) { closeDetail(); return; }
  }
});

// ── BROWSER HISTORY ───────────────────────────────────────────
let _historyBlocked = false;

function _pushHistory(state) {
  if (_historyBlocked) return;
  history.pushState(state, '');
}

window.addEventListener('popstate', e => {
  if (!e.state) { gotoView('dashboard'); return; }
  _historyBlocked = true;
  const s = e.state;
  if (s.view) gotoView(s.view).then(() => {
    if (s.detailType === 'order') openOrderDetail(s.detailId);
    else if (s.detailType === 'quote') openQuoteDetail(s.detailId);
    else if (s.detailType === 'delivery') openDeliveryDetail(s.detailId);
    else if (s.detailType === 'customer') openCustomerDetail(s.detailId);
    else if (s.detailType === 'project') openProject(s.detailId);
    else if (s.detailType === 'item') gotoPlmItem(s.detailId);
  }).finally(() => { _historyBlocked = false; });
  else _historyBlocked = false;
});

window.addEventListener('DOMContentLoaded', async () => {
  state.settings = await api('/api/settings').catch(() => ({}));
  const cadBtn = document.getElementById('tb-cad-btn');
  if (cadBtn) cadBtn.style.display = state.settings?.cad_path ? '' : 'none';
  history.replaceState({ view: 'dashboard' }, '');
  gotoView('dashboard');
  loadStats();
  loadCheckouts();
  _renderRecent();
  setupUploadDrag();
  document.addEventListener('click', e => {
    const res = document.getElementById('li-plm-results');
    if (res && !e.target.closest('#li-plm-results') && e.target.id !== 'li-plm-search') res.style.display = 'none';
    const res2 = document.getElementById('dim-plm-results');
    if (res2 && !e.target.closest('#dim-plm-results') && e.target.id !== 'dim-plm-search') res2.style.display = 'none';
  });
});

// ── VIEWS ─────────────────────────────────────────────────────
async function gotoView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const ni = document.getElementById('ni-' + v);
  if (ni) ni.classList.add('active');
  closeDetail();
  _pushHistory({ view: v });

  if (v === 'projects') await renderProjectsList();
  else if (v === 'dashboard') await renderDashboard();
  else if (v === 'customers') await renderCustomers();
  else if (v === 'quotes') await renderQuotes();
  else if (v === 'orders') await renderOrders();
  else if (v === 'deliveries') await renderDeliveries();
  else if (v === 'changelog') await renderChangelog();
  else if (v === 'settings') await renderSettings();
  else if (v === 'fileindex') await renderFileIndex();
  else if (v === 'search') renderSearchView();
  else if (v === 'profit') await renderProfitOverview();
  else if (v === 'inventory') await renderInventory();
}

// ── PROJECTS LIST ─────────────────────────────────────────────
async function renderProjectsList() {
  setLeftHeader('Projekte', `<button class="btn btn-primary btn-sm" onclick="openModal('projectModal')">+ Projekt</button>`);
  const projects = await api('/api/projects');
  state.projects = projects;
  if (!projects.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">📂</div><div class="empty-text">Noch keine Projekte</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="openModal('projectModal')">Erstes Projekt anlegen</button></div></div>`);
    return;
  }
  const statChip = (val, label, color) => val
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:${color}"><span style="font-family:var(--mono);font-weight:600">${val}</span><span style="color:var(--t4)">${label}</span></span>`
    : '';
  setLeftBody(`<div style="display:flex;flex-direction:column;gap:6px;max-width:860px">${projects.map(p => `
    <div onclick="openProject(${p.id})" style="display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);cursor:pointer;transition:border-color .15s,background .15s" onmouseover="this.style.borderColor='var(--line3)';this.style.background='var(--bg3)'" onmouseout="this.style.borderColor='var(--line)';this.style.background='var(--bg2)'">
      <div style="width:38px;height:38px;border-radius:var(--r-sm);background:rgba(142,163,255,.1);border:1px solid rgba(142,163,255,.2);display:grid;place-items:center;flex-shrink:0">
        <span style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--blue)">${p.number.replace(/[^0-9]/g,'').slice(-3)||'—'}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em">${esc(p.name)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:3px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${p.number}</span>
          ${p.customer ? `<span style="color:var(--t3)">${esc(p.customer)}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        ${statChip(p.asm_count, 'asm', 'var(--blue)')}
        ${statChip(p.prt_count, 'prt', 'var(--teal)')}
        ${statChip(p.doc_count, 'doc', 'var(--purple)')}
        ${p.file_count ? `<span style="font-size:11px;color:var(--t4);font-family:var(--mono)">${p.file_count} <span style="font-family:var(--sans);font-weight:400">files</span></span>` : ''}
        <span style="font-size:10px;color:var(--t4);white-space:nowrap">${new Date(p.created_at).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'2-digit'})}</span>
        <span style="color:var(--t4);font-size:12px">›</span>
      </div>
    </div>`).join('')}</div>`);
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
    `<div class="breadcrumb"><span onclick="gotoView('projects')">Projekte</span><span class="sep">/</span><strong>${esc(p.name)}</strong><span class="chip" style="margin-left:6px">${p.number}</span></div>`,
    `<button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'asm')">+ Baugruppe</button>
     <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'prt')">+ Part</button>
     <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'doc')">+ Dok</button>`
  );

  renderProjectTree(p);
  openProjectDetail(p);
}

async function openProjectAndItem(projectId, itemId) {
  await openProject(projectId);
  await openItemDetail(itemId);
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
    setLeftBody(`<div class="empty"><div class="empty-icon">🔩</div><div class="empty-text">Noch keine Items</div>
      <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
        <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'asm')">+ Baugruppe</button>
        <button class="btn btn-primary btn-sm" onclick="openItemModal(${p.id},null,'prt')">+ Part</button>
        <button class="btn btn-ghost btn-sm" onclick="openItemModal(${p.id},null,'doc')">+ Dokument</button>
      </div></div>`);
    return;
  }

  const bomChildIds = new Set();
  items.forEach(item => (item.latest_revision?.bom || []).forEach(b => bomChildIds.add(b.child_item_id)));

  const filterOn = state.filterBomChildren !== false;
  const rootItems = items.filter(i => i.parent_id === null);
  const visibleRoots = filterOn ? rootItems.filter(i => !bomChildIds.has(i.id)) : rootItems;
  const hiddenCount = rootItems.length - visibleRoots.length;

  setLeftBody(`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line)">
      <span style="font-size:11px;color:var(--t4);font-family:var(--mono)">${items.length} Items</span>
      <button onclick="toggleBomFilter()" style="font-size:11px;padding:3px 9px;border-radius:var(--r-xs);cursor:pointer;font-family:var(--sans);border:1px solid ${filterOn?'rgba(142,163,255,.35)':'var(--line2)'};background:${filterOn?'rgba(142,163,255,.1)':'transparent'};color:${filterOn?'var(--blue)':'var(--t3)'}">
        BOM-Kinder ${filterOn?'ausgeblendet':'sichtbar'}${filterOn && hiddenCount ? ` (${hiddenCount})` : ''}
      </button>
    </div>
    <div id="project-tree">${renderTreeNodes(visibleRoots, items)}</div>`);

  _treeRestoreOpen(openIds);
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
  const hasKids = bomKids.length > 0;
  const n = _nim(); const nid = `tn${n}`, tid = `tt${n}`;
  const childHtml = hasKids ? bomKids.map(b => {
    const ci = map[b.child_item_id];
    return ci ? _renderTreeNode(ci, map, false) : '';
  }).join('') : '';
  return `<div class="tree-node">
    <div class="tree-row" onclick="openItemDetail(${item.id})" ${isRoot ? `id="tr-${item.id}"` : ''}
      style="${co ? 'background:rgba(106,208,214,.07);box-shadow:inset 2px 0 0 var(--teal);' : ''}">
      <span class="tree-tog" onclick="event.stopPropagation();togN('${nid}','${tid}')" style="color:var(--t4)">${hasKids ? '▶' : ''}</span>
      ${_itemChip(item.item_type, 20)}
      <span class="tree-num" style="font-size:10px">${item.item_number}</span>
      <span class="tree-name">${esc(item.name)}</span>
      ${item.classification ? _classChip(item.classification) : ''}
      ${co ? `<span style="font-family:var(--mono);font-size:8px;color:var(--teal);background:rgba(106,208,214,.12);border:1px solid rgba(106,208,214,.25);padding:1px 5px;border-radius:3px;flex-shrink:0" title="Ausgecheckt">CO</span>` : ''}
      ${rev ? `<span class="status st-${rev.status} tree-rev" style="font-size:9px">rev${rev.rev}</span>` : ''}
    </div>
    ${hasKids ? `<div id="${nid}" class="tree-children" data-item-id="${item.id}" style="display:none">${childHtml}</div>` : ''}
  </div>`;
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
    `<span style="font-family:var(--mono);font-size:11px;color:var(--blue);margin-right:6px">${p.number}</span><strong>${esc(p.name)}</strong>`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'pt-info')">Info</button>
    <button class="tab" onclick="switchTab(this,'pt-files')">Struktur</button>
    <button class="tab" onclick="switchTab(this,'pt-docs')">Dokumente${docCount?` <span style="background:var(--blue);color:var(--bg0);border-radius:8px;font-size:9px;font-family:var(--mono);padding:1px 5px;margin-left:3px">${docCount}</span>`:''}</button>
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
      const qtyBadge = (b.quantity && b.quantity !== 1) ? ` <span style="font-family:var(--mono);font-size:9px;color:var(--t4);background:var(--bg3);padding:1px 5px;border-radius:3px">×${b.quantity}</span>` : '';
      return renderItemFiles(ci, depth + 1) + (qtyBadge ? `<div style="padding:0 0 2px ${28 + depth*16}px">${qtyBadge}</div>` : '');
    }).join('') : '';
    return `<div>
      <div style="display:flex;align-items:center;gap:7px;padding:5px ${depth>0?'6px':'4px'};border-radius:var(--r-xs);cursor:pointer;transition:background .1s;${co?'background:rgba(106,208,214,.07);box-shadow:inset 2px 0 0 var(--teal);':''}" onclick="openItemDetail(${item.id})" onmouseover="this.style.background='${co?'rgba(106,208,214,.12)':'var(--bg3)'}'" onmouseout="this.style.background='${co?'rgba(106,208,214,.07)':''}'" >
        ${hasKids ? `<span onclick="event.stopPropagation();const e=document.getElementById('${nid}');const open=e.style.display!=='none';e.style.display=open?'none':'';this.style.transform=open?'':'rotate(90deg)'" style="color:var(--t4);font-size:9px;transition:transform .15s;flex-shrink:0;cursor:pointer">▶</span>` : '<span style="width:11px;flex-shrink:0"></span>'}
        ${_itemChip(item.item_type, 18)}
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue);flex-shrink:0">${item.item_number}</span>
        <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t1)">${esc(item.name)}</span>
        ${co ? `<span style="font-family:var(--mono);font-size:8px;color:var(--teal);background:rgba(106,208,214,.12);border:1px solid rgba(106,208,214,.25);padding:1px 5px;border-radius:3px;flex-shrink:0" title="Ausgecheckt">CO</span>` : ''}
        ${rev ? `<span class="status st-${rev.status}" style="font-size:9px;flex-shrink:0">rev${rev.rev}</span>` : ''}
      </div>
      ${datasets.length ? `<div style="padding:2px 6px 4px ${28 + depth*16}px;display:flex;flex-direction:column;gap:2px">
        ${datasets.map(d => `<div style="display:flex;align-items:center;gap:6px;padding:3px 6px;background:var(--bg2);border-radius:3px">
          <span class="ds-type ${dtClass(d.original_name,d.ds_type)}" style="font-size:8.5px">${fileLabel(d.original_name,d.ds_type)}</span>
          <span style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)">${esc(d.original_name)}</span>
          <a href="/api/datasets/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" style="padding:3px" title="Download" download>↓</a>
        </div>`).join('')}
      </div>` : ''}
      ${hasKids ? `<div id="${nid}" style="padding-left:${14+depth*4}px;border-left:1px solid var(--line);margin-left:${14+depth*4}px">${childHtml}</div>` : ''}
    </div>`;
  }

  const roots = allItems.filter(i => !i.parent_id);
  const filesHtml = roots.length
    ? roots.map(i => renderItemFiles(i, 0)).join('')
    : '<div style="color:var(--t3);font-size:12px;padding:8px 0">Keine Items im Projekt</div>';

  const asmCount = allItems.filter(i=>i.item_type==='asm').length;
  const prtCount = allItems.filter(i=>i.item_type==='prt').length;
  const docCount2 = allItems.filter(i=>i.item_type==='doc').length;

  document.getElementById('dp-body').innerHTML = `
    <div id="pt-files" style="display:none">
      <div style="display:flex;gap:10px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--line)">
        ${asmCount?`<span style="font-size:11px;color:var(--blue);font-family:var(--mono)">${asmCount} <span style="color:var(--t4);font-family:var(--sans)">asm</span></span>`:''}
        ${prtCount?`<span style="font-size:11px;color:var(--teal);font-family:var(--mono)">${prtCount} <span style="color:var(--t4);font-family:var(--sans)">prt</span></span>`:''}
        ${docCount2?`<span style="font-size:11px;color:var(--purple);font-family:var(--mono)">${docCount2} <span style="color:var(--t4);font-family:var(--sans)">doc</span></span>`:''}
      </div>
      ${filesHtml}
    </div>
    <div id="pt-docs" style="display:none">
      ${renderProjectDocs(p)}
    </div>
    <div id="pt-info">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">Nummer</div>
          <div style="font-family:var(--mono);font-size:13px;color:var(--blue);margin-top:3px">${p.number}</div>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">Kunde</div>
          <div style="font-size:13px;color:var(--t1);margin-top:3px">${p.customer||'—'}</div>
        </div>
        ${p.description?`<div style="grid-column:span 2;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">Beschreibung</div>
          <div style="font-size:12px;color:var(--t2);margin-top:4px;white-space:pre-wrap;line-height:1.6">${esc(p.description)}</div>
        </div>`:''}
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px">
          <div class="ps-label">Angelegt</div>
          <div style="font-size:12px;color:var(--t2);margin-top:3px">${fmtDate(p.created_at)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" onclick="editProject(${p.id})">Bearbeiten</button>
        ${!(p.items && p.items.length) ? `<button class="btn btn-red btn-sm" onclick="deleteProject(${p.id})">Löschen</button>` : ''}
      </div>
    </div>
    <div id="pt-log" style="display:none">
      ${(p.changelog||[]).map(cl => `
        <div class="cl-row"><div class="cl-dot"></div>
        <div><div class="cl-action">${cl.action}</div><div class="cl-detail">${cl.details||''}</div></div>
        <div class="cl-time">${fmtDate(cl.created_at)}</div></div>`).join('') || '<div style="color:var(--t3);font-size:12px">Leer</div>'}
    </div>`;
  showDetail();
}

// ── PROJECT DOCUMENTS ─────────────────────────────────────────
function renderProjectDocs(p) {
  const docs = p.documents || [];
  const typeLabel = { PDF:'PDF', DOC:'Word', SPREADSHEET:'Excel', IMAGE:'Bild', CAD:'CAD', GCODE:'GCode', OTHER:'Datei' };
  const rows = docs.map(d => `
    <div class="ds-row">
      <span class="ds-type dt-${d.doc_type}">${typeLabel[d.doc_type]||d.doc_type}</span>
      <div class="ds-info" style="flex:1">
        <div class="ds-name">${esc(d.name)}</div>
        <div class="ds-meta">${fmtSize(d.file_size)} · ${fmtDate(d.uploaded_at)}${d.notes?' · <em>'+esc(d.notes)+'</em>':''}</div>
      </div>
      <a href="/api/documents/${d.id}/view" target="_blank" class="btn btn-icon btn-ghost btn-sm" title="Öffnen">&#x2197;</a>
      <a href="/api/documents/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="openDocEditModal(${d.id},'${esc(d.name)}','${esc(d.notes||'')}',${p.id})" title="Bearbeiten">✏️</button>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="delDoc(${d.id},${p.id})" title="Löschen">✕</button>
    </div>`).join('');

  return `
    <div style="margin-bottom:12px">
      <label class="btn btn-ghost btn-sm" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
        &#x1F4CE; Dokument hochladen
        <input type="file" multiple style="display:none" onchange="uploadDocs(this,${p.id})">
      </label>
    </div>
    ${rows || '<div style="color:var(--t3);font-size:12px;padding:8px 0">Noch keine Dokumente</div>'}`;
}

async function uploadDocs(input, projectId) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: fd });
  }
  toast(files.length === 1 ? 'Dokument hochgeladen' : files.length + ' Dokumente hochgeladen', 'ok');
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
  toast('Gespeichert', 'ok'); closeModal('docEditModal');
  const p = await api(`/api/projects/${projId}`);
  state.project = p;
  const tab = document.getElementById('pt-docs');
  if (tab) tab.innerHTML = renderProjectDocs(p);
}

async function delDoc(id, projectId) {
  if (!confirm('Dokument löschen?')) return;
  await api(`/api/documents/${id}`, 'DELETE');
  toast('Dokument gelöscht', 'ok');
  const p = await api(`/api/projects/${projectId}`);
  state.project = p;
  const tab = document.getElementById('pt-docs');
  if (tab) tab.innerHTML = renderProjectDocs(p);
  // Update tab badge
  openProjectDetail(p);
}

// ── ITEM DETAIL ───────────────────────────────────────────────
async function openItemDetail(itemId) {
  // highlight tree row
  document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('selected'));
  const tr = document.getElementById('tr-' + itemId);
  if (tr) tr.classList.add('selected');

  const item = await api(`/api/items/${itemId}`);
  state.item = item;
  state.activeRevId = item.revisions?.[0]?.id || null;
  _trackRecent('item', item.id, item.name, item.item_number, item.item_type);

  renderItemDetail(item, state.activeRevId);
  showDetail();
}
function itemIsEditable(item) {
  return !(item.revisions||[]).some(r => r.status === 'REL' || r.status === 'OBS');
}


function renderItemDetail(item, activeRevId) {
  const isASM = item.item_type === 'asm';
  const isDOC = item.item_type === 'doc';
  const typeLabel = isASM ? 'ASM' : isDOC ? 'DOC' : 'PRT';
  const typeColor = isASM ? 'var(--blue)' : isDOC ? 'var(--purple)' : 'var(--teal)';
  const typeBg    = isASM ? 'rgba(142,163,255,.12)' : isDOC ? 'rgba(180,140,255,.12)' : 'rgba(106,208,214,.12)';
  const editable = itemIsEditable(item);
  document.getElementById('dp-title').innerHTML =
    `<span style="font-family:var(--mono);font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:${typeBg};color:${typeColor};flex-shrink:0">${typeLabel}</span>`
    + `<span style="font-family:var(--mono);font-size:11px;color:${typeColor};flex-shrink:0">${item.item_number}</span>`
    + `<strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(item.name)}</strong>`
    + (item.classification ? ' ' + _classChip(item.classification) : '')
    + (editable ? ` <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px;flex-shrink:0" onclick="openEditItemModal(${item.id})">✏</button>` : '')
    + ` <button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px;flex-shrink:0" onclick="openMoveItemModal(${item.id})">↪</button>`;

  const tabs = `
    <button class="tab active" onclick="switchTab(this,'it-revs')">Revisionen</button>
    <button class="tab" onclick="switchTab(this,'it-log')">Changelog</button>
    ${!isDOC ? `<button class="tab" onclick="switchTab(this,'it-time');loadItemTimeEntries(${item.id})">Zeiten</button>` : ''}
    <button class="tab" onclick="switchTab(this,'it-whereused');loadWhereUsed(${item.id})">Where-Used</button>`;
  document.getElementById('dp-tabs').innerHTML = tabs;
  if (!isDOC) {
    const activeCheckout = state.checkouts.find(c => c.item_id === item.id);
    const coBtn = activeCheckout
      ? `<button class="btn btn-amber btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;margin-left:4px" onclick="doCheckin('${activeCheckout.folder.replace(/'/g,"\\'")}',this)">⬆ Einchecken</button>`
      : `<button class="btn btn-teal btn-sm" style="font-size:10px;padding:2px 8px;flex-shrink:0;margin-left:4px" onclick="openCheckoutModal(${item.id},'${esc(item.item_number)}','${item.item_type}')">⬇ Auschecken</button>`;
    document.getElementById('dp-title').innerHTML += coBtn;
  }

  const rev = item.revisions?.find(r => r.id === activeRevId) || item.revisions?.[0];

  document.getElementById('dp-body').innerHTML = `
    <div id="it-revs">
      ${(() => {
        const activeRev = item.active_revision || (item.revisions||[])[0];
        const bom = activeRev?.bom || [];
        const bomTotal = item.item_type === 'asm' && bom.length
          ? bom.reduce((s, b) => s + (b.default_price != null ? b.default_price * b.quantity : 0), 0)
          : null;
        const allPriced = item.item_type === 'asm' && bom.length && bom.every(b => b.default_price != null);
        const bomHint = bomTotal != null && bomTotal > 0
          ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--t3)">
              BOM: <strong style="color:var(--teal);font-family:var(--mono)">${fmtChf(bomTotal)}</strong>
              ${!allPriced ? '<span style="color:var(--amber);font-size:10px">⚠ unvollständig</span>' : ''}
              <button class="btn btn-ghost btn-sm" style="padding:1px 6px;font-size:10px" onclick="document.getElementById(\'item-price-field\').value=${bomTotal.toFixed(2)};document.getElementById(\'item-price-field\').dispatchEvent(new Event(\'blur\'))">übernehmen</button>
             </span>`
          : (item.item_type === 'asm' && bom.length ? `<span style="font-size:11px;color:var(--amber)">BOM: ⚠ keine Preise</span>` : '');
        return `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 10px;background:var(--bg2);border-radius:var(--r-sm);margin-bottom:10px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--t3)">
            VP:
            <input id="item-price-field" type="number" step="0.01" min="0" placeholder="—"
              value="${item.default_price != null ? item.default_price : ''}"
              style="width:84px;background:var(--bg3);border:1px solid var(--line2);border-radius:var(--r-xs);padding:3px 7px;font-size:12px;color:var(--t1);font-family:var(--mono);-moz-appearance:textfield;appearance:textfield"
              class="no-spin" onblur="saveItemPrice(${item.id},this)" onkeydown="if(event.key==='Enter')this.blur()">
            <span style="color:var(--t4)">CHF</span>
          </span>
          ${bomHint}
          ${item.source_url ? `<a href="${esc(item.source_url)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--blue);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">Quelle ↗</a>` : ''}
        </div>`;
      })()}
      <div class="sep-label" style="margin-top:4px">Revisionen</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;align-items:center">
        ${(item.revisions||[]).map(r => `
          <div class="rev-pill ${r.id === activeRevId ? 'active-rev' : ''}" onclick="switchRev(${item.id}, ${r.id})">
            <span class="status st-${r.status}" style="font-size:9px">rev${r.rev}</span>
            <span style="color:var(--t3);font-size:10px">${r.status}</span>
          </div>`).join('')}
        <div style="margin-left:auto;display:flex;gap:4px">
          ${!isDOC ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="openItemModal(${item.project_id},${isASM ? item.id : (item.parent_id||'null')},'prt')">+ Part</button>` : ''}
          ${isASM ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 7px" onclick="openItemModal(${item.project_id},${item.id},'asm')">+ Sub-ASM</button>` : ''}
        </div>
      </div>
      ${rev ? renderRevDetail(rev, item) : '<div style="color:var(--t3)">Keine Revision</div>'}
    </div>
    <div id="it-log" style="display:none">
      ${(item.changelog||[]).map(cl => `
        <div class="cl-row"><div class="cl-dot"></div>
        <div><div class="cl-action">${cl.action}</div><div class="cl-detail">${cl.details||''}</div></div>
        <div class="cl-time">${fmtDate(cl.created_at)}</div></div>`).join('') || '<div style="color:var(--t3);font-size:12px">Leer</div>'}
    </div>
    ${!isDOC ? `<div id="it-time" style="display:none">
      <div id="item-time-list"><div style="color:var(--t3);font-size:12px;padding:8px 0">Wird geladen…</div></div>
    </div>` : ''}
    <div id="it-whereused" style="display:none">
      <div id="it-whereused-list"><div style="color:var(--t3);font-size:12px;padding:8px 0">Wird geladen…</div></div>
    </div>`;
  setTimeout(() => {
    document.querySelectorAll('canvas[data-stl-url]').forEach(c => {
      if (!c._stlInit) { c._stlInit = true; initSTLViewer(c.id, c.dataset.stlUrl); }
    });
  }, 0);
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

function initSTLViewer(canvasId, url) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const loadDiv = document.getElementById('stl-load-' + canvasId.replace('stl-c-',''));
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { if (loadDiv) loadDiv.textContent = 'WebGL nicht verfügbar'; return; }
  fetch(url).then(r => r.arrayBuffer()).then(buf => {
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
    const VS = 'attribute vec3 aP,aN;uniform mat4 uM;uniform mat3 uN;uniform vec3 uC;uniform float uS;varying vec3 vN;void main(){gl_Position=uM*vec4((aP-uC)*uS,1.);vN=normalize(uN*aN);}';
    const FS = 'precision mediump float;varying vec3 vN;void main(){float d=clamp(dot(normalize(vN),normalize(vec3(1.,1.5,1.))),0.,1.)*.7+.3;gl_FragColor=vec4(.3*d,.55*d,.9*d,1.);}';
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
    let rX=-0.4, rY=0.6, zoom=1, drag=false, lx=0, ly=0;
    const mul4=(a,b)=>{const r=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)r[j*4+i]+=a[k*4+i]*b[j*4+k];return r;};
    const Rx=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);};
    const Ry=a=>{const c=Math.cos(a),s=Math.sin(a);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);};
    const Tr=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
    const Pr=(f,a,n,fa)=>{const t=Math.tan(f/2);return new Float32Array([1/(a*t),0,0,0,0,1/t,0,0,0,0,-(fa+n)/(fa-n),-1,0,0,-2*fa*n/(fa-n),0]);};
    const m3=(m)=>new Float32Array([m[0],m[1],m[2],m[4],m[5],m[6],m[8],m[9],m[10]]);
    function draw() {
      canvas.width=canvas.clientWidth||400; canvas.height=canvas.clientHeight||220;
      const W=canvas.width, H=canvas.height;
      gl.viewport(0,0,W,H);
      gl.clearColor(0.11,0.12,0.14,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const mod=mul4(Rx(rX),Ry(rY));
      gl.uniformMatrix4fv(uM,false,mul4(Pr(Math.PI/4,W/H,0.01,100),mul4(Tr(0,0,-3.2/zoom),mod)));
      gl.uniformMatrix3fv(uN,false,m3(mod));
      gl.drawArrays(gl.TRIANGLES,0,pos.length/3);
    }
    canvas.onmousedown = e=>{drag=true;lx=e.clientX;ly=e.clientY;canvas.style.cursor='grabbing';e.preventDefault();};
    window.addEventListener('mousemove', e=>{if(!drag||!document.getElementById(canvasId))return;rY+=(e.clientX-lx)*0.01;rX+=(e.clientY-ly)*0.01;lx=e.clientX;ly=e.clientY;draw();});
    window.addEventListener('mouseup', ()=>{if(drag){drag=false;const c=document.getElementById(canvasId);if(c)c.style.cursor='grab';}});
    canvas.addEventListener('wheel', e=>{zoom*=e.deltaY>0?0.92:1.09;zoom=Math.max(0.2,Math.min(6,zoom));draw();e.preventDefault();},{passive:false});
    let t0=[];
    canvas.addEventListener('touchstart',e=>{t0=[...e.touches];e.preventDefault();},{passive:false});
    canvas.addEventListener('touchmove',e=>{
      e.preventDefault();
      if(e.touches.length===1&&t0.length){rY+=(e.touches[0].clientX-t0[0].clientX)*0.01;rX+=(e.touches[0].clientY-t0[0].clientY)*0.01;}
      else if(e.touches.length===2&&t0.length===2){const d0=Math.hypot(t0[0].clientX-t0[1].clientX,t0[0].clientY-t0[1].clientY),d1=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);zoom*=d1/Math.max(d0,1);zoom=Math.max(0.2,Math.min(6,zoom));}
      t0=[...e.touches];draw();
    },{passive:false});
    draw();
  }).catch(e=>{if(loadDiv)loadDiv.textContent='Fehler beim Laden.';console.error('STL viewer:',e);});
}

function switchSTLViewer(revId, url) {
  const canvasId = 'stl-c-' + revId;
  const old = document.getElementById(canvasId);
  if (!old) return;
  const loadDiv = document.getElementById('stl-load-' + revId);
  if (loadDiv) { loadDiv.style.display = ''; loadDiv.textContent = 'Lade…'; }
  const nc = document.createElement('canvas');
  nc.id = canvasId; nc.style.cssText = 'width:100%;height:100%;display:block;cursor:grab';
  nc.dataset.stlUrl = url;
  old.replaceWith(nc);
  initSTLViewer(canvasId, url);
}

function renderRevDetail(rev, item) {
  const isASM = item.item_type === 'asm';
  const isDOC = item.item_type === 'doc';
  const locked = rev.status === 'REL' || rev.status === 'OBS';
  const wfMap = {
    DFT: [{s:'REV',label:'→ In Review',cls:'btn-amber'}],
    REV: [{s:'DFT',label:'← Zurück zu Entwurf',cls:'btn-ghost'},{s:'REL',label:'✓ Freigeben',cls:'btn-green'}],
    REL: [{s:'ECO',label:'⚡ ECO starten',cls:'btn-purple'},{s:'OBS',label:'Veralten (OBS)',cls:'btn-ghost'}],
    ECO: [{s:'DFT',label:'Neue Rev anlegen',cls:'btn-amber'}],
    OBS: []
  };
  const wfBtns = (wfMap[rev.status]||[]).map(b =>
    `<button class="btn btn-sm ${b.cls}" onclick="openStatusModal(${rev.id},'${b.s}')">${b.label}</button>`).join('');

  const ps = rev.print_settings;
  return `
    <!-- Rev info -->
    <div class="sep-label">rev${rev.rev} – Details</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;font-size:12px">
      <div><div class="ps-label">Status</div><span class="status st-${rev.status}">${rev.status}</span></div>
      <div><div class="ps-label">Erstellt</div>${fmtDate(rev.created_at)}</div>
      ${rev.released_at ? `<div><div class="ps-label">Freigegeben</div>${fmtDate(rev.released_at)}</div>` : ''}
      ${rev.released_by ? `<div><div class="ps-label">Von</div>${rev.released_by}</div>` : ''}
      ${rev.description ? `<div style="grid-column:span 2"><div class="ps-label">Beschreibung</div>${esc(rev.description)}</div>` : ''}
      ${rev.eco_reason ? `<div style="grid-column:span 2"><div class="ps-label">ECO-Grund</div><span style="color:var(--purple)">${esc(rev.eco_reason)}</span></div>` : ''}
    </div>

    ${isASM ? `
    <!-- BOM -->
    <div class="sep-label">Stückliste (BOM)</div>
    <div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
      ${(rev.bom||[]).length ? rev.bom.map(b => `
        <div class="bom-row">
          <span style="color:var(--t3);font-size:10px;width:24px">${b.position||'—'}</span>
          <span>${_itemChip(b.item_type,16)}</span>
          <span class="bom-num">${b.item_number}</span>
          <span style="flex:1;font-size:12px">${esc(b.name)}</span>
          ${b.child_active_rev ? `<span class="status st-${b.child_active_rev.status}" style="flex-shrink:0">rev${b.child_active_rev.rev}</span>` : ''}
          <span class="bom-qty">${b.quantity} ${b.unit}</span>
          ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="delBom(${b.id},${item.id},${rev.id})">✕</button>`}
        </div>`).join('')
        : '<div style="padding:12px;color:var(--t3);font-size:12px;text-align:center">Noch keine Positionen</div>'}
    </div>
    ${locked ? '' : `<button class="btn btn-ghost btn-sm" onclick="openBomModal(${rev.id},${item.project_id})">+ Position hinzufügen</button>`}
    ` : ''}

    ${(() => {
      const stls = (rev.datasets||[]).filter(d => dtClass(d.original_name, d.ds_type) === 'dt-STL');
      if (!stls.length) return '';
      const fUrl = API+'/api/datasets/'+stls[0].id+'/download';
      const sel = stls.length > 1
        ? '<select style="margin-left:auto;font-size:11px;background:var(--bg1);color:var(--t1);border:1px solid var(--line);border-radius:var(--r);padding:2px 6px" onchange="switchSTLViewer('+rev.id+', this.value)">'
          + stls.map(d => '<option value="'+API+'/api/datasets/'+d.id+'/download">'+esc(d.original_name)+'</option>').join('')+'</select>'
        : '';
      return '<div class="sep-label" style="margin-top:12px">3D Vorschau'+sel+'</div>'
        +'<div style="position:relative;width:100%;height:220px;border-radius:var(--r);overflow:hidden;margin-bottom:10px">'
        +'<canvas id="stl-c-'+rev.id+'" data-stl-url="'+fUrl+'" style="width:100%;height:100%;display:block;cursor:grab"></canvas>'
        +'<div id="stl-load-'+rev.id+'" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:var(--t3);font-size:12px;pointer-events:none">Lade…</div>'
        +'</div>';
    })()}

    <!-- Datasets -->
    <div class="sep-label" style="margin-top:12px">Dateien (Datasets)
      ${locked ? '<span style="font-size:10px;color:var(--t3);margin-left:auto;font-family:var(--mono)">&#128274; Gesperrt ('+rev.status+')</span>'
               : '<button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openUploadModal('+rev.id+',\''+item.item_number+'\',\''+rev.rev+'\')">+ Datei</button>'}
    </div>
    <div id="ds-list-${rev.id}">
      ${renderDatasets(rev.datasets||[], rev.id, locked)}
    </div>

    ${!isASM && !isDOC ? `
    <!-- Print settings -->
    <div class="sep-label" style="margin-top:12px">Druckparameter
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="openPsModal(${rev.id}, ${JSON.stringify(ps||{}).replace(/"/g,'&quot;')})">Bearbeiten</button>
    </div>
    ${ps && (ps.material||ps.layer_height||ps.printer_cost_hr) ? `
    <div class="ps-grid">
      ${ps.material?`<div class="ps-cell"><div class="ps-label">Material</div><div class="ps-val">${esc(ps.material)}</div></div>`:''}
      ${ps.color?`<div class="ps-cell"><div class="ps-label">Farbe</div><div class="ps-val">${esc(ps.color)}</div></div>`:''}
      ${ps.printer?`<div class="ps-cell"><div class="ps-label">Drucker</div><div class="ps-val">${esc(ps.printer)}</div></div>`:''}
      ${ps.layer_height?`<div class="ps-cell"><div class="ps-label">Layer</div><div class="ps-val">${ps.layer_height} mm</div></div>`:''}
      ${ps.infill?`<div class="ps-cell"><div class="ps-label">Infill</div><div class="ps-val">${ps.infill}%</div></div>`:''}
      ${ps.supports?`<div class="ps-cell"><div class="ps-label">Supports</div><div class="ps-val">${esc(ps.supports)}</div></div>`:''}
      ${ps.nozzle?`<div class="ps-cell"><div class="ps-label">Düse</div><div class="ps-val">${ps.nozzle} mm</div></div>`:''}
      ${ps.print_temp?`<div class="ps-cell"><div class="ps-label">Drucktemp</div><div class="ps-val">${ps.print_temp}°C</div></div>`:''}
      ${ps.bed_temp?`<div class="ps-cell"><div class="ps-label">Bett</div><div class="ps-val">${ps.bed_temp}°C</div></div>`:''}
      ${ps.print_duration?`<div class="ps-cell"><div class="ps-label">Druckdauer</div><div class="ps-val">${ps.print_duration} h</div></div>`:''}
      ${ps.filament_weight_total?`<div class="ps-cell"><div class="ps-label">Filament ges.</div><div class="ps-val">${ps.filament_weight_total} g</div></div>`:''}
    </div>
    ${(ps.printer_cost_hr||ps.filament_price_kg) ? (() => {
      const mat = ((ps.filament_weight_total||0)/1000)*(ps.filament_price_kg||0);
      const mach = (ps.print_duration||0)*(ps.printer_cost_hr||0);
      const total = mat+mach;
      return '<div class="cost-result" style="margin-top:8px">'
        +'<div style="font-size:10px;font-family:var(--mono);color:var(--t3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Kostenrechnung</div>'
        +(mat?'<div class="cost-row"><span>Materialkosten</span><span>'+fmtN(mat)+' CHF</span></div>':'')
        +(mach?'<div class="cost-row"><span>Maschinenkosten</span><span>'+fmtN(mach)+' CHF</span></div>':'')
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px">'
        +'<span style="font-size:11px;color:var(--t3)">Gesamt</span>'
        +'<span class="cost-total">'+fmtN(total)+' CHF</span></div></div>';
    })() : ''}
    ` : `<div style="color:var(--t3);font-size:12px">Noch keine Druckparameter hinterlegt.</div>`}
    ` : ''}

    <!-- Workflow -->
    <div class="wf-strip" style="margin-top:16px">
      <div class="wf-label">Freigabe-Workflow</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${wfBtns || '<span style="color:var(--t3);font-size:11px">Keine weiteren Aktionen möglich</span>'}
      </div>
    </div>

    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:6px">
      ${itemIsEditable(item)
        ? `<button class="btn btn-red btn-sm" onclick="deleteItem(${item.id})">🗑 Item löschen</button>`
        : `<span style="font-size:11px;color:var(--t3);font-family:var(--mono)">🔒 Löschen nur unter Einstellungen → Admin</span>`}
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

function renderDatasets(datasets, revId, locked) {
  if (!datasets.length) return `<div style="color:var(--t3);font-size:12px">Noch keine Dateien angehängt.</div>`;
  const groups = {};
  datasets.forEach(d => { (groups[d.ds_type] = groups[d.ds_type]||[]).push(d); });
  return Object.entries(groups).map(([type, files]) =>
    `<div style="margin-bottom:4px">
      ${files.map(f => `
        <div class="ds-row">
          <span class="ds-type ${dtClass(f.original_name, type)}">${fileLabel(f.original_name, type)}</span>
          <div class="ds-info">
            <div class="ds-name">${esc(f.original_name)}</div>
            <div class="ds-meta">v${f.version} · ${fmtSize(f.file_size)} · ${fmtDate(f.uploaded_at)}${f.notes?' · '+esc(f.notes):''}</div>
          </div>
          <a href="${API}/api/datasets/${f.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a>
          ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="openEditDatasetModal(${f.id},'${esc(f.original_name)}','${esc(f.notes||'')}')" title="Info bearbeiten">✏️</button>`}
          ${locked ? '' : `<button class="btn btn-icon btn-ghost btn-sm" onclick="delDataset(${f.id},${revId})" title="Loeschen">&#x2715;</button>`}
        </div>`).join('')}
    </div>`
  ).join('');
}

async function switchRev(itemId, revId) {
  state.activeRevId = revId;
  const item = await api(`/api/items/${itemId}`);
  state.item = item;
  renderItemDetail(item, revId);
}

// ── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard() {
  const today = new Date().toLocaleDateString('de-CH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  setLeftHeader('Dashboard', `<span style="font-size:11px;color:var(--t3);font-family:var(--mono)">${today}</span><button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="renderDashboard()">↺</button>`);
  closeDetail();
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px;opacity:.4">⏳</div><div class="empty-text" style="font-size:12px">Lade…</div></div>`);
  const [s, d, invItems] = await Promise.all([api('/api/stats'), api('/api/dashboard'), api('/api/inventory')]);

  const ostCls   = {DRAFT:'st-DFT',CONFIRMED:'st-REL',DELIVERED:'st-REV',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
  const ostLabel = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
  const qstCls   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
  const qstLabel = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
  const dstCls   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
  const dstLabel = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
  const stColors = {DFT:'var(--blue)',REV:'var(--amber)',REL:'var(--green)',ECO:'var(--purple)',OBS:'var(--t3)'};
  const itemIcon = t => _itemChip(t, 18);

  const invCritical = invItems.filter(i => i.min_qty > 0 && i.stock_qty < i.min_qty);
  const invWarn     = invItems.filter(i => i.min_qty > 0 && i.stock_qty === i.min_qty);
  const invLow      = [...invCritical, ...invWarn];
  const activeDeliveries = d.recentDeliveries.filter(x => x.status !== 'DELIVERED');

  // ── KPI tiles ──
  const kpiTile = (label, value, sub, accent, click) => `
    <div onclick="${click||''}" style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;cursor:${click?'pointer':'default'};transition:border-color .15s" onmouseover="this.style.borderColor='var(--line3)'" onmouseout="this.style.borderColor='var(--line)'">
      <div style="font-size:11px;color:var(--t3);margin-bottom:8px;display:flex;align-items:center;gap:5px">
        <span style="width:6px;height:6px;border-radius:50%;background:${accent};flex-shrink:0;display:inline-block"></span>
        ${label}
      </div>
      <div style="font-family:var(--mono);font-size:24px;font-weight:600;color:var(--t1);line-height:1;letter-spacing:-0.02em">${value}</div>
      ${sub ? `<div style="font-size:11px;color:var(--t3);margin-top:6px">${sub}</div>` : ''}
    </div>`;

  const confirmedOrders = d.openOrders.filter(o => o.status === 'CONFIRMED').length;
  const sentQuotes = d.openQuotes.filter(q => q.status === 'SENT').length;
  const invAlert = invCritical.length
    ? `<span style="color:var(--red)">${invCritical.length} kritisch</span>${invWarn.length ? ` · <span style="color:var(--amber)">${invWarn.length} Warnung</span>` : ''}`
    : invWarn.length ? `<span style="color:var(--amber)">${invWarn.length} auf Min.</span>` : '<span style="color:var(--green)">alles ok</span>';

  // Revenue tile wider than others
  const kpiHtml = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:24px">
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px">
        <div style="font-size:11px;color:var(--t3);margin-bottom:8px;display:flex;align-items:center;gap:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
          Umsatz
        </div>
        <div style="font-family:var(--mono);font-size:22px;font-weight:600;color:var(--t1);line-height:1;letter-spacing:-0.02em">${fmtCHF(d.revenueMonth||0)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:6px">diesen Monat · <span style="color:var(--t2)">${fmtCHF(d.revenueTotal||0)} gesamt</span></div>
      </div>
      ${kpiTile('Aufträge', d.openOrders.length, confirmedOrders + ' bestätigt', 'var(--blue)', "gotoView('orders')")}
      ${kpiTile('Angebote', d.openQuotes.length, sentQuotes + ' versendet', 'var(--teal)', "gotoView('quotes')")}
      ${kpiTile('Lieferungen', activeDeliveries.length, 'aktiv offen', 'var(--amber)', "gotoView('deliveries')")}
      ${kpiTile('Freigabe', d.inReview.length, 'warten auf REV', 'var(--purple)', '')}
      ${kpiTile('Lager', invLow.length || '—', invAlert, invCritical.length ? 'var(--red)' : invWarn.length ? 'var(--amber)' : 'var(--green)', "gotoView('inventory')")}
    </div>`;

  // ── Section header ──
  const sh = label => `<div style="font-family:var(--mono);font-size:9.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--t4);font-weight:500;padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:8px">${label}</div>`;
  const emptyRow = msg => `<div style="color:var(--t3);font-size:12px;padding:10px 0">${msg}</div>`;

  // ── Aufträge ──
  const ordersHtml = d.openOrders.length ? d.openOrders.map(o => `
    <div onclick="gotoView('orders')" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${ostCls[o.status]||'st-DFT'}" style="flex-shrink:0">${ostLabel[o.status]||o.status}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.title)}</div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:1px">${o.number} · ${esc(o.customer_name||'—')}${o.delivery_date?' · '+o.delivery_date.slice(0,10):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:11.5px;color:var(--t1)">${fmtCHF(o.total||0)}</div>
        <div style="font-size:10px;color:var(--t4);margin-top:1px">${o.item_count} Pos.</div>
      </div>
    </div>`).join('') : emptyRow('Keine offenen Aufträge');

  // ── Angebote ──
  const quotesHtml = d.openQuotes.length ? d.openQuotes.map(q => `
    <div onclick="gotoView('quotes')" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${qstCls[q.status]||'st-DFT'}" style="flex-shrink:0">${qstLabel[q.status]||q.status}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}</div>
        <div style="font-size:10.5px;color:var(--t3);margin-top:1px">${q.number} · ${esc(q.customer_name||'—')}${q.valid_until?' · bis '+q.valid_until.slice(0,10):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:11.5px;color:var(--t1)">${fmtCHF(q.total||0)}</div>
        <div style="font-size:10px;color:var(--t4);margin-top:1px">${q.item_count} Pos.</div>
      </div>
    </div>`).join('') : emptyRow('Keine offenen Angebote');

  // ── Freigabe ──
  const reviewHtml = d.inReview.length ? d.inReview.map(r => `
    <div onclick="gotoPlmItem(${r.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:22px;height:22px;border-radius:var(--r-xs);background:var(--amber-soft);display:grid;place-items:center;flex-shrink:0">
        <span style="font-size:11px">${itemIcon(r.item_type)}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:1px;font-family:var(--mono)">${r.item_number} · ${esc(r.project_number)}</div>
      </div>
      <span class="status st-REV">rev${r.rev}</span>
    </div>`).join('') : emptyRow('Keine Items in Prüfung');

  // ── Fällige Lieferscheine ──
  const todayIso = new Date().toISOString().slice(0,10);
  const dueSoon = d.dueSoon || [];
  const dueSoonHtml = dueSoon.length ? dueSoon.map(ls => {
    const daysLeft = Math.round((new Date(ls.delivery_date) - new Date(todayIso)) / 86400000);
    const urgent = daysLeft <= 3;
    const color = daysLeft < 0 ? 'var(--red)' : urgent ? 'var(--amber)' : 'var(--t2)';
    const label = daysLeft < 0 ? `${Math.abs(daysLeft)}d überfällig` : daysLeft === 0 ? 'Heute' : `in ${daysLeft}d`;
    return `<div onclick="gotoView('deliveries');openDeliveryDetail(${ls.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ls.title)}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:1px">${ls.number} · ${esc(ls.customer_name||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:11px;font-weight:600;color:${color}">${label}</div>
        <div style="font-size:10px;color:var(--t4)">${ls.delivery_date}</div>
      </div>
    </div>`;
  }).join('') : emptyRow('Keine Lieferscheine fällig in 14 Tagen');

  // ── Ablaufende Angebote ──
  const quotesExpiring = d.quotesExpiring || [];
  const quotesExpHtml = quotesExpiring.length ? quotesExpiring.map(q => {
    const daysLeft = Math.round((new Date(q.valid_until) - new Date(todayIso)) / 86400000);
    const color = daysLeft < 0 ? 'var(--red)' : daysLeft <= 3 ? 'var(--amber)' : 'var(--t3)';
    const label = daysLeft < 0 ? 'Abgelaufen' : daysLeft === 0 ? 'Heute' : `in ${daysLeft}d`;
    return `<div onclick="gotoView('quotes');openQuoteDetail(${q.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:1px">${q.number} · ${esc(q.customer_name||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:11px;font-weight:600;color:${color}">${label}</div>
        <div style="font-family:var(--mono);font-size:10px;color:var(--t3)">${fmtCHF(q.total||0)}</div>
      </div>
    </div>`;
  }).join('') : emptyRow('Keine Angebote laufen in 14 Tagen ab');

  // ── Produktion ──
  const grouped = {};
  d.inProduction.forEach(x => {
    if (!grouped[x.delivery_id]) grouped[x.delivery_id] = { number: x.delivery_number, status: x.delivery_status, customer: x.customer_name, items: [] };
    grouped[x.delivery_id].items.push(x);
  });
  const prodHtml = Object.values(grouped).length ? Object.values(grouped).map(g => `
    <div style="border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3)">
        <span class="status ${dstCls[g.status]||'st-DFT'}">${dstLabel[g.status]||g.status}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${g.number}</span>
        <span style="font-size:11px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.customer||'—')}</span>
      </div>
      ${g.items.map(x => `
        <div onclick="openProject(${x.project_id})" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
          <span style="font-family:var(--mono);font-size:10px;color:var(--blue);flex-shrink:0">${x.item_number||'—'}</span>
          <span style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)">${esc(x.description)}</span>
          <span style="font-size:11px;color:var(--t3);flex-shrink:0;font-family:var(--mono)">${x.quantity} ${x.unit}</span>
        </div>`).join('')}
    </div>`).join('') : emptyRow('Keine aktive Produktion');

  // ── PLM Status-Verteilung ──
  const total = s.assemblies + s.parts || 1;
  const statusHtml = `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${s.by_status.map(st => `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status st-${st.status}" style="width:34px;justify-content:center">${st.status}</span>
          <div style="flex:1;height:3px;background:var(--line);border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(st.count/total*100)}%;height:100%;background:${stColors[st.status]||'var(--t3)'};border-radius:2px"></div>
          </div>
          <span style="font-family:var(--mono);font-size:11px;color:var(--t2);width:22px;text-align:right">${st.count}</span>
        </div>`).join('')}
      <div style="font-size:10px;color:var(--t3);margin-top:4px;text-align:right">${s.assemblies} Baugruppen · ${s.parts} Parts · ${s.projects} Projekte</div>
    </div>`;

  // ── Lager-Warnungen ──
  const invLowHtml = invLow.length ? invLow.map(i => {
    const isCritical = i.stock_qty < i.min_qty;
    const col = isCritical ? 'var(--red)' : 'var(--amber)';
    return `<div onclick="gotoView('inventory');openInventoryDetail(${i.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name)}${i.color?` <span style="color:var(--t3);font-weight:400;font-size:11px">${esc(i.color)}</span>`:''}${i.material?` <span style="color:var(--t3);font-weight:400;font-size:11px">${esc(i.material)}</span>`:''}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:1px">${esc(i.category)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:12px;color:${col};font-weight:600">${fmtN(i.stock_qty,1)} <span style="font-size:10px;font-weight:400">${i.unit}</span></div>
        <div style="font-size:10px;color:var(--t4);margin-top:1px">Min ${fmtN(i.min_qty,1)}</div>
      </div>
    </div>`;
  }).join('') : `<div style="display:flex;align-items:center;gap:8px;padding:10px;color:var(--green);font-size:12px">
    <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
    Alle Artikel über Mindestbestand
  </div>`;

  setLeftBody(`<div style="max-width:1100px;padding-bottom:24px">

    ${kpiHtml}

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">

      <!-- Spalte 1 -->
      <div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Offene Aufträge')}</div>
          <div style="padding:0 4px 8px">${ordersHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('Offene Angebote')}</div>
          <div style="padding:0 4px 8px">${quotesHtml}</div>
        </div>
      </div>

      <!-- Spalte 2 -->
      <div>
        <div style="background:var(--bg1);border:1px solid ${dueSoon.length ? 'var(--amber-line)' : 'var(--line)'};border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Fällige Lieferscheine'+(dueSoon.length?` <span style="color:var(--amber)">${dueSoon.length}</span>`:''))}</div>
          <div style="padding:0 4px 8px">${dueSoonHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid ${quotesExpiring.length ? 'var(--red-line)' : 'var(--line)'};border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Ablaufende Angebote'+(quotesExpiring.length?` <span style="color:var(--red)">${quotesExpiring.length}</span>`:''))}</div>
          <div style="padding:0 4px 8px">${quotesExpHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('Lager — Warnungen')}</div>
          <div style="padding:0 4px 8px">${invLowHtml}</div>
        </div>
      </div>

      <!-- Spalte 3 -->
      <div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Aktive Produktion')}</div>
          <div style="padding:8px 10px">${prodHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Freigabe-Pipeline')}</div>
          <div style="padding:0 4px 8px">${reviewHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('PLM Status')}</div>
          <div style="padding:8px 14px 14px">${statusHtml}</div>
        </div>
      </div>

    </div>
  </div>`);
}

// ── CHANGELOG ─────────────────────────────────────────────────
let _changelogRows = [];
function exportChangelog() {
  if (!_changelogRows.length) { toast('Keine Daten zum Exportieren','warn'); return; }
  const header = ['Datum','Zeit','Typ','Referenz','Bezeichnung','Aktion','Details'];
  const csvRows = _changelogRows.map(r => {
    const dt = r.created_at ? r.created_at.replace('T',' ').slice(0,19) : '';
    const date = dt.slice(0,10); const time = dt.slice(11,16);
    return [date, time, r.entity_type||'', r.ref||'', r.label||'', r.action||'', r.details||''];
  });
  const csv = [header, ...csvRows].map(row => row.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'changelog-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
async function renderChangelog() {
  setLeftHeader('Changelog', `
    <button class="btn btn-ghost btn-sm" onclick="renderChangelog()">↺ Aktualisieren</button>
    <button class="btn btn-ghost btn-sm" onclick="exportChangelog()">&#x2B07; CSV</button>`);
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px">⏳</div><div class="empty-text">Lade…</div></div>`);
  const rows = await api('/api/changelog?limit=2000');
  _changelogRows = rows;
  if (!rows.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Noch keine Einträge</div></div>`);
    return;
  }
  const actionIcon = a => {
    if (a.includes('Added') || a.includes('angelegt') || a.includes('Created')) return '✚';
    if (a.includes('Deleted') || a.includes('gelöscht') || a.includes('Entfernt')) return '✕';
    if (a.includes('Status')) return '⇄';
    if (a.includes('ECO')) return '⚡';
    if (a.includes('BOM')) return '📋';
    if (a.includes('Druckparameter')) return '🖨';
    if (a.includes('Updated') || a.includes('gespeichert')) return '✏';
    return '·';
  };
  const typeColor = t => ({item:'var(--blue)',revision:'var(--teal)',project:'var(--amber)'}[t]||'var(--t3)');
  const itemTypeIcon = t => _itemChip(t, 16);

  // Group by date
  const byDate = {};
  rows.forEach(r => {
    const d = r.created_at ? r.created_at.split('T')[0].split(' ')[0] : '?';
    (byDate[d] = byDate[d]||[]).push(r);
  });

  const html = Object.entries(byDate).map(([date, entries]) => `
    <div style="margin-bottom:18px">
      <div style="font-family:var(--mono);font-size:10px;color:var(--t3);letter-spacing:1px;text-transform:uppercase;padding:4px 0;border-bottom:1px solid var(--line);margin-bottom:6px">${date}</div>
      ${entries.map(r => `
        <div style="display:flex;gap:10px;padding:7px 6px;border-radius:var(--r);transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          <div style="width:18px;text-align:center;flex-shrink:0;font-size:13px;margin-top:1px">${actionIcon(r.action)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:12px;font-weight:500">${esc(r.action)}</span>
              ${r.ref ? `<span style="font-family:var(--mono);font-size:10px;color:var(--blue);cursor:pointer" onclick="${r.project_id?'openProject('+r.project_id+')':''}">${itemTypeIcon(r.item_type)} ${esc(r.ref)}</span>` : ''}
            </div>
            ${r.details ? `<div style="font-size:11px;color:var(--t3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px">${esc(r.details)}</div>` : ''}
            ${r.label ? `<div style="font-size:11px;color:var(--t2);margin-top:1px">${esc(r.label)}</div>` : ''}
          </div>
          <div style="font-family:var(--mono);font-size:9px;color:var(--t3);flex-shrink:0;white-space:nowrap;margin-top:2px">${r.created_at ? new Date(r.created_at).toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
        </div>`).join('')}
    </div>`).join('');

  setLeftBody(`<div style="padding-bottom:20px">${html}</div>`);
}

// ── SETTINGS ──────────────────────────────────────────────────
function _stTab(name) {
  document.querySelectorAll('.st-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.st-tab-pane').forEach(p => p.hidden = p.dataset.tab !== name);
}

async function renderSettings() {
  setLeftHeader('Einstellungen', `<button class="btn btn-primary btn-sm" onclick="saveSettings()">💾 Speichern</button>`);
  closeDetail();
  const s = state.settings;
  const fi = (id, label, val, ph='', type='text') =>
    `<div class="fg"><label class="fl">${label}</label><input class="fi" id="st-${id}" type="${type}" value="${esc(val||'')}" placeholder="${ph}"></div>`;
  const ft = (id, label, val, ph='') =>
    `<div class="fg"><label class="fl">${label}</label><textarea class="ft" id="st-${id}" rows="2" placeholder="${ph}">${esc(val||'')}</textarea></div>`;
  const fck = (id, label, val) =>
    `<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;color:var(--t2)"><input type="checkbox" id="st-${id}" ${val !== '0' ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">${label}</label>`;

  setLeftBody(`
    <div style="max-width:720px">
      <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:20px">
        <button class="st-tab-btn active" data-tab="firma"   onclick="_stTab('firma')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Firma</button>
        <button class="st-tab-btn"        data-tab="kalk"    onclick="_stTab('kalk')"    style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Kalkulation</button>
        <button class="st-tab-btn"        data-tab="bon"     onclick="_stTab('bon')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Kassabon</button>
        <button class="st-tab-btn"        data-tab="druck3d" onclick="_stTab('druck3d')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">3D-Druck</button>
        <button class="st-tab-btn"        data-tab="plm"     onclick="_stTab('plm')"     style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">PLM</button>
        <button class="st-tab-btn"        data-tab="daten"   onclick="_stTab('daten')"   style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--t2);border-bottom:2px solid transparent;margin-bottom:-1px">Daten</button>
        <button class="st-tab-btn"        data-tab="loeschen" onclick="_stTab('loeschen')" style="background:none;border:none;padding:8px 16px;cursor:pointer;font-size:13px;color:var(--red);border-bottom:2px solid transparent;margin-bottom:-1px">Admin</button>
      </div>

      <!-- TAB: Firma -->
      <div class="st-tab-pane" data-tab="firma">
        <div class="sep-label" style="margin-top:0">Firma / Briefkopf</div>
        <div class="form-row cols2">
          ${fi('company_name','Firmenname *',s.company_name,'Muster GmbH')}
          ${fi('company_uid','UID / MwSt-Nr.',s.company_uid,'CHE-123.456.789 MWST')}
        </div>
        <div class="form-row">
          ${fi('company_street','Straße + Hausnummer',s.company_street,'Industriestraße 42')}
        </div>
        <div class="form-row cols3">
          ${fi('company_postal_code','PLZ',s.company_postal_code,'8000')}
          ${fi('company_city','Ort',s.company_city,'Zürich')}
          ${fi('company_country','Land',s.company_country,'Schweiz')}
        </div>
        <div class="form-row cols3">
          ${fi('company_phone','Telefon',s.company_phone,'+41 44 000 00 00')}
          ${fi('company_email','E-Mail',s.company_email,'info@firma.ch','email')}
          ${fi('company_website','Website',s.company_website,'www.firma.ch')}
        </div>
        <div class="sep-label">Bankangaben</div>
        <div class="form-row cols3">
          ${fi('bank_name','Bank',s.bank_name,'Zürcher Kantonalbank')}
          ${fi('bank_iban','IBAN',s.bank_iban,'CH00 0000 0000 0000 0000 0')}
          ${fi('bank_bic','BIC / SWIFT',s.bank_bic,'ZKBKCHZZ80A')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: Kalkulation -->
      <div class="st-tab-pane" data-tab="kalk" hidden>
        <div class="sep-label" style="margin-top:0">Standardwerte</div>
        <div class="form-row cols3">
          ${fi('default_tax_rate','Standard MwSt. (%)',s.default_tax_rate,'','number')}
          ${fi('quote_validity_days','Angebot gültig (Tage)',s.quote_validity_days,'','number')}
          ${fi('default_payment_terms','Zahlungsbedingungen',s.default_payment_terms,'30 Tage netto')}
        </div>
        <div class="form-row cols3">
          ${fi('hourly_rate','Stundensatz (CHF/h)',s.hourly_rate,'z.B. 120','number')}
          ${fi('default_filament_price_kg','Filamentpreis (CHF/kg)',s.default_filament_price_kg,'','number')}
          ${fi('default_machine_cost_hr','Maschinenkosten (CHF/h)',s.default_machine_cost_hr,'','number')}
        </div>
        <div class="sep-label">Dokument-Fussnoten</div>
        <div class="form-row">
          ${ft('invoice_footer','Fusszeile Rechnung',s.invoice_footer,'Zahlungshinweis, Bankverbindung …')}
        </div>
        <div class="form-row">
          ${ft('quote_footer','Fusszeile Angebot',s.quote_footer,'Hinweis Gültigkeit, Lieferbedingungen …')}
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: Kassabon -->
      <div class="st-tab-pane" data-tab="bon" hidden>
        <div class="sep-label" style="margin-top:0">Fusszeile</div>
        <div class="form-row">
          ${ft('receipt_footer','Fusszeile Kassabon',s.receipt_footer,'z.B. Vielen Dank für Ihren Auftrag!')}
        </div>
        <div class="sep-label">Bon-Aufbau</div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px">
          <div class="form-row cols2" style="margin-bottom:8px">
            ${fi('receipt_line_width','Zeilenbreite (Zeichen)',s.receipt_line_width,'32','number')}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">
            ${fck('receipt_show_datetime','Datum &amp; Uhrzeit anzeigen',s.receipt_show_datetime)}
            ${fck('receipt_show_customer','Kundenname anzeigen',s.receipt_show_customer)}
            ${fck('receipt_show_item_number','Artikelnummer anzeigen',s.receipt_show_item_number)}
            ${fck('receipt_show_notes','Notizen anzeigen',s.receipt_show_notes)}
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary" onclick="saveSettings()">💾 Speichern</button>
        </div>
      </div>

      <!-- TAB: 3D-Druck -->
      <div class="st-tab-pane" data-tab="druck3d" hidden>
        <div class="sep-label" style="margin-top:0">Drucker</div>
        <div id="st-printers-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input class="fi" id="st-pr-name" style="width:200px" placeholder="Druckername">
          <input class="fi" id="st-pr-cost" type="number" step="0.01" style="width:110px" placeholder="CHF/h (z.B. 1.50)">
          <button class="btn btn-ghost btn-sm" onclick="addPrinter()">+ Drucker hinzufügen</button>
        </div>

        <div class="sep-label" style="margin-top:20px">Düsen</div>
        <div id="st-nozzles-list" style="margin-bottom:8px"></div>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="fi" id="st-nz-size" style="width:120px" placeholder="Grösse (z.B. 0.4)">
          <button class="btn btn-ghost btn-sm" onclick="addNozzle()">+ Düse hinzufügen</button>
        </div>

        <div class="sep-label" style="margin-top:20px">Material-Vorlagen</div>
        <div id="st-mats-list" style="margin-bottom:8px"></div>
        <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:12px;margin-top:4px">
          <div class="form-row cols3">
            <div class="fg"><label class="fl">Name *</label><input class="fi" id="st-mat-name" placeholder="z.B. PLA"></div>
            <div class="fg"><label class="fl">Düse</label>
              <select class="fs" id="st-mat-nozzle"><option value="">—</option></select>
            </div>
            <div class="fg"><label class="fl">Filamentpreis (CHF/kg)</label><input class="fi" id="st-mat-price" type="number" step="0.01" placeholder="22.00"></div>
          </div>
          <div class="form-row cols3">
            <div class="fg"><label class="fl">Drucktemp (°C)</label><input class="fi" id="st-mat-temp" placeholder="210"></div>
            <div class="fg"><label class="fl">Bett (°C)</label><input class="fi" id="st-mat-bed" placeholder="60"></div>
            <div class="fg"><label class="fl">Notizen</label><input class="fi" id="st-mat-notes" placeholder="optional"></div>
          </div>
          <input type="hidden" id="st-mat-id" value="">
          <button class="btn btn-ghost btn-sm" id="st-mat-add-btn" onclick="addMaterialPreset()">+ Vorlage hinzufügen</button>
        </div>
      </div>

      <!-- TAB: PLM -->
      <div class="st-tab-pane" data-tab="plm" hidden>
        <div class="sep-label" style="margin-top:0">Klassifizierungen</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:12px">Verfügbare Klassifizierungen für Bauteile, Baugruppen und Dokumente. Reihenfolge per Drag &amp; Drop ändern.</div>
        <div id="st-class-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fi" id="st-class-new" placeholder="Neue Klassifizierung…" style="max-width:240px" onkeydown="if(event.key==='Enter')_addClass()">
          <button class="btn btn-ghost btn-sm" onclick="_addClass()">+ Hinzufügen</button>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-primary btn-sm" onclick="_saveClassifications()">Speichern</button>
          <span id="st-class-msg" style="font-size:12px;color:var(--t3);margin-left:8px"></span>
        </div>
      </div>

      <!-- TAB: Daten -->
      <div class="st-tab-pane" data-tab="daten" hidden>
        <div class="sep-label" style="margin-top:0">Datenpfad</div>
        <div id="st-datapath-info" style="font-size:12px;color:var(--t3);margin-bottom:10px">Lädt aktuelle Pfade…</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">Datenverzeichnis (Datenbank + Dateien)</label>
            <input class="fi" id="st-data-dir" placeholder="/absoluter/pfad/zum/datenverzeichnis">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveDataPath()">Pfad speichern</button>
          <span id="st-datapath-msg" style="font-size:12px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:20px">CAD-Programm</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:8px">Pfad zur ausführbaren Datei des CAD-Programms. Wird über den CAD-Button in der Topbar gestartet.</div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">CAD-Pfad</label>
            <input class="fi" id="st-cad-path" placeholder="z.B. /usr/bin/solidedge oder C:\\Program Files\\...">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveCadPath()">Pfad speichern</button>
          <span id="st-cad-msg" style="font-size:12px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:20px">Checkout-Verzeichnis</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:8px">Ordner, in den ausgecheckte CAD-Dateien kopiert werden. Leer lassen für Standard: <code style="font-family:var(--mono)">[Datenverzeichnis]/checkout</code></div>
        <div class="form-row">
          <div class="fg">
            <label class="fl">Checkout-Pfad</label>
            <input class="fi" id="st-checkout-dir" placeholder="z.B. /home/user/CAD-Checkout">
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
          <button class="btn btn-ghost btn-sm" onclick="saveCheckoutDir()">Pfad speichern</button>
          <span id="st-checkout-msg" style="font-size:12px;color:var(--t3)"></span>
        </div>

        <div class="sep-label" style="margin-top:24px">Datensicherung</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:10px">Lädt alle PLM-Daten (Datenbank + hochgeladene Dateien) als ZIP-Archiv herunter.</div>
        <div style="display:flex;gap:8px">
          <a class="btn btn-ghost" href="/api/export" download>&#x1F4E6; Gesamtexport herunterladen</a>
        </div>

        <div class="sep-label" style="margin-top:24px">Datei-Index</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:10px">Übersicht aller gespeicherten Dateien mit angezeigtem Namen und tatsächlichem Dateinamen auf der Festplatte (Notfall-Referenz).</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="gotoView('fileindex')">&#x1F4C2; Datei-Index öffnen</button>
        </div>
      </div>

      <!-- TAB: Admin -->
      <div class="st-tab-pane" data-tab="loeschen" hidden>
        <div style="background:var(--red-soft);border:1px solid var(--red-line);border-radius:var(--r);padding:10px 14px;margin-bottom:20px;font-size:12px;color:var(--red)">
          ⚠ Änderungen hier können bestehende Daten und Nummernkreise dauerhaft beschädigen. Nur vornehmen wenn du weisst was du tust.
        </div>

        <div class="sep-label" style="margin-top:0;color:var(--red)">Datensätze löschen</div>
        <div style="display:flex;gap:2px;border-bottom:1px solid var(--line);margin-bottom:14px">
          <button class="adm-del-tab active" data-deltab="teile"    onclick="_admDelTab('teile')"    style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:12px;color:var(--red);border-bottom:2px solid var(--red);margin-bottom:-1px;font-weight:600">Teile</button>
          <button class="adm-del-tab"        data-deltab="projekte" onclick="_admDelTab('projekte')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:12px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">Projekte</button>
          <button class="adm-del-tab"        data-deltab="auftraege" onclick="_admDelTab('auftraege')" style="background:none;border:none;padding:6px 14px;cursor:pointer;font-size:12px;color:var(--t3);border-bottom:2px solid transparent;margin-bottom:-1px">Aufträge</button>
        </div>
        <div id="adm-del-teile">
          <div style="font-size:12px;color:var(--t3);margin-bottom:6px">Freigegebene (REL/OBS) Bauteile, Baugruppen und Dokumente</div>
          <div id="st-del-items" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-projekte" style="display:none">
          <div style="font-size:12px;color:var(--t3);margin-bottom:6px">Projekte mit Inhalten (Items, Dateien)</div>
          <div id="st-del-projects" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>
        <div id="adm-del-auftraege" style="display:none">
          <div style="font-size:12px;color:var(--t3);margin-bottom:6px">Aufträge (nicht Entwurf)</div>
          <div id="st-del-orders" style="display:flex;flex-direction:column;gap:4px"></div>
          <div style="font-size:12px;color:var(--t3);margin:10px 0 6px">Angebote (nicht Entwurf)</div>
          <div id="st-del-quotes" style="display:flex;flex-direction:column;gap:4px"></div>
        </div>

        <div class="sep-label" style="margin-top:28px">Nummernpräfixe</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:12px">Präfixe für neu erstellte Datensätze. Bestehende Nummern werden <b>nicht</b> geändert.</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Aufträge</label><input class="fi" id="adm-prefix-order" placeholder="AUF"></div>
          <div class="fg"><label class="fl">Angebote</label><input class="fi" id="adm-prefix-quote" placeholder="ANG"></div>
          <div class="fg"><label class="fl">Lieferscheine</label><input class="fi" id="adm-prefix-delivery" placeholder="LS"></div>
          <div class="fg"><label class="fl">Kunden</label><input class="fi" id="adm-prefix-customer" placeholder="KD"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">Stellen Geschäftsnummern</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Aufträge</label><input class="fi" id="adm-pad-order" type="number" min="1" max="8" placeholder="4"></div>
          <div class="fg"><label class="fl">Angebote</label><input class="fi" id="adm-pad-quote" type="number" min="1" max="8" placeholder="4"></div>
          <div class="fg"><label class="fl">Lieferscheine</label><input class="fi" id="adm-pad-delivery" type="number" min="1" max="8" placeholder="4"></div>
          <div class="fg"><label class="fl">Kunden</label><input class="fi" id="adm-pad-customer" type="number" min="1" max="8" placeholder="4"></div>
          <div class="fg"><label class="fl">Projekte</label><input class="fi" id="adm-pad-project" type="number" min="1" max="8" placeholder="4"></div>
          <div class="fg" style="display:flex;align-items:center;gap:10px;padding-top:20px">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:12px;color:var(--t2)">
              <input type="checkbox" id="adm-num-yearly" style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
              Jahreszahl in Nummer
            </label>
          </div>
        </div>

        <div class="sep-label" style="margin-top:20px">Struktur Item-Nummern</div>
        <div style="font-size:12px;color:var(--t3);margin-bottom:10px">Gilt nur für <b>neu erstellte</b> Items. Bestehende Nummern werden nicht geändert.</div>
        <div class="form-row cols2">
          <div class="fg"><label class="fl">Trennzeichen</label><input class="fi" id="adm-num-sep" placeholder="-" maxlength="3"></div>
          <div class="fg"><label class="fl">Stellen Baugruppe</label><input class="fi" id="adm-pad-asm" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Stellen Part</label><input class="fi" id="adm-pad-prt" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Stellen Dokument</label><input class="fi" id="adm-pad-doc" type="number" min="1" max="6" placeholder="3"></div>
          <div class="fg"><label class="fl">Baugruppen-Kürzel</label><input class="fi" id="adm-seg-asm" placeholder="asm" maxlength="10"></div>
          <div class="fg"><label class="fl">Part-Kürzel</label><input class="fi" id="adm-seg-prt" placeholder="prt" maxlength="10"></div>
          <div class="fg"><label class="fl">Dokument-Kürzel</label><input class="fi" id="adm-seg-doc" placeholder="doc" maxlength="10"></div>
        </div>

        <div class="sep-label" style="margin-top:20px">Revisionen</div>
        <div class="form-row">
          <div class="fg"><label class="fl">Format</label>
            <select class="fs" id="adm-rev-format">
              <option value="num">Numerisch (1, 2, 3 …)</option>
              <option value="letter">Buchstaben (A, B, C …)</option>
            </select>
          </div>
        </div>

        <div style="font-size:11px;color:var(--t3);margin-top:14px;font-family:var(--mono);line-height:2;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px" id="adm-preview"></div>

        <div style="margin-top:16px">
          <button class="btn btn-red" onclick="saveAdminSettings()">⚠ Admin-Einstellungen speichern</button>
        </div>
      </div>

    </div>`);

  // active tab styling
  document.querySelectorAll('.st-tab-btn').forEach(b => {
    b.addEventListener('mouseenter', () => { if (!b.classList.contains('active')) b.style.color = 'var(--t1)'; });
    b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.color = 'var(--t2)'; });
  });
  const styleActiveTabs = () => document.querySelectorAll('.st-tab-btn').forEach(b => {
    const isLoeschen = b.dataset.tab === 'loeschen';
    const activeColor = isLoeschen ? 'var(--red)' : 'var(--blue)';
    const inactiveColor = isLoeschen ? 'var(--red)' : 'var(--t2)';
    b.style.color = b.classList.contains('active') ? activeColor : inactiveColor;
    b.style.borderBottomColor = b.classList.contains('active') ? activeColor : 'transparent';
    b.style.fontWeight = b.classList.contains('active') ? '600' : '400';
  });
  styleActiveTabs();
  document.querySelectorAll('.st-tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      styleActiveTabs();
      if (b.dataset.tab === 'loeschen') _loadDelTab();
      if (b.dataset.tab === 'plm') _loadPlmTab();
    });
  });

  loadAndRenderPrinterConfig();
  api('/api/data-path').then(d => {
    document.getElementById('st-datapath-info').innerHTML =
      `DB: <code style="user-select:all">${d.db_path}</code><br>Dateien: <code style="user-select:all">${d.files_dir}</code>`;
    document.getElementById('st-data-dir').value = d.data_dir;
  });
  api('/api/settings').then(s => {
    const el = document.getElementById('st-checkout-dir');
    if (el) el.value = s.checkout_dir || '';
    const ec = document.getElementById('st-cad-path');
    if (ec) ec.value = s.cad_path || '';
  });
}

async function saveCadPath() {
  const val = document.getElementById('st-cad-path')?.value.trim() || '';
  await api('/api/settings', 'PUT', { cad_path: val });
  const msg = document.getElementById('st-cad-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  state.settings = await api('/api/settings');
  const btn = document.getElementById('tb-cad-btn');
  if (btn) btn.style.display = val ? '' : 'none';
}

async function launchCad() {
  const path = state.settings?.cad_path;
  if (!path) { toast('Kein CAD-Pfad konfiguriert — bitte unter Einstellungen → System hinterlegen', 'err'); return; }
  try {
    await api('/api/launch-cad', 'POST');
    toast('CAD wird gestartet…', 'ok');
  } catch(e) { toast('CAD konnte nicht gestartet werden', 'err'); }
}

async function saveCheckoutDir() {
  const val = document.getElementById('st-checkout-dir')?.value.trim() || '';
  await api('/api/settings', 'PUT', { checkout_dir: val });
  const msg = document.getElementById('st-checkout-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => { msg.textContent = ''; }, 2000); }
  state.settings = await api('/api/settings');
}

async function saveSettings() {
  const keys = ['company_name','company_uid','company_street','company_postal_code','company_city',
    'company_country','company_phone','company_email','company_website',
    'bank_name','bank_iban','bank_bic',
    'default_tax_rate','quote_validity_days','default_payment_terms',
    'default_filament_price_kg','default_machine_cost_hr','hourly_rate',
    'invoice_footer','quote_footer','receipt_footer','receipt_line_width','checkout_dir'];
  const checkboxKeys = ['receipt_show_datetime','receipt_show_customer','receipt_show_item_number','receipt_show_notes'];
  const body = {};
  keys.forEach(k => {
    const el = document.getElementById('st-' + k);
    if (el) body[k] = el.value;
  });
  checkboxKeys.forEach(k => {
    const el = document.getElementById('st-' + k);
    if (el) body[k] = el.checked ? '1' : '0';
  });
  state.settings = await api('/api/settings','PUT',body);
  toast('Einstellungen gespeichert','ok');
}

async function saveDataPath() {
  const input = document.getElementById('st-data-dir');
  const msg   = document.getElementById('st-datapath-msg');
  if (!input || !input.value.trim()) return;
  try {
    const r = await api('/api/data-path', 'PUT', { data_dir: input.value.trim() });
    msg.textContent = r.message;
    msg.style.color = 'var(--green)';
  } catch(e) {
    msg.textContent = 'Fehler beim Speichern';
    msg.style.color = 'var(--red)';
  }
}

// ── PRINTER / NOZZLE / MATERIAL SETTINGS ──────────────────────
async function loadAndRenderPrinterConfig() {
  [state.printers, state.nozzles, state.materialPresets] = await Promise.all([
    api('/api/printers'), api('/api/nozzles'), api('/api/material-presets')
  ]);
  state._psConfigLoaded = true;
  _renderPrinterList(); _renderNozzleList(); _renderMatList();
  // populate nozzle select in material form
  const nzSel = document.getElementById('st-mat-nozzle');
  if (nzSel) nzSel.innerHTML = '<option value="">—</option>' +
    state.nozzles.map(n=>`<option value="${n.size}">${n.size} mm</option>`).join('');
}
function _renderPrinterList() {
  const el = document.getElementById('st-printers-list'); if (!el) return;
  el.innerHTML = state.printers.length ? state.printers.map(p => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);margin-bottom:4px">
      <span style="flex:1;font-weight:500">${esc(p.name)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--t3)">${p.cost_per_hour} CHF/h</span>
      <button class="btn btn-icon btn-ghost btn-sm" onclick="editPrinter(${p.id},'${esc(p.name)}',${p.cost_per_hour})">✏️</button>
      <button class="btn btn-icon btn-red btn-sm" onclick="delPrinter(${p.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--t3);font-size:12px;padding:4px 0">Noch keine Drucker hinterlegt.</div>';
}
function _renderNozzleList() {
  const el = document.getElementById('st-nozzles-list'); if (!el) return;
  el.innerHTML = state.nozzles.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">` +
    state.nozzles.map(n => `<div style="display:inline-flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:3px 10px;font-size:12px">
      <span>${n.size} mm</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;width:14px;height:14px;font-size:10px" onclick="delNozzle(${n.id})">✕</button>
    </div>`).join('') + '</div>' : '<div style="color:var(--t3);font-size:12px;padding:4px 0">Noch keine Düsen hinterlegt.</div>';
}
function _renderMatList() {
  const el = document.getElementById('st-mats-list'); if (!el) return;
  el.innerHTML = state.materialPresets.length ? state.materialPresets.map(m => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);margin-bottom:4px">
      <span style="font-weight:500;min-width:60px">${esc(m.name)}</span>
      <span style="font-family:var(--mono);font-size:11px;color:var(--t3)">${[m.print_temp&&m.print_temp+'°C',m.bed_temp&&'Bett '+m.bed_temp+'°C',m.nozzle&&m.nozzle+' mm',m.filament_price_kg&&m.filament_price_kg+' CHF/kg'].filter(Boolean).join(' · ')}</span>
      <button class="btn btn-icon btn-ghost btn-sm" style="margin-left:auto" onclick="editMaterialPreset(${m.id})">✏️</button>
      <button class="btn btn-icon btn-red btn-sm" onclick="delMaterialPreset(${m.id})">✕</button>
    </div>`).join('') : '<div style="color:var(--t3);font-size:12px;padding:4px 0">Noch keine Vorlagen hinterlegt.</div>';
}
async function addPrinter() {
  const name = document.getElementById('st-pr-name').value.trim();
  const cost = parseFloat(document.getElementById('st-pr-cost').value)||0;
  if (!name) return toast('Name fehlt','err');
  await api('/api/printers','POST',{name,cost_per_hour:cost});
  document.getElementById('st-pr-name').value = '';
  document.getElementById('st-pr-cost').value = '';
  await loadAndRenderPrinterConfig(); toast('Drucker gespeichert','ok');
}
async function editPrinter(id, name, cost) {
  const newName = prompt('Druckername:', name); if (!newName) return;
  const newCost = prompt('Kosten (CHF/h):', cost);
  await api(`/api/printers/${id}`,'PUT',{name:newName, cost_per_hour:parseFloat(newCost)||0});
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Gespeichert','ok');
}
async function delPrinter(id) {
  await api(`/api/printers/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Drucker gelöscht','ok');
}
async function addNozzle() {
  const size = document.getElementById('st-nz-size').value.trim();
  if (!size) return toast('Grösse fehlt','err');
  await api('/api/nozzles','POST',{size});
  document.getElementById('st-nz-size').value = '';
  await loadAndRenderPrinterConfig(); toast('Düse hinzugefügt','ok');
}
async function delNozzle(id) {
  await api(`/api/nozzles/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Düse gelöscht','ok');
}
function editMaterialPreset(id) {
  const m = state.materialPresets.find(x => x.id === id); if (!m) return;
  document.getElementById('st-mat-id').value = id;
  set('st-mat-name', m.name); set('st-mat-temp', m.print_temp||'');
  set('st-mat-bed', m.bed_temp||''); set('st-mat-price', m.filament_price_kg||'');
  set('st-mat-notes', m.notes||'');
  document.getElementById('st-mat-nozzle').value = m.nozzle||'';
  document.getElementById('st-mat-add-btn').textContent = '✓ Speichern';
}
async function addMaterialPreset() {
  const name = document.getElementById('st-mat-name').value.trim();
  if (!name) return toast('Name fehlt','err');
  const body = {
    name, print_temp: document.getElementById('st-mat-temp').value,
    bed_temp: document.getElementById('st-mat-bed').value,
    nozzle: document.getElementById('st-mat-nozzle').value,
    filament_price_kg: parseFloat(document.getElementById('st-mat-price').value)||null,
    notes: document.getElementById('st-mat-notes').value
  };
  const editId = document.getElementById('st-mat-id').value;
  if (editId) {
    await api(`/api/material-presets/${editId}`,'PUT',body);
    document.getElementById('st-mat-id').value = '';
    document.getElementById('st-mat-add-btn').textContent = '+ Vorlage hinzufügen';
  } else {
    await api('/api/material-presets','POST',body);
  }
  ['st-mat-name','st-mat-temp','st-mat-bed','st-mat-price','st-mat-notes'].forEach(f=>set(f,''));
  document.getElementById('st-mat-nozzle').value = '';
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Vorlage gespeichert','ok');
}
async function delMaterialPreset(id) {
  await api(`/api/material-presets/${id}`,'DELETE');
  await loadAndRenderPrinterConfig(); state._psConfigLoaded = false; toast('Vorlage gelöscht','ok');
}

// ── FILE INDEX ────────────────────────────────────────────────
async function renderFileIndex() {
  setLeftHeader('Datei-Index', `<button class="btn btn-ghost btn-sm" onclick="exportFileIndex()">&#x1F4CB; Als CSV</button>`);
  closeDetail();
  const { datasets, documents } = await api('/api/file-index');

  const fmtSize = b => {
    if (!b) return '—';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(1) + ' MB';
  };

  const dsRows = datasets.map(f => `
    <tr>
      <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(f.project_number)}</td>
      <td style="font-size:11px">${esc(f.item_number||'—')}</td>
      <td style="font-size:11px;color:var(--t2)">${esc(f.revision||'')}</td>
      <td style="font-size:11px;font-weight:500">${esc(f.original_name)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${esc(f.filename)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--t3);text-align:right">${fmtSize(f.file_size)}</td>
      <td style="font-size:10px;color:var(--t3)">${(f.uploaded_at||'').slice(0,10)}</td>
    </tr>`).join('');

  const docRows = documents.map(f => `
    <tr>
      <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(f.project_number)}</td>
      <td style="font-size:11px;color:var(--t3)" colspan="2">Projektdokument</td>
      <td style="font-size:11px;font-weight:500">${esc(f.original_name)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${esc(f.filename)}</td>
      <td style="font-family:var(--mono);font-size:10px;color:var(--t3);text-align:right">${fmtSize(f.file_size)}</td>
      <td style="font-size:10px;color:var(--t3)">${(f.uploaded_at||'').slice(0,10)}</td>
    </tr>`).join('');

  const total = datasets.length + documents.length;
  const totalBytes = [...datasets,...documents].reduce((s,f) => s + (f.file_size||0), 0);

  setLeftBody(`<div style="padding:4px 0;max-width:1200px">
    <div style="font-size:12px;color:var(--t3);margin-bottom:16px;line-height:1.6">
      Alle gespeicherten Dateien mit ihrem <strong>angezeigten Namen</strong> und dem <strong>tatsächlichen Dateinamen</strong> auf der Festplatte.<br>
      Speicherort: <code style="font-family:var(--mono);background:var(--bg2);padding:1px 5px;border-radius:3px">data/files/</code>
      &nbsp;·&nbsp; ${total} Dateien &nbsp;·&nbsp; ${fmtSize(totalBytes)} gesamt
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid var(--line)">
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">Projekt</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600;white-space:nowrap">Artikel-Nr.</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Rev.</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Angezeigter Name</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Dateiname auf Festplatte</th>
          <th style="text-align:right;padding:6px 8px;color:var(--t3);font-weight:600">Grösse</th>
          <th style="text-align:left;padding:6px 8px;color:var(--t3);font-weight:600">Datum</th>
        </tr>
      </thead>
      <tbody>
        ${dsRows}${docRows}
        ${!total ? '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Dateien vorhanden</td></tr>' : ''}
      </tbody>
    </table>
  </div>`);

  // Store for CSV export
  window._fileIndexData = { datasets, documents };
}

function exportFileIndex() {
  const { datasets, documents } = window._fileIndexData || { datasets:[], documents:[] };
  const rows = [
    ['Projekt','Artikel-Nr.','Revision','Angezeigter Name','Dateiname auf Festplatte','Typ','Grösse (Bytes)','Datum'],
    ...datasets.map(f => [f.project_number, f.item_number||'', f.revision||'', f.original_name, f.filename, f.ds_type||'', f.file_size||'', (f.uploaded_at||'').slice(0,10)]),
    ...documents.map(f => [f.project_number, '', '', f.original_name, f.filename, f.ds_type||'', f.file_size||'', (f.uploaded_at||'').slice(0,10)])
  ];
  const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'datei-index.csv';
  a.click();
}

// ── PROFIT OVERVIEW ───────────────────────────────────────────
let _profitData = [];
let _profitState = { sort: 'number', dir: 1, text: '', margin: '' };

function _exportProfitCsv() {
  const { sort, dir, text, margin, type } = _profitState;
  const q = text.toLowerCase();
  let rows = _profitData.filter(i => {
    if (q && !i.item_number.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q) && !i.project_number.toLowerCase().includes(q) && !(i.project_name||'').toLowerCase().includes(q)) return false;
    if (type && i.item_type !== type) return false;
    if (margin === 'pos'     && !(i.margin != null && i.margin >= 0)) return false;
    if (margin === 'neg'     && !(i.margin != null && i.margin < 0))  return false;
    if (margin === 'missing' && i.margin != null) return false;
    return true;
  });
  const val = i => ({
    project: i.project_number, number: i.item_number, name: i.name,
    cost: i.manufacturing_cost ? i.manufacturing_cost.total : -Infinity,
    price: i.default_price ?? -Infinity,
    margin: i.margin ?? -Infinity,
    margin_pct: i.margin_pct ?? -Infinity,
  })[sort] ?? '';
  rows.sort((a, b) => { const av = val(a), bv = val(b); return dir * (typeof av === 'string' ? av.localeCompare(bv) : av - bv); });

  const csvNum = v => v == null ? '' : String(v).replace('.', ',');
  const csvStr = s => '"' + String(s||'').replace(/"/g, '""') + '"';
  const lines = [
    ['Projekt','Nummer','Typ','Name','Herst.-kosten (CHF)','Filament (CHF)','Maschine (CHF)','Verkaufspreis (CHF)','Marge (CHF)','Marge (%)','Stk. verkauft','Umsatz (CHF)','Gewinn total (CHF)'].join(';'),
    ...rows.map(i => {
      const mc = i.manufacturing_cost;
      return [
        csvStr(i.project_number),
        csvStr(i.item_number),
        csvStr(i.item_type === 'asm' ? 'Baugruppe' : 'Part'),
        csvStr(i.name),
        csvNum(mc ? mc.total?.toFixed(2) : null),
        csvNum(mc ? mc.filament?.toFixed(2) : null),
        csvNum(mc ? mc.machine?.toFixed(2) : null),
        csvNum(i.default_price != null ? i.default_price.toFixed(2) : null),
        csvNum(i.margin != null ? i.margin.toFixed(2) : null),
        csvNum(i.margin_pct != null ? i.margin_pct.toFixed(1) : null),
        csvNum(i.order_qty || 0),
        csvNum(i.order_revenue != null ? i.order_revenue.toFixed(2) : null),
        csvNum(i.order_profit != null ? i.order_profit.toFixed(2) : null),
      ].join(';');
    })
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Kalkulation_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function renderProfitOverview() {
  setLeftHeader('Kalkulation', `<div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="_exportProfitCsv()">↓ CSV</button><button class="btn btn-ghost btn-sm" onclick="renderProfitOverview()">↺ Aktualisieren</button></div>`);
  closeDetail();
  _profitData = await api('/api/profit-overview');
  _profitState = { sort: 'number', dir: 1, text: '', margin: '' };

  const withCost  = _profitData.filter(i => i.manufacturing_cost);
  const withBoth  = _profitData.filter(i => i.manufacturing_cost && i.default_price != null);
  const totalMargin = withBoth.reduce((s, i) => s + i.margin, 0);
  const marginColor = m => m == null ? 'var(--t3)' : m < 0 ? 'var(--red)' : m < 1 ? 'var(--yellow)' : 'var(--green)';

  setLeftBody(`<div style="padding:4px 0;max-width:1100px">
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);padding:10px 16px;min-width:120px">
        <div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Teile gesamt</div>
        <div style="font-size:20px;font-weight:600">${_profitData.length}</div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);padding:10px 16px;min-width:120px">
        <div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Mit Herst.-kosten</div>
        <div style="font-size:20px;font-weight:600">${withCost.length}</div>
      </div>
      <div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);padding:10px 16px;min-width:150px">
        <div style="font-size:10px;color:var(--t3);text-transform:uppercase;margin-bottom:4px">Gesamtmarge</div>
        <div style="font-size:20px;font-weight:600;color:${marginColor(totalMargin)}">${withBoth.length ? fmtCHF(totalMargin) : '—'}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <input class="fi" id="profit-search" placeholder="Suche: Nummer, Name, Projekt …"
        oninput="_profitState.text=this.value;_renderProfitRows()"
        style="max-width:280px;font-size:12px;padding:5px 10px">
      <select class="fs" id="profit-margin-filter" onchange="_profitState.margin=this.value;_renderProfitRows()"
        style="max-width:180px;font-size:12px;padding:5px 8px">
        <option value="">Alle Marge</option>
        <option value="pos">Positiv</option>
        <option value="neg">Negativ</option>
        <option value="missing">Unvollständig</option>
      </select>
      <select class="fs" id="profit-type-filter" onchange="_profitState.type=this.value;_renderProfitRows()"
        style="max-width:160px;font-size:12px;padding:5px 8px">
        <option value="">Alle Typen</option>
        <option value="prt">🔩 Parts</option>
        <option value="asm">📦 Baugruppen</option>
      </select>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="border-bottom:2px solid var(--line)" id="profit-thead"></tr>
      </thead>
      <tbody id="profit-tbody"></tbody>
    </table>
    <div style="margin-top:10px;font-size:11px;color:var(--t3)">
      Herstellungskosten = Filamentkosten (g × CHF/kg) + Maschinenkosten (h × CHF/h) aus den Druckparametern der letzten Revision.
    </div>
  </div>`);

  _renderProfitRows();
}

function _profitSortBy(col) {
  if (_profitState.sort === col) _profitState.dir *= -1;
  else { _profitState.sort = col; _profitState.dir = 1; }
  _renderProfitRows();
}

function _renderProfitRows() {
  const { sort, dir, text, margin, type } = _profitState;
  const q = text.toLowerCase();
  const marginColor = m => m == null ? 'var(--t3)' : m < 0 ? 'var(--red)' : m < 1 ? 'var(--yellow)' : 'var(--green)';
  const marginBg    = m => m == null ? '' : m < 0 ? 'background:rgba(241,120,120,.08)' : m < 1 ? 'background:rgba(239,177,74,.08)' : 'background:rgba(91,211,138,.08)';

  let rows = _profitData.filter(i => {
    if (q && !i.item_number.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q) && !i.project_number.toLowerCase().includes(q) && !(i.project_name||'').toLowerCase().includes(q)) return false;
    if (type && i.item_type !== type) return false;
    if (margin === 'pos'     && !(i.margin != null && i.margin >= 0)) return false;
    if (margin === 'neg'     && !(i.margin != null && i.margin < 0))  return false;
    if (margin === 'missing' && i.margin != null) return false;
    return true;
  });

  const val = i => ({
    project:      i.project_number,
    number:       i.item_number,
    name:         i.name,
    cost:         i.manufacturing_cost ? i.manufacturing_cost.total : -Infinity,
    price:        i.default_price ?? -Infinity,
    margin:       i.margin ?? -Infinity,
    margin_pct:   i.margin_pct ?? -Infinity,
    order_qty:    i.order_qty ?? -Infinity,
    order_revenue:i.order_revenue ?? -Infinity,
    order_profit: i.order_profit ?? -Infinity,
  })[sort] ?? '';

  rows.sort((a, b) => {
    const av = val(a), bv = val(b);
    return dir * (typeof av === 'string' ? av.localeCompare(bv) : av - bv);
  });

  const arrow = col => sort === col ? (dir === 1 ? ' ▲' : ' ▼') : '';
  const th = (label, col, align='left') =>
    `<th style="text-align:${align};padding:6px 8px;color:${sort===col?'var(--t1)':'var(--t3)'};font-weight:600;cursor:pointer;user-select:none;white-space:nowrap"
      onclick="_profitSortBy('${col}')">${label}${arrow(col)}</th>`;

  document.getElementById('profit-thead').innerHTML =
    th('Projekt','project') + th('Nummer','number') + th('Name','name') +
    th('Herst.-kosten','cost','right') + th('Verkaufspreis','price','right') +
    th('Marge','margin','right') + th('%','margin_pct','right') +
    th('Stk. verkauft','order_qty','right') + th('Umsatz','order_revenue','right') + th('Gewinn total','order_profit','right');

  document.getElementById('profit-tbody').innerHTML = rows.length ? rows.map(i => {
    const mc = i.manufacturing_cost;
    const cost = mc ? mc.total : null;
    const costDetail = mc ? `<span style="font-size:10px;color:var(--t3)">`
      + (mc.filament > 0 ? `Fil. ${fmtN(mc.filament)}` : '')
      + (mc.filament > 0 && mc.machine > 0 ? ' + ' : '')
      + (mc.machine > 0 ? `Mach. ${fmtN(mc.machine)}` : '') + `</span>` : '';
    const opColor = i.order_profit == null ? 'var(--t3)' : i.order_profit < 0 ? 'var(--red)' : i.order_profit === 0 ? 'var(--t3)' : 'var(--green)';
    return `<tr style="border-bottom:1px solid var(--line);cursor:pointer;${marginBg(i.margin)}" onclick="openProjectAndItem(${i.project_db_id},${i.id})" title="Im PLM öffnen">
      <td style="padding:5px 8px;font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(i.project_number)}</td>
      <td style="padding:5px 8px;font-size:11px;white-space:nowrap">${_itemChip(i.item_type,16)} ${esc(i.item_number)}</td>
      <td style="padding:5px 8px;font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px">${cost != null ? `${fmtCHF(cost)}<br>${costDetail}` : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px">${i.default_price != null ? fmtCHF(i.default_price) : '<span style="color:var(--t3)">—</span>'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:12px;font-weight:600;color:${marginColor(i.margin)}">${i.margin != null ? fmtCHF(i.margin) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px;color:${marginColor(i.margin)}">${i.margin_pct != null ? i.margin_pct.toFixed(0)+'%' : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px;color:${i.order_qty ? 'var(--t2)' : 'var(--t4)'}">${i.order_qty ? fmtN(i.order_qty, 0) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px;color:${i.order_qty ? 'var(--t2)' : 'var(--t4)'}">${i.order_revenue ? fmtCHF(i.order_revenue) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:11px;font-weight:${i.order_profit != null ? 600 : 400};color:${opColor}">${i.order_profit != null ? fmtCHF(i.order_profit) : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Einträge</td></tr>';
}

// ── CUSTOMERS ─────────────────────────────────────────────────
let _customerFilter = { text:'' };
function _clearCustomerFilter(){_customerFilter={text:''};renderCustomers();}
async function renderCustomers() {
  setLeftHeader('Kunden', `<button class="btn btn-primary btn-sm" onclick="openCustomerModal()">+ Kunde</button>`);
  const customers = await api('/api/customers');
  state.customers = customers;
  if (!customers.length) { setLeftBody(`<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">Noch keine Kunden</div></div>`); return; }
  const hasFilter = !!_customerFilter.text;
  setLeftBody(`
    <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center">
      <input class="fi" style="flex:1" placeholder="Suchen nach Name, Nummer, E-Mail…" value="${esc(_customerFilter.text||'')}"
        oninput="_customerFilter.text=this.value;_render_customerRows()">
      ${hasFilter?`<button class="btn btn-ghost btn-sm" onclick="_clearCustomerFilter()" title="Filter zurücksetzen">✕</button>`:''}
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Nummer</th><th>Name</th><th>E-Mail</th><th>Telefon</th><th>Adresse</th><th></th></tr></thead>
      <tbody id="_customer-tbody"></tbody>
    </table></div>`);
  _render_customerRows();
}
function _render_customerRows() {
  const t = _customerFilter.text.toLowerCase();
  const rows = (state.customers||[]).filter(c =>
    !t || c.name.toLowerCase().includes(t) || c.number.toLowerCase().includes(t) ||
    (c.email||'').toLowerCase().includes(t) || (c.phone||'').toLowerCase().includes(t) ||
    (c.city||'').toLowerCase().includes(t)
  );
  const el = document.getElementById('_customer-tbody');
  if (!el) return;
  el.innerHTML = rows.map(c=>`<tr onclick="openCustomerDetail(${c.id})">
    <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${c.number}</td>
    <td style="font-weight:500">${esc(c.name)}</td>
    <td style="color:var(--t2)">${c.email||'—'}</td>
    <td style="color:var(--t2)">${c.phone||'—'}</td>
    <td style="color:var(--t3);font-size:11px">${[c.street,c.postal_code&&c.city?c.postal_code+' '+c.city:'',c.country].filter(Boolean).join(', ')||'—'}</td>
    <td><button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delCustomer(${c.id})">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--t3)">Keine Treffer</td></tr>';
}

async function openCustomerDetail(id) {
  const c = await api(`/api/customers/${id}`);
  _trackRecent('customer', c.id, c.name, c.number);
  _pushHistory({ view: 'customers', detailType: 'customer', detailId: c.id });
  const ostLabel = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
  const ostCls   = {DRAFT:'st-DFT',CONFIRMED:'st-REL',DELIVERED:'st-REV',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
  const qstLabel = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
  const qstCls   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
  const dstLabel = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
  const dstCls   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
  const fmtChfD  = v => v != null ? fmtCHF(parseFloat(v)) : '—';
  const empty    = msg => `<div style="color:var(--t3);font-size:12px;padding:6px 0">${msg}</div>`;

  const orderRevTotal  = c.orders.reduce((s,o)  => s + (o.total||0), 0);
  const delivRevTotal  = c.deliveries.reduce((s,d) => s + (d.total||0), 0);

  document.getElementById('dp-title').innerHTML =
    `👤 <strong>${esc(c.name)}</strong> <span style="font-family:var(--mono);font-size:11px;color:var(--blue);margin-left:6px">${c.number}</span>`;

  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'cd-orders')">Aufträge <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:10px;padding:1px 6px;margin-left:3px">${c.orders.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-quotes')">Angebote <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:10px;padding:1px 6px;margin-left:3px">${c.quotes.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-deliveries')">Lieferungen <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:10px;padding:1px 6px;margin-left:3px">${c.deliveries.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-info')">Stammdaten</button>`;

  const orderRows = c.orders.length ? c.orders.map(o => `
    <div onclick="gotoView('orders')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${ostCls[o.status]||'st-DFT'}">${ostLabel[o.status]||o.status}</span>
      <div>
        <div style="font-weight:500">${esc(o.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${o.number}${o.order_date?' · '+o.order_date.slice(0,10):''}${o.delivery_date?' · 📅 '+o.delivery_date.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:12px">${fmtChfD(o.total)}</div>
        <div style="font-size:10px;color:var(--t3)">${o.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Aufträge');

  const quoteRows = c.quotes.length ? c.quotes.map(q => `
    <div onclick="gotoView('quotes')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${qstCls[q.status]||'st-DFT'}">${qstLabel[q.status]||q.status}</span>
      <div>
        <div style="font-weight:500">${esc(q.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${q.number}${q.quote_date?' · '+q.quote_date.slice(0,10):''}${q.valid_until?' · gültig bis '+q.valid_until.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:12px">${fmtChfD(q.total)}</div>
        <div style="font-size:10px;color:var(--t3)">${q.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Angebote');

  const delivRows = c.deliveries.length ? c.deliveries.map(d => `
    <div onclick="gotoView('deliveries')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${dstCls[d.status]||'st-DFT'}">${dstLabel[d.status]||d.status}</span>
      <div>
        <div style="font-weight:500">${esc(d.title)}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${d.number}${d.order_number?' · Auftrag '+d.order_number:''}${d.delivery_date?' · '+d.delivery_date.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:12px">${fmtChfD(d.total)}</div>
        <div style="font-size:10px;color:var(--t3)">${d.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Lieferungen');

  document.getElementById('dp-body').innerHTML = `
    <div id="cd-orders">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--line);font-size:11px;color:var(--t3)">
        <span>${c.orders.length} Aufträge</span>
        <span style="font-family:var(--mono);color:var(--t1)">Total ${fmtChfD(orderRevTotal)}</span>
      </div>
      ${orderRows}
    </div>
    <div id="cd-quotes" style="display:none">
      ${quoteRows}
    </div>
    <div id="cd-deliveries" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--line);font-size:11px;color:var(--t3)">
        <span>${c.deliveries.length} Lieferungen</span>
        <span style="font-family:var(--mono);color:var(--t1)">Total ${fmtChfD(delivRevTotal)}</span>
      </div>
      ${delivRows}
    </div>
    <div id="cd-info" style="display:none;padding:14px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;margin-bottom:14px">
        ${c.email?`<div><div class="ps-label">E-Mail</div><div class="ps-val"><a href="mailto:${esc(c.email)}" style="color:var(--blue)">${esc(c.email)}</a></div></div>`:''}
        ${c.phone?`<div><div class="ps-label">Telefon</div><div class="ps-val">${esc(c.phone)}</div></div>`:''}
        ${c.street?`<div style="grid-column:span 2"><div class="ps-label">Adresse</div><div class="ps-val">${esc(c.street)}, ${c.postal_code||''} ${c.city||''}, ${c.country||''}</div></div>`:''}
        ${c.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><div class="ps-val" style="white-space:pre-wrap;color:var(--t2)">${esc(c.notes)}</div></div>`:''}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openCustomerModal(${c.id})">✏️ Bearbeiten</button>
      <button class="btn btn-red btn-sm" style="margin-left:6px" onclick="delCustomer(${c.id})">🗑 Löschen</button>
    </div>`;

  showDetail();
}

// ── ORDERS ────────────────────────────────────────────────────
function _selOpts(pairs, cur) {
  return pairs.map(([v,l])=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`).join('');
}
function _filterBar(filterObj, stOpts, clearFn, idPrefix) {
  const hasFilter = filterObj.text||filterObj.status||filterObj.dateFrom||filterObj.dateTo;
  return `<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
    <input class="fi" style="flex:1;min-width:150px" placeholder="Suchen…" value="${esc(filterObj.text||'')}"
      oninput="${idPrefix}Filter.text=this.value;_render${idPrefix}Rows()">
    <select class="fs" style="width:130px" onchange="${idPrefix}Filter.status=this.value;_render${idPrefix}Rows()">
      <option value="">Alle Status</option>${_selOpts(stOpts,filterObj.status||'')}
    </select>
    <input class="fi" type="date" style="width:116px" title="Von Datum" value="${filterObj.dateFrom||''}"
      onchange="${idPrefix}Filter.dateFrom=this.value;_render${idPrefix}Rows()">
    <input class="fi" type="date" style="width:116px" title="Bis Datum" value="${filterObj.dateTo||''}"
      onchange="${idPrefix}Filter.dateTo=this.value;_render${idPrefix}Rows()">
    ${hasFilter?`<button class="btn btn-ghost btn-sm" onclick="${clearFn}()" title="Filter zurücksetzen">✕</button>`:''}
  </div>`;
}
let _orderFilter = { text:'', status:'', dateFrom:'', dateTo:'' };
function _clearOrderFilter(){_orderFilter={text:'',status:'',dateFrom:'',dateTo:''};renderOrders();}
async function renderOrders() {
  setLeftHeader('Aufträge', `<button class="btn btn-primary btn-sm" onclick="openOrderModal()">+ Auftrag</button>`);
  const orders = await api('/api/orders');
  state.orders = orders;
  if (!orders.length) { setLeftBody(`<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Noch keine Aufträge</div></div>`); return; }
  setLeftBody(_filterBar(_orderFilter,[['DRAFT','Entwurf'],['CONFIRMED','Bestätigt'],['DELIVERED','Geliefert'],['INVOICED','Fakturiert'],['CANCELLED','Storniert']],'_clearOrderFilter','_order')+
    `<div class="tbl-wrap"><table>
      <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Kunde</th><th>Pos.</th><th>Status</th><th>Datum</th><th style="text-align:right">Total</th><th></th></tr></thead>
      <tbody id="_order-tbody"></tbody>
    </table></div>`);
  _render_orderRows();
}
function _render_orderRows() {
  const t = _orderFilter.text.toLowerCase(); const s = _orderFilter.status;
  const df = _orderFilter.dateFrom; const dt = _orderFilter.dateTo;
  const rows = (state.orders||[]).filter(o =>
    (!t || o.title.toLowerCase().includes(t) || (o.customer_name||'').toLowerCase().includes(t) || o.number.includes(t)) &&
    (!s || o.status === s) &&
    (!df || (o.order_date||'') >= df) &&
    (!dt || (o.order_date||'') <= dt)
  );
  const el = document.getElementById('_order-tbody');
  if (!el) return;
  el.innerHTML = rows.map(o=>`<tr onclick="openOrderDetail(${o.id})">
    <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${o.number}</td>
    <td style="font-weight:500">${esc(o.title)}</td>
    <td style="color:var(--t2)">${o.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${(o.items||[]).length}</td>
    <td>${_stSel('order',o.id,o.status)}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${o.order_date||'—'}</td>
    <td style="font-family:var(--mono);font-size:11px;text-align:right;color:var(--green)">${o.computed_total != null ? fmtChf(o.computed_total) : '—'}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generateDoc(${o.id},'invoice')" title="Rechnung PDF">&#128196;</button>
      ${o.status==='DRAFT' ? `<button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delOrder(${o.id})">&#x2715;</button>` : ''}
    </td>
  </tr>`).join('') || '<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--t3)">Keine Treffer</td></tr>';
}

function _renderBillableTimeSection(timeEntries, taxRate, discountPct, includeTax, itemsTotal) {
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const billable = timeEntries.filter(e => e.billable);
  if (!billable.length) return '';
  const billableH = billable.reduce((s,e)=>s+(e.hours||0),0);
  const timeCost = billableH * hourlyRate;
  const discAmt = itemsTotal * discountPct / 100;
  const netItems = itemsTotal - discAmt;
  const grandNet = netItems + timeCost;
  const tax = includeTax ? grandNet * taxRate / 100 : 0;
  const grandTotal = grandNet + tax;
  return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
    <div style="padding:6px 8px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:9px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Arbeitszeit (verrechenbar)</div>
    <table style="width:100%"><tbody>
      ${billable.map(e => {
        const cost = e.hours * hourlyRate;
        return `<tr style="border-bottom:1px solid var(--line)">
          <td style="padding:6px 8px;width:28px"></td>
          <td style="padding:6px 8px;font-size:12px">${esc(e.description||'Arbeitszeit')}
            <div style="font-size:10px;color:var(--t3)">${e.date||''}</div></td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:11px;white-space:nowrap">${fmtN(e.hours,2)} h</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:11px;white-space:nowrap">${fmtCHF(hourlyRate)}/h</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:11px">${fmtCHF(cost)}</td>
          <td style="padding:6px 8px"></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    <div style="padding:10px 12px;border-top:1px solid var(--line);font-size:12px">
      <div style="display:flex;justify-content:flex-end;gap:24px">
        <div style="text-align:right">
          <div style="color:var(--t3)">Positionen: <span style="font-family:var(--mono)">${fmtCHF(netItems)}</span></div>
          <div style="color:var(--t2)">+ Arbeitszeit ${fmtN(billableH,2)} h: <span style="font-family:var(--mono)">${fmtCHF(timeCost)}</span></div>
          ${includeTax?`<div style="color:var(--t3)">MwSt. ${taxRate}%: <span style="font-family:var(--mono)">${fmtCHF(tax)}</span></div>`:''}
          <div style="font-size:14px;font-weight:600;margin-top:4px;color:var(--green)">Gesamttotal: <span style="font-family:var(--mono)">${fmtCHF(grandTotal)}</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

async function refreshOrderPositionen(orderId) {
  const posDiv = document.getElementById('od-pos');
  if (!posDiv) return;
  const [o, timeEntries] = await Promise.all([
    api(`/api/orders/${orderId}`),
    api(`/api/time-entries?order_id=${orderId}`)
  ]);
  const items = o.items || [];
  const subtotal = items.reduce((s,i)=>s+(i.quantity*i.unit_price*(1-(i.discount_pct||0)/100)),0);
  posDiv.innerHTML = `
    ${renderLineItems(items, 'order', orderId, o.tax_rate??0, o.discount_pct||0, !!o.include_tax)}
    ${_renderBillableTimeSection(timeEntries, o.tax_rate??0, o.discount_pct||0, !!o.include_tax, subtotal)}
    <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="openLineItemModal('order',${orderId})">+ Position</button>`;
}

async function openOrderDetail(id) {
  const [o, timeEntries] = await Promise.all([
    api(`/api/orders/${id}`),
    api(`/api/time-entries?order_id=${id}`)
  ]);
  const rec = (state.orders||[]).find(x=>x.id===id); if (rec) Object.assign(rec, o);
  _trackRecent('order', o.id, o.title, o.number);
  _pushHistory({ view: 'orders', detailType: 'order', detailId: o.id });
  document.getElementById('dp-title').innerHTML = `<strong>${o.number}</strong>&nbsp;${esc(o.title)}`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'od-pos')">Positionen</button>
    <button class="tab" onclick="switchTab(this,'od-info')">Details</button>
    <button class="tab" onclick="switchTab(this,'od-time');loadTimeEntries(${id})">Zeiten</button>`;
  const items = o.items || [];
  const subtotal = items.reduce((s,i)=>s+(i.quantity*i.unit_price*(1-(i.discount_pct||0)/100)),0);
  document.getElementById('dp-body').innerHTML = `
    <div id="od-pos">
      ${renderLineItems(items, 'order', id, o.tax_rate??0, o.discount_pct||0, !!o.include_tax)}
      ${_renderBillableTimeSection(timeEntries, o.tax_rate??0, o.discount_pct||0, !!o.include_tax, subtotal)}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="openLineItemModal('order',${id})">+ Position</button>
    </div>
    <div id="od-info" style="display:none">
      <div class="sep-label">Auftragsdaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('order',id,o.status)}</div>
        <div><div class="ps-label">Kunde</div>${o.customer_name||'—'}</div>
        <div><div class="ps-label">Datum</div>${o.order_date||'—'}</div>
        <div><div class="ps-label">Lieferdatum</div><span id="od-delivery-date">${o.delivery_date||'—'}</span></div>
        <div><div class="ps-label">MwSt.</div>${o.tax_rate??0} % ${o.include_tax?'<span style="color:var(--green);font-size:10px">(ausgewiesen)</span>':'<span style="color:var(--t3);font-size:10px">(ohne)</span>'}</div>
        ${(o.discount_pct||0)>0?`<div><div class="ps-label">Gesamtrabatt</div>${o.discount_pct} %</div>`:''}
        ${o.payment_terms?`<div style="grid-column:span 2"><div class="ps-label">Zahlungsbedingungen</div>${esc(o.payment_terms)}</div>`:''}
        ${o.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(o.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openOrderModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'invoice')">&#128196; Rechnung PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="cloneOrder(${id})">⧉ Klonen</button>
        <button class="btn btn-primary btn-sm" onclick="orderToDelivery(${id})">🚚 Lieferschein erstellen</button>
        ${o.status==='DRAFT' ? `<button class="btn btn-red btn-sm" onclick="delOrder(${id})">🗑 Löschen</button>` : ''}
      </div>
    </div>
    <div id="od-time" style="display:none">
      <div id="time-entries-list"><div style="color:var(--t3);font-size:12px">Wird geladen…</div></div>
    </div>`;
  showDetail();
}

async function orderToDelivery(orderId) {
  const timeEntries = await api(`/api/time-entries?order_id=${orderId}`);
  const billable = timeEntries.filter(e => e.billable);
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const billableH = billable.reduce((s,e)=>s+(e.hours||0),0);
  _showDynModal(`<div class="modal" style="max-width:400px">
    <div class="modal-head"><div class="modal-title">Lieferschein erstellen</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:var(--t2)">Alle Positionen des Auftrags werden übernommen.</div>
      ${billable.length ? `<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r)">
        <input type="checkbox" id="dtd-include-time" checked style="width:15px;height:15px;margin-top:1px;cursor:pointer;accent-color:var(--blue);flex-shrink:0">
        <div>
          <div style="font-size:12px;font-weight:500;color:var(--t1)">Verrechenbare Zeiten übernehmen</div>
          <div style="font-size:11px;color:var(--t3);margin-top:2px">${billable.length} Einträge · ${fmtN(billableH,2)} h${hourlyRate>0?' · '+fmtCHF(billableH*hourlyRate):''}</div>
        </div>
      </label>` : `<div style="font-size:11px;color:var(--t3);padding:8px 0">Keine verrechenbaren Zeiteinträge vorhanden.</div>`}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="_doCreateDelivery(${orderId})">🚚 Erstellen</button>
    </div>
  </div>`);
}

async function _doCreateDelivery(orderId) {
  const cb = document.getElementById('dtd-include-time');
  const include_time = cb ? cb.checked : false;
  _hideDynModal();
  const d = await api(`/api/orders/${orderId}/to-delivery`, 'POST', { include_time });
  toast(`Lieferschein ${d.number} erstellt`, 'ok');
  await renderDeliveries();
  openDeliveryDetail(d.id);
}

// ── SEARCH ────────────────────────────────────────────────────
function renderSearchView() {
  setLeftHeader('Suche', '');
  const classes = getClassifications();
  const chips = classes.map(c => {
    const [color, bg] = _classColor(c);
    return `<span onclick="document.getElementById('globalSearch').value='${esc(c)}';onSearch('${esc(c)}')"
      style="font-family:var(--mono);font-size:10px;padding:3px 9px;border-radius:12px;background:${bg};color:${color};cursor:pointer;border:1px solid ${color.replace(')',',0.3)').replace('var(','rgba(')};transition:opacity .12s" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">${esc(c)}</span>`;
  }).join('');
  setLeftBody(`
    <div style="padding:12px 0 8px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--line);margin-bottom:12px">
      <span style="font-size:11px;color:var(--t4);align-self:center;margin-right:4px">Klasse:</span>
      ${chips}
    </div>
    <div id="search-results"><div style="padding:20px;text-align:center;color:var(--t3)">Suchbegriff oben eingeben …</div></div>`);
}

let searchTimer;
async function onSearch(q) {
  clearTimeout(searchTimer);
  if (!q || q.length < 2) return;
  searchTimer = setTimeout(async () => {
    if (state.view !== 'search') { state.view = 'search'; document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active')); renderSearchView(); }
    const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
    const fmtSz = b => !b?'—':b<1024?b+'B':b<1048576?(b/1024).toFixed(0)+'KB':(b/1048576).toFixed(1)+'MB';
    const dsIcon = t => ({CAD:'📐',GCODE:'⚙',PDF:'📕',IMG:'🖼',DOC:'📄'}[t]||'📎');
    const ostL = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
    const ostC = {DRAFT:'st-DFT',CONFIRMED:'st-REL',DELIVERED:'st-REV',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
    const qstL = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
    const qstC = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
    const dstL = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
    const dstC = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};

    const section = (label, count) => `<div class="sep-label" style="margin-top:16px">${label}${count?` <span style="color:var(--t4);font-weight:400">(${count})</span>`:''}</div>`;
    const noHits = `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Keine Treffer für „${esc(q)}"</div></div>`;
    const total = (r.projects?.length||0)+(r.items?.length||0)+(r.datasets?.length||0)+(r.orders?.length||0)+(r.quotes?.length||0)+(r.customers?.length||0)+(r.deliveries?.length||0);

    const html = total ? `
      ${r.orders?.length ? section('Aufträge', r.orders.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Lieferdatum</th></tr></thead>
        <tbody>${r.orders.map(o=>`<tr style="cursor:pointer" onclick="gotoView('orders');openOrderDetail(${o.id})">
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(o.number)}</td>
          <td>${esc(o.title)}</td><td style="color:var(--t3)">${esc(o.customer_name||'—')}</td>
          <td><span class="status ${ostC[o.status]||''}">${ostL[o.status]||o.status}</span></td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${o.delivery_date||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.quotes?.length ? section('Angebote', r.quotes.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Gültig bis</th></tr></thead>
        <tbody>${r.quotes.map(q=>`<tr style="cursor:pointer" onclick="gotoView('quotes');openQuoteDetail(${q.id})">
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(q.number)}</td>
          <td>${esc(q.title)}</td><td style="color:var(--t3)">${esc(q.customer_name||'—')}</td>
          <td><span class="status ${qstC[q.status]||''}">${qstL[q.status]||q.status}</span></td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${q.valid_until||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.deliveries?.length ? section('Lieferscheine', r.deliveries.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Datum</th></tr></thead>
        <tbody>${r.deliveries.map(d=>`<tr style="cursor:pointer" onclick="gotoView('deliveries');openDeliveryDetail(${d.id})">
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(d.number)}</td>
          <td>${esc(d.title)}</td><td style="color:var(--t3)">${esc(d.customer_name||'—')}</td>
          <td><span class="status ${dstC[d.status]||''}">${dstL[d.status]||d.status}</span></td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${d.delivery_date||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.customers?.length ? section('Kunden', r.customers.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Name</th><th>E-Mail</th><th>Ort</th></tr></thead>
        <tbody>${r.customers.map(c=>`<tr style="cursor:pointer" onclick="gotoView('customers');openCustomerDetail(${c.id})">
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(c.number)}</td>
          <td>${esc(c.name)}</td><td style="color:var(--t3)">${esc(c.email||'—')}</td>
          <td style="color:var(--t3)">${esc(c.city||'—')}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.projects?.length ? section('Projekte', r.projects.length) + `<div class="card-grid">${r.projects.map(p=>`
        <div class="card" onclick="openProject(${p.id})"><div class="card-accent"></div>
        <div class="card-num">${p.number}</div><div class="card-name">${esc(p.name)}</div></div>`).join('')}</div>` : ''}
      ${r.items?.length ? section('PLM Items', r.items.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nummer</th><th>Name</th><th>Klasse</th><th>Projekt</th><th>Rev</th><th>Status</th></tr></thead>
        <tbody>${r.items.map(i=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${i.project_id},${i.id})">
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${i.item_number}</td>
          <td>${esc(i.name)}</td>
          <td>${i.classification ? _classChip(i.classification) : '<span style="color:var(--t4)">—</span>'}</td>
          <td style="color:var(--t3)">${i.project_name}</td>
          <td style="font-family:var(--mono);font-size:10px">${i.latest_revision?.rev||'—'}</td>
          <td>${i.latest_revision?`<span class="status st-${i.latest_revision.status}">${i.latest_revision.status}</span>`:''}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.datasets?.length ? section('Dateien', r.datasets.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Datei</th><th>Item</th><th>Projekt</th><th>Rev</th><th>Grösse</th><th></th></tr></thead>
        <tbody>${r.datasets.map(d=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${d.project_id},${d.item_id})">
          <td><span style="margin-right:5px">${dsIcon(d.ds_type)}</span>${esc(d.original_name)}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${d.item_number}</td>
          <td style="color:var(--t3)">${d.project_name}</td>
          <td style="font-family:var(--mono);font-size:10px">${d.rev||'—'}</td>
          <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${fmtSz(d.file_size)}</td>
          <td onclick="event.stopPropagation()"><a href="/api/datasets/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a></td>
        </tr>`).join('')}</tbody></table></div>` : ''}
    ` : noHits;
    const resEl = document.getElementById('search-results');
    if (resEl) resEl.innerHTML = `<div style="padding-bottom:20px">${html}</div>`;
    else setLeftBody(`<div style="padding-bottom:20px">${html}</div>`);
  }, 300);
}

// ── PROJECT CRUD ──────────────────────────────────────────────
let editingProjectId = null;
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

async function saveProject() {
  const name = V('pm-name'); if (!name) return toast('Name fehlt','err');
  const body = { name, description: V('pm-desc'), customer: V('pm-customer') };
  if (editingProjectId) {
    await api(`/api/projects/${editingProjectId}`, 'PUT', body);
    toast('Projekt aktualisiert','ok');
  } else {
    await api('/api/projects','POST',body);
    toast('Projekt angelegt','ok');
  }
  closeModal('projectModal'); editingProjectId=null;
  gotoView('projects'); loadStats();
}

async function editProject(id) {
  const p = await api(`/api/projects/${id}`);
  editingProjectId = id;
  set('pm-name',p.name); set('pm-desc',p.description); set('pm-customer',p.customer);
  openModal('projectModal');
}

async function deleteProject(id) {
  const p = await api(`/api/projects/${id}`);
  if (!confirm(`Projekt "${p.name}" löschen?`)) return;
  await api(`/api/projects/${id}`,'DELETE');
  toast('Projekt gelöscht','ok'); closeDetail(); gotoView('projects'); loadStats();
}

async function _forceDeleteProject(id, name) {
  if (!confirm(`Projekt "${name}" und ALLE Inhalte unwiderruflich löschen?`)) return;
  await api(`/api/projects/${id}`,'DELETE');
  toast('Projekt gelöscht','ok'); closeDetail(); gotoView('projects'); loadStats();
  _loadDelTab();
}

function _admDelTab(name) {
  document.querySelectorAll('.adm-del-tab').forEach(b => {
    const active = b.dataset.deltab === name;
    b.style.color = active ? 'var(--red)' : 'var(--t3)';
    b.style.borderBottomColor = active ? 'var(--red)' : 'transparent';
    b.style.fontWeight = active ? '600' : '400';
  });
  ['teile','projekte','auftraege'].forEach(t => {
    const el = document.getElementById('adm-del-' + t);
    if (el) el.style.display = t === name ? '' : 'none';
  });
}

function _admPreview() {
  const g = id => document.getElementById(id)?.value || '';
  const pre  = g('adm-prefix-order') || 'AUF';
  const padO = parseInt(g('adm-pad-order'))   || 4;
  const padP = parseInt(g('adm-pad-project')) || 4;
  const padA = parseInt(g('adm-pad-asm'))     || 3;
  const padT = parseInt(g('adm-pad-prt'))     || 3;
  const padD = parseInt(g('adm-pad-doc'))     || 3;
  const yr   = document.getElementById('adm-num-yearly')?.checked ? new Date().getFullYear()+'-' : '';
  const sep  = g('adm-num-sep') || '-';
  const sa   = g('adm-seg-asm') || 'asm';
  const sp   = g('adm-seg-prt') || 'prt';
  const sd   = g('adm-seg-doc') || 'doc';
  const revFmt = g('adm-rev-format') || 'num';
  const rev1 = revFmt === 'letter' ? 'A' : '1';
  const rev2 = revFmt === 'letter' ? 'B' : '2';
  const proj = '1'.padStart(padP, '0');
  const el = document.getElementById('adm-preview');
  if (!el) return;
  el.innerHTML =
    `<span style="color:var(--t4)">Auftrag: </span>${pre}-${yr}${'1'.padStart(padO,'0')}\n` +
    `<span style="color:var(--t4)">Projekt: </span>${proj}\n` +
    `<span style="color:var(--t4)">Baugruppe: </span>${proj}${sep}${sa}${sep}${'1'.padStart(padA,'0')}\n` +
    `<span style="color:var(--t4)">Part in BG: </span>${proj}${sep}${sa}${sep}${'1'.padStart(padA,'0')}${sep}${sp}${sep}${'1'.padStart(padT,'0')}\n` +
    `<span style="color:var(--t4)">Dokument: </span>${proj}${sep}${sd}${sep}${'1'.padStart(padD,'0')}\n` +
    `<span style="color:var(--t4)">Revision: </span>rev${rev1} → rev${rev2}`;
}

async function saveAdminSettings() {
  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title" style="color:var(--red)">⚠ Admin-Einstellungen speichern</div></div>
    <div class="modal-body" style="padding:14px 16px;font-size:13px;color:var(--t2)">
      Änderungen an Präfixen und Nummernformat gelten nur für <b>neu erstellte</b> Datensätze.<br><br>
      Geänderte Zählerstände können bei falscher Eingabe zu <b>doppelten Nummern</b> führen.<br><br>
      Wirklich speichern?
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-red" onclick="_doSaveAdminSettings()">Ja, speichern</button>
    </div>
  </div>`);
}

async function _doSaveAdminSettings() {
  _hideDynModal();
  const gv = id => document.getElementById(id)?.value?.trim() || '';
  const gi = (id, def) => String(parseInt(document.getElementById(id)?.value)||def);
  const settings = {
    prefix_order:    gv('adm-prefix-order')    || 'AUF',
    prefix_quote:    gv('adm-prefix-quote')    || 'ANG',
    prefix_delivery: gv('adm-prefix-delivery') || 'LS',
    prefix_customer: gv('adm-prefix-customer') || 'KD',
    pad_order:       gi('adm-pad-order',    4),
    pad_quote:       gi('adm-pad-quote',    4),
    pad_delivery:    gi('adm-pad-delivery', 4),
    pad_customer:    gi('adm-pad-customer', 4),
    pad_project:     gi('adm-pad-project',  4),
    num_yearly:      document.getElementById('adm-num-yearly')?.checked ? '1' : '0',
    num_sep:         gv('adm-num-sep')  || '-',
    seg_asm:         gv('adm-seg-asm')  || 'asm',
    seg_prt:         gv('adm-seg-prt')  || 'prt',
    seg_doc:         gv('adm-seg-doc')  || 'doc',
    pad_asm:         gi('adm-pad-asm',  3),
    pad_prt:         gi('adm-pad-prt',  3),
    pad_doc:         gi('adm-pad-doc',  3),
    rev_format:      gv('adm-rev-format') || 'num',
  };
  await api('/api/settings', 'PUT', settings);
  state.settings = await api('/api/settings');
  toast('Admin-Einstellungen gespeichert', 'ok');
}

const DEFAULT_CLASSIFICATIONS = ['Eigenteil','Kaufteil','Normteil','Halbzeug','Rohmaterial'];

function getClassifications() {
  try {
    const raw = state.settings?.item_classifications;
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...DEFAULT_CLASSIFICATIONS];
}

function _loadPlmTab() {
  _renderClassList(getClassifications());
}

let _classDragIdx = null;

function _renderClassList(list) {
  const el = document.getElementById('st-class-list');
  if (!el) return;
  el.innerHTML = list.map((c, i) => `
    <div class="cls-row" data-idx="${i}" draggable="true"
      style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);transition:opacity .15s">
      <span class="cls-handle" style="cursor:grab;color:var(--t4);font-size:16px;line-height:1;flex-shrink:0">⠿</span>
      ${_classChip(c)}
      <input class="fi cls-name" value="${esc(c)}" style="flex:1;font-size:12px;padding:3px 7px;height:28px" onchange="_onClassRename(${i},this.value)">
      <button class="btn btn-red btn-icon btn-sm" onclick="_removeClass(${i})">✕</button>
    </div>`).join('');

  // Drag & drop handlers
  el.querySelectorAll('.cls-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      _classDragIdx = parseInt(row.dataset.idx);
      row.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.style.borderColor = 'var(--blue)'; });
    row.addEventListener('dragleave', () => { row.style.borderColor = 'var(--line)'; });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.style.borderColor = 'var(--line)';
      const toIdx = parseInt(row.dataset.idx);
      if (_classDragIdx === null || _classDragIdx === toIdx) return;
      const cur = _getCurrentClassList();
      const [moved] = cur.splice(_classDragIdx, 1);
      cur.splice(toIdx, 0, moved);
      _renderClassList(cur);
    });
  });
}

function _onClassRename(idx, newVal) {
  const list = _getCurrentClassList();
  list[idx] = newVal.trim() || list[idx];
  _renderClassList(list);
}

function _getCurrentClassList() {
  const el = document.getElementById('st-class-list');
  if (!el) return [];
  return [...el.querySelectorAll('.cls-name')].map(i => i.value.trim()).filter(Boolean);
}

function _addClass() {
  const inp = document.getElementById('st-class-new');
  const val = inp?.value.trim();
  if (!val) return;
  const list = _getCurrentClassList();
  if (list.includes(val)) { toast('Bereits vorhanden', 'err'); return; }
  list.push(val);
  _renderClassList(list);
  inp.value = '';
  inp.focus();
}

function _removeClass(idx) {
  const list = _getCurrentClassList();
  list.splice(idx, 1);
  _renderClassList(list);
}

async function _saveClassifications() {
  const list = _getCurrentClassList();
  await api('/api/settings', 'PUT', { item_classifications: JSON.stringify(list) });
  state.settings = await api('/api/settings');
  const msg = document.getElementById('st-class-msg');
  if (msg) { msg.textContent = 'Gespeichert'; msg.style.color = 'var(--green)'; setTimeout(() => msg.textContent = '', 2000); }
  toast('Klassifizierungen gespeichert', 'ok');
}

async function _loadDelTab() {
  const [projects, orders, quotes, settings, counters] = await Promise.all([
    api('/api/projects').catch(()=>[]),
    api('/api/orders').catch(()=>[]),
    api('/api/quotes').catch(()=>[]),
    api('/api/settings').catch(()=>({})),
    api('/api/counters').catch(()=>({}))
  ]);

  // Fill admin settings fields
  const fv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  fv('adm-prefix-order',    settings.prefix_order    || 'AUF');
  fv('adm-prefix-quote',    settings.prefix_quote    || 'ANG');
  fv('adm-prefix-delivery', settings.prefix_delivery || 'LS');
  fv('adm-prefix-customer', settings.prefix_customer || 'KD');
  fv('adm-pad-order',       settings.pad_order       || '4');
  fv('adm-pad-quote',       settings.pad_quote       || '4');
  fv('adm-pad-delivery',    settings.pad_delivery    || '4');
  fv('adm-pad-customer',    settings.pad_customer    || '4');
  fv('adm-pad-project',     settings.pad_project     || '4');
  fv('adm-seg-asm',         settings.seg_asm         || 'asm');
  fv('adm-seg-prt',         settings.seg_prt         || 'prt');
  fv('adm-seg-doc',         settings.seg_doc         || 'doc');
  fv('adm-num-sep',         settings.num_sep         || '-');
  fv('adm-pad-asm',         settings.pad_asm         || '3');
  fv('adm-pad-prt',         settings.pad_prt         || '3');
  fv('adm-pad-doc',         settings.pad_doc         || '3');
  const yrEl = document.getElementById('adm-num-yearly');
  if (yrEl) yrEl.checked = (settings.num_yearly ?? '1') !== '0';
  const revFmtEl = document.getElementById('adm-rev-format');
  if (revFmtEl) revFmtEl.value = settings.rev_format || 'num';

  const previewIds = ['adm-prefix-order','adm-pad-order','adm-pad-project','adm-num-yearly',
    'adm-seg-asm','adm-seg-prt','adm-seg-doc','adm-num-sep',
    'adm-pad-asm','adm-pad-prt','adm-pad-doc','adm-rev-format'];
  previewIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.admListener) {
      el.dataset.admListener = '1';
      el.addEventListener('input', _admPreview);
      el.addEventListener('change', _admPreview);
    }
  });
  _admPreview();
  _admDelTab('teile');

  // Released items
  const itemsEl = document.getElementById('st-del-items');
  if (itemsEl) {
    itemsEl.innerHTML = '<div style="font-size:12px;color:var(--t3)">Lädt…</div>';
    let relItems = [], loadErr = false;
    try { relItems = await api('/api/items-released'); }
    catch(e) { loadErr = true; }
    if (loadErr) {
      itemsEl.innerHTML = '<div style="font-size:12px;color:var(--amber)">⚠ Endpunkt nicht verfügbar — Server neu starten</div>';
    } else {
      itemsEl.innerHTML = relItems.length
        ? relItems.map(i => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
            ${_itemChip(i.item_type,15)}
            <span style="font-family:var(--mono);font-size:11px;color:var(--blue)">${esc(i.item_number)}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
            <span style="font-size:10px;color:var(--t3)">${esc(i.project_number||'')}</span>
            <button class="btn btn-red btn-sm" onclick="_forceDelItem(${i.id},'${esc(i.item_number)}')">Löschen</button>
          </div>`).join('')
        : '<div style="font-size:12px;color:var(--t3)">Keine freigegebenen Items</div>';
    }
  }

  const pelEl = document.getElementById('st-del-projects');
  if (pelEl) {
    const withContent = projects.filter(p => p.item_count > 0);
    pelEl.innerHTML = withContent.length
      ? withContent.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span style="font-family:var(--mono);font-size:11px;color:var(--blue)">${esc(p.number)}</span>
          <span style="flex:1;font-size:12px">${esc(p.name)}</span>
          <span style="font-size:11px;color:var(--t3)">${p.item_count} Items</span>
          <button class="btn btn-red btn-sm" onclick="_forceDeleteProject(${p.id},'${esc(p.name)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--t3)">Keine Projekte mit Inhalten</div>';
  }

  const ordEl = document.getElementById('st-del-orders');
  if (ordEl) {
    const locked = orders.filter(o => o.status !== 'DRAFT');
    ordEl.innerHTML = locked.length
      ? locked.map(o => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span class="status st-${ORDER_ST_MAP[o.status]?.replace('st-','')}" style="font-size:10px">${ORDER_ST_LABEL[o.status]||o.status}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--blue)">${esc(o.number)}</span>
          <span style="flex:1;font-size:12px">${esc(o.title)}</span>
          <button class="btn btn-red btn-sm" onclick="_forceDelOrder(${o.id},'${esc(o.number)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--t3)">Keine gesperrten Aufträge</div>';
  }

  const quoEl = document.getElementById('st-del-quotes');
  if (quoEl) {
    const locked = quotes.filter(q => q.status !== 'DRAFT');
    quoEl.innerHTML = locked.length
      ? locked.map(q => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span style="font-family:var(--mono);font-size:11px;color:var(--blue)">${esc(q.number)}</span>
          <span style="flex:1;font-size:12px">${esc(q.title)}</span>
          <button class="btn btn-red btn-sm" onclick="_forceDelQuote(${q.id},'${esc(q.number)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:12px;color:var(--t3)">Keine gesperrten Angebote</div>';
  }
}

async function _forceDelItem(id, number) {
  if (!confirm(`Item ${number} unwiderruflich löschen? Alle Revisionen und Dateien werden entfernt.`)) return;
  await api(`/api/items/${id}`,'DELETE');
  toast(`${number} gelöscht`,'ok'); _loadDelTab();
}

async function _forceDelOrder(id, number) {
  if (!confirm(`Auftrag ${number} unwiderruflich löschen?`)) return;
  await api(`/api/orders/${id}`,'DELETE');
  toast('Auftrag gelöscht','ok'); _loadDelTab(); loadStats();
}

async function _forceDelQuote(id, number) {
  if (!confirm(`Angebot ${number} unwiderruflich löschen?`)) return;
  await api(`/api/quotes/${id}`,'DELETE');
  toast('Angebot gelöscht','ok'); _loadDelTab(); loadStats();
}

// ── ITEM MOVE ─────────────────────────────────────────────────
async function openMoveItemModal(itemId) {
  let item, projects;
  try {
    [item, projects] = await Promise.all([api('/api/items/' + itemId), api('/api/projects')]);
  } catch(e) { return toast('Fehler: ' + e, 'err'); }
  const others = projects.filter(p => p.id !== item.project_id);
  if (!others.length) return toast('Keine anderen Projekte vorhanden', 'err');

  const opts = others.map(p => `<option value="${p.id}">${p.number} – ${esc(p.name)}</option>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.id = 'moveItemOverlay';
  overlay.innerHTML = `<div class="modal" style="max-width:400px">
    <div class="modal-header">
      <div class="modal-title">↪ Verschieben: ${esc(item.item_number)}</div>
      <button class="btn btn-icon btn-ghost" onclick="document.getElementById('moveItemOverlay').remove()">✕</button>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t2);margin-bottom:14px">
        <strong style="color:var(--t1)">${esc(item.name)}</strong> in ein anderes Projekt verschieben.<br>
        <span style="font-size:12px;color:var(--t3);margin-top:4px;display:block">Die Item-Nummer wird automatisch neu vergeben. Untergeordnete Items (Kinder) werden mitgenommen.</span>
      </div>
      <div class="fg">
        <label class="fl">Zielprojekt</label>
        <select class="fi" id="move-target-project">${opts}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="document.getElementById('moveItemOverlay').remove()">Abbrechen</button>
      <button class="btn btn-primary" onclick="confirmMoveItem(${itemId})">Verschieben</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
}

async function confirmMoveItem(itemId) {
  const targetId = document.getElementById('move-target-project')?.value;
  if (!targetId) return;
  const overlay = document.getElementById('moveItemOverlay');
  const btn = overlay?.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await api('/api/items/' + itemId + '/move', 'PUT', { target_project_id: parseInt(targetId) });
    overlay?.remove();
    toast('Item verschoben', 'ok');
    closeDetail();
    if (state.project) openProject(state.project.id);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Verschieben'; }
    toast('Fehler: ' + e, 'err');
  }
}

async function saveItemPrice(itemId, input) {
  const val = input.value.trim();
  const price = val === '' ? null : parseFloat(val);
  try {
    const item = await api('/api/items/' + itemId);
    await api('/api/items/' + itemId, 'PUT', {
      name: item.name, description: item.description,
      source_url: item.source_url || null, default_price: price
    });
    input.style.borderColor = 'var(--green)';
    setTimeout(() => input.style.borderColor = '', 1200);
  } catch(e) {
    toast('Fehler: ' + e, 'err');
  }
}

// ── ITEM CRUD ─────────────────────────────────────────────────
async function openEditItemModal(id) {
  const item = await api('/api/items/' + id);
  set('eim-id', id);
  set('eim-name', item.name);
  set('eim-desc', item.description || '');
  set('eim-url', item.source_url || '');
  set('eim-price', item.default_price != null ? item.default_price : '');
  const clSel = document.getElementById('eim-classification');
  clSel.innerHTML = '<option value="">— keine —</option>' + getClassifications().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  clSel.value = item.classification || '';
  document.getElementById('eim-title').textContent = 'Bearbeiten: ' + item.item_number;
  openModal('editItemModal');
}

async function saveEditItem() {
  const id = V('eim-id');
  const name = V('eim-name');
  if (!name) return toast('Name fehlt', 'err');
  await api('/api/items/' + id, 'PUT', {
    name, description: V('eim-desc'), source_url: V('eim-url')||null,
    default_price: V('eim-price') ? parseFloat(V('eim-price')) : null,
    classification: document.getElementById('eim-classification').value || null
  });
  toast('Name gespeichert', 'ok');
  closeModal('editItemModal');
  const item = await api('/api/items/' + id);
  state.item = item;
  renderItemDetail(item, state.activeRevId);
  if (state.project) openProject(state.project.id);
}

function openItemModal(projectId, parentId, type) {
  set('im-name',''); set('im-desc',''); set('im-url',''); set('im-price','');
  set('im-project-id', projectId);
  set('im-parent-id', parentId||'');
  document.getElementById('im-type').value = type||'prt';
  document.getElementById('im-title').textContent = type==='asm' ? 'Neue Baugruppe' : type==='doc' ? 'Neues Dokument' : 'Neues Part';
  openModal('itemModal');
}

async function saveItem() {
  const name = V('im-name'); if (!name) return toast('Name fehlt','err');
  const projectId = V('im-project-id');
  const parentId = V('im-parent-id');
  const body = { name, description: V('im-desc'), item_type: V('im-type'), parent_id: parentId||null, source_url: V('im-url')||null, default_price: V('im-price') ? parseFloat(V('im-price')) : null };
  await api(`/api/projects/${projectId}/items`,'POST',body);
  toast('Item angelegt','ok'); closeModal('itemModal');
  openProject(projectId); loadStats();
}

async function deleteItem(id) {
  if (!confirm('Item und alle Revisionen / Dateien löschen?')) return;
  const item = state.item;
  await api(`/api/items/${id}`,'DELETE');
  toast('Item gelöscht','ok'); closeDetail();
  if (state.project) openProject(state.project.id);
}

// ── REVISION / STATUS ─────────────────────────────────────────
const statusHints = {
  REV: 'Revision wird zur Prüfung eingereicht.',
  DFT: 'Revision zurück auf Entwurf setzen.',
  REL: 'Revision freigeben. Alle vorherigen REL-Revisionen werden auf OBS gesetzt.',
  ECO: 'Engineering Change Order starten. Eine neue Revision wird automatisch in DFT angelegt.',
  OBS: 'Revision als veraltet markieren.'
};

function openStatusModal(revId, targetStatus) {
  set('sm-rev-id', revId); set('sm-target-status', targetStatus);
  set('sm-desc',''); set('sm-eco','');
  document.getElementById('sm-title').textContent = `Status → ${targetStatus}`;
  document.getElementById('sm-hint').textContent = statusHints[targetStatus]||'';
  document.getElementById('sm-eco-row').style.display = targetStatus==='ECO' ? 'block':'none';
  openModal('statusModal');
}

async function doStatusChange() {
  const revId = V('sm-rev-id'); const status = V('sm-target-status');
  const body = { status, description: V('sm-desc'), eco_reason: V('sm-eco'), released_by: 'User' };
  await api(`/api/revisions/${revId}/status`,'PUT',body);
  toast(`Status → ${status}`,'ok'); closeModal('statusModal');
  if (state.item) {
    const item = await api(`/api/items/${state.item.id}`);
    state.item = item;
    const newRev = status === 'ECO' ? item.revisions?.[0] : item.revisions?.find(r => r.id === state.activeRevId) || item.revisions?.[0];
    state.activeRevId = newRev?.id;
    renderItemDetail(item, newRev?.id);
  }
  refreshProjectTree();
}

// ── DATASETS ─────────────────────────────────────────────────
let upFiles = [];
function openUploadModal(revId, itemNumber, rev) {
  upFiles=[];
  state.uploadItemNumber = itemNumber || '';
  state.uploadRev = rev || '';
  set('up-rev-id',revId); set('up-ver','1'); set('up-notes','');
  document.getElementById('upPreview').innerHTML='';
  document.getElementById('upInput').value='';
  // Show auto-rename hint
  const hint = document.getElementById('up-rename-hint');
  if (hint) hint.textContent = itemNumber ? 'Dateien werden umbenannt zu: ' + itemNumber + '_Rev' + rev + '_NNN.ext' : '';
  openModal('uploadModal');
}

function setupUploadDrag() {
  const zone = document.getElementById('upZone');
  document.getElementById('upInput').addEventListener('change', e => handleFiles(e.target.files));
  zone.addEventListener('dragover', e=>{e.preventDefault();zone.classList.add('drag')});
  zone.addEventListener('dragleave', ()=>zone.classList.remove('drag'));
  zone.addEventListener('drop', e=>{e.preventDefault();zone.classList.remove('drag');handleFiles(e.dataTransfer.files)});
}

function handleFiles(files) {
  upFiles = [...upFiles, ...Array.from(files)];
  const itemNumber = state.uploadItemNumber || '';
  const rev = state.uploadRev || '';
  document.getElementById('upPreview').innerHTML = upFiles.map((f,i) => {
    const newName = itemNumber ? buildUploadName(f.name, itemNumber, rev, i) : f.name;
    const renamed = itemNumber && newName !== f.name;
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-top:5px;font-size:12px">
      &#x1F4C4; <div style="flex:1;min-width:0">
        ${renamed ? `<div style="color:var(--t3);text-decoration:line-through;font-size:10px">${esc(f.name)}</div>` : ''}
        <div style="color:${renamed?'var(--teal)':'var(--t1)'}">${esc(newName)}</div>
      </div>
      <span style="color:var(--t3);font-size:10px;flex-shrink:0">${fmtSize(f.size)}</span>
    </div>`;
  }).join('');
}

function buildUploadName(originalName, itemNumber, rev, index) {
  // Build: 0028-asm-001-prt-007_rev1_001.stl
  const ext = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  const base = itemNumber + '_rev' + rev + '_' + String(index+1).padStart(3,'0');
  return base + ext;
}

async function doUpload() {
  if (!upFiles.length) return toast('Keine Datei ausgewaehlt','err');
  const revId = V('up-rev-id');
  const itemNumber = state.uploadItemNumber || '';
  const rev = state.uploadRev || '';
  document.getElementById('upBtn').textContent = 'Hochladen...';
  for (let i = 0; i < upFiles.length; i++) {
    const f = upFiles[i];
    const newName = itemNumber ? buildUploadName(f.name, itemNumber, rev, i) : f.name;
    // Rename file by creating a new File object with the new name
    const renamedFile = itemNumber ? new File([f], newName, { type: f.type }) : f;
    const fd = new FormData();
    fd.append('file', renamedFile);
    fd.append('version', V('up-ver'));
    fd.append('notes', V('up-notes'));
    await fetch(API+'/api/revisions/'+revId+'/datasets', { method:'POST', body:fd });
  }
  document.getElementById('upBtn').textContent = 'Hochladen';
  toast(upFiles.length+' Datei(en) hochgeladen','ok');
  closeModal('uploadModal');
  if (state.item) await switchRev(state.item.id, parseInt(revId));
}

function openEditDatasetModal(id, name, notes) {
  set('dsed-id', id); set('dsed-name', name); set('dsed-notes', notes);
  openModal('datasetEditModal');
}
async function saveDatasetEdit() {
  const id = V('dsed-id');
  await api(`/api/datasets/${id}`, 'PUT', { original_name: V('dsed-name'), notes: V('dsed-notes') });
  toast('Gespeichert', 'ok'); closeModal('datasetEditModal');
  if (state.item) { const item = await api(`/api/items/${state.item.id}`); state.item = item; renderItemDetail(item, state.activeRevId); }
}

async function delDataset(dsId, revId) {
  if (!confirm('Datei löschen?')) return;
  await api(`/api/datasets/${dsId}`,'DELETE');
  toast('Datei gelöscht','ok');
  if (state.item) await switchRev(state.item.id, revId);
}

// ── BOM ───────────────────────────────────────────────────────
async function openBomModal(revId, projectId) {
  set('bom-rev-id', revId); set('bom-qty','1'); set('bom-notes','');
  const items = await api(`/api/projects/${projectId}/items-for-bom`);
  const sel = document.getElementById('bom-child-id');
  sel.innerHTML = '<option value="">— wählen —</option>' +
    items.map(i=>`<option value="${i.id}">${i.item_number} · ${esc(i.name)}</option>`).join('');
  openModal('bomModal');
}

async function doBomAdd() {
  const childId = V('bom-child-id'); if (!childId) return toast('Item wählen','err');
  const revId = V('bom-rev-id');
  await api(`/api/revisions/${revId}/bom`,'POST',{child_item_id:parseInt(childId),quantity:parseFloat(V('bom-qty'))||1,unit:V('bom-unit'),notes:V('bom-notes')});
  toast('Position hinzugefügt','ok'); closeModal('bomModal');
  if (state.item) await switchRev(state.item.id, parseInt(revId));
  refreshProjectTree();
}

async function delBom(bomId, itemId, revId) {
  await api(`/api/bom/${bomId}`,'DELETE');
  toast('Position entfernt','ok');
  if (state.item) await switchRev(itemId, revId);
  refreshProjectTree();
}

// ── PRINT SETTINGS ────────────────────────────────────────────
async function loadPsConfig() {
  if (state._psConfigLoaded) return;
  [state.printers, state.nozzles, state.materialPresets] = await Promise.all([
    api('/api/printers'), api('/api/nozzles'), api('/api/material-presets')
  ]);
  state._psConfigLoaded = true;
}
function _populatePsSelects() {
  const matSel = document.getElementById('ps-mat-preset');
  if (matSel) matSel.innerHTML = '<option value="">— Vorlage auswählen (füllt Felder automatisch aus) —</option>' +
    state.materialPresets.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const nozSel = document.getElementById('ps-nozzle');
  if (nozSel) nozSel.innerHTML = '<option value="">—</option>' +
    state.nozzles.map(n=>`<option value="${n.size}">${n.size} mm</option>`).join('');
  const prSel = document.getElementById('ps-printer');
  if (prSel) prSel.innerHTML = '<option value="">— kein —</option>' +
    state.printers.map(p=>`<option value="${esc(p.name)}" data-cost="${p.cost_per_hour}">${esc(p.name)} (${p.cost_per_hour} CHF/h)</option>`).join('');
}
async function openPsModal(revId, ps) {
  await loadPsConfig();
  _populatePsSelects();
  set('ps-rev-id',revId);
  set('ps-mat',ps.material||''); set('ps-col',ps.color||''); set('ps-layer',ps.layer_height||'');
  set('ps-infill',ps.infill||''); set('ps-temp',ps.print_temp||'');
  set('ps-bed',ps.bed_temp||''); set('ps-notes',ps.notes||'');
  document.getElementById('ps-sup').value = ps.supports||'';
  document.getElementById('ps-nozzle').value = ps.nozzle||'';
  document.getElementById('ps-printer').value = ps.printer||'';
  document.getElementById('ps-mat-preset').value = '';
  set('ps-cost-hr', ps.printer_cost_hr || state.settings.default_machine_cost_hr || '');
  set('ps-fil-price', ps.filament_price_kg || state.settings.default_filament_price_kg || '');
  set('ps-fil-weight', ps.filament_weight_total||'');
  set('ps-duration', ps.print_duration||'');
  document.getElementById('cost-preview').style.display = 'none';
  calcCost();
  openModal('psModal');
}
function applyMaterialPreset(presetId) {
  if (!presetId) return;
  const m = state.materialPresets.find(x => x.id == presetId);
  if (!m) return;
  set('ps-mat', m.name);
  set('ps-temp', m.print_temp||'');
  set('ps-bed', m.bed_temp||'');
  if (m.nozzle) document.getElementById('ps-nozzle').value = m.nozzle;
  if (m.filament_price_kg) set('ps-fil-price', m.filament_price_kg);
  document.getElementById('ps-mat-preset').value = '';
  calcCost();
}
function onPsPrinterChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (opt && opt.dataset.cost !== undefined && opt.dataset.cost !== '') {
    set('ps-cost-hr', opt.dataset.cost);
    calcCost();
  }
}
// Same helpers exposed for delivery item manual entry
function _populateDimSelects() {
  const matSel = document.getElementById('dim-man-preset');
  if (matSel) matSel.innerHTML = '<option value="">— Vorlage auswählen —</option>' +
    state.materialPresets.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const nozSel = document.getElementById('dim-man-nozzle');
  if (nozSel) nozSel.innerHTML = '<option value="">—</option>' +
    state.nozzles.map(n=>`<option value="${n.size}">${n.size} mm</option>`).join('');
  const prSel = document.getElementById('dim-man-printer');
  if (prSel) prSel.innerHTML = '<option value="">— kein —</option>' +
    state.printers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
}
function applyDimPreset(presetId) {
  if (!presetId) return;
  const m = state.materialPresets.find(x => x.id == presetId);
  if (!m) return;
  set('dim-man-mat', m.name);
  set('dim-man-temp', m.print_temp||'');
  set('dim-man-bed', m.bed_temp||'');
  if (m.nozzle) document.getElementById('dim-man-nozzle').value = m.nozzle;
  document.getElementById('dim-man-preset').value = '';
}
function dimTab(tab) {
  ['3mf','manual'].forEach(t => {
    document.getElementById('dim-section-'+t).style.display = t===tab ? '' : 'none';
    document.getElementById('dim-tab-'+t).classList.toggle('active', t===tab);
    document.getElementById('dim-tab-'+t).classList.toggle('btn-ghost', t!==tab);
  });
}

function calcCost() {
  const filPrice = parseFloat(V('ps-fil-price')) || 0;
  const filWeight = parseFloat(V('ps-fil-weight')) || 0;
  const duration = parseFloat(V('ps-duration')) || 0;
  const costHr = parseFloat(V('ps-cost-hr')) || 0;
  if (!filPrice && !costHr) { document.getElementById('cost-preview').style.display='none'; return; }
  const matCost = (filWeight / 1000) * filPrice;
  const machCost = duration * costHr;
  const waste = 0;
  const total = matCost + machCost;
  document.getElementById('cr-mat').textContent = fmtN(matCost) + ' CHF';
  document.getElementById('cr-mach').textContent = fmtN(machCost) + ' CHF';
  document.getElementById('cr-total').textContent = fmtN(total) + ' CHF';
  document.getElementById('cost-preview').style.display = 'block';
}

async function savePrintSettings() {
  const revId = V('ps-rev-id');
  await api('/api/revisions/'+revId+'/print-settings','PUT',{
    material:V('ps-mat'),color:V('ps-col'),layer_height:V('ps-layer'),infill:V('ps-infill'),
    supports:document.getElementById('ps-sup').value,
    nozzle:document.getElementById('ps-nozzle').value,
    print_temp:V('ps-temp'),bed_temp:V('ps-bed'),
    printer:document.getElementById('ps-printer').value,notes:V('ps-notes'),
    printer_cost_hr: parseFloat(V('ps-cost-hr'))||null,
    filament_price_kg: parseFloat(V('ps-fil-price'))||null,
    filament_weight_total: parseFloat(V('ps-fil-weight'))||null,
    print_duration: parseFloat(V('ps-duration'))||null,
  });
  toast('Druckparameter gespeichert','ok'); closeModal('psModal');
  if (state.item) await switchRev(state.item.id, parseInt(revId));
}

// ── CUSTOMERS CRUD ────────────────────────────────────────────
let editingCustomerId = null;
async function openCustomerModal(id) {
  editingCustomerId = id||null;
  if (id) {
    const c = state.customers.find(x=>x.id===id) || await api(`/api/customers/${id}`);
    set('cm-name',c.name); set('cm-email',c.email); set('cm-phone',c.phone);
    set('cm-street',c.street||''); set('cm-plz',c.postal_code||'');
    set('cm-city',c.city||''); set('cm-country',c.country||'Schweiz');
    set('cm-notes',c.notes||'');
    document.getElementById('cm-title').textContent='Kunde bearbeiten';
  } else {
    ['cm-name','cm-email','cm-phone','cm-street','cm-plz','cm-city','cm-notes'].forEach(f=>set(f,''));
    set('cm-country','Schweiz');
    document.getElementById('cm-title').textContent='Neuer Kunde';
  }
  set('cm-id',id||''); openModal('customerModal');
}

async function saveCustomer() {
  const name=V('cm-name'); if(!name) return toast('Name fehlt','err');
  const body={name,email:V('cm-email'),phone:V('cm-phone'),
    street:V('cm-street'),postal_code:V('cm-plz'),city:V('cm-city'),country:V('cm-country')||'Schweiz',
    notes:V('cm-notes')};
  if (editingCustomerId) await api(`/api/customers/${editingCustomerId}`,'PUT',body);
  else await api('/api/customers','POST',body);
  toast('Gespeichert','ok'); closeModal('customerModal'); renderCustomers(); loadStats();
}

async function delCustomer(id) {
  if(!confirm('Kunden löschen?')) return;
  await api(`/api/customers/${id}`,'DELETE'); toast('Gelöscht','ok'); renderCustomers(); loadStats();
}

// ── ORDERS CRUD ───────────────────────────────────────────────
let editingOrderId = null;
function onCustChange(pfx) {
  const sel = document.getElementById(pfx+'-customer');
  const inp = document.getElementById(pfx+'-customer-free');
  if (inp) inp.style.display = sel.value === '__free__' ? '' : 'none';
}
function setCustFields(pfx, customer_id, customer_name_free) {
  const sel = document.getElementById(pfx+'-customer');
  const inp = document.getElementById(pfx+'-customer-free');
  if (customer_name_free && !customer_id) {
    sel.value = '__free__';
    if (inp) { inp.style.display = ''; inp.value = customer_name_free; }
  } else {
    sel.value = customer_id || '';
    if (inp) { inp.style.display = 'none'; inp.value = ''; }
  }
}
let _omCustTimer = null;
async function searchCustomerForOrder(q) {
  clearTimeout(_omCustTimer);
  const res = document.getElementById('om-customer-results');
  const sel = document.getElementById('om-customer-selected');
  if (sel) sel.style.display = 'none';
  if (!q || q.length < 1) { res.style.display = 'none'; return; }
  _omCustTimer = setTimeout(async () => {
    const all = state.customers || [];
    const ql = q.toLowerCase();
    const matches = all.filter(c => c.name.toLowerCase().includes(ql) || (c.number||'').toLowerCase().includes(ql));
    if (!matches.length) {
      res.innerHTML = `<div style="padding:9px 12px;font-size:12px;color:var(--t3)">Keine Treffer</div>`
        + `<div onclick="selectOrderCustomerFree('${esc(q)}')" style="padding:9px 12px;cursor:pointer;font-size:12px;border-top:1px solid var(--line)"
            onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
            ✏ "${esc(q)}" als Freitext verwenden</div>`;
    } else {
      res.innerHTML = matches.map(c =>
        `<div onclick="selectOrderCustomer(${c.id},'${esc(c.number)} ${esc(c.name)}')"
          style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${c.number}</span>
          <span style="font-size:12px;flex:1">${esc(c.name)}</span>
        </div>`).join('')
        + `<div onclick="selectOrderCustomerFree('${esc(q)}')" style="padding:9px 12px;cursor:pointer;font-size:12px;color:var(--t3);border-top:1px solid var(--line)"
            onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
            ✏ "${esc(q)}" als Freitext verwenden</div>`;
    }
    res.style.display = 'block';
  }, 150);
}
function selectOrderCustomer(id, label) {
  document.getElementById('om-customer').value = id;
  document.getElementById('om-customer-free').style.display = 'none';
  document.getElementById('om-customer-search').value = '';
  document.getElementById('om-customer-results').style.display = 'none';
  const sel = document.getElementById('om-customer-selected');
  document.getElementById('om-customer-name').textContent = label;
  sel.style.display = 'flex';
}
function selectOrderCustomerFree(name) {
  document.getElementById('om-customer').value = '__free__';
  document.getElementById('om-customer-free').value = name;
  document.getElementById('om-customer-free').style.display = '';
  document.getElementById('om-customer-search').value = '';
  document.getElementById('om-customer-results').style.display = 'none';
  const sel = document.getElementById('om-customer-selected');
  document.getElementById('om-customer-name').textContent = '✏ ' + name;
  sel.style.display = 'flex';
}
function clearOrderCustomer() {
  document.getElementById('om-customer').value = '';
  document.getElementById('om-customer-free').style.display = 'none';
  document.getElementById('om-customer-free').value = '';
  document.getElementById('om-customer-search').value = '';
  document.getElementById('om-customer-results').style.display = 'none';
  const sel = document.getElementById('om-customer-selected');
  if (sel) sel.style.display = 'none';
}
function getCustBody(pfx) {
  if (pfx === 'om') {
    const val = document.getElementById('om-customer').value;
    if (val === '__free__') return { customer_id: null, customer_name_free: document.getElementById('om-customer-free').value.trim() || null };
    return { customer_id: val || null, customer_name_free: null };
  }
  const sel = document.getElementById(pfx+'-customer');
  if (sel.value === '__free__') {
    return { customer_id: null, customer_name_free: document.getElementById(pfx+'-customer-free').value.trim() || null };
  }
  return { customer_id: sel.value || null, customer_name_free: null };
}

async function openOrderModal(id) {
  editingOrderId=id||null;
  const customers=await api('/api/customers'); state.customers=customers;
  clearOrderCustomer();
  if (id) {
    const o=await api(`/api/orders/${id}`);
    set('om-title-f',o.title);
    if (o.customer_id) {
      const c = customers.find(x => x.id === o.customer_id);
      if (c) selectOrderCustomer(c.id, c.number + ' ' + c.name);
    } else if (o.customer_name_free) {
      selectOrderCustomerFree(o.customer_name_free);
    }
    document.getElementById('om-status').value=o.status;
    set('om-date',o.order_date||''); set('om-delivery',o.delivery_date||''); set('om-notes',o.notes||'');
    set('om-tax',o.tax_rate??''); set('om-disc',o.discount_pct??0); set('om-terms',o.payment_terms||'');
    document.getElementById('om-include-tax').checked = !!o.include_tax;
    document.getElementById('om-title').textContent='Auftrag bearbeiten';
  } else {
    ['om-title-f','om-date','om-delivery','om-notes','om-terms'].forEach(f=>set(f,''));
    document.getElementById('om-status').value='DRAFT';
    set('om-tax', state.settings.default_tax_rate ?? '');
    set('om-disc',0);
    set('om-terms', state.settings.default_payment_terms || '');
    document.getElementById('om-include-tax').checked = false;
    document.getElementById('om-title').textContent='Neuer Auftrag';
  }
  set('om-id',id||''); openModal('orderModal');
}

async function saveOrder() {
  const title=V('om-title-f'); if(!title) return toast('Bezeichnung fehlt','err');
  const body={title,...getCustBody('om'),status:document.getElementById('om-status').value,
    notes:V('om-notes'),order_date:V('om-date')||null,delivery_date:V('om-delivery')||null,
    tax_rate:parseFloat(V('om-tax'))||0, discount_pct:parseFloat(V('om-disc'))||0,
    payment_terms:V('om-terms'), include_tax:document.getElementById('om-include-tax').checked?1:0};
  if (editingOrderId) {
    await api(`/api/orders/${editingOrderId}`,'PUT',body);
    toast('Gespeichert','ok'); closeModal('orderModal');
    openOrderDetail(editingOrderId);
  } else {
    const o = await api('/api/orders','POST',body);
    toast('Auftrag angelegt','ok'); closeModal('orderModal');
    await renderOrders(); openOrderDetail(o.id);
  }
  loadStats();
}

async function delOrder(id) {
  const o = state.orders.find(x => x.id === id) || await api(`/api/orders/${id}`);
  if(!confirm(`Auftrag ${o.number} löschen?`)) return;
  await api(`/api/orders/${id}`,'DELETE'); toast('Gelöscht','ok'); closeDetail(); renderOrders(); loadStats();
}

// ── QUOTES ────────────────────────────────────────────────────
let _quoteFilter = { text:'', status:'', dateFrom:'', dateTo:'' };
function _clearQuoteFilter(){_quoteFilter={text:'',status:'',dateFrom:'',dateTo:''};renderQuotes();}
async function renderQuotes() {
  setLeftHeader('Angebote', `<button class="btn btn-primary btn-sm" onclick="openQuoteModal()">+ Angebot</button>`);
  const quotes = await api('/api/quotes');
  state.quotes = quotes;
  if (!quotes.length) { setLeftBody(`<div class="empty"><div class="empty-icon">📄</div><div class="empty-text">Noch keine Angebote</div></div>`); return; }
  setLeftBody(_filterBar(_quoteFilter,[['DRAFT','Entwurf'],['SENT','Versendet'],['ACCEPTED','Akzeptiert'],['DECLINED','Abgelehnt']],'_clearQuoteFilter','_quote')+
    `<div class="tbl-wrap"><table>
      <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Kunde</th><th>Pos.</th><th>Status</th><th>Gültig bis</th><th></th></tr></thead>
      <tbody id="_quote-tbody"></tbody>
    </table></div>`);
  _render_quoteRows();
}
function _render_quoteRows() {
  const t = _quoteFilter.text.toLowerCase(); const s = _quoteFilter.status;
  const df = _quoteFilter.dateFrom; const dt = _quoteFilter.dateTo;
  const rows = (state.quotes||[]).filter(q =>
    (!t || q.title.toLowerCase().includes(t) || (q.customer_name||'').toLowerCase().includes(t) || q.number.includes(t)) &&
    (!s || q.status === s) &&
    (!df || (q.quote_date||'') >= df) &&
    (!dt || (q.quote_date||'') <= dt)
  );
  const el = document.getElementById('_quote-tbody');
  if (!el) return;
  el.innerHTML = rows.map(q=>`<tr onclick="openQuoteDetail(${q.id})">
    <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${q.number}</td>
    <td style="font-weight:500">${esc(q.title)}</td>
    <td style="color:var(--t2)">${q.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${(q.items||[]).length}</td>
    <td>${_stSel('quote',q.id,q.status)}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${q.valid_until||'—'}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generateDoc(${q.id},'quote')" title="Angebot PDF">&#128196;</button>
      ${q.status==='DRAFT' ? `<button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delQuote(${q.id})">&#x2715;</button>` : ''}
    </td>
  </tr>`).join('') || '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Treffer</td></tr>';
}

async function openQuoteDetail(id) {
  const q = await api(`/api/quotes/${id}`);
  const rec = (state.quotes||[]).find(x=>x.id===id); if (rec) Object.assign(rec, q);
  _trackRecent('quote', q.id, q.title, q.number);
  _pushHistory({ view: 'quotes', detailType: 'quote', detailId: q.id });
  document.getElementById('dp-title').innerHTML = `<strong>${q.number}</strong>&nbsp;${esc(q.title)}`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'qd-pos')">Positionen</button>
    <button class="tab" onclick="switchTab(this,'qd-info')">Details</button>`;
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const estHours = q.estimated_hours || 0;
  const hoursCost = estHours * hourlyRate;
  const hoursSection = estHours > 0 ? (() => {
    const items = q.items || [];
    const subtotal = items.reduce((s,i)=>s+(i.quantity*i.unit_price*(1-(i.discount_pct||0)/100)),0);
    const discAmt = subtotal * (q.discount_pct||0) / 100;
    const net = subtotal - discAmt;
    const grandNet = q.include_hours ? net + hoursCost : net;
    const tax = q.include_tax ? grandNet * (q.tax_rate||0) / 100 : 0;
    const grandTotal = grandNet + tax;
    return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-bottom:10px;font-size:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:600;color:var(--t2)">Arbeitszeit</span>
        <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="openQuoteModal(${id})">✏️ Ändern</button>
      </div>
      <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap">
        <span style="color:var(--t3)">${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h</span>
        <span style="font-family:var(--mono);font-weight:600;color:${q.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>
        <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:${q.include_hours?'rgba(91,211,138,.12)':'var(--bg2)'};color:${q.include_hours?'var(--green)':'var(--t3)'}">${q.include_hours?'eingerechnet':'nicht eingerechnet'}</span>
      </div>
      ${q.include_hours && items.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:flex-end">
        <div style="text-align:right;font-size:12px;color:var(--t2)">Gesamttotal inkl. Arbeitszeit:
          <span style="font-family:var(--mono);font-weight:700;font-size:14px;color:var(--green);margin-left:8px">${fmtCHF(grandTotal)}</span>
        </div>
      </div>` : ''}
    </div>`;
  })() : '';
  document.getElementById('dp-body').innerHTML = `
    <div id="qd-pos">
      ${renderLineItems(q.items||[], 'quote', id, q.tax_rate??0, q.discount_pct||0, !!q.include_tax)}
      ${hoursSection}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="openLineItemModal('quote',${id})">+ Position</button>
    </div>
    <div id="qd-info" style="display:none">
      <div class="sep-label">Angebotsdaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('quote',id,q.status)}</div>
        <div><div class="ps-label">Kunde</div>${q.customer_name||'—'}</div>
        <div><div class="ps-label">Datum</div>${q.quote_date||'—'}</div>
        <div><div class="ps-label">Gültig bis</div>${q.valid_until||'—'}</div>
        <div><div class="ps-label">MwSt.</div>${q.tax_rate??0} % ${q.include_tax?'<span style="color:var(--green);font-size:10px">(ausgewiesen)</span>':'<span style="color:var(--t3);font-size:10px">(ohne)</span>'}</div>
        ${estHours>0?`<div><div class="ps-label">Arbeitszeit</div>${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h = <span style="font-family:var(--mono);color:${q.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>${q.include_hours?' <span style="color:var(--green);font-size:10px">(eingerechnet)</span>':' <span style="color:var(--t3);font-size:10px">(nicht eingerechnet)</span>'}</div>`:''}
        ${(q.discount_pct||0)>0?`<div><div class="ps-label">Gesamtrabatt</div>${q.discount_pct} %</div>`:''}
        ${q.payment_terms?`<div style="grid-column:span 2"><div class="ps-label">Zahlungsbedingungen</div>${esc(q.payment_terms)}</div>`:''}
        ${q.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(q.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openQuoteModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'quote')">&#128196; Angebot PDF</button>
        ${q.status !== 'ACCEPTED' ? `<button class="btn btn-green btn-sm" onclick="convertQuoteToOrder(${id})">➜ In Auftrag umwandeln</button>` : ''}
        ${q.status==='DRAFT' ? `<button class="btn btn-red btn-sm" onclick="delQuote(${id})">🗑 Löschen</button>` : ''}
      </div>
    </div>`;
  showDetail();
}

let editingQuoteId = null;
async function openQuoteModal(id) {
  editingQuoteId=id||null;
  const customers=await api('/api/customers'); state.customers=customers;
  const sel=document.getElementById('qm-customer');
  sel.innerHTML='<option value="">— keiner —</option><option value="__free__">✏ Name eingeben...</option>'+customers.map(c=>`<option value="${c.id}">${c.number} ${esc(c.name)}</option>`).join('');
  if (id) {
    const q=await api(`/api/quotes/${id}`);
    set('qm-title-f',q.title); setCustFields('qm',q.customer_id,q.customer_name_free); document.getElementById('qm-status').value=q.status;
    set('qm-date',q.quote_date||''); set('qm-valid',q.valid_until||''); set('qm-notes',q.notes||'');
    set('qm-tax',q.tax_rate??''); set('qm-disc',q.discount_pct??0); set('qm-terms',q.payment_terms||'');
    document.getElementById('qm-include-tax').checked = !!q.include_tax;
    set('qm-hours', q.estimated_hours||0);
    document.getElementById('qm-include-hours').checked = !!q.include_hours;
    document.getElementById('qm-title').textContent='Angebot bearbeiten';
  } else {
    ['qm-title-f','qm-date','qm-valid','qm-notes','qm-terms'].forEach(f=>set(f,''));
    document.getElementById('qm-status').value='DRAFT';
    set('qm-tax', state.settings.default_tax_rate ?? '');
    set('qm-disc', 0);
    set('qm-terms', state.settings.default_payment_terms || '');
    document.getElementById('qm-include-tax').checked = false;
    set('qm-hours', 0);
    document.getElementById('qm-include-hours').checked = false;
    const validDays = parseInt(state.settings.quote_validity_days);
    if (validDays > 0) {
      const validDate = new Date(); validDate.setDate(validDate.getDate() + validDays);
      set('qm-valid', validDate.toISOString().split('T')[0]);
    } else {
      set('qm-valid', '');
    }
    document.getElementById('qm-title').textContent='Neues Angebot';
  }
  set('qm-id',id||''); openModal('quoteModal');
}

async function saveQuote() {
  const title=V('qm-title-f'); if(!title) return toast('Bezeichnung fehlt','err');
  const body={title,...getCustBody('qm'),status:document.getElementById('qm-status').value,
    notes:V('qm-notes'),quote_date:V('qm-date')||null,valid_until:V('qm-valid')||null,
    tax_rate:parseFloat(V('qm-tax'))||0, discount_pct:parseFloat(V('qm-disc'))||0,
    payment_terms:V('qm-terms'), include_tax:document.getElementById('qm-include-tax').checked?1:0,
    estimated_hours:parseFloat(V('qm-hours'))||0,
    include_hours:document.getElementById('qm-include-hours').checked?1:0};
  if (editingQuoteId) {
    await api(`/api/quotes/${editingQuoteId}`,'PUT',body);
    toast('Gespeichert','ok'); closeModal('quoteModal');
    openQuoteDetail(editingQuoteId);
  } else {
    const q=await api('/api/quotes','POST',body);
    toast('Angebot angelegt','ok'); closeModal('quoteModal');
    await renderQuotes(); openQuoteDetail(q.id);
  }
  loadStats();
}

async function delQuote(id) {
  const q = state.quotes.find(x => x.id === id) || await api(`/api/quotes/${id}`);
  if(!confirm(`Angebot ${q.number} löschen?`)) return;
  await api(`/api/quotes/${id}`,'DELETE'); toast('Gelöscht','ok'); closeDetail(); renderQuotes(); loadStats();
}

async function convertQuoteToOrder(quoteId) {
  if(!confirm('Angebot in Auftrag umwandeln? Das Angebot wird als "Akzeptiert" markiert.')) return;
  const o = await api(`/api/quotes/${quoteId}/convert`,'POST',{});
  toast('Auftrag '+o.number+' angelegt','ok');
  gotoView('orders');
  openOrderDetail(o.id);
}

// ── LINE ITEMS (shared for orders + quotes) ────────────────────
function renderLineItems(items, parentType, parentId, taxRate, discountPct, includeTax) {
  const subtotal = items.reduce((s,i)=>s+(i.quantity*i.unit_price*(1-(i.discount_pct||0)/100)),0);
  const discAmt = subtotal * discountPct / 100;
  const net = subtotal - discAmt;
  const tax = includeTax ? net * taxRate / 100 : 0;
  const total = net + tax;
  const hasLineDiscount = items.some(i=>(i.discount_pct||0)>0);
  const showDiscount = hasLineDiscount || discountPct > 0;
  if (!items.length) return `<div style="color:var(--t3);font-size:12px;padding:8px 0">Noch keine Positionen</div>`;
  return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
    <table style="width:100%">
      <thead><tr>
        <th style="text-align:left;padding:7px 8px;font-family:var(--mono);font-size:9px;color:var(--t3);border-bottom:1px solid var(--line)">Beschreibung</th>
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:9px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Menge</th>
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:9px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Preis</th>
        ${showDiscount?`<th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:9px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Rab.</th>`:''}
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:9px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Total</th>
        <th style="border-bottom:1px solid var(--line)"></th>
      </tr></thead>
      <tbody>
        ${items.map((i,idx)=>{
          const lineTotal = i.quantity*i.unit_price*(1-(i.discount_pct||0)/100);
          const isFirst = idx===0, isLast = idx===items.length-1;
          const mc = i.manufacturing_cost;
          const costTotal = mc ? mc.total * i.quantity : null;
          const margin = (costTotal != null) ? lineTotal - costTotal : null;
          const marginColor = margin == null ? '' : margin < 0 ? 'color:var(--red)' : margin < lineTotal * 0.15 ? 'color:var(--yellow)' : 'color:var(--green)';
          const costHint = mc ? `<div style="font-size:10px;margin-top:2px;color:var(--t3)">Herst.: ${fmtChf(mc.total)}${mc.from_bom?' <span style="color:var(--teal)">(BOM)</span>':''}${i.quantity>1?` × ${i.quantity} = ${fmtChf(costTotal)}`:''}
            <span style="margin-left:6px;${marginColor}">Marge ${fmtChf(margin)}</span></div>` : '';
          return `<tr style="border-bottom:1px solid var(--line)" onclick="openLineItemModal('${parentType}',${parentId},${i.id})">
            <td style="padding:3px 4px;width:28px" onclick="event.stopPropagation()">
              <div style="display:flex;flex-direction:column;gap:1px">
                <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:14px;font-size:9px;opacity:${isFirst?0.2:1}" ${isFirst?'disabled':''} onclick="moveLineItem('${parentType}',${i.id},${parentId},'up')">▲</button>
                <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:14px;font-size:9px;opacity:${isLast?0.2:1}" ${isLast?'disabled':''} onclick="moveLineItem('${parentType}',${i.id},${parentId},'down')">▼</button>
              </div>
            </td>
            <td style="padding:7px 8px;font-size:12px;cursor:pointer">
              ${esc(i.description)}
              ${i.notes?`<div style="font-size:10px;color:var(--t3)">${esc(i.notes)}</div>`:''}
              ${costHint}
            </td>
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:11px;white-space:nowrap">${i.quantity} ${i.unit}</td>
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:11px;white-space:nowrap">${fmtChf(i.unit_price)}</td>
            ${showDiscount?`<td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:11px;color:var(--amber)">${i.discount_pct||0}%</td>`:''}
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:11px">${fmtChf(lineTotal)}</td>
            <td style="padding:7px 8px;white-space:nowrap">
              ${parentType==='order'&&i.item_id?`<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:2px 6px;margin-right:2px" onclick="event.stopPropagation();openInventoryDeductModal(${i.id},${i.item_id},${i.quantity},'${parentId}')">📦</button>`:''}
              <button class="btn btn-icon btn-ghost btn-sm" onclick="event.stopPropagation();delLineItem('${parentType}',${i.id},${parentId})">✕</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="padding:10px 12px;border-top:1px solid var(--line);font-size:12px">
      <div style="display:flex;justify-content:flex-end;gap:24px">
        <div style="text-align:right">
          ${discountPct>0?`<div style="color:var(--t3)">Zwischentotal: <span style="font-family:var(--mono)">${fmtChf(subtotal)}</span></div>
          <div style="color:var(--amber)">Rabatt ${discountPct}%: <span style="font-family:var(--mono)">-${fmtChf(discAmt)}</span></div>`:''}
          <div style="color:var(--t2)">Netto: <span style="font-family:var(--mono)">${fmtChf(net)}</span></div>
          ${includeTax?`<div style="color:var(--t3)">MwSt. ${taxRate}%: <span style="font-family:var(--mono)">${fmtChf(tax)}</span></div>`:''}
          <div style="font-size:14px;font-weight:600;margin-top:4px;color:var(--green)">Total: <span style="font-family:var(--mono)">${fmtChf(total)}</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

let _liSearchTimer;
async function searchItemsForLine(q) {
  clearTimeout(_liSearchTimer);
  const res = document.getElementById('li-plm-results');
  if (!q || q.length < 1) { res.style.display='none'; return; }
  _liSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-all?q='+encodeURIComponent(q));
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const rev = i.latest_revision;
      const icon = _itemChip(i.item_type, 18);
      return `<div onclick="selectLinkedItem(${JSON.stringify(i).replace(/"/g,'&quot;')})"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${i.item_number}</span>
        <span style="flex:1;font-size:12px">${esc(i.name)}</span>
        <span style="font-size:10px;color:var(--t3)">${i.project_name}</span>
        ${rev?`<span class="status st-${rev.status}" style="margin-left:4px">rev${rev.rev}</span>`:''}
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

function selectLinkedItem(item) {
  set('li-linked-plm-id', item.id);
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-plm-results').style.display = 'none';
  const sel = document.getElementById('li-plm-selected');
  document.getElementById('li-plm-badge').textContent = item.item_number;
  document.getElementById('li-plm-name').textContent = item.name + ' · ' + item.project_name;
  sel.style.display = 'flex';
  if (!V('li-desc')) set('li-desc', item.item_number + ' – ' + item.name);
  if (item.default_price != null && !(parseFloat(V('li-price')) > 0)) set('li-price', item.default_price);
  // Show manufacturing cost hint
  const hint = document.getElementById('li-cost-hint');
  const mc = item.manufacturing_cost;
  if (mc) {
    const parts = [];
    if (mc.filament > 0) parts.push(`Filament ${fmtCHF(mc.filament)}`);
    if (mc.machine > 0) parts.push(`Maschine ${fmtCHF(mc.machine)}`);
    const sellPrice = item.default_price;
    const margin = sellPrice != null ? sellPrice - mc.total : null;
    const marginPct = (margin != null && mc.total > 0) ? (margin / mc.total * 100) : null;
    const marginColor = margin == null ? 'var(--t3)' : margin < 0 ? 'var(--red)' : margin < mc.total * 0.2 ? 'var(--yellow)' : 'var(--green)';
    hint.innerHTML = `<span style="color:var(--t3)">Herstellungskosten:</span> <strong>${fmtCHF(mc.total)}</strong>`
      + (mc.from_bom ? ` <span style="color:var(--teal);font-size:10px">(aus BOM)</span>` : parts.length ? ` <span style="color:var(--t3)">(${parts.join(' + ')})</span>` : '')
      + (margin != null ? ` &nbsp;·&nbsp; <span style="color:${marginColor}">Marge ${fmtCHF(margin)}${marginPct != null ? ` / ${marginPct.toFixed(0)}%` : ''}</span>` : '');
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }
}

function clearLinkedItem() {
  set('li-linked-plm-id', '');
  document.getElementById('li-plm-selected').style.display = 'none';
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-cost-hint').style.display = 'none';
}

function openLineItemModal(parentType, parentId, itemId) {
  set('li-parent-type', parentType);
  set('li-parent-id', parentId);
  set('li-item-id', itemId||'');
  set('li-linked-plm-id', '');
  document.getElementById('li-title').textContent = itemId ? 'Position bearbeiten' : 'Position hinzufügen';
  document.getElementById('li-save').textContent = itemId ? 'Speichern' : 'Hinzufügen';
  document.getElementById('li-plm-results').style.display = 'none';
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-cost-hint').style.display = 'none';

  if (itemId) {
    const src = parentType === 'order' ? state.orders : (state.quotes||[]);
    const parent = src.find(x=>x.id===parentId);
    const li = (parent?.items||[]).find(x=>x.id===itemId);
    if (li) {
      set('li-desc',li.description); set('li-qty',li.quantity); set('li-price',li.unit_price);
      set('li-disc',li.discount_pct||0); set('li-notes',li.notes||'');
      document.getElementById('li-unit').value = li.unit||'Stk';
      if (li.item_id && li.item_number) {
        set('li-linked-plm-id', li.item_id);
        const icon = _itemChip(li.item_type, 18);
        document.getElementById('li-plm-badge').textContent = icon + ' ' + li.item_number;
        document.getElementById('li-plm-name').textContent = li.description;
        document.getElementById('li-plm-selected').style.display = 'flex';
        // Show cost hint directly from already-loaded data
        const hint = document.getElementById('li-cost-hint');
        const mc = li.manufacturing_cost;
        if (mc) {
          const parts = [];
          if (mc.filament > 0) parts.push(`Filament ${fmtCHF(mc.filament)}`);
          if (mc.machine > 0) parts.push(`Maschine ${fmtCHF(mc.machine)}`);
          const sellPrice = li.unit_price;
          const margin = sellPrice != null ? sellPrice - mc.total : null;
          const marginPct = (margin != null && mc.total > 0) ? (margin / mc.total * 100) : null;
          const marginColor = margin == null ? 'var(--t3)' : margin < 0 ? 'var(--red)' : margin < mc.total * 0.2 ? 'var(--yellow)' : 'var(--green)';
          hint.innerHTML = `<span style="color:var(--t3)">Herstellungskosten:</span> <strong>${fmtCHF(mc.total)}</strong>`
            + (parts.length ? ` <span style="color:var(--t3)">(${parts.join(' + ')})</span>` : '')
            + (margin != null ? ` &nbsp;·&nbsp; <span style="color:${marginColor}">Marge ${fmtCHF(margin)}${marginPct != null ? ` / ${marginPct.toFixed(0)}%` : ''}</span>` : '');
          hint.style.display = 'block';
        } else {
          hint.style.display = 'none';
        }
      } else {
        document.getElementById('li-plm-selected').style.display = 'none';
      }
    }
  } else {
    ['li-desc','li-notes'].forEach(f=>set(f,''));
    set('li-qty',1); set('li-price',0); set('li-disc',0);
    document.getElementById('li-unit').value = 'Stk';
    document.getElementById('li-plm-selected').style.display = 'none';
  }
  openModal('lineItemModal');
}

async function saveLineItem() {
  const parentType = V('li-parent-type');
  const parentId = parseInt(V('li-parent-id'));
  const itemId = V('li-item-id');
  const desc = V('li-desc'); if(!desc) return toast('Beschreibung fehlt','err');
  const linkedPlmId = V('li-linked-plm-id') ? parseInt(V('li-linked-plm-id')) : null;
  const body = { description:desc, quantity:parseFloat(V('li-qty'))||1,
    unit:document.getElementById('li-unit').value,
    unit_price:parseFloat(V('li-price'))||0,
    discount_pct:parseFloat(V('li-disc'))||0,
    notes:V('li-notes'),
    item_id: linkedPlmId };
  if (itemId) {
    await api(`/api/${parentType === 'order' ? 'order' : 'quote'}-items/${itemId}`,'PUT',body);
    toast('Gespeichert','ok');
  } else {
    await api(`/api/${parentType === 'order' ? 'orders' : 'quotes'}/${parentId}/items`,'POST',body);
    toast('Position hinzugefügt','ok');
  }
  closeModal('lineItemModal');
  if (parentType==='order') { await renderOrders(); openOrderDetail(parentId); }
  else { await renderQuotes(); openQuoteDetail(parentId); }
}

async function delLineItem(parentType, itemId, parentId) {
  await api(`/api/${parentType === 'order' ? 'order' : 'quote'}-items/${itemId}`,'DELETE');
  toast('Position entfernt','ok');
  if (parentType==='order') { await renderOrders(); openOrderDetail(parentId); }
  else { await renderQuotes(); openQuoteDetail(parentId); }
}
async function moveLineItem(parentType, itemId, parentId, direction) {
  await api(`/api/order-items/${itemId}/move`,'PUT',{direction});
  if (parentType==='order') { const o=await api(`/api/orders/${parentId}`); document.getElementById('od-pos').innerHTML=renderLineItems(o.items||[],'order',parentId,o.tax_rate??0,o.discount_pct||0,!!o.include_tax)+'<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openLineItemModal(\'order\','+parentId+')">+ Position</button>'; }
}

// ── DETAIL PANEL ──────────────────────────────────────────────
function showDetail() { document.getElementById('detail-panel').classList.remove('hidden'); }
function closeDetail() { document.getElementById('detail-panel').classList.add('hidden'); }
function switchTab(btn, targetId) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll(`#dp-body > div`).forEach(d=>{d.style.display='none'});
  const el=document.getElementById(targetId);
  if(el) el.style.display='';
}

// ── UI HELPERS ────────────────────────────────────────────────
function setLeftHeader(title, actionsHtml) {
  if (typeof title === 'string' && !title.includes('<')) {
    document.getElementById('left-title').innerHTML = `<strong>${title}</strong>`;
  } else {
    document.getElementById('left-title').innerHTML = title;
  }
  document.getElementById('left-actions').innerHTML = actionsHtml||'';
}
function setLeftBody(html) { document.getElementById('left-body').innerHTML = html; }

async function loadStats() {
  const s = await api('/api/stats');
  document.getElementById('badge-projects').textContent = s.projects||0;
  document.getElementById('badge-customers').textContent = s.customers||0;
  document.getElementById('badge-orders').textContent = s.orders||0;
  const el = document.getElementById('badge-quotes');
  if (el) el.textContent = s.quotes||0;
  const el2 = document.getElementById('badge-deliveries');
  if (el2) el2.textContent = s.deliveries||0;
  const el3 = document.getElementById('badge-inventory');
  if (el3) el3.textContent = s.inventory||0;
}

// ── API ───────────────────────────────────────────────────────
async function api(url, method='GET', body=null) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  const r = await fetch(API+url, opts);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: 'HTTP '+r.status }));
    if (r.status !== 404) toast(e.error||'Serverfehler', 'err');
    throw new Error(e.error||'HTTP '+r.status);
  }
  return r.json();
}

// ── UTILS ─────────────────────────────────────────────────────
const V = id => document.getElementById(id)?.value||'';
const set = (id,v) => { const el=document.getElementById(id); if(el) el.value=v??''; };
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmtDate = d => d ? new Date(d).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const fmtSize = b => { if(!b) return '—'; if(b<1024) return b+'B'; if(b<1048576) return (b/1024).toFixed(1)+'KB'; return (b/1048576).toFixed(1)+'MB'; };
const fmtChf = v => fmtCHF(parseFloat(v)||0);

function toast(msg, type='ok') {
  const c=document.getElementById('toasts');
  const t=document.createElement('div');
  t.className=`toast ${type}`;
  t.innerHTML=`<span class="ti">${type==='ok'?'✓':'✕'}</span> ${esc(msg)}`;
  c.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),250)},3200);
}

// -- SHUTDOWN --------------------------------------------------
async function shutdownServer() {
  await loadCheckouts();
  const checkouts = state.checkouts;
  const totalFiles = checkouts.reduce((s, c) => s + (c.files?.length || 0), 0);
  const newCount = _scanNewCount();
  const newItemFiles = _scanResult.item_files;
  const newRootFiles = _scanResult.root_files;

  if (checkouts.length > 0) {
    _showDynModal(`<div class="modal" style="max-width:460px">
      <div class="modal-head">
        <div class="modal-title" style="color:var(--amber)">⚠ Aktive Checkouts</div>
      </div>
      <div class="modal-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:var(--t2)">${checkouts.length} Checkout(s) aktiv · ${totalFiles} Dateien</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${checkouts.map(c => `<div style="font-size:12px;font-family:var(--mono);color:var(--t3)">
            ${_itemChip(c.item_type,14)} <span style="color:var(--blue)">${esc(c.item_number)}</span> – ${esc(c.item_name)}
          </div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--t3);padding-top:4px">Vor dem Beenden einchecken (Checkout-Ordner werden gelöscht)?</div>
      </div>
      <div class="modal-foot" style="gap:6px">
        <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">Beenden ohne Einchecken</button>
        <button class="btn btn-primary" onclick="_doShutdown(true)">Einchecken & Beenden</button>
      </div>
    </div>`);
  } else if (newCount > 0) {
    const allFiles = [
      ...newItemFiles.flatMap(g => g.new_files.map(f => `<span style="color:var(--blue);font-family:var(--mono)">${esc(g.item_number)}/</span>${esc(f.name)}`)),
      ...newRootFiles.map(f => `<span style="color:var(--t3)">root/</span>${esc(f.name)}`)
    ];
    _showDynModal(`<div class="modal" style="max-width:460px">
      <div class="modal-head">
        <div class="modal-title" style="color:var(--amber)">⚠ Nicht erfasste Dateien</div>
      </div>
      <div class="modal-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:var(--t2)">${newCount} Datei(en) im Checkout-Ordner noch nicht im PLM erfasst:</div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto">
          ${allFiles.map(f => `<div style="font-size:11px;color:var(--t3)">${f}</div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--t3)">Jetzt erfassen oder später?</div>
      </div>
      <div class="modal-foot" style="gap:6px">
        <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">Trotzdem beenden</button>
        <button class="btn btn-primary" onclick="_hideDynModal();showCheckoutList()">Jetzt erfassen</button>
      </div>
    </div>`);
  } else {
    _showDynModal(`<div class="modal" style="max-width:360px">
      <div class="modal-head">
        <div class="modal-title">Server beenden</div>
      </div>
      <div class="modal-body" style="padding:14px 16px">
        <div style="font-size:13px;color:var(--t2)">PLM-Server wirklich beenden?</div>
        <div style="font-size:12px;color:var(--t3);margin-top:6px">Die Weboberfläche ist danach nicht mehr erreichbar.</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">Beenden</button>
      </div>
    </div>`);
  }
}

async function _doShutdown(checkinFirst) {
  if (checkinFirst) {
    for (const c of [...state.checkouts]) {
      try { await api('/api/checkout/checkin', 'POST', { folder: c.folder }); } catch {}
    }
  }
  _hideDynModal();
  try { await fetch('/api/shutdown', { method: 'POST' }); } catch {}
  // History leeren damit window.close() nicht geblockt wird
  history.replaceState(null, '', window.location.href);
  const closeAttempt = () => { window.close(); };
  closeAttempt();
  setTimeout(() => {
    document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0a0b0d;color:#ecedef;font-family:Manrope,sans-serif;gap:16px">'
      + '<div style="font-size:36px;color:var(--t4)">■</div>'
      + '<div style="font-size:17px;font-weight:600">PLM & ERP wurde beendet</div>'
      + '<div style="font-size:12px;color:#4a5470;margin-bottom:8px">Der Server wurde gestoppt.</div>'
      + '<button onclick="window.close()" style="background:#1d2029;border:1px solid #2a2d3a;color:#ecedef;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:Manrope,sans-serif">✕ Tab schliessen</button>'
      + '</div>';
    // Letzter Versuch nach dem DOM-Reset
    setTimeout(window.close, 100);
  }, 300);
}

// ── DELIVERIES ────────────────────────────────────────────────
const DELIVERY_ST_MAP   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
const DELIVERY_ST_LABEL = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};

let _deliveryFilter = { text:'', status:'', dateFrom:'', dateTo:'' };
function _clearDeliveryFilter(){_deliveryFilter={text:'',status:'',dateFrom:'',dateTo:''};renderDeliveries();}
async function renderDeliveries() {
  setLeftHeader('Lieferscheine', `<button class="btn btn-primary btn-sm" onclick="openDeliveryModal()">+ Lieferschein</button>`);
  const rows = await api('/api/deliveries');
  state.deliveries = rows;
  if (!rows.length) { setLeftBody(`<div class="empty"><div class="empty-icon">🚚</div><div class="empty-text">Noch keine Lieferscheine</div></div>`); return; }
  setLeftBody(_filterBar(_deliveryFilter,[['DRAFT','Entwurf'],['READY','Bereit'],['DELIVERED','Geliefert']],'_clearDeliveryFilter','_delivery')+
    `<div class="tbl-wrap"><table>
      <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Kunde</th><th>Pos.</th><th>Status</th><th>Datum</th><th></th></tr></thead>
      <tbody id="_delivery-tbody"></tbody>
    </table></div>`);
  _render_deliveryRows();
}

function _render_deliveryRows() {
  const t = _deliveryFilter.text.toLowerCase(); const s = _deliveryFilter.status;
  const df = _deliveryFilter.dateFrom; const dt = _deliveryFilter.dateTo;
  const rows = (state.deliveries||[]).filter(d =>
    (!t || d.title.toLowerCase().includes(t) || (d.customer_name||'').toLowerCase().includes(t) || d.number.includes(t)) &&
    (!s || d.status === s) &&
    (!df || (d.delivery_date||'') >= df) &&
    (!dt || (d.delivery_date||'') <= dt)
  );
  const el = document.getElementById('_delivery-tbody');
  if (!el) return;
  el.innerHTML = rows.map(d => `<tr onclick="openDeliveryDetail(${d.id})">
    <td style="font-family:var(--mono);font-size:10px;color:var(--blue)">${d.number}</td>
    <td style="font-weight:500">${esc(d.title)}</td>
    <td style="color:var(--t2)">${d.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${d.item_count||0}</td>
    <td>${_stSel('delivery',d.id,d.status)}</td>
    <td style="font-family:var(--mono);font-size:10px;color:var(--t3)">${d.delivery_date||'—'}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generateDeliveryDoc(${d.id})" title="Druckansicht">&#128196;</button>
      <button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delDelivery(${d.id})">&#x2715;</button>
    </td>
  </tr>`).join('') || '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Treffer</td></tr>';
}

async function openDeliveryDetail(id) {
  const d = await api(`/api/deliveries/${id}`);
  _trackRecent('delivery', d.id, d.title, d.number);
  _pushHistory({ view: 'deliveries', detailType: 'delivery', detailId: d.id });
  document.getElementById('dp-title').innerHTML = `<strong>${d.number}</strong>&nbsp;${esc(d.title)}`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'dd-pos')">Positionen</button>
    <button class="tab" onclick="switchTab(this,'dd-info')">Details</button>`;
  document.getElementById('dp-body').innerHTML = `
    <div id="dd-pos">
      ${renderDeliveryItems(d.items||[], id)}
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openDeliveryItemModal(${id})">+ Position</button>
    </div>
    <div id="dd-info" style="display:none">
      <div class="sep-label">Lieferscheindaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('delivery',id,d.status)}</div>
        <div><div class="ps-label">Kunde</div>${d.customer_name||'—'}</div>
        <div><div class="ps-label">Lieferdatum</div>${d.delivery_date||'—'}</div>
        ${d.manufacture_date?`<div><div class="ps-label">Herstellungsdatum</div>${d.manufacture_date}</div>`:''}
        ${d.order_number?`<div><div class="ps-label">Auftrag</div>${d.order_number} ${d.order_title?'– '+esc(d.order_title):''}</div>`:''}
        ${d.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(d.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openDeliveryModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDeliveryDoc(${id})">&#128196; Druckansicht</button>
        <button class="btn btn-red btn-sm" onclick="delDelivery(${id})">🗑 Löschen</button>
      </div>
    </div>`;
  showDetail();
}

function renderDeliveryItems(items, deliveryId) {
  if (!items.length) return `<div style="color:var(--t3);font-size:12px;padding:8px 0">Noch keine Positionen</div>`;
  const allBtn = items.length > 1 ? `<div style="display:flex;gap:6px;margin-bottom:8px">
    <button class="btn btn-teal btn-sm" onclick="printReceiptAll(${deliveryId},'short')">🖶 Alle kurz</button>
    <button class="btn btn-teal btn-sm" onclick="printReceiptAll(${deliveryId},'full')">🖶 Alle mit Parametern</button>
  </div>` : '';
  return allBtn + items.map((item,idx) => {
    const isFirst = idx===0, isLast = idx===items.length-1;
    return `
    <div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:${item.print_settings?'1px solid var(--line)':'none'}">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:9px;opacity:${isFirst?0.2:1}" ${isFirst?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'up')">▲</button>
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:9px;opacity:${isLast?0.2:1}" ${isLast?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'down')">▼</button>
        </div>
        ${item.item_number?`<span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${item.item_number}</span>`:''}
        <span style="font-size:12px;font-weight:500;flex:1">${esc(item.description)}</span>
        <span style="font-family:var(--mono);font-size:11px;color:var(--t2)">${item.quantity} ${item.unit}</span>
        ${item.unit_price!=null?`<span style="font-family:var(--mono);font-size:11px;color:var(--green)">${fmtCHF(parseFloat(item.unit_price))}</span>`:''}
        <button class="btn btn-teal btn-icon btn-sm" onclick="printReceipt(${item.id},'short')" title="Kurzbeleg">🖶</button>
        <button class="btn btn-teal btn-icon btn-sm" onclick="printReceipt(${item.id},'full')" title="Vollbeleg mit Parametern">🖶≡</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openDeliveryItemModal(${deliveryId},${item.id})" title="Bearbeiten">✏</button>
        <button class="btn btn-red btn-icon btn-sm" onclick="delDeliveryItem(${item.id},${deliveryId})">✕</button>
      </div>
      ${item.print_settings ? `<div style="padding:8px 10px">${renderSettingsPreview(item.print_settings)}</div>` : ''}
    </div>`;
  }).join('');
}

// ── 3MF SETTINGS RENDERING ────────────────────────────────────
const SETTINGS_GROUPS = [
  { label: 'Profil', color: 'var(--blue)', keys: [
    ['print_settings_id','Druckprofil'], ['printer_settings_id','Drucker'], ['filament_settings_id','Filamentprofil']
  ]},
  { label: 'Schichten & Wände', color: 'var(--teal)', keys: [
    ['layer_height','Schichthöhe (mm)'], ['first_layer_height','1. Schicht (mm)'],
    ['perimeters','Perimeter'], ['top_solid_layers','Oben (Lagen)'], ['bottom_solid_layers','Unten (Lagen)'],
    ['spiral_vase','Vase-Modus']
  ]},
  { label: 'Infill', color: 'var(--amber)', keys: [
    ['fill_density','Infill (%)'], ['fill_pattern','Muster'],
    ['top_fill_pattern','Oben-Muster'], ['bottom_fill_pattern','Unten-Muster']
  ]},
  { label: 'Support', color: 'var(--purple)', keys: [
    ['support_material','Aktiv'], ['support_material_auto','Auto-Support'],
    ['support_material_threshold','Überhangwinkel (°)'], ['support_material_pattern','Muster'],
    ['support_material_style','Stil'], ['raft_layers','Raft-Lagen']
  ]},
  { label: 'Temperatur', color: 'var(--red)', keys: [
    ['temperature','Düse (°C)'], ['first_layer_temperature','Düse 1. Schicht (°C)'],
    ['bed_temperature','Bett (°C)'], ['first_layer_bed_temperature','Bett 1. Schicht (°C)'],
    ['nozzle_temperature','Düse (°C)'], ['hot_plate_temp','Bett (°C)']
  ]},
  { label: 'Geschwindigkeit', color: 'var(--green)', keys: [
    ['perimeter_speed','Perimeter (mm/s)'], ['infill_speed','Infill (mm/s)'],
    ['travel_speed','Travel (mm/s)'], ['first_layer_speed','1. Schicht (mm/s)'],
    ['bridge_speed','Brücken (mm/s)']
  ]},
  { label: 'Kühlung', color: 'var(--teal)', keys: [
    ['fan_always_on','Lüfter immer an'], ['min_fan_speed','Min-Lüfter (%)'],
    ['max_fan_speed','Max-Lüfter (%)'], ['bridge_fan_speed','Brücken-Lüfter (%)'],
    ['disable_fan_first_layers','Lüfter aus (erste Lagen)']
  ]},
  { label: 'Filament', color: 'var(--amber)', keys: [
    ['filament_type','Typ'], ['filament_diameter','Durchmesser (mm)'],
    ['filament_density','Dichte (g/cm³)'], ['filament_cost','Preis (CHF/kg)']
  ]},
  { label: 'Diverses', color: 'var(--t2)', keys: [
    ['seam_position','Nahtposition'], ['brim_width','Brim (mm)'],
    ['skirts','Skirt-Linien'], ['wipe_tower','Wipe-Tower'],
    ['avoid_crossing_perimeters','Kreuzungen vermeiden'], ['ironing','Bügeln'],
    ['ironing_type','Bügeltyp'], ['nozzle_diameter','Düsendurchmesser (mm)'],
    ['estimated_printing_time_normal_mode','Druckzeit (geschätzt)']
  ]}
];

function getFirstVal(v) {
  if (!v) return null;
  const first = v.split(';')[0].trim();
  if (first === '0' || first === '') return null;
  if (first === '1') return 'Ja';
  // strip trailing % for cleaner display, keep value
  return first || null;
}

function renderSettingsPreview(s) {
  const knownKeys = new Set(SETTINGS_GROUPS.flatMap(g => g.keys.map(([k]) => k)));
  const groups = SETTINGS_GROUPS.map(g => {
    const cells = g.keys.map(([k, label]) => {
      const v = getFirstVal(s[k]);
      if (!v) return '';
      return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:5px 7px">
        <div style="font-family:var(--mono);font-size:8px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${label}</div>
        <div style="font-size:11px;font-weight:500;color:var(--t1)">${esc(v)}</div>
      </div>`;
    }).filter(Boolean).join('');
    if (!cells) return '';
    return `<div style="margin-bottom:8px">
      <div style="font-family:var(--mono);font-size:9px;color:${g.color};letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">${g.label}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px">${cells}</div>
    </div>`;
  }).filter(Boolean).join('');

  // Weitere Parameter nur anzeigen wenn bekannte Gruppen leer sind (reiner Fallback)
  const SKIP_KEYS = new Set([
    'bed_shape','thumbnails','thumbnails_format','before_layer_gcode','after_layer_gcode',
    'start_gcode','end_gcode','between_objects_gcode','toolchange_gcode','color_change_gcode',
    'pause_print_gcode','template_custom_gcode','feature_gcode','machine_start_gcode',
    'machine_end_gcode','change_filament_gcode','layer_change_gcode','time_lapse_gcode',
    'printer_notes','notes','compatible_printers','compatible_prints','compatible_printers_condition',
    'compatible_prints_condition','inherits','renamed_from','filename_format',
  ]);
  const SKIP_VALS = new Set(['', '0', 'nil', 'null', 'none', '0%', 'auto']);
  const extras = groups ? '' : (() => {
    const extraCells = Object.entries(s)
      .filter(([k,v]) => !knownKeys.has(k) && !SKIP_KEYS.has(k) && v && String(v).trim())
      .slice(0, 20)
      .map(([k,v]) => {
        const val = getFirstVal(v) || String(v).split(';')[0].trim();
        if (!val || SKIP_VALS.has(val.toLowerCase()) || val.includes('\n') || val.length > 40) return '';
        return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:5px 7px">
          <div style="font-family:var(--mono);font-size:8px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${esc(k.replace(/_/g,' '))}</div>
          <div style="font-size:11px;font-weight:500;color:var(--t1)">${esc(val)}</div>
        </div>`;
      }).filter(Boolean).join('');
    return extraCells ? `<div style="margin-bottom:8px">
      <div style="font-family:var(--mono);font-size:9px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Parameter</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px">${extraCells}</div>
    </div>` : '';
  })();

  return groups + extras || '<div style="font-size:11px;color:var(--t3)">Keine Settings geladen</div>';
}

// ── 3MF UPLOAD HANDLING ───────────────────────────────────────
async function handle3mfUpload(file) {
  if (!file) return;
  const status = document.getElementById('dim-3mf-status');
  const preview = document.getElementById('dim-3mf-preview');
  status.textContent = '⏳ Wird analysiert…';
  status.style.color = 'var(--amber)';
  preview.style.display = 'none';
  set('dim-settings-json', '');

  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/parse-3mf', { method: 'POST', body: fd });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      status.textContent = '✕ ' + (e.error || 'Fehler beim Parsen');
      status.style.color = 'var(--red)';
      return;
    }
    const { settings } = await r.json();
    set('dim-settings-json', JSON.stringify(settings));
    const keyCount = Object.keys(settings).length;
    status.textContent = `✓ ${keyCount} Parameter geladen · ${file.name}`;
    status.style.color = 'var(--green)';
    preview.style.display = 'block';
    preview.innerHTML = renderSettingsPreview(settings);
  } catch(e) {
    status.textContent = '✕ Verbindungsfehler';
    status.style.color = 'var(--red)';
  }
}

// ── DELIVERY ITEM SEARCH (reuses items-all endpoint) ──────────
let _dimSearchTimer;
async function searchItemsForDim(q) {
  clearTimeout(_dimSearchTimer);
  const res = document.getElementById('dim-plm-results');
  if (!q || q.length < 1) { res.style.display='none'; return; }
  _dimSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-all?q='+encodeURIComponent(q));
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const icon = _itemChip(i.item_type, 18);
      return `<div onclick="selectDimLinkedItem(${JSON.stringify(i).replace(/"/g,'&quot;')})"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${i.item_number}</span>
        <span style="flex:1;font-size:12px">${esc(i.name)}</span>
        <span style="font-size:10px;color:var(--t3)">${i.project_name}</span>
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

async function _showDimStockInfo(itemId) {
  const el = document.getElementById('dim-stock-info');
  if (!el) return;
  try {
    const s = await api('/api/inventory/stock-check?item_id=' + itemId);
    if (!s) { el.style.display = 'none'; return; }
    const avail = (s.stock_qty || 0) - (s.planned_qty || 0);
    const color = s.stock_qty <= 0 ? 'var(--red)' : avail <= 0 ? 'var(--amber)' : 'var(--green)';
    el.style.display = 'block';
    el.style.background = s.stock_qty <= 0 ? 'var(--red-soft)' : avail <= 0 ? 'var(--amber-soft)' : 'var(--green-soft)';
    el.style.borderColor = s.stock_qty <= 0 ? 'var(--red-line)' : avail <= 0 ? 'var(--amber-line)' : 'var(--green-line)';
    el.style.color = color;
    el.innerHTML = `<b>Lager: ${fmtN(s.stock_qty, 0)} ${s.unit}</b>`
      + (s.planned_qty > 0 ? ` · ${fmtN(s.planned_qty, 0)} geplant (offene Aufträge)` : '')
      + ` · <b style="color:${color}">Verfügbar: ${fmtN(avail, 0)} ${s.unit}</b>`
      + (s.stock_qty <= 0 ? ' — <b>Kein Bestand!</b>' : '');
  } catch { el.style.display = 'none'; }
}

function selectDimLinkedItem(item) {
  set('dim-linked-plm-id', item.id);
  document.getElementById('dim-plm-search').value = '';
  document.getElementById('dim-plm-results').style.display = 'none';
  const icon = _itemChip(item.item_type, 18);
  document.getElementById('dim-plm-badge').textContent = icon + ' ' + item.item_number;
  document.getElementById('dim-plm-name').textContent = item.name + ' · ' + item.project_name;
  document.getElementById('dim-plm-selected').style.display = 'flex';
  _showDimStockInfo(item.id);
  if (!V('dim-desc')) set('dim-desc', item.item_number + ' – ' + item.name);
  if (item.default_price != null && !V('dim-price')) set('dim-price', item.default_price);
  // Auto-fill manual print parameters from linked item's print settings
  const ps = item.latest_revision && item.latest_revision.print_settings;
  if (ps) {
    if (ps.filament_weight_total && !V('dim-man-fw')) set('dim-man-fw', ps.filament_weight_total);
    if (ps.print_duration && !V('dim-man-dur')) set('dim-man-dur', ps.print_duration);
    if (ps.material && !V('dim-man-mat')) set('dim-man-mat', ps.material);
    if (ps.print_temp && !V('dim-man-temp')) set('dim-man-temp', ps.print_temp);
    if (ps.bed_temp && !V('dim-man-bed')) set('dim-man-bed', ps.bed_temp);
    if (ps.nozzle && !document.getElementById('dim-man-nozzle').value) document.getElementById('dim-man-nozzle').value = ps.nozzle;
    if (ps.layer_height && !V('dim-man-layer')) set('dim-man-layer', ps.layer_height);
    if (ps.infill && !V('dim-man-infill')) set('dim-man-infill', ps.infill);
  }
}

function clearDimLinkedItem() {
  set('dim-linked-plm-id', '');
  document.getElementById('dim-plm-selected').style.display = 'none';
  document.getElementById('dim-plm-search').value = '';
  const el = document.getElementById('dim-stock-info');
  if (el) el.style.display = 'none';
}

// ── DELIVERY CRUD ─────────────────────────────────────────────
let editingDeliveryId = null;
async function openDeliveryModal(id) {
  editingDeliveryId = id||null;
  const customers = await api('/api/customers');
  const orders = await api('/api/orders');
  const cSel = document.getElementById('dm-customer');
  const oSel = document.getElementById('dm-order');
  cSel.innerHTML = '<option value="">— keiner —</option><option value="__free__">✏ Name eingeben...</option>' + customers.map(c=>`<option value="${c.id}">${c.number} ${esc(c.name)}</option>`).join('');
  oSel.innerHTML = '<option value="">— keiner —</option>' + orders.map(o=>`<option value="${o.id}">${o.number} – ${esc(o.title)}</option>`).join('');
  if (id) {
    const d = await api(`/api/deliveries/${id}`);
    set('dm-title-f', d.title); setCustFields('dm',d.customer_id,d.customer_name_free); oSel.value = d.order_id||'';
    document.getElementById('dm-status').value = d.status||'DRAFT';
    set('dm-date', d.delivery_date||''); set('dm-manufacture-date', d.manufacture_date||''); set('dm-notes', d.notes||'');
    document.getElementById('dm-title').textContent = 'Lieferschein bearbeiten';
  } else {
    ['dm-title-f','dm-date','dm-manufacture-date','dm-notes'].forEach(f=>set(f,''));
    document.getElementById('dm-status').value = 'DRAFT';
    cSel.value = ''; oSel.value = '';
    document.getElementById('dm-title').textContent = 'Neuer Lieferschein';
  }
  set('dm-id', id||''); openModal('deliveryModal');
}

async function saveDelivery() {
  const title = V('dm-title-f'); if (!title) return toast('Bezeichnung fehlt','err');
  const body = { title, ...getCustBody('dm'), order_id: V('dm-order')||null,
    status: document.getElementById('dm-status').value, delivery_date: V('dm-date')||null,
    manufacture_date: V('dm-manufacture-date')||null, notes: V('dm-notes') };
  if (editingDeliveryId) {
    await api(`/api/deliveries/${editingDeliveryId}`,'PUT',body);
    toast('Gespeichert','ok'); closeModal('deliveryModal');
    openDeliveryDetail(editingDeliveryId);
  } else {
    const d = await api('/api/deliveries','POST',body);
    toast('Lieferschein angelegt','ok'); closeModal('deliveryModal');
    await renderDeliveries(); openDeliveryDetail(d.id);
  }
  loadStats();
}

async function delDelivery(id) {
  if (!confirm('Lieferschein löschen?')) return;
  await api(`/api/deliveries/${id}`,'DELETE'); toast('Gelöscht','ok'); closeDetail(); renderDeliveries(); loadStats();
}

async function openDeliveryItemModal(deliveryId, itemId) {
  await loadPsConfig();
  _populateDimSelects();
  dimTab('3mf');
  set('dim-delivery-id', deliveryId);
  set('dim-item-id', itemId||'');
  set('dim-linked-plm-id', '');
  set('dim-settings-json', '');
  document.getElementById('dim-title').textContent = itemId ? 'Position bearbeiten' : 'Position hinzufügen';
  document.getElementById('dim-save').textContent = itemId ? 'Speichern' : 'Hinzufügen';
  document.getElementById('dim-plm-results').style.display = 'none';
  document.getElementById('dim-plm-search').value = '';
  document.getElementById('dim-plm-selected').style.display = 'none';
  const _si = document.getElementById('dim-stock-info'); if (_si) _si.style.display = 'none';
  document.getElementById('dim-3mf-status').textContent = '';
  document.getElementById('dim-3mf-preview').style.display = 'none';
  document.getElementById('dim-3mf-preview').innerHTML = '';
  document.getElementById('dim-3mf-input').value = '';
  ['dim-man-mat','dim-man-color','dim-man-layer','dim-man-infill','dim-man-temp','dim-man-bed','dim-man-fw','dim-man-dur','dim-man-notes'].forEach(f=>set(f,''));
  document.getElementById('dim-man-sup').value = '';
  document.getElementById('dim-man-nozzle').value = '';
  document.getElementById('dim-man-printer').value = '';
  document.getElementById('dim-man-preset').value = '';

  if (itemId) {
    const fresh = await api(`/api/deliveries/${deliveryId}`);
    const it = (fresh.items||[]).find(x=>x.id===itemId);
    if (it) {
      set('dim-desc', it.description); set('dim-qty', it.quantity); set('dim-notes', it.notes||'');
      set('dim-price', it.unit_price!=null ? it.unit_price : '');
      document.getElementById('dim-unit').value = it.unit||'Stk';
      if (it.item_id && it.item_number) {
        set('dim-linked-plm-id', it.item_id);
        const icon = _itemChip(it.item_type, 18);
        document.getElementById('dim-plm-badge').textContent = icon + ' ' + it.item_number;
        document.getElementById('dim-plm-name').textContent = it.description;
        document.getElementById('dim-plm-selected').style.display = 'flex';
        _showDimStockInfo(it.item_id);
      }
      if (it.print_settings_json) {
        set('dim-settings-json', it.print_settings_json);
        const settings = JSON.parse(it.print_settings_json);
        const keyCount = Object.keys(settings).length;
        const st = document.getElementById('dim-3mf-status');
        st.textContent = `✓ ${keyCount} Parameter gespeichert`;
        st.style.color = 'var(--green)';
        document.getElementById('dim-3mf-preview').style.display = 'block';
        document.getElementById('dim-3mf-preview').innerHTML = renderSettingsPreview(settings);
      }
    }
  } else {
    ['dim-desc','dim-notes'].forEach(f=>set(f,''));
    set('dim-qty', 1); set('dim-price', '');
    document.getElementById('dim-unit').value = 'Stk';
  }
  openModal('deliveryItemModal');
}

async function saveDeliveryItem() {
  const deliveryId = parseInt(V('dim-delivery-id'));
  const itemId = V('dim-item-id');
  const desc = V('dim-desc'); if (!desc) return toast('Beschreibung fehlt','err');
  const priceVal = V('dim-price');
  let settingsJson = V('dim-settings-json') || null;
  if (document.getElementById('dim-tab-manual')?.classList.contains('active')) {
    const mat = V('dim-man-mat'); const temp = V('dim-man-temp'); const bed = V('dim-man-bed');
    const layer = V('dim-man-layer'); const infill = V('dim-man-infill');
    const sup = document.getElementById('dim-man-sup').value;
    const nozzle = document.getElementById('dim-man-nozzle').value;
    const printer = document.getElementById('dim-man-printer').value;
    const fw = V('dim-man-fw'); const dur = V('dim-man-dur'); const notes = V('dim-man-notes');
    const color = V('dim-man-color');
    if (mat || temp || bed || layer || infill) {
      const obj = {};
      if (mat) obj.filament_type = mat;
      if (color) obj._color = color;
      if (temp) obj.temperature = temp;
      if (bed) obj.bed_temperature = bed;
      if (layer) obj.layer_height = layer;
      if (infill) obj.fill_density = infill + '%';
      if (sup && sup !== '—') obj.support_material = (sup !== 'Nein') ? '1' : '0';
      if (nozzle) obj.nozzle_diameter = nozzle;
      if (printer) obj.print_settings_id = printer;
      if (fw) obj._filament_weight = fw + ' g';
      if (dur) obj._duration = dur + ' h';
      if (notes) obj._notes = notes;
      settingsJson = JSON.stringify(obj);
    } else { settingsJson = null; }
  }
  const body = {
    description: desc, quantity: parseFloat(V('dim-qty'))||1,
    unit: document.getElementById('dim-unit').value,
    unit_price: priceVal !== '' ? parseFloat(priceVal) : null,
    item_id: V('dim-linked-plm-id') ? parseInt(V('dim-linked-plm-id')) : null,
    print_settings_json: settingsJson,
    notes: V('dim-notes')
  };
  try {
    if (itemId) {
      await api(`/api/delivery-items/${itemId}`,'PUT',body);
      toast('Gespeichert','ok');
    } else {
      await api(`/api/deliveries/${deliveryId}/items`,'POST',body);
      toast('Position hinzugefügt','ok');
    }
    closeModal('deliveryItemModal');
    await renderDeliveries(); openDeliveryDetail(deliveryId);
  } catch(e) {
    closeModal('deliveryItemModal'); // immer schliessen damit UI nicht blockiert bleibt
  }
}

async function delDeliveryItem(itemId, deliveryId) {
  await api(`/api/delivery-items/${itemId}`,'DELETE');
  toast('Position entfernt','ok');
  await renderDeliveries(); openDeliveryDetail(deliveryId);
}
async function moveDeliveryItem(itemId, deliveryId, direction) {
  await api(`/api/delivery-items/${itemId}/move`,'PUT',{direction});
  const d = await api(`/api/deliveries/${deliveryId}`);
  document.getElementById('dd-pos').innerHTML = renderDeliveryItems(d.items||[], deliveryId) +
    `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openDeliveryItemModal(${deliveryId})">+ Position</button>`;
}

// -- PDF GENERATION (Rechnung + Angebot) -----------------------
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function generateDoc(id, type) {
  const endpoint = type === 'quote' ? `/api/quotes/${id}/quote-data` : `/api/orders/${id}/invoice-data`;
  const d = await api(endpoint);
  const s = state.settings;
  const today = new Date().toLocaleDateString('de-CH');
  const isQuote = type === 'quote';
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

  const hasDiscount = (d.discount_pct||0) > 0 || (d.positions||[]).some(p=>(p.discount_pct||0)>0);
  const cols = hasDiscount ? 5 : 4;
  const rows = (d.positions||[]).map(p => {
    const lineTotal = p.quantity * p.unit_price * (1 - (p.discount_pct||0)/100);
    let html = '<tr style="border-bottom:1px solid #e5e7eb">'
      +'<td style="padding:8px 6px">'+escHtml(p.description)+(p.item_number?' <span style="font-size:10px;color:#6b7280">['+p.item_number+']</span>':'')
      +(p.notes?'<br><span style="font-size:10px;color:#9ca3af">'+escHtml(p.notes)+'</span>':'')+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+p.quantity+' '+p.unit+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtP(p.unit_price)+'</td>'
      +(hasDiscount?(p.discount_pct?'<td style="padding:8px 6px;text-align:right;color:#d97706">'+p.discount_pct+'%</td>':'<td style="padding:8px 6px;text-align:right;color:#9ca3af">—</td>'):'')
      +'<td style="padding:8px 6px;text-align:right;font-weight:600">'+fmtP(lineTotal)+'</td>'
      +'</tr>';
    if (p.sub_items && p.sub_items.length) {
      html += p.sub_items.map(s =>
        '<tr style="background:#f9fafb">'
        +'<td style="padding:4px 6px 4px 22px;color:#6b7280;font-size:11px">↳ '+(s.item_type==='asm'?'📦':s.item_type==='doc'?'📄':'🔩')+' '+escHtml(s.item_number)+' – '+escHtml(s.name)+'</td>'
        +'<td style="padding:4px 6px;text-align:right;font-size:11px;color:#6b7280">'+s.quantity+' '+s.unit+'</td>'
        +'<td style="padding:4px 6px"></td>'
        +(hasDiscount?'<td style="padding:4px 6px"></td>':'')
        +'<td style="padding:4px 6px"></td>'
        +'</tr>'
      ).join('');
    }
    return html;
  }).join('');

  // Billable time entries (only for invoices/orders, not quotes)
  const billableTime = !isQuote && d.billable_time?.length ? d.billable_time : [];
  const hourlyRate = !isQuote ? (d.hourly_rate || 0) : 0;
  const timeRows = billableTime.map(t => {
    const hrs = parseFloat(t.hours) || 0;
    const cost = hrs * hourlyRate;
    return '<tr style="border-bottom:1px solid #e5e7eb">'
      +'<td style="padding:8px 6px">'+(t.description||'Arbeitszeit')+(t.date?' <span style="font-size:10px;color:#9ca3af">['+t.date+']</span>':'')+'</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtN(hrs,2)+' h</td>'
      +'<td style="padding:8px 6px;text-align:right">'+fmtP(hourlyRate)+'/h</td>'
      +(hasDiscount?'<td style="padding:8px 6px"></td>':'')
      +'<td style="padding:8px 6px;text-align:right;font-weight:600">'+fmtP(cost)+'</td>'
      +'</tr>';
  }).join('');
  const timeTotal = billableTime.reduce((s, t) => s + (parseFloat(t.hours)||0) * hourlyRate, 0);
  // Grand total including time
  const grandTotal = (d.total || 0) + timeTotal;

  const html = `<!DOCTYPE html>
<html lang="de-CH">
<head><meta charset="UTF-8"><title>${docLabel} ${d.number}</title>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .company-name{font-size:22px;font-weight:700;color:${color};letter-spacing:-0.5px}
  .company-detail{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.6}
  .doc-label{font-size:28px;font-weight:700;color:#111827;margin-bottom:4px}
  .meta{color:#6b7280;font-size:12px;line-height:1.7}
  .addr-block{margin:30px 0;display:flex;gap:60px}
  .addr-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:4px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  thead{background:#f9fafb}
  thead th{text-align:left;padding:10px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb}
  .totals{margin-left:auto;width:300px;margin-top:10px}
  .total-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;border-bottom:1px solid #f3f4f6}
  .total-gross{display:flex;justify-content:space-between;padding:10px 0;font-size:16px;font-weight:700;border-top:2px solid ${color};margin-top:4px;color:${color}}
  .footer{margin-top:50px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af}
  .badge{display:inline-block;background:#dbeafe;color:${color};font-size:10px;padding:2px 8px;border-radius:20px;font-weight:600}
  @media print{body{padding:20px}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company-name">${escHtml(s.company_name || '')}</div>
    <div class="company-detail">
      ${companyLines.map(l => escHtml(l)).join('<br>')}
      ${s.company_phone ? '<br>'+escHtml(s.company_phone) : ''}
      ${s.company_email ? ' · '+escHtml(s.company_email) : ''}
      ${s.company_uid   ? '<br>'+escHtml(s.company_uid)  : ''}
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-label">${docLabel}</div>
    <div style="font-family:monospace;font-size:14px;color:${color}">${d.number}</div>
    <div class="meta">
      Datum: ${today}<br>
      ${isQuote && d.valid_until ? 'Gültig bis: '+d.valid_until+'<br>' : ''}
      ${!isQuote && d.order_date ? 'Auftragsdatum: '+d.order_date+'<br>' : ''}
      ${!isQuote && d.delivery_date ? 'Lieferdatum: '+d.delivery_date+'<br>' : ''}
      ${d.payment_terms ? 'Zahlung: '+escHtml(d.payment_terms) : ''}
    </div>
  </div>
</div>

<div class="addr-block">
  ${d.customer_name ? `<div>
    <div class="addr-label">${isQuote ? 'Angebotsempfänger' : 'Rechnungsempfänger'}</div>
    <div style="font-weight:600;font-size:14px">${escHtml(d.customer_name)}</div>
    ${d.customer_number ? '<div style="font-size:11px;color:#6b7280">'+d.customer_number+'</div>' : ''}
    <div style="margin-top:4px;line-height:1.7;color:#374151">${custAddrLines.map(l=>escHtml(l)).join('<br>')}</div>
    ${d.customer_email ? '<div style="margin-top:4px;color:#6b7280">'+escHtml(d.customer_email)+'</div>' : ''}
  </div>` : `<div><div class="addr-label">${isQuote ? 'Angebotsempfänger' : 'Rechnungsempfänger'}</div><div style="color:#9ca3af">Kein Kunde zugewiesen</div></div>`}
  <div>
    <div class="addr-label">${isQuote ? 'Betreff' : 'Auftrag'}</div>
    <div style="font-weight:600">${escHtml(d.title)}</div>
    <div style="margin-top:4px"><span class="badge">${d.status}</span></div>
    ${d.notes ? '<div style="margin-top:6px;font-size:12px;color:#6b7280">'+escHtml(d.notes)+'</div>' : ''}
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
  <tbody>${rows || `<tr><td colspan="${cols}" style="padding:20px;text-align:center;color:#9ca3af">Keine Positionen</td></tr>`}${timeRows}</tbody>
</table>

<div class="totals">
  ${(d.discount_pct||0)>0 ? '<div class="total-row"><span>Zwischentotal</span><span>'+fmtP(d.subtotal)+'</span></div>'
    +'<div class="total-row" style="color:#d97706"><span>Rabatt '+d.discount_pct+'%</span><span>-'+fmtP(d.discount_amount)+'</span></div>' : ''}
  <div class="total-row"><span>Positionen Netto</span><span>${fmtP(d.net)}</span></div>
  ${billableTime.length && hourlyRate > 0 ? '<div class="total-row"><span>Arbeitszeit</span><span>'+fmtP(timeTotal)+'</span></div>' : ''}
  ${d.include_tax ? '<div class="total-row"><span>MwSt. '+(d.tax_rate ?? 0)+'%</span><span>'+fmtP(d.tax_amount)+'</span></div>' : ''}
  <div class="total-gross"><span>Gesamtbetrag</span><span>${fmtCHF(billableTime.length && hourlyRate > 0 ? grandTotal : d.total)}</span></div>
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
      <div style="font-weight:600;color:var(--red);margin-bottom:4px;font-size:12px">Drucker nicht erreichbar</div>
      <div style="font-size:11px;color:var(--t2);font-family:var(--mono);white-space:pre-wrap;word-break:break-word">${esc(String(msg))}</div>
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

// ── DELIVERY DOC (Lieferschein / Produktionsblatt) ─────────────
const SETTINGS_GROUPS_PDF = [
  { label: 'Profil', keys: [
    ['print_settings_id','Druckprofil'], ['printer_settings_id','Drucker'], ['filament_settings_id','Filamentprofil']
  ]},
  { label: 'Schichten & Wände', keys: [
    ['layer_height','Schichthöhe (mm)'], ['first_layer_height','1. Schicht (mm)'],
    ['perimeters','Perimeter'], ['top_solid_layers','Oben'], ['bottom_solid_layers','Unten'],
    ['spiral_vase','Vase-Modus']
  ]},
  { label: 'Infill', keys: [
    ['fill_density','Infill (%)'], ['fill_pattern','Muster'],
    ['top_fill_pattern','Oben'], ['bottom_fill_pattern','Unten']
  ]},
  { label: 'Support', keys: [
    ['support_material','Aktiv'], ['support_material_auto','Auto'],
    ['support_material_threshold','Überhang (°)'], ['support_material_pattern','Muster'],
    ['support_material_style','Stil'], ['raft_layers','Raft']
  ]},
  { label: 'Temperatur', keys: [
    ['temperature','Düse (°C)'], ['first_layer_temperature','Düse 1. Schicht'],
    ['bed_temperature','Bett (°C)'], ['first_layer_bed_temperature','Bett 1. Schicht']
  ]},
  { label: 'Geschwindigkeit (mm/s)', keys: [
    ['perimeter_speed','Perimeter'], ['infill_speed','Infill'],
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
  if (!s) return '<p style="color:#9ca3af;font-size:12px">Keine Druckeinstellungen hinterlegt.</p>';
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
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1d4ed8;margin-bottom:4px">${g.label}</div>
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
        <span style="background:rgba(255,255,255,.2);width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${idx+1}</span>
        ${item.item_number?`<span style="font-family:monospace;font-size:11px;opacity:.8">${escHtml(item.item_number)}</span>`:''}
        <span style="font-weight:600;font-size:14px;flex:1">${escHtml(item.description)}</span>
        <span style="background:rgba(255,255,255,.15);padding:3px 10px;border-radius:20px;font-size:12px">${item.quantity} ${item.unit}</span>
      </div>
      ${item.notes?`<div style="padding:8px 14px;background:#eff6ff;font-size:12px;color:#374151;border-bottom:1px solid #dbeafe">Notiz: ${escHtml(item.notes)}</div>`:''}
      <div style="padding:12px 14px">
        ${hasSettings ? renderSettingsTablePdf(item.print_settings) : '<p style="color:#9ca3af;font-size:12px;margin:0">Keine 3MF-Druckeinstellungen hinterlegt.</p>'}
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
  .meta{color:#6b7280;font-size:12px;line-height:1.7}
  .addr-block{display:flex;gap:48px;margin:20px 0 24px}
  .addr-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:3px}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600}
  .sign-row{display:flex;gap:40px;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb}
  .sign-box{flex:1;border-bottom:1px solid #9ca3af;padding-bottom:2px;font-size:11px;color:#6b7280;height:40px;display:flex;align-items:flex-end}
  @media print{body{padding:16px}.header{margin-bottom:20px}}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="company-name">${escHtml(s.company_name||'')}</div>
    <div style="font-size:11px;color:#6b7280;margin-top:2px;line-height:1.6">
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
      ${d.delivery_date?'Lieferdatum: '+d.delivery_date+'<br>':''}
      ${d.manufacture_date?'Herstellungsdatum: '+d.manufacture_date+'<br>':''}
      ${d.order_number?'Auftrag: '+escHtml(d.order_number):''}
    </div>
    <span class="badge" style="background:#dbeafe;color:#1d4ed8;margin-top:4px">${DELIVERY_ST_LABEL[d.status]||d.status}</span>
  </div>
</div>

<div class="addr-block">
  ${d.customer_name?`<div>
    <div class="addr-label">Empfänger</div>
    <div style="font-weight:600;font-size:14px">${escHtml(d.customer_name)}</div>
    ${d.customer_number?'<div style="font-size:11px;color:#6b7280">'+escHtml(d.customer_number)+'</div>':''}
    <div style="margin-top:3px;line-height:1.7;color:#374151">${custAddrLines.map(l=>escHtml(l)).join('<br>')}</div>
    ${d.customer_email?'<div style="margin-top:3px;color:#6b7280">'+escHtml(d.customer_email)+'</div>':''}
  </div>`:`<div><div class="addr-label">Empfänger</div><div style="color:#9ca3af">—</div></div>`}
  <div>
    <div class="addr-label">Auftrag / Betreff</div>
    <div style="font-weight:600">${escHtml(d.title)}</div>
    ${d.notes?`<div style="margin-top:4px;font-size:12px;color:#6b7280">${escHtml(d.notes)}</div>`:''}
  </div>
</div>

<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:12px">${(d.items||[]).length} Position(en)</div>

${itemsHtml || '<p style="color:#9ca3af">Keine Positionen</p>'}

<div class="sign-row">
  <div style="flex:1"><div style="font-size:11px;color:#6b7280;margin-bottom:6px">Übergabe durch</div><div class="sign-box"></div></div>
  <div style="flex:1"><div style="font-size:11px;color:#6b7280;margin-bottom:6px">Empfang bestätigt</div><div class="sign-box"></div></div>
  <div style="flex:1"><div style="font-size:11px;color:#6b7280;margin-bottom:6px">Datum</div><div class="sign-box"></div></div>
</div>

<div style="margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#d1d5db;text-align:right">${today}</div>
<script>window.onload = () => window.print();<\/script>
</body></html>`;

  const w = window.open('', '_blank', 'width=950,height=750');
  w.document.write(html);
  w.document.close();
}


// ── CLONE ORDER ───────────────────────────────────────────────
async function cloneOrder(id) {
  const o = await api(`/api/orders/${id}/clone`, 'POST');
  toast(`Auftrag ${o.number} erstellt`, 'ok');
  await renderOrders();
  openOrderDetail(o.id);
}

// ── ZEITERFASSUNG ─────────────────────────────────────────────
let _teOrderId = null;

async function loadTimeEntries(orderId) {
  _teOrderId = orderId;
  const entries = await api(`/api/time-entries?order_id=${orderId}`);
  const totalH = entries.reduce((s, e) => s + (e.hours||0), 0);
  const billableH = entries.filter(e=>e.billable).reduce((s,e)=>s+(e.hours||0),0);
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const el = document.getElementById('time-entries-list');
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <div class="sep-label" style="margin:0;flex:1">Zeiterfassung</div>
      <span style="font-size:11px;color:var(--t3)">Total: <strong style="color:var(--t1)">${fmtN(totalH,2)} h</strong></span>
      ${billableH>0&&hourlyRate>0?`<span style="font-size:11px;color:var(--green)">verrechenbar: <strong>${fmtN(billableH,2)} h = ${fmtCHF(billableH*hourlyRate)}</strong></span>`:''}
      <button class="btn btn-primary btn-sm" onclick="openTimeModal()">+ Eintrag</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Datum</th><th>Stunden</th><th>Beschreibung</th><th>Verrechnen</th><th></th></tr></thead>
      <tbody>${entries.map(e => `<tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--t3)">${e.date||'—'}</td>
        <td style="font-family:var(--mono);font-size:11px;font-weight:600">${fmtN(e.hours,2)} h</td>
        <td style="color:var(--t2)">${esc(e.description||'')}</td>
        <td style="text-align:center"><span style="font-size:10px;padding:1px 7px;border-radius:10px;background:${e.billable?'rgba(91,211,138,.12)':'var(--bg2)'};color:${e.billable?'var(--green)':'var(--t3)'}">${e.billable?'Ja':'—'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openTimeModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏</button>
          <button class="btn btn-red btn-sm btn-icon" onclick="delTimeEntry(${e.id})">✕</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`
    : '<div style="color:var(--t3);font-size:12px;padding:12px 0">Noch keine Zeiteinträge</div>'}`;
}

function _showDynModal(html) {
  document.getElementById('dynModal')?.remove();
  const ov = document.createElement('div');
  ov.className = 'overlay open'; ov.id = 'dynModal';
  ov.innerHTML = html;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}
function _hideDynModal() { document.getElementById('dynModal')?.remove(); }

function openTimeModal(entry) {
  const e = entry || {};
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  _showDynModal(`<div class="modal" style="max-width:380px">
    <div class="modal-head"><div class="modal-title">${e.id ? 'Zeiteintrag bearbeiten' : 'Zeiteintrag erfassen'}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">Datum</label>
        <input id="te-date" type="date" class="fi" value="${e.date||new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label class="fl">Stunden</label>
        <input id="te-hours" type="number" step="0.25" min="0.25" class="fi" placeholder="1.5" value="${e.hours||''}"></div>
      <div class="fg"><label class="fl">Beschreibung</label>
        <input id="te-desc" type="text" class="fi" placeholder="Konstruktion, Montage …" value="${esc(e.description||'')}"></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;padding:6px 0;border-top:1px solid var(--line)">
        <input type="checkbox" id="te-billable" ${e.billable?'checked':''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
        <span style="color:var(--t2)">Zeit verrechnen</span>
        ${hourlyRate>0?`<span style="color:var(--t3);margin-left:4px">(${fmtCHF(hourlyRate)}/h)</span>`:''}
      </label>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveTimeEntry(${e.id||'null'})">Speichern</button>
    </div>
  </div>`);
}

async function saveTimeEntry(id) {
  const date = document.getElementById('te-date').value;
  const hours = parseFloat(document.getElementById('te-hours').value);
  const description = document.getElementById('te-desc').value.trim();
  const billable = document.getElementById('te-billable').checked ? 1 : 0;
  if (!hours || hours <= 0) { toast('Stunden erforderlich', 'err'); return; }
  try {
    if (id) {
      await api(`/api/time-entries/${id}`, 'PUT', { date, hours, description, billable });
    } else {
      await api('/api/time-entries', 'POST', { order_id: _teOrderId, date, hours, description, billable });
    }
    _hideDynModal();
    loadTimeEntries(_teOrderId);
    refreshOrderPositionen(_teOrderId);
  } catch(e) {
    _hideDynModal();
    toast('Fehler beim Speichern', 'err');
  }
}

async function delTimeEntry(id) {
  if (!confirm('Eintrag löschen?')) return;
  await api(`/api/time-entries/${id}`, 'DELETE');
  loadTimeEntries(_teOrderId);
  refreshOrderPositionen(_teOrderId);
}

// ── ITEM ZEITERFASSUNG ────────────────────────────────────────
let _teItemId = null;

async function loadWhereUsed(itemId) {
  const el = document.getElementById('it-whereused-list');
  if (!el) return;
  const rows = await api(`/api/items/${itemId}/where-used`).catch(() => []);
  if (!rows.length) {
    el.innerHTML = '<div style="color:var(--t3);font-size:12px;padding:8px 0">Dieses Teil wird in keiner Baugruppe verwendet.</div>';
    return;
  }
  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px">
    ${rows.map(r => `
      <div onclick="openProjectAndItem(${r.project_id},${r.id})" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
        ${_itemChip(r.item_type, 16)}
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(r.item_number)}</span>
        <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>
        ${_classChip(r.classification)}
        <span class="status st-${r.status}" style="font-size:9px">rev${r.rev}</span>
        <span style="font-size:10px;color:var(--t4);font-family:var(--mono)">${esc(r.project_number)}</span>
      </div>`).join('')}
  </div>`;
}

async function loadItemTimeEntries(itemId) {
  _teItemId = itemId;
  const el = document.getElementById('item-time-list');
  if (!el) return;
  const entries = await api(`/api/time-entries?item_id=${itemId}`);
  const totalH = entries.reduce((s, e) => s + (parseFloat(e.hours)||0), 0);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:11px;color:var(--t3)">${entries.length ? `${entries.length} Einträge · ${fmtN(totalH,2)} h gesamt` : 'Noch keine Einträge'}</span>
      <button class="btn btn-primary btn-sm" onclick="openItemTimeModal()">+ Eintrag</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr>
        <th>Datum</th><th>Stunden</th><th>Beschreibung</th><th></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => `<tr>
          <td style="font-family:var(--mono);font-size:11px">${e.date||'—'}</td>
          <td style="font-family:var(--mono);font-size:11px;white-space:nowrap">${fmtN(parseFloat(e.hours)||0,2)} h</td>
          <td style="font-size:12px;color:var(--t2)">${esc(e.description||'—')}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="openItemTimeModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏</button>
            <button class="btn btn-red btn-sm btn-icon" onclick="delItemTimeEntry(${e.id})">✕</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : ''}`;
}

function openItemTimeModal(entry) {
  const e = entry || {};
  _showDynModal(`<div class="modal" style="max-width:380px">
    <div class="modal-head">
      <div class="modal-title">${e.id ? 'Zeit bearbeiten' : 'Zeit erfassen'}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">Datum</label>
        <input id="ite-date" type="date" class="fi" value="${e.date||new Date().toISOString().slice(0,10)}"></div>
      <div class="fg"><label class="fl">Stunden</label>
        <input id="ite-hours" type="number" step="0.25" min="0.25" class="fi" placeholder="1.5" value="${e.hours||''}"></div>
      <div class="fg"><label class="fl">Beschreibung</label>
        <input id="ite-desc" type="text" class="fi" placeholder="Konstruktion, Recherche, CAD …" value="${esc(e.description||'')}"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveItemTimeEntry(${e.id||'null'})">Speichern</button>
    </div>
  </div>`);
}

async function saveItemTimeEntry(id) {
  const date  = document.getElementById('ite-date').value;
  const hours = parseFloat(document.getElementById('ite-hours').value);
  const description = document.getElementById('ite-desc').value.trim();
  if (!hours || hours <= 0) { toast('Stunden erforderlich', 'err'); return; }
  if (id) {
    await api(`/api/time-entries/${id}`, 'PUT', { date, hours, description, billable: 0 });
  } else {
    await api('/api/time-entries', 'POST', { item_id: _teItemId, date, hours, description, billable: 0 });
  }
  _hideDynModal();
  loadItemTimeEntries(_teItemId);
}

async function delItemTimeEntry(id) {
  if (!confirm('Eintrag löschen?')) return;
  await api(`/api/time-entries/${id}`, 'DELETE');
  loadItemTimeEntries(_teItemId);
}

// ── CHECKOUT ──────────────────────────────────────────────────
const CHECKOUT_TYPES = [
  { key: 'CAD',         label: 'CAD-Dateien',     hint: '.step, .stp, .par, .asm …' },
  { key: 'GCODE',       label: 'G-Code',           hint: '.gcode, .nc …' },
  { key: 'STL',         label: 'STL',              hint: '.stl' },
  { key: 'PDF',         label: 'PDF',              hint: '.pdf' },
  { key: 'IMAGE',       label: 'Bilder',           hint: '.png, .jpg …' },
  { key: 'DOC',         label: 'Dokumente',        hint: '.docx, .txt …' },
  { key: 'SPREADSHEET', label: 'Tabellen',         hint: '.xlsx, .csv …' },
  { key: 'OTHER',       label: 'Sonstige',         hint: '' },
];

function openCheckoutModal(itemId, itemNumber, itemType) {
  const isAsm = itemType === 'asm';
  _showDynModal(`<div class="modal" style="max-width:460px">
    <div class="modal-head">
      <div class="modal-title">Auschecken — ${esc(itemNumber)}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      ${isAsm ? `<div style="background:rgba(142,163,255,.08);border:1px solid rgba(142,163,255,.2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:14px;font-size:12px;color:var(--t2)">
        Baugruppe: alle Parts aus der BOM werden rekursiv mitgeladen, damit die CAD-Verlinkungen bestehen bleiben.
      </div>` : ''}
      <div style="font-size:11px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Dateitypen auswählen</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px">
        ${CHECKOUT_TYPES.map(t => `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--line3)'" onmouseout="this.style.borderColor='var(--line2)'">
            <input type="checkbox" class="co-type" value="${t.key}" ${t.key==='CAD'?'checked':''} style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer;flex-shrink:0">
            <div>
              <div style="font-size:12px;font-weight:500">${t.label}</div>
              ${t.hint?`<div style="font-size:10px;color:var(--t4);font-family:var(--mono)">${t.hint}</div>`:''}
            </div>
          </label>`).join('')}
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer">
        <input type="checkbox" id="co-all" style="accent-color:var(--blue);width:14px;height:14px" onchange="document.querySelectorAll('.co-type').forEach(c=>c.checked=this.checked)">
        <span style="font-size:12px;color:var(--t3)">Alle Typen auswählen</span>
      </label>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-teal" onclick="doCheckout(${itemId})">⬇ Auschecken</button>
    </div>
  </div>`);
}

async function doCheckout(itemId) {
  const types = [...document.querySelectorAll('.co-type:checked')].map(c => c.value);
  if (!types.length) { toast('Mindestens einen Dateityp wählen', 'err'); return; }

  const btn = document.querySelector('.modal-foot .btn-teal');
  const orig = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Wird kopiert…'; btn.disabled = true; }

  try {
    const r = await api(`/api/items/${itemId}/checkout`, 'POST', { types });
    _hideDynModal();
    if (r.warning) { toast(r.warning, 'err'); return; }
    await loadCheckouts();
    if (state.project) renderProjectTree(state.project);
    if (state.item) renderItemDetail(state.item, state.activeRevId);
    _showCheckoutResult(r);
  } catch(e) {
    if (btn) { btn.textContent = orig; btn.disabled = false; }
    toast('Fehler beim Auschecken', 'err');
  }
}

// Registry: folder paths stored here, referenced by index in onclick (avoids path-escaping in HTML)
let _coFolders = [];

function _coOpen(i)      { openCheckoutFolder(_coFolders[i]); }
function _coIn(i, btn)   { doCheckin(_coFolders[i], btn); }

function _showCheckoutResult(r) {
  _coFolders = [r.folder];
  _showDynModal(`<div class="modal" style="max-width:520px">
    <div class="modal-head">
      <div class="modal-title"><span style="color:var(--green)">✓</span> Ausgecheckt — ${r.files.length} Dateien</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px">
        <div style="font-size:10px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Ordner</div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--t1);word-break:break-all;user-select:all">${esc(r.folder)}</div>
      </div>
      ${r.files.some(f=>f.readonly) ? `<div style="background:rgba(239,177,74,.08);border:1px solid rgba(239,177,74,.25);border-radius:var(--r-sm);padding:7px 10px;margin-bottom:10px;font-size:11px;color:var(--amber)">
        🔒 Freigegebene Dateien (REL) sind schreibgeschützt kopiert worden.
      </div>` : ''}
      <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
        ${r.files.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-xs);background:var(--bg2)">
            <span class="ds-type dt-${f.ds_type}" style="font-size:9px;flex-shrink:0">${f.ds_type}</span>
            <span style="font-size:11px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
            <span style="font-size:10px;color:var(--t4);font-family:var(--mono);flex-shrink:0">${esc(f.item_number)}</span>
            ${f.readonly ? `<span title="Schreibgeschützt (REL)" style="font-size:11px;color:var(--amber)">🔒</span>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-red btn-sm" onclick="_coIn(0,this)">⬆ Einchecken</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="_hideDynModal()">Schliessen</button>
      <button class="btn btn-teal" onclick="_coOpen(0)">📂 Ordner öffnen</button>
    </div>
  </div>`);
}

async function doCheckin(folder, btn) {
  if (!confirm('Checkout-Ordner löschen? Alle darin enthaltenen Dateien werden entfernt.')) return;
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '⏳…'; btn.disabled = true; }
  try {
    await api('/api/checkout/checkin', 'POST', { folder });
    await loadCheckouts();
    _hideDynModal();
    toast('Eingecheckt — Ordner gelöscht', 'ok');
    if (state.project) renderProjectTree(state.project);
    if (state.item) renderItemDetail(state.item, state.activeRevId);
  } catch(e) {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    toast('Fehler beim Einchecken: ' + (e.message||''), 'err');
  }
}

async function doCheckinAll() {
  if (!state.checkouts.length) return;
  if (!confirm(`Alle ${state.checkouts.length} Checkouts einchecken und Ordner löschen?`)) return;
  for (const c of [...state.checkouts]) {
    try { await api('/api/checkout/checkin', 'POST', { folder: c.folder }); } catch {}
  }
  await loadCheckouts();
  _hideDynModal();
  toast('Alle Checkouts eingecheckt', 'ok');
  if (state.project) renderProjectTree(state.project);
  if (state.item) renderItemDetail(state.item, state.activeRevId);
}

async function openCheckoutFolder(folder) {
  try {
    await api('/api/checkout/open', 'POST', { folder });
    toast('Ordner wird geöffnet…', 'ok');
  } catch(e) {
    toast('Ordner öffnen fehlgeschlagen — Pfad kopiert', 'err');
    try { navigator.clipboard.writeText(folder); } catch {}
  }
}

async function showCheckoutList() {
  await loadCheckouts();
  const list = state.checkouts;
  _coFolders = list.map(c => c.folder);
  const totalFiles = list.reduce((s, c) => s + (c.files?.length || 0), 0);
  const newCount = _scanNewCount();

  _showDynModal(`<div class="modal" style="max-width:580px">
    <div class="modal-head">
      <div class="modal-title">Checkouts${list.length ? ` <span style="font-family:var(--mono);font-size:11px;color:var(--teal);font-weight:400">${list.length} aktiv · ${totalFiles} Dateien</span>` : ''}${newCount ? ` <span style="font-family:var(--mono);font-size:11px;color:var(--amber);font-weight:400">+${newCount} neu erkannt</span>` : ''}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;max-height:520px;overflow-y:auto">

      ${newCount ? `<div>
        <div style="font-size:11px;font-weight:600;color:var(--amber);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Neue Dateien erkannt</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_scanResult.item_files.map((g, gi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:12px;font-weight:500;margin-bottom:4px">
                In <span style="font-family:var(--mono);color:var(--blue)">${esc(g.item_number)}</span> – ${esc(g.item_name)}
              </div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--t3);margin-bottom:6px">${g.new_files.map(f=>`${esc(f.name)} <span style="color:var(--t4)">[${f.ds_type}]</span>`).join(' · ')}</div>
              <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                onclick="importCheckoutFiles(${JSON.stringify(g).replace(/"/g,'&quot;')})">⬇ Zu Bauteil hinzufügen</button>
            </div>`).join('')}
          ${_scanResult.root_files.map((f, fi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:12px;font-weight:500;margin-bottom:4px">
                Neue Datei auf oberster Ebene: <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span>
                <span style="font-size:10px;color:var(--t4);margin-left:6px">[${f.ds_type}]</span>
              </div>
              <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                onclick="importNewItem(${JSON.stringify(f).replace(/"/g,'&quot;')})">+ Als neues Bauteil erfassen</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${list.length ? `<div>
        <div style="font-size:11px;font-weight:600;color:var(--t3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Aktive Checkouts</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${list.map((c, i) => {
            const dt = new Date(c.checked_out).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
            return `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                ${_itemChip(c.item_type,18)}
                <span style="font-family:var(--mono);font-size:11px;color:var(--blue)">${esc(c.item_number)}</span>
                <span style="font-size:12px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.item_name)}</span>
                <span style="font-size:10px;color:var(--t4);flex-shrink:0">${dt}</span>
              </div>
              <div style="font-family:var(--mono);font-size:10px;color:var(--t3);margin-bottom:6px;user-select:all;word-break:break-all">${esc(c.folder)}</div>
              <div style="font-size:11px;color:var(--t4);margin-bottom:6px">${c.files?.length||0} Dateien${c.files?.some(f=>f.readonly)?' · <span style="color:var(--amber)">🔒 schreibgeschützte</span>':''}</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="_coOpen(${i})">📂 Öffnen</button>
                <button class="btn btn-red btn-sm" onclick="_coIn(${i},this)">⬆ Einchecken</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : (!newCount ? `<div style="color:var(--t3);font-size:12px;padding:16px 0;text-align:center">Keine aktiven Checkouts</div>` : '')}

    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Schliessen</button>
      ${list.length ? `<button class="btn btn-red" onclick="doCheckinAll()">⬆ Alle einchecken (${list.length})</button>` : ''}
    </div>
  </div>`);
}

async function importCheckoutFiles(g) {
  const files = g.new_files;
  if (!confirm(`${files.length} Datei(en) zu "${g.item_number} – ${g.item_name}" hinzufügen?`)) return;
  try {
    const r = await api('/api/checkout/import', 'POST', { mode: 'item', item_id: g.item_id, folder: g.folder, files });
    await loadCheckouts();
    _showDynModal(null);
    toast(`${r.count} Datei(en) zu Rev ${r.rev} hinzugefügt`, 'ok');
    if (state.item?.id === g.item_id) renderItemDetail(state.item, state.activeRevId);
    showCheckoutList();
  } catch(e) { toast('Import fehlgeschlagen: ' + (e.message||''), 'err'); }
}

let _importProjects = [];
async function importNewItem(f) {
  _importProjects = await api('/api/projects').catch(() => []);
  const extMap = { par:'prt', psm:'prt', asm:'asm', dft:'doc', pdf:'doc' };
  const ext = f.name.split('.').pop().toLowerCase();
  const suggestedType = extMap[ext] || 'prt';
  const suggestedName = f.name.replace(/\.[^.]+$/, '');

  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head">
      <div class="modal-title">Neues Bauteil erfassen</div>
      <button class="btn btn-icon btn-ghost" onclick="showCheckoutList()">✕</button>
    </div>
    <div class="modal-body" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:var(--t3)">Datei: <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span></div>
      <div>
        <label style="font-size:11px;color:var(--t3);margin-bottom:4px;display:block">Projekt</label>
        <select id="imp-project" class="input" style="width:100%">
          ${_importProjects.map(p => `<option value="${p.id}">${esc(p.number)} – ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--t3);margin-bottom:4px;display:block">Typ</label>
        <select id="imp-type" class="input" style="width:100%">
          <option value="prt"${suggestedType==='prt'?' selected':''}>🔩 Part (prt)</option>
          <option value="asm"${suggestedType==='asm'?' selected':''}>📦 Baugruppe (asm)</option>
          <option value="doc"${suggestedType==='doc'?' selected':''}>📄 Dokument (doc)</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--t3);margin-bottom:4px;display:block">Name</label>
        <input id="imp-name" class="input" style="width:100%" value="${esc(suggestedName)}" placeholder="Bauteilname">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="showCheckoutList()">Zurück</button>
      <button class="btn btn-primary" onclick="_doImportNewItem(${JSON.stringify(f).replace(/"/g,'&quot;')})">Bauteil erstellen</button>
    </div>
  </div>`);
}

async function _doImportNewItem(f) {
  const project_id = document.getElementById('imp-project')?.value;
  const item_type  = document.getElementById('imp-type')?.value;
  const name       = document.getElementById('imp-name')?.value?.trim();
  if (!project_id || !item_type || !name) { toast('Alle Felder ausfüllen', 'err'); return; }
  try {
    const r = await api('/api/checkout/import', 'POST', {
      mode: 'new',
      new_item: { project_id, item_type, name, file_path: f.path, file_name: f.name, ds_type: f.ds_type }
    });
    await loadCheckouts();
    toast(`Bauteil ${r.item_number} erstellt`, 'ok');
    showCheckoutList();
    if (state.project) { const p = await api(`/api/projects/${state.project.id}`); openProjectDetail(p); }
  } catch(e) { toast('Fehler: ' + (e.message||''), 'err'); }
}

// ── LAGER / BESTAND ───────────────────────────────────────────
const INV_CATS = ['3D Druck','Filament','Hardware','Elektronik','Komponenten','Werkzeug','Verbrauchsmaterial','Sonstiges'];

let _invSort = { col: 'name', dir: 1 };

function _invStockState(i) {
  if (!i.min_qty || i.min_qty <= 0) return 'ok';
  if (i.stock_qty < i.min_qty) return 'critical';
  if (i.stock_qty === i.min_qty) return 'warn';
  return 'ok';
}

async function renderInventory() {
  setLeftHeader('Lager', `<button class="btn btn-primary btn-sm" onclick="openInventoryModal()">+ Artikel</button>`);
  const items = await api('/api/inventory');
  const badgeInv = document.getElementById('badge-inventory');
  if (badgeInv) badgeInv.textContent = items.length || '—';
  if (!items.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">📦</div><div class="empty-text">Noch keine Lagerartikel</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="openInventoryModal()">Ersten Artikel anlegen</button></div></div>`);
    return;
  }
  _invRenderTable(items);
}

function _invRenderTable(items) {
  const { col, dir } = _invSort;
  // Always sort by name first so variants stay together, then by selected col within same name
  const cmp = (a, b) => String(a||'').localeCompare(String(b||''), undefined, {sensitivity:'base'});
  const sorted = [...items].sort((a, b) => {
    const nameCmp = cmp(a.name, b.name);
    if (nameCmp !== 0) return col === 'name' ? nameCmp * dir : nameCmp;
    const colorCmp = cmp(a.color, b.color);
    if (colorCmp !== 0) return col === 'color' ? colorCmp * dir : colorCmp;
    const matCmp = cmp(a.material, b.material);
    if (matCmp !== 0) return col === 'material' ? matCmp * dir : matCmp;
    if (col === 'stock_qty' || col === 'min_qty' || col === 'planned_qty')
      return ((parseFloat(a[col])||0) - (parseFloat(b[col])||0)) * dir;
    return cmp(a[col], b[col]) * dir;
  });
  const byCategory = {};
  sorted.forEach(i => { (byCategory[i.category] = byCategory[i.category]||[]).push(i); });

  const critical = items.filter(i => _invStockState(i) === 'critical').length;
  const warn = items.filter(i => _invStockState(i) === 'warn').length;
  const banner = (critical || warn) ? `<div style="background:rgba(241,120,120,.10);border:1px solid rgba(241,120,120,.30);border-radius:var(--r);padding:8px 12px;margin-bottom:12px;font-size:12px;display:flex;gap:12px">
    ${critical?`<span style="color:var(--red)">● ${critical} unter Mindestbestand</span>`:''}
    ${warn?`<span style="color:var(--amber)">● ${warn} auf Mindestbestand</span>`:''}
  </div>` : '';

  const th = (c, label) => {
    const active = col === c;
    return `<th style="cursor:pointer;user-select:none;white-space:nowrap${active?';color:var(--blue)':''}" onclick="_invSetSort('${c}')">${label}${active?(dir===1?' ▲':' ▼'):''}</th>`;
  };

  const rows = Object.entries(byCategory).map(([cat, catItems]) => {
    // Group by name within category
    const nameGroups = [];
    catItems.forEach(i => {
      const last = nameGroups[nameGroups.length - 1];
      if (last && last.name === i.name) last.items.push(i);
      else nameGroups.push({ name: i.name, items: [i] });
    });

    const itemRows = nameGroups.map(group => {
      const isMulti = group.items.length > 1;
      return group.items.map((i, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === group.items.length - 1;
        const state = _invStockState(i);
        const stockColor = state==='critical'?'var(--red)':state==='warn'?'var(--amber)':'var(--green)';
        const stockIcon = state==='critical'?' ⚠':'';
        const borderBottom = isMulti && !isLast ? 'border-bottom:1px solid var(--bg3)' : '';
        const nameTd = isFirst
          ? `<td style="font-weight:500;vertical-align:top;padding-top:8px" rowspan="${group.items.length}">${esc(i.name)}${isMulti?` <span style="font-size:9px;color:var(--t3);font-weight:400">${group.items.length}×</span>`:''}</td>`
          : '';
        const variantLabel = [i.color, i.material].filter(Boolean);
        const colorTd = isMulti
          ? `<td style="color:var(--t2);font-size:11px;${borderBottom}">${esc(i.color||'—')}</td>
             <td style="color:var(--t2);font-size:11px;${borderBottom}">${esc(i.material||'—')}</td>`
          : `<td style="color:var(--t2);font-size:11px">${esc(i.color||'—')}</td>
             <td style="color:var(--t2);font-size:11px">${esc(i.material||'—')}</td>`;
        const planned = i.planned_qty || 0;
        const avail = (i.stock_qty || 0) - planned;
        const plannedTd = planned > 0
          ? `<td style="font-family:var(--mono);font-size:11px;color:var(--amber);${isMulti&&!isLast?borderBottom:''}">${fmtN(planned,0)} ${i.unit}</td>`
          : `<td style="font-family:var(--mono);font-size:11px;color:var(--t4);${isMulti&&!isLast?borderBottom:''}">—</td>`;
        return `<tr onclick="openInventoryDetail(${i.id})" style="cursor:pointer">
          ${nameTd}
          ${colorTd}
          <td style="font-family:var(--mono);font-size:11px;color:${stockColor};font-weight:${state!=='ok'?600:400};${isMulti&&!isLast?borderBottom:''}">${fmtN(i.stock_qty,2)} ${i.unit}${stockIcon}</td>
          ${plannedTd}
          <td style="font-family:var(--mono);font-size:11px;color:var(--t3);${isMulti&&!isLast?borderBottom:''}">${i.min_qty>0?fmtN(i.min_qty,2)+' '+i.unit:'—'}</td>
          <td style="display:flex;gap:4px;${isMulti&&!isLast?borderBottom:''}">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openMovementModal(${i.id},'in')">＋</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openMovementModal(${i.id},'out')">－</button>
            <button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delInventoryItem(${i.id})">✕</button>
          </td>
        </tr>`;
      }).join('');
    }).join('');

    return `<tr style="background:var(--bg0)"><td colspan="6" style="font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:6px 10px">${cat}</td></tr>
    ${itemRows}`;
  }).join('');

  setLeftBody(banner + `<div class="tbl-wrap"><table>
    <thead><tr>${th('name','Artikel')}${th('color','Farbe')}${th('material','Material')}${th('stock_qty','Bestand')}${th('planned_qty','Geplant')}${th('min_qty','Minimum')}<th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`);
}

function _invSetSort(col) {
  if (_invSort.col === col) _invSort.dir *= -1;
  else { _invSort.col = col; _invSort.dir = 1; }
  renderInventory();
}

async function openInventoryDetail(id) {
  const item = await api(`/api/inventory/${id}`);
  const state = _invStockState(item);
  const stockColor = state==='critical'?'var(--red)':state==='warn'?'var(--amber)':'var(--green)';
  const stockIcon = state==='critical'?' ⚠':'';
  document.getElementById('dp-title').innerHTML = esc(item.name);
  document.getElementById('dp-tabs').innerHTML = `<button class="tab active" onclick="switchTab(this,'inv-info')">Details</button>`;
  document.getElementById('dp-body').innerHTML = `
    <div id="inv-info">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:12px">
        <div><div class="ps-label">Kategorie</div>${item.category}</div>
        ${item.color?`<div><div class="ps-label">Farbe</div>${esc(item.color)}</div>`:''}
        ${item.material?`<div><div class="ps-label">Material</div>${esc(item.material)}</div>`:''}
        <div><div class="ps-label">Bestand</div><span style="font-family:var(--mono);font-weight:600;color:${stockColor}">${fmtN(item.stock_qty,2)} ${item.unit}${stockIcon}</span></div>
        <div><div class="ps-label">Mindestbestand</div>${item.min_qty>0?fmtN(item.min_qty,2)+' '+item.unit:'—'}</div>
        ${item.price_per_unit!=null?`<div><div class="ps-label">Preis / Einheit</div><span style="font-family:var(--mono)">${fmtCHF(item.price_per_unit)}</span></div>`:''}
        ${item.linked_item_number?`<div style="grid-column:span 2"><div class="ps-label">PLM-Teil</div>
          <span style="font-family:var(--mono);font-size:10px;color:var(--blue);cursor:pointer" onclick="gotoPlmItem(${item.item_id})">${esc(item.linked_item_number)} – ${esc(item.linked_item_name||'')}</span>
        </div>`:''}
        ${item.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(item.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
        <button class="btn btn-primary btn-sm" onclick="openMovementModal(${id},'in')">+ Zugang</button>
        <button class="btn btn-amber btn-sm" onclick="openMovementModal(${id},'out')">− Abgang</button>
        <button class="btn btn-ghost btn-sm" onclick="openInventoryModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-red btn-sm" onclick="delInventoryItem(${id})">🗑 Löschen</button>
      </div>
      <div class="sep-label">Letzte Bewegungen</div>
      ${item.movements?.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Datum</th><th>Typ</th><th>Menge</th><th>Referenz</th><th>Notiz</th></tr></thead>
        <tbody>${item.movements.map(m => `<tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--t3)">${(m.created_at||'').slice(0,16).replace('T',' ')}</td>
          <td><span style="font-size:10px;padding:1px 6px;border-radius:10px;background:${m.qty>0?'rgba(91,211,138,.15)':'rgba(241,120,120,.15)'};color:${m.qty>0?'var(--green)':'var(--red)'}">${m.qty>0?'Zugang':'Abgang'}</span></td>
          <td style="font-family:var(--mono);font-size:11px;font-weight:600;color:${m.qty>0?'var(--green)':'var(--red)'}">${m.qty>0?'+':''}${fmtN(m.qty,2)} ${item.unit}</td>
          <td style="color:var(--t3);font-size:11px">${esc(m.reference||'—')}</td>
          <td style="color:var(--t3);font-size:11px">${esc(m.notes||'')}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<div style="color:var(--t3);font-size:12px">Noch keine Bewegungen</div>'}
    </div>`;
  showDetail();
}

async function openInventoryModal(id) {
  const item = id ? await api(`/api/inventory/${id}`) : null;
  _showDynModal(`<div class="modal" style="max-width:480px">
    <div class="modal-head"><div class="modal-title">${item ? 'Artikel bearbeiten' : 'Neuer Lagerartikel'}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">Verknüpftes PLM-Teil</label>
        <div style="position:relative">
          <input id="inv-plm-search" class="fi" placeholder="Teil suchen…" autocomplete="off"
            oninput="searchInvPlmItem(this.value)"
            value="${item?.linked_item_number ? item.linked_item_number+' – '+esc(item.linked_item_name||'') : ''}">
          <input type="hidden" id="inv-item-id" value="${item?.item_id||''}">
          <div id="inv-plm-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);z-index:200;max-height:160px;overflow-y:auto"></div>
        </div>
      </div>
      <div class="fg"><label class="fl">Name *</label><input id="inv-name" class="fi" value="${esc(item?.name||'')}"></div>
      <div class="cols2">
        <div class="fg"><label class="fl">Kategorie</label>
          <select id="inv-cat" class="fi">${INV_CATS.map(c=>`<option value="${c}"${(item?.category||'Sonstiges')===c?' selected':''}>${c}</option>`).join('')}</select></div>
        <div class="fg"><label class="fl">SKU / Artikelnr.</label><input id="inv-sku" class="fi" value="${esc(item?.sku||'')}"></div>
      </div>
      <div class="cols2">
        <div class="fg"><label class="fl">Farbe</label><input id="inv-color" class="fi" placeholder="z.B. Schwarz" value="${esc(item?.color||'')}"></div>
        <div class="fg"><label class="fl">Material</label><input id="inv-material" class="fi" placeholder="z.B. PLA" value="${esc(item?.material||'')}"></div>
      </div>
      <div class="cols2">
        <div class="fg"><label class="fl">Einheit</label><input id="inv-unit" class="fi" value="${esc(item?.unit||'Stk')}"></div>
        <div class="fg"><label class="fl">Mindestbestand</label><input id="inv-min" type="number" min="0" step="0.01" class="fi" value="${item?.min_qty||0}"></div>
      </div>
      <div class="fg"><label class="fl">Preis / Einheit</label><input id="inv-price" type="number" min="0" step="0.01" class="fi" placeholder="—" value="${item?.price_per_unit!=null?item.price_per_unit:''}"></div>
      ${!id ? `<div class="fg"><label class="fl">Anfangsbestand</label><input id="inv-stock" type="number" min="0" step="0.01" class="fi" value="0"></div>` : ''}
      <div class="fg"><label class="fl">Notizen</label><textarea id="inv-notes" class="fs" rows="2" style="resize:vertical">${esc(item?.notes||'')}</textarea></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveInventoryItem(${id||'null'})">Speichern</button>
    </div>
  </div>`);
}

let _invPlmTimer;
function searchInvPlmItem(q) {
  clearTimeout(_invPlmTimer);
  const res = document.getElementById('inv-plm-results');
  if (!q || q.length < 1) { res.style.display='none'; return; }
  _invPlmTimer = setTimeout(async () => {
    const items = await api('/api/items-all?q='+encodeURIComponent(q));
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:12px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const icon = _itemChip(i.item_type, 18);
      const mc = i.manufacturing_cost;
      const price = i.default_price ?? mc?.total ?? null;
      return `<div onclick="selectInvPlmItem(${JSON.stringify(i).replace(/"/g,'&quot;')})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:10px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:12px">${esc(i.name)}</span>
        ${price!=null?`<span style="font-family:var(--mono);font-size:10px;color:var(--t3)">${fmtCHF(price)}</span>`:''}
        <span style="font-size:10px;color:var(--t3)">${esc(i.project_name)}</span>
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

function selectInvPlmItem(item) {
  document.getElementById('inv-item-id').value = item.id;
  document.getElementById('inv-plm-search').value = item.item_number + ' – ' + item.name;
  document.getElementById('inv-plm-results').style.display = 'none';
  const nameEl = document.getElementById('inv-name');
  if (nameEl && !nameEl.value.trim()) nameEl.value = item.item_number + ' – ' + item.name;
  const priceEl = document.getElementById('inv-price');
  if (priceEl && !priceEl.value) {
    const mc = item.manufacturing_cost;
    const price = item.default_price ?? mc?.total ?? null;
    if (price != null) priceEl.value = price;
  }
}

async function saveInventoryItem(id) {
  const body = {
    name: document.getElementById('inv-name').value.trim(),
    category: document.getElementById('inv-cat').value,
    sku: document.getElementById('inv-sku').value.trim(),
    color: document.getElementById('inv-color').value.trim() || null,
    material: document.getElementById('inv-material').value.trim() || null,
    unit: document.getElementById('inv-unit').value.trim() || 'Stk',
    min_qty: document.getElementById('inv-min').value,
    price_per_unit: document.getElementById('inv-price').value || null,
    item_id: document.getElementById('inv-item-id').value || null,
    notes: document.getElementById('inv-notes').value.trim()
  };
  if (!body.name) { toast('Name erforderlich', 'err'); return; }
  if (id) {
    await api(`/api/inventory/${id}`, 'PUT', body);
  } else {
    const stockEl = document.getElementById('inv-stock');
    body.stock_qty = stockEl ? parseFloat(stockEl.value)||0 : 0;
    const item = await api('/api/inventory', 'POST', body);
    if (body.stock_qty > 0) {
      await api(`/api/inventory/${item.id}/movement`, 'POST', { type: 'in', qty: body.stock_qty, notes: 'Anfangsbestand' });
    }
    _hideDynModal();
    await renderInventory();
    openInventoryDetail(item.id);
    return;
  }
  _hideDynModal();
  await renderInventory();
  openInventoryDetail(id);
}

function openMovementModal(itemId, defaultType) {
  _showDynModal(`<div class="modal" style="max-width:360px">
    <div class="modal-head"><div class="modal-title">Lagerbewegung</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">Typ</label>
        <select id="mov-type" class="fi">
          <option value="in"${defaultType==='in'?' selected':''}>Zugang (+)</option>
          <option value="out"${defaultType==='out'?' selected':''}>Abgang (−)</option>
          <option value="adjust">Korrektur (=)</option>
        </select></div>
      <div class="fg"><label class="fl">Menge</label><input id="mov-qty" type="number" min="0.01" step="0.01" class="fi" placeholder="1"></div>
      <div class="fg"><label class="fl">Referenz (z.B. Auftragsnr.)</label><input id="mov-ref" class="fi" placeholder="optional"></div>
      <div class="fg"><label class="fl">Notiz</label><input id="mov-notes" class="fi" placeholder="optional"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveMovement(${itemId})">Buchen</button>
    </div>
  </div>`);
}

async function saveMovement(itemId) {
  const type = document.getElementById('mov-type').value;
  const qty = parseFloat(document.getElementById('mov-qty').value);
  const reference = document.getElementById('mov-ref').value.trim();
  const notes = document.getElementById('mov-notes').value.trim();
  if (!qty || qty <= 0) { toast('Menge erforderlich', 'err'); return; }
  await api(`/api/inventory/${itemId}/movement`, 'POST', { type, qty, reference, notes });
  _hideDynModal();
  toast('Buchung gespeichert', 'ok');
  await renderInventory();
  openInventoryDetail(itemId);
}

async function delInventoryItem(id) {
  if (!confirm('Artikel und alle Bewegungen löschen?')) return;
  await api(`/api/inventory/${id}`, 'DELETE');
  closeDetail();
  renderInventory();
}

async function openInventoryDeductModal(orderItemId, plmItemId, qty, orderId) {
  const invItems = await api(`/api/inventory?item_id=${plmItemId}`);
  if (!invItems.length) { toast('Kein Lagerartikel für dieses Teil verknüpft', 'err'); return; }

  const first = invItems[0];
  const options = invItems.map(i => {
    const variantLabel = [i.color, i.material].filter(Boolean).join(' / ');
    return `<option value="${i.id}" data-stock="${i.stock_qty}" data-planned="${i.planned_qty||0}" data-unit="${esc(i.unit)}">${esc(i.name)}${variantLabel ? ` (${esc(variantLabel)})` : ''} — ${fmtN(i.stock_qty,2)} ${esc(i.unit)}</option>`;
  }).join('');

  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title">Lager abbuchen</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      ${invItems.length > 1 ? `<div class="fg"><label class="fl">Lagerartikel</label>
        <select id="ded-inv-id" class="fi" onchange="_dedUpdateStock(this,${qty})">${options}</select></div>`
        : `<input type="hidden" id="ded-inv-id" value="${first.id}">`}
      <div id="ded-stock-info">${_dedStockHtmlInline(first, qty)}</div>
      <div class="fg"><label class="fl">Menge abbuchen</label>
        <input id="ded-qty" type="number" min="0.01" step="0.01" class="fi" value="${qty}" oninput="_dedCheckQty(this)"></div>
      <div class="fg"><label class="fl">Referenz</label>
        <input id="ded-ref" class="fi" value="AUF-${orderId}" placeholder="Auftragsnr."></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-amber" id="ded-save" onclick="deductFromInventory()">Abbuchen</button>
    </div>
  </div>`);

  _dedUpdateSaveBtn(first, qty);
}

function _dedUpdateSaveBtn(inv, qty) {
  const btn = document.getElementById('ded-save');
  if (!btn) return;
  const enough = (inv.stock_qty || 0) >= qty;
  btn.disabled = !enough;
  btn.title = enough ? '' : `Nicht genug Bestand (${fmtN(inv.stock_qty,2)} ${inv.unit} vorhanden)`;
}

function _dedCheckQty(input) {
  const qty = parseFloat(input.value) || 0;
  const sel = document.getElementById('ded-inv-id');
  const stock = parseFloat(sel?.dataset?.stock ?? sel?.options?.[sel.selectedIndex]?.dataset?.stock ?? 0);
  const planned = parseFloat(sel?.dataset?.planned ?? sel?.options?.[sel.selectedIndex]?.dataset?.planned ?? 0);
  const unit = sel?.options?.[sel.selectedIndex]?.dataset?.unit || '';
  const inv = { stock_qty: stock, planned_qty: planned, unit };
  document.getElementById('ded-stock-info').innerHTML = _dedStockHtmlInline(inv, qty);
  _dedUpdateSaveBtn(inv, qty);
}

function _dedStockHtmlInline(inv, reqQty) {
  const planned = inv.planned_qty || 0;
  const avail = inv.stock_qty - planned;
  const enough = inv.stock_qty >= reqQty;
  const color = inv.stock_qty <= 0 ? 'var(--red)' : !enough ? 'var(--red)' : avail < reqQty ? 'var(--amber)' : 'var(--green)';
  const bg = inv.stock_qty <= 0 || !enough ? 'var(--red-soft)' : avail < reqQty ? 'var(--amber-soft)' : 'var(--green-soft)';
  const border = inv.stock_qty <= 0 || !enough ? 'var(--red-line)' : avail < reqQty ? 'var(--amber-line)' : 'var(--green-line)';
  return `<div style="font-size:11px;padding:7px 10px;border-radius:var(--r-sm);background:${bg};border:1px solid ${border};color:${color}">
    <b>Bestand: ${fmtN(inv.stock_qty,2)} ${inv.unit}</b>`
    + (planned > 0 ? ` · ${fmtN(planned,0)} geplant · <b>Verfügbar: ${fmtN(avail,2)} ${inv.unit}</b>` : '')
    + (!enough ? ` — <b>Zu wenig Bestand!</b>` : '')
    + `</div>`;
}

function _dedUpdateStock(sel, qty) {
  const opt = sel.options[sel.selectedIndex];
  const inv = { stock_qty: parseFloat(opt.dataset.stock)||0, planned_qty: parseFloat(opt.dataset.planned)||0, unit: opt.dataset.unit||'' };
  const qtyVal = parseFloat(document.getElementById('ded-qty')?.value) || qty;
  document.getElementById('ded-stock-info').innerHTML = _dedStockHtmlInline(inv, qtyVal);
  _dedUpdateSaveBtn(inv, qtyVal);
}

async function deductFromInventory() {
  const invIdEl = document.getElementById('ded-inv-id');
  const invId = invIdEl.value;
  const qty = parseFloat(document.getElementById('ded-qty').value);
  const reference = document.getElementById('ded-ref').value.trim();
  if (!qty || qty <= 0) { toast('Menge erforderlich', 'err'); return; }
  // Final server-side check
  const fresh = await api(`/api/inventory/${invId}`).catch(() => null);
  if (fresh && fresh.stock_qty < qty) {
    toast(`Nicht genug Bestand — verfügbar: ${fmtN(fresh.stock_qty,2)} ${fresh.unit}`, 'err');
    return;
  }
  await api(`/api/inventory/${invId}/movement`, 'POST', { type: 'out', qty, reference, notes: 'Auftragsabgang' });
  _hideDynModal();
  toast('Abgebucht', 'ok');
  renderInventory();
}
