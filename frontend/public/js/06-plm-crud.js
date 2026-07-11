// 06-plm-crud.js — Projekt/Artikel CRUD, Revisionen, Datensätze, Stückliste, Druckeinstellungen
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── PROJECT CRUD ──────────────────────────────────────────────
let editingProjectId = null;
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openNewProjectModal() {
  editingProjectId = null;
  set('pm-name', ''); set('pm-desc', ''); set('pm-customer', '');
  openModal('projectModal');
}

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
    pad_order:       gi('adm-pad-order',    3),
    pad_quote:       gi('adm-pad-quote',    3),
    pad_delivery:    gi('adm-pad-delivery', 3),
    pad_customer:    gi('adm-pad-customer', 3),
    pad_project:     gi('adm-pad-project',  3),
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

const DEFAULT_CLASSIFICATIONS = [
  {name:'Eigenteil',  color:'#8ea3ff'},
  {name:'Kaufteil',   color:'#6ad0d6'},
  {name:'Normteil',   color:'#efb14a'},
  {name:'Halbzeug',   color:'#b48cff'},
  {name:'Rohmaterial',color:'#7a7f8e'},
];

function getClassifications() {
  try {
    const raw = state.settings?.item_classifications;
    if (raw) {
      const parsed = JSON.parse(raw);
      // Backwards compat: old format was array of strings
      if (parsed.length && typeof parsed[0] === 'string')
        return parsed.map((name, i) => ({ name, color: DEFAULT_CLASSIFICATIONS[i]?.color || '#7a7f8e' }));
      return parsed;
    }
  } catch {}
  return DEFAULT_CLASSIFICATIONS.map(c => ({...c}));
}

function _loadPlmTab() {
  _renderClassList(getClassifications());
}

let _classDragIdx = null;

function _renderClassList(list) {
  const el = document.getElementById('st-class-list');
  if (!el) return;
  el.innerHTML = list.map((c, i) => {
    const col = c.color || '#7a7f8e';
    const bg = col + '20'; // hex with 12% alpha approximation
    return `<div class="cls-row" data-idx="${i}" draggable="true"
      style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);transition:opacity .15s">
      <span class="cls-handle" style="cursor:grab;color:var(--t4);font-size:16px;line-height:1;flex-shrink:0">⠿</span>
      <input type="color" class="cls-color" value="${col}" title="Farbe wählen"
        style="width:28px;height:28px;padding:2px;border:1px solid var(--line);border-radius:4px;background:var(--bg3);cursor:pointer;flex-shrink:0"
        oninput="_onClassColorChange()">
      <span class="cls-preview" style="font-family:var(--mono);font-size:13px;padding:2px 8px;border-radius:3px;background:${bg};color:${col};flex-shrink:0">${esc(c.name)}</span>
      <input class="fi cls-name" value="${esc(c.name)}" style="flex:1;font-size:13px;padding:3px 7px;height:28px" oninput="_onClassNameInput(this)">
      <button class="btn btn-red btn-icon btn-sm" onclick="_removeClass(${i})">✕</button>
    </div>`;
  }).join('');

  el.querySelectorAll('.cls-row').forEach(row => {
    row.addEventListener('dragstart', e => {
      _classDragIdx = parseInt(row.dataset.idx);
      row.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => { row.style.opacity = '1'; });
    row.addEventListener('dragover', e => { e.preventDefault(); row.style.borderColor = 'var(--blue)'; });
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

// Live preview: update chip when name or color changes
function _onClassNameInput(inp) {
  const row = inp.closest('.cls-row');
  const preview = row?.querySelector('.cls-preview');
  if (preview) preview.textContent = inp.value || '…';
}
function _onClassColorChange() {
  const el = document.getElementById('st-class-list');
  if (!el) return;
  el.querySelectorAll('.cls-row').forEach(row => {
    const col = row.querySelector('.cls-color')?.value || '#7a7f8e';
    const bg = col + '20';
    const preview = row.querySelector('.cls-preview');
    if (preview) { preview.style.color = col; preview.style.background = bg; }
  });
}

function _getCurrentClassList() {
  const el = document.getElementById('st-class-list');
  if (!el) return [];
  return [...el.querySelectorAll('.cls-row')].map(row => ({
    name:  row.querySelector('.cls-name')?.value.trim() || '',
    color: row.querySelector('.cls-color')?.value || '#7a7f8e',
  })).filter(c => c.name);
}

function _addClass() {
  const inp = document.getElementById('st-class-new');
  const val = inp?.value.trim();
  if (!val) return;
  const list = _getCurrentClassList();
  if (list.some(c => c.name === val)) { toast('Bereits vorhanden', 'err'); return; }
  list.push({ name: val, color: '#8ea3ff' });
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
  const [projects, orders, quotes, deliveries, settings, counters] = await Promise.all([
    api('/api/projects').catch(()=>[]),
    api('/api/orders').catch(()=>[]),
    api('/api/quotes').catch(()=>[]),
    api('/api/deliveries').catch(()=>[]),
    api('/api/settings').catch(()=>({})),
    api('/api/counters').catch(()=>({}))
  ]);

  // Fill admin settings fields
  const fv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  fv('adm-prefix-order',    settings.prefix_order    || 'AUF');
  fv('adm-prefix-quote',    settings.prefix_quote    || 'ANG');
  fv('adm-prefix-delivery', settings.prefix_delivery || 'LS');
  fv('adm-prefix-customer', settings.prefix_customer || 'KD');
  fv('adm-pad-order',       settings.pad_order       || '3');
  fv('adm-pad-quote',       settings.pad_quote       || '3');
  fv('adm-pad-delivery',    settings.pad_delivery    || '3');
  fv('adm-pad-customer',    settings.pad_customer    || '3');
  fv('adm-pad-project',     settings.pad_project     || '3');
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
    itemsEl.innerHTML = '<div style="font-size:13px;color:var(--t3)">Lädt…</div>';
    let relItems = [], loadErr = false;
    try { relItems = await api('/api/items-released'); }
    catch(e) { loadErr = true; }
    if (loadErr) {
      itemsEl.innerHTML = '<div style="font-size:13px;color:var(--amber)">⚠ Endpunkt nicht verfügbar — Server neu starten</div>';
    } else {
      itemsEl.innerHTML = relItems.length
        ? relItems.map(i => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
            ${_itemChip(i.item_type,15)}
            <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
            <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}</span>
            <span style="font-size:13px;color:var(--t3)">${esc(i.project_number||'')}</span>
            <button class="btn btn-red btn-sm" onclick="_forceDelItem(${i.id},'${esc(i.item_number)}')">Löschen</button>
          </div>`).join('')
        : '<div style="font-size:13px;color:var(--t3)">Keine freigegebenen Items</div>';
    }
  }

  const pelEl = document.getElementById('st-del-projects');
  if (pelEl) {
    const withContent = projects.filter(p => p.item_count > 0);
    pelEl.innerHTML = withContent.length
      ? withContent.map(p => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(p.number)}</span>
          <span style="flex:1;font-size:13px">${esc(p.name)}</span>
          <span style="font-size:13px;color:var(--t3)">${p.item_count} Items</span>
          <button class="btn btn-red btn-sm" onclick="_forceDeleteProject(${p.id},'${esc(p.name)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:13px;color:var(--t3)">Keine Projekte mit Inhalten</div>';
  }

  const ordEl = document.getElementById('st-del-orders');
  if (ordEl) {
    const locked = orders.filter(o => o.status !== 'DRAFT');
    ordEl.innerHTML = locked.length
      ? locked.map(o => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span class="status st-${ORDER_ST_MAP[o.status]?.replace('st-','')}" style="font-size:13px">${ORDER_ST_LABEL[o.status]||o.status}</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(o.number)}</span>
          <span style="flex:1;font-size:13px">${esc(o.title)}</span>
          <button class="btn btn-red btn-sm" onclick="_forceDelOrder(${o.id},'${esc(o.number)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:13px;color:var(--t3)">Keine gesperrten Aufträge</div>';
  }

  const quoEl = document.getElementById('st-del-quotes');
  if (quoEl) {
    const locked = quotes.filter(q => q.status !== 'DRAFT');
    quoEl.innerHTML = locked.length
      ? locked.map(q => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(q.number)}</span>
          <span style="flex:1;font-size:13px">${esc(q.title)}</span>
          <button class="btn btn-red btn-sm" onclick="_forceDelQuote(${q.id},'${esc(q.number)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:13px;color:var(--t3)">Keine gesperrten Angebote</div>';
  }

  const delEl = document.getElementById('st-del-deliveries');
  if (delEl) {
    const DST = { DRAFT:'Entwurf', READY:'Bereit', DELIVERED:'Geliefert' };
    const DST_CLS = { DRAFT:'st-DFT', READY:'st-REV', DELIVERED:'st-REL' };
    const locked = deliveries.filter(d => d.status !== 'DRAFT');
    delEl.innerHTML = locked.length
      ? locked.map(d => `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
          <span class="status ${DST_CLS[d.status]||'st-DFT'}" style="font-size:13px">${DST[d.status]||d.status}</span>
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(d.number)}</span>
          <span style="flex:1;font-size:13px">${esc(d.title)}</span>
          <button class="btn btn-red btn-sm" onclick="_forceDelDelivery(${d.id},'${esc(d.number)}')">Löschen</button>
        </div>`).join('')
      : '<div style="font-size:13px;color:var(--t3)">Keine gesperrten Produktionsaufträge</div>';
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

async function _forceDelDelivery(id, number) {
  if (!confirm(`Produktionsauftrag ${number} unwiderruflich löschen?`)) return;
  await api(`/api/deliveries/${id}`,'DELETE');
  toast('Produktionsauftrag gelöscht','ok'); _loadDelTab(); loadStats();
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
        <span style="font-size:13px;color:var(--t3);margin-top:4px;display:block">Die Item-Nummer wird automatisch neu vergeben. Untergeordnete Items (Kinder) werden mitgenommen.</span>
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

async function _saveItemField(itemId, input, field) {
  const val = input.value.trim();
  const parsed = val === '' ? null : parseFloat(val);
  try {
    const item = await api('/api/items/' + itemId);
    await api('/api/items/' + itemId, 'PUT', {
      name: item.name, description: item.description,
      source_url: item.source_url || null,
      default_price: field === 'default_price' ? parsed : (item.default_price ?? null),
      weight_g: field === 'weight_g' ? parsed : (item.weight_g ?? null),
      classification: item.classification || null
    });
    input.style.borderColor = 'var(--green)';
    setTimeout(() => { input.style.borderColor = ''; }, 1200);
  } catch(e) { input.style.borderColor = 'var(--red)'; toast('Fehler: ' + e, 'err'); }
}

async function saveItemWeight(itemId, input) { return _saveItemField(itemId, input, 'weight_g'); }
async function saveItemPrice(itemId, input)  { return _saveItemField(itemId, input, 'default_price'); }

// ── ITEM CRUD ─────────────────────────────────────────────────
async function openEditItemModal(id) {
  const item = await api('/api/items/' + id);
  set('eim-id', id);
  set('eim-name', item.name);
  set('eim-desc', item.description || '');
  set('eim-url', item.source_url || '');
  set('eim-price', item.default_price != null ? item.default_price : '');
  set('eim-weight', item.weight_g != null ? item.weight_g : '');
  const clSel = document.getElementById('eim-classification');
  clSel.innerHTML = '<option value="">— keine —</option>' + getClassifications().map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');
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
    weight_g: V('eim-weight') ? parseFloat(V('eim-weight')) : null,
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
  const newItem = await api(`/api/projects/${projectId}/items`,'POST',body);
  toast('Item angelegt','ok'); closeModal('itemModal');
  await openProject(projectId); loadStats();
  if (newItem?.id) openItemDetail(newItem.id);
}

async function deleteItem(id) {
  if (!confirm('Item und alle Revisionen / Dateien löschen?')) return;
  const item = state.item;
  await api(`/api/items/${id}`,'DELETE');
  toast('Item gelöscht','ok'); closeDetail();
  if (state.project) openProject(state.project.id);
}

async function deleteRevision(revId, itemId) {
  if (!confirm('Diese Revision (DFT) und alle zugehörigen Dateien löschen?')) return;
  try {
    await api(`/api/revisions/${revId}`, 'DELETE');
    toast('Revision gelöscht', 'ok');
    const fresh = await api(`/api/items/${itemId}`);
    openItemDetail(fresh.id);
  } catch(e) {
    toast(e.message || 'Fehler beim Löschen', 'err');
  }
}

// ── REVISION / STATUS ─────────────────────────────────────────
const statusHints = {
  REV: 'Revision wird zur Prüfung eingereicht.',
  DFT: 'Revision zurück auf Entwurf setzen.',
  REL: 'Revision freigeben. Alle vorherigen REL-Revisionen werden auf OBS gesetzt.',
  ECO: 'Engineering Change Order starten. Die aktuelle Revision wird gesperrt (ECO). Eine neue DFT-Revision wird automatisch angelegt.',
  OBS: 'Revision als veraltet markieren.'
};

async function openStatusModal(revId, targetStatus) {
  // Check completeness before REL
  if (targetStatus === 'REL' && state.item) {
    const warnings = [];
    if (state.item.default_price == null) warnings.push('Kein Verkaufspreis (VP) hinterlegt');
    if (state.item.weight_g == null)      warnings.push('Kein Gewicht hinterlegt');
    const rev = state.item.revisions?.find(r => r.id === revId);
    if (!rev?.datasets?.length)           warnings.push('Keine Dateien (Datasets) hochgeladen');
    if (warnings.length) {
      const proceed = await _showReleaseWarning(warnings);
      if (!proceed) return;
    }
  }
  set('sm-rev-id', revId); set('sm-target-status', targetStatus);
  set('sm-desc',''); set('sm-eco','');
  document.getElementById('sm-title').textContent = `Status → ${targetStatus}`;
  document.getElementById('sm-hint').textContent = statusHints[targetStatus]||'';
  document.getElementById('sm-eco-row').style.display = targetStatus==='ECO' ? 'block':'none';
  openModal('statusModal');
}

function _showReleaseWarning(warnings) {
  return new Promise(resolve => {
    _showDynModal(`<div class="modal" style="max-width:420px">
      <div class="modal-head"><div class="modal-title" style="color:var(--amber)">⚠ Freigabe-Warnung</div></div>
      <div class="modal-body">
        <div style="font-size:13px;color:var(--t2);margin-bottom:12px">Folgende Angaben fehlen:</div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
          ${warnings.map(w => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--amber)">
            <span>⚠</span><span>${esc(w)}</span>
          </div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3)">Trotzdem freigeben?</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="_hideDynModal();window._releaseResolve(false)">Abbrechen</button>
        <button class="btn btn-amber" onclick="_hideDynModal();window._releaseResolve(true)">Trotzdem freigeben</button>
      </div>
    </div>`);
    window._releaseResolve = resolve;
  });
}

async function doStatusChange() {
  const revId = V('sm-rev-id'); const status = V('sm-target-status');
  const body = { status, description: V('sm-desc'), eco_reason: V('sm-eco'), released_by: 'User' };
  await api(`/api/revisions/${revId}/status`,'PUT',body);
  toast(`Status → ${status}`,'ok'); closeModal('statusModal');
  if (state.item) {
    const item = await api(`/api/items/${state.item.id}`);
    state.item = item;
    // After ECO: navigate to the newly created DFT revision (newest), otherwise stay on current rev
    const newRev = status === 'ECO'
      ? (item.revisions?.find(r => r.status === 'DFT') || item.revisions?.[0])
      : (item.revisions?.find(r => r.id === parseInt(revId)) || item.revisions?.find(r => r.id === state.activeRevId) || item.revisions?.[0]);
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
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-top:5px;font-size:13px">
      &#x1F4C4; <div style="flex:1;min-width:0">
        ${renamed ? `<div style="color:var(--t3);text-decoration:line-through;font-size:13px">${esc(f.name)}</div>` : ''}
        <div style="color:${renamed?'var(--teal)':'var(--t1)'}">${esc(newName)}</div>
      </div>
      <span style="color:var(--t3);font-size:13px;flex-shrink:0">${fmtSize(f.size)}</span>
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
function setBomTab(tab) {
  document.getElementById('bom-pane-item').style.display = tab === 'item' ? '' : 'none';
  document.getElementById('bom-pane-std').style.display  = tab === 'std'  ? '' : 'none';
  document.getElementById('bom-tab-item').className = 'btn btn-sm ' + (tab === 'item' ? 'btn-primary' : 'btn-ghost');
  document.getElementById('bom-tab-std').className  = 'btn btn-sm ' + (tab === 'std'  ? 'btn-primary' : 'btn-ghost');
}

window._bomBasket = [];
window._bomSearchCache = {};

let _bomSearchTimer;
async function _bomItemSearch(q) {
  clearTimeout(_bomSearchTimer);
  const res = document.getElementById('bom-child-results');
  if (!q || q.length < 1) { res.style.display = 'none'; return; }
  _bomSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-for-bom?q=' + encodeURIComponent(q)).catch(() => []);
    items.forEach(i => { window._bomSearchCache[i.id] = i; });
    if (!items.length) {
      res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>';
      res.style.display = 'block'; return;
    }
    res.innerHTML = items.map(i => {
      const rev = i.latest_revision;
      const sameProject = state.item && i.project_id === state.item.project_id;
      const inBasket = window._bomBasket.some(b => b.type === 'item' && b.id === i.id);
      return `<div onclick="_bomSelectItem(${i.id})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line);${inBasket?'opacity:.4;pointer-events:none':''}"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        ${_itemChip(i.item_type, 16)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:12px;color:${sameProject?'var(--t4)':'var(--teal)'};font-family:var(--mono)">${esc(i.project_number)}</span>
        ${rev ? `<span class="status st-${rev.status}" style="font-size:11px">rev${rev.rev}</span>` : ''}
        ${inBasket ? '<span style="font-size:11px;color:var(--green)">✓</span>' : ''}
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

function _bomSelectItem(itemId) {
  document.getElementById('bom-child-results').style.display = 'none';
  document.getElementById('bom-child-search').value = '';
  if (window._bomBasket.some(b => b.type === 'item' && b.id === itemId)) return;
  const i = window._bomSearchCache[itemId];
  if (!i) return;
  window._bomBasket.push({ type: 'item', id: itemId, item_number: i.item_number, name: i.name, item_type: i.item_type, quantity: 1, unit: 'pcs' });
  _renderBomBasket();
}

function _bomAddStdToBasket() {
  const sel = document.getElementById('bom-std-id');
  const id = parseInt(sel.value);
  if (!id) return toast('Normteil wählen', 'err');
  if (window._bomBasket.some(b => b.type === 'std' && b.id === id)) return toast('Bereits in der Liste', 'err');
  const text = sel.options[sel.selectedIndex]?.text || '';
  window._bomBasket.push({ type: 'std', id, name: text, quantity: 1, unit: 'pcs' });
  sel.value = '';
  _renderBomBasket();
}

function _bomRemove(i) { window._bomBasket.splice(i, 1); _renderBomBasket(); }
function _bomSetQty(i, v) { window._bomBasket[i].quantity = Math.max(1, Math.round(parseFloat(v) || 1)); }
function _bomSetUnit(i, v) { window._bomBasket[i].unit = v; }

function _renderBomBasket() {
  const el = document.getElementById('bom-basket-area');
  if (!el) return;
  const btn = document.getElementById('bom-save-btn');
  const n = window._bomBasket.length;
  if (btn) btn.textContent = n ? `Alle hinzufügen (${n})` : 'Hinzufügen';
  if (!n) {
    el.innerHTML = '<div style="font-size:13px;color:var(--t4);text-align:center;padding:12px 0;border:1px dashed var(--line2);border-radius:var(--r)">Noch keine Positionen — oben suchen und auswählen</div>';
    return;
  }
  const units = ['pcs','set','m','mm','g','kg'];
  el.innerHTML = '<div style="border:1px solid var(--line);border-radius:var(--r);overflow:hidden">' +
    window._bomBasket.map((b, i) => `
      <div style="display:flex;align-items:center;gap:7px;padding:6px 10px;${i > 0 ? 'border-top:1px solid var(--line)' : ''}">
        <button class="btn btn-icon btn-ghost btn-sm" onclick="_bomRemove(${i})" style="color:var(--red);flex-shrink:0">✕</button>
        ${b.type === 'item'
          ? `${_itemChip(b.item_type, 14)}<span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${esc(b.item_number)}</span>`
          : `<span style="font-size:10px;font-weight:700;background:rgba(142,163,255,.15);color:var(--blue);padding:1px 5px;border-radius:3px;flex-shrink:0">N</span>`}
        <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)">${esc(b.name)}</span>
        <input type="number" value="${b.quantity}" min="1" step="1"
          style="width:52px;font-size:13px;font-family:var(--mono);text-align:right;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:2px 5px;color:var(--t1);flex-shrink:0"
          onkeydown="if(event.key==='.'||event.key===',')event.preventDefault()"
          onchange="_bomSetQty(${i},this.value)" oninput="_bomSetQty(${i},this.value)">
        <select style="font-size:13px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:2px 4px;color:var(--t1);flex-shrink:0" onchange="_bomSetUnit(${i},this.value)">
          ${units.map(u => `<option${u === b.unit ? ' selected' : ''}>${u}</option>`).join('')}
        </select>
      </div>`).join('') +
  '</div>';
}

async function openBomModal(revId, projectId) {
  set('bom-rev-id', revId);
  window._bomBasket = [];
  window._bomSearchCache = {};
  document.getElementById('bom-child-search').value = '';
  document.getElementById('bom-child-results').style.display = 'none';
  const stdParts = await api('/api/standard-parts');
  document.getElementById('bom-std-id').innerHTML = '<option value="">— Normteil wählen —</option>' +
    stdParts.map(s=>`<option value="${s.id}">${esc(s.designation)}${s.material?' · '+esc(s.material):''}</option>`).join('');
  setBomTab('item');
  _renderBomBasket();
  openModal('bomModal');
}

async function doBomAdd() {
  if (!window._bomBasket.length) return toast('Keine Positionen ausgewählt', 'err');
  const revId = V('bom-rev-id');
  let added = 0;
  for (const b of window._bomBasket) {
    try {
      if (b.type === 'std') {
        await api(`/api/revisions/${revId}/bom-std`, 'POST', { std_part_id: b.id, quantity: b.quantity, unit: b.unit, notes: '' });
      } else {
        await api(`/api/revisions/${revId}/bom`, 'POST', { child_item_id: b.id, quantity: b.quantity, unit: b.unit, notes: '' });
      }
      added++;
    } catch(e) {
      toast(`Fehler bei "${b.item_number || b.name}": ${e.message || 'unbekannt'}`, 'err');
    }
  }
  if (added) toast(`${added} Position${added > 1 ? 'en' : ''} hinzugefügt`, 'ok');
  closeModal('bomModal');
  if (state.item) await switchRev(state.item.id, parseInt(revId));
  refreshProjectTree();
}

async function delBom(bomId, itemId, revId) {
  await api(`/api/bom/${bomId}`,'DELETE');
  toast('Position entfernt','ok');
  if (state.item) await switchRev(itemId, revId);
  refreshProjectTree();
}

async function delBomStd(bomStdId, itemId, revId) {
  await api(`/api/bom-std/${bomStdId}`,'DELETE');
  toast('Position entfernt','ok');
  if (state.item) await switchRev(itemId, revId);
  refreshProjectTree();
}

function openStepBomImport(revId, projectId) {
  _showDynModal(`
    <div class="modal-head"><div class="modal-title">📐 BOM aus STEP-Datei importieren</div></div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:14px">
        Baugruppe in Solid Edge als STEP exportieren (<em>Datei → Exportieren → STEP AP214/AP242</em>)
        und hier hochladen. PLM liest die Bauteilstruktur automatisch aus.
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="file" id="step-file-in" accept=".stp,.step"
          style="flex:1;font-size:13px;color:var(--t2);background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:5px 8px">
        <button class="btn btn-primary btn-sm" onclick="doParseStep(${revId},${projectId})">📤 Analysieren</button>
      </div>
      <div id="step-result" style="margin-top:16px"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" id="step-import-btn" style="display:none"
        onclick="doStepBomImport(${revId})">✓ BOM übernehmen</button>
    </div>`);
}

async function doParseStep(revId, projectId) {
  const input = document.getElementById('step-file-in');
  if (!input?.files?.length) return toast('Bitte STEP-Datei auswählen', 'err');
  const el = document.getElementById('step-result');
  el.innerHTML = '<div style="color:var(--t3);font-size:13px">Analysiere …</div>';
  const fd = new FormData();
  fd.append('file', input.files[0]);
  let tree;
  try {
    const r = await fetch('/api/parse-step-bom', { method: 'POST', body: fd });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
    tree = await r.json();
  } catch(e) {
    el.innerHTML = `<div style="color:var(--red);font-size:13px">⚠ ${esc(e.message)}</div>`;
    return;
  }
  const children = tree.children || [];
  if (!children.length) {
    el.innerHTML = '<div style="color:var(--amber);font-size:13px">⚠ Keine Unterbauteile gefunden — ist das eine Baugruppe?</div>';
    return;
  }
  const items = await api(`/api/projects/${projectId}/items-for-bom`);
  window._stepChildren = children;
  const rows = children.map((c, i) => {
    const match = items.find(it => it.name.toLowerCase() === c.name.toLowerCase());
    return `<tr>
      <td style="font-size:13px">
        ${esc(c.name)}
        ${c.children?.length ? `<span style="font-size:11px;color:var(--teal);margin-left:4px">[ASM · ${c.children.length}]</span>` : ''}
      </td>
      <td><input type="number" id="sq-${i}" value="${c.qty||1}" min="0.001" step="1"
        style="width:58px;font-size:13px;background:var(--bg2);color:var(--t1);border:1px solid var(--line);border-radius:var(--r-sm);padding:2px 5px"></td>
      <td>
        <select id="sm-${i}" style="font-size:13px;background:var(--bg2);color:var(--t1);border:1px solid var(--line);border-radius:var(--r-sm);padding:3px 6px;width:100%">
          <option value="">— überspringen —</option>
          ${items.map(it => `<option value="${it.id}" ${it.id===match?.id?'selected':''}>${it.item_number} · ${esc(it.name)}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:13px;width:20px">${match ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--t4)">?</span>'}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <div class="sep-label" style="margin-top:0">${children.length} Position${children.length!==1?'en':''} in „${esc(tree.name)}"</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>STEP-Name</th><th>Menge</th><th>PLM-Bauteil</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div style="font-size:11px;color:var(--t4);margin-top:6px">
      ✓ automatisch erkannt · ? bitte manuell zuordnen · „überspringen" = nicht importieren
    </div>`;
  document.getElementById('step-import-btn').style.display = '';
}

async function doStepBomImport(revId) {
  const children = window._stepChildren || [];
  const entries = [];
  for (let i = 0; i < children.length; i++) {
    const id = document.getElementById(`sm-${i}`)?.value;
    const qty = parseFloat(document.getElementById(`sq-${i}`)?.value) || 1;
    if (id) entries.push({ child_item_id: parseInt(id), quantity: qty, unit: 'pcs' });
  }
  if (!entries.length) return toast('Keine Zuordnungen ausgewählt', 'err');
  const r = await api(`/api/revisions/${revId}/bom-bulk`, 'POST', { entries });
  toast(`${r.count} Position${r.count!==1?'en':''} in BOM übernommen`, 'ok');
  _hideDynModal();
  if (state.item) await switchRev(state.item.id, revId);
  refreshProjectTree();
}

// ── PRINT SETTINGS ────────────────────────────────────────────
async function loadPsConfig() {
  if (state._psConfigLoaded) return;
  [state.printers, state.nozzles, state.materialPresets, state.rawMaterials] = await Promise.all([
    api('/api/printers'), api('/api/nozzles'), api('/api/material-presets'), api('/api/raw-materials')
  ]);
  state._psConfigLoaded = true;
}
async function applyDimRawMat(val) {
  if (!val) return;
  const rm = (state.rawMaterials||[]).find(m => m.id == val);
  if (rm) {
    if (rm.material_type) set('dim-man-mat',   rm.material_type);
    if (rm.color)         set('dim-man-color',  rm.color);
    if (rm.print_temp)    set('dim-man-temp',  rm.print_temp);
    if (rm.bed_temp)      set('dim-man-bed',   rm.bed_temp);
    dimTab('manual');
  }

  // Load prices from incoming movements
  const prices = await api(`/api/raw-materials/${val}/prices`).catch(() => []);
  if (!prices.length) return;

  const unit = opt.dataset.unit || 'Stk';
  if (prices.length === 1) {
    set('dim-price', prices[0].unit_price);
    return;
  }
  // Multiple different prices → ask user
  _showDynModal(`<div class="modal" style="max-width:380px">
    <div class="modal-head"><div class="modal-title">Einkaufspreis wählen</div></div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        Mehrere Einkaufspreise für dieses Material vorhanden. Welchen möchtest du verwenden?
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${prices.map(p => `
          <button class="btn btn-ghost" style="text-align:left;justify-content:space-between"
            onclick="set('dim-price','${p.unit_price}');_hideDynModal()">
            <span style="font-family:var(--mono)">${fmtChf(p.unit_price)} / ${esc(unit)}</span>
            <span style="font-size:11px;color:var(--t4)">${p.created_at?.slice(0,10)||''}${p.notes?' · '+esc(p.notes):''}</span>
          </button>`).join('')}
        <button class="btn btn-ghost" style="text-align:left;color:var(--t4)"
          onclick="_hideDynModal()">— Kein Preis übernehmen</button>
      </div>
    </div>
  </div>`);
}
function _buildRmOptions(mats) {
  // Legacy: used for dim-rawmat select (Produktion)
  let opts = '<option value="">— kein Rohmaterial —</option>';
  for (const m of mats) {
    const label = [m.color, m.material_type, m.brand].filter(Boolean).join(' · ') || m.name;
    opts += `<option value="${m.id}">${esc(label)}${m.weight_g?' ('+fmtN(m.weight_g,0)+'g)':''} — ${fmtN(m.stock_qty,0)} ${m.unit}</option>`;
  }
  return opts;
}

// Searchable raw material picker (for li-rawmat in quotes/orders)
function _rmSearch(q, resultsId, hiddenId) {
  const res = document.getElementById(resultsId);
  if (!res) return;
  const mats = (state.rawMaterials||[]).filter(m => m.stock_qty > 0 || !q);
  const ql = (q||'').toLowerCase();
  const filtered = ql
    ? mats.filter(m => (m.color||'').toLowerCase().includes(ql)
        || (m.material_type||'').toLowerCase().includes(ql)
        || (m.name||'').toLowerCase().includes(ql)
        || (m.brand||'').toLowerCase().includes(ql))
    : mats;
  if (!filtered.length) {
    res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>';
    res.style.display = 'block';
    return;
  }
  res.innerHTML = [
    '<div onclick="_rmSelectItem(\'\',\'\',\''+resultsId+'\',\''+hiddenId+'\')" style="padding:8px 12px;cursor:pointer;font-size:13px;color:var(--t4)" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'\'">— kein Rohmaterial —</div>',
    ...filtered.map(m => {
      const label = [m.color, m.material_type, m.brand].filter(Boolean).join(' · ') || m.name;
      const stock = `${fmtN(m.stock_qty,0)} ${m.unit}`;
      return `<div onclick="_rmSelectItem('${m.id}','${esc(label).replace(/'/g,"\\'")}','${resultsId}','${hiddenId}')"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span style="flex:1;font-size:13px">${esc(label)}${m.weight_g?` <span style="color:var(--t4);font-size:12px">${fmtN(m.weight_g,0)}g</span>`:''}</span>
        <span style="font-family:var(--mono);font-size:12px;color:var(--t3)">${stock}</span>
      </div>`;
    })
  ].join('');
  res.style.display = 'block';
}

function _rmSelectItem(id, label, resultsId, hiddenId) {
  _rmSetValue(hiddenId, id, label);
  document.getElementById(resultsId).style.display = 'none';
  if (hiddenId === 'li-rawmat') _onRmSelect(id);
}

function _rmSetValue(hiddenId, id, label) {
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = id || '';
  const search = document.getElementById(hiddenId + '-search');
  if (!search) return;
  if (label) { search.value = label; return; }
  if (id) {
    const m = (state.rawMaterials||[]).find(m => m.id == id);
    search.value = m ? ([m.color, m.material_type, m.brand].filter(Boolean).join(' · ') || m.name) : '';
  } else {
    search.value = '';
  }
}

// Called when a raw material is selected in the quote line item modal
async function _onRmSelect(val) {
  window._liSelectedLot = null;
  if (!val) { _calcLiCost(); return; }
  const mat = (state.rawMaterials||[]).find(m => m.id == val);
  const activeLots = (mat?.lots||[]).filter(l => l.lot_number && (l.remaining_qty ?? l.qty ?? 0) > 0);
  if (activeLots.length === 0) {
    // No lots → use general price
    _calcLiCost();
  } else if (activeLots.length === 1) {
    // One lot → auto-select
    window._liSelectedLot = activeLots[0];
    _calcLiCost();
  } else {
    // Multiple lots → ask user
    _showLotPicker(mat, activeLots);
  }
}

function _showLotPicker(mat, lots) {
  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title">Lot wählen</div></div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        Mehrere aktive Lots für <strong>${esc(mat.name)}</strong>. Welches Lot verwenden?
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${lots.map(l => {
          const rem = fmtN(l.remaining_qty ?? l.qty ?? 0, 0);
          const price = l.unit_price != null ? fmtChf(l.unit_price)+'/'+mat.unit : '—';
          return `<button class="btn btn-ghost" style="text-align:left;justify-content:space-between;display:flex;gap:12px"
            onclick="_selectLot(${JSON.stringify(l).replace(/"/g,'&quot;')})">
            <span style="font-family:var(--mono)">${esc(l.lot_number)}</span>
            <span style="color:var(--t3);font-size:13px">${rem} ${mat.unit}</span>
            <span style="color:var(--teal);font-family:var(--mono)">${price}</span>
          </button>`;
        }).join('')}
        <button class="btn btn-ghost" style="color:var(--t4)" onclick="_selectLot(null)">— ohne Lot-Zuordnung</button>
      </div>
    </div>
  </div>`);
}

function _selectLot(lot) {
  window._liSelectedLot = lot;
  _hideDynModal();
  _calcLiCost();
}

// Same helpers exposed for delivery item manual entry
function _populateDimSelects() {
  const rmSel = document.getElementById('dim-rawmat');
  if (rmSel) rmSel.innerHTML = '<option value="">— kein Rohmaterial —</option>' +
    (state.rawMaterials||[]).map(m => {
      const label = [m.material_type, m.color, m.dimensions].filter(Boolean).join(' · ');
      return `<option value="${m.id}" data-mat="${esc(m.material_type)}" data-col="${esc(m.color)}" data-unit="${esc(m.unit)}">${esc(m.name)}${label?' ('+esc(label)+')':''} — ${m.stock_qty} ${m.unit}</option>`;
    }).join('');
  const nozSel = document.getElementById('dim-man-nozzle');
  if (nozSel) nozSel.innerHTML = '<option value="">—</option>' +
    state.nozzles.map(n=>`<option value="${n.size}">${n.size} mm</option>`).join('');
  const prSel = document.getElementById('dim-man-printer');
  if (prSel) prSel.innerHTML = '<option value="">— kein —</option>' +
    state.printers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
}
function dimTab(tab) {
  ['3mf','manual'].forEach(t => {
    document.getElementById('dim-section-'+t).style.display = t===tab ? '' : 'none';
    document.getElementById('dim-tab-'+t).classList.toggle('active', t===tab);
    document.getElementById('dim-tab-'+t).classList.toggle('btn-ghost', t!==tab);
  });
}
