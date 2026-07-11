// 09-production.js — Produktionsaufträge, 3MF-Einstellungen, Positionssuche, CRUD
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DELIVERIES ────────────────────────────────────────────────
const DELIVERY_ST_MAP   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
const DELIVERY_ST_LABEL = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};

let _deliveryFilter = { text:'', status:'', dateFrom:'', dateTo:'' };
function _clearDeliveryFilter(){_deliveryFilter={text:'',status:'',dateFrom:'',dateTo:''};renderDeliveries();}
async function renderDeliveries() {
  setLeftHeader('Produktion', `<button class="btn btn-primary btn-sm" onclick="openDeliveryModal()">+ Produktionsauftrag</button>`);
  const rows = await api('/api/deliveries');
  state.deliveries = rows;
  if (!rows.length) { setLeftBody(`<div class="empty"><div class="empty-icon">🔧</div><div class="empty-text">Noch keine Produktionsaufträge</div></div>`); return; }
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
  el.innerHTML = rows.map(d => `<tr data-id="${d.id}" onclick="openDeliveryDetail(${d.id})">
    <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${d.number}</td>
    <td style="font-weight:500">${esc(d.title)}</td>
    <td style="color:var(--t2)">${d.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${d.item_count||0}</td>
    <td>${_stSel('delivery',d.id,d.status)}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(d.delivery_date)}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generateDeliveryDoc(${d.id})" title="Druckansicht">&#128196;</button>
      ${d.status === 'DRAFT' ? `<button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delDelivery(${d.id})">&#x2715;</button>` : ''}
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('delivery',id,d.status)}</div>
        <div><div class="ps-label">Kunde</div>${d.customer_name||'—'}</div>
        <div><div class="ps-label">Lieferdatum</div>${fmtD(d.delivery_date)}</div>
        ${d.manufacture_date?`<div><div class="ps-label">Herstellungsdatum</div>${fmtD(d.manufacture_date)}</div>`:''}
        ${d.order_number?`<div><div class="ps-label">Auftrag</div>${d.order_number} ${d.order_title?'– '+esc(d.order_title):''}</div>`:''}
        ${d.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(d.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openDeliveryModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDeliveryDoc(${id})">&#128196; Druckansicht</button>
        ${d.status === 'DRAFT'
          ? `<button class="btn btn-red btn-sm" onclick="delDelivery(${id})">🗑 Löschen</button>`
          : `<span style="font-size:13px;color:var(--t3);font-family:var(--mono)">🔒 Löschen nur unter Einstellungen → Admin</span>`}
      </div>
    </div>`;
  _markActiveRow(id);
  showDetail();
}

function renderDeliveryItems(items, deliveryId) {
  if (!items.length) return `<div style="color:var(--t3);font-size:13px;padding:8px 0">Noch keine Positionen</div>`;
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
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:11px;opacity:${isFirst?0.2:1}" ${isFirst?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'up')">▲</button>
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:11px;opacity:${isLast?0.2:1}" ${isLast?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'down')">▼</button>
        </div>
        ${item.item_number?`<span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${item.item_number}</span>`:''}
        <span style="font-size:13px;font-weight:500;flex:1">${esc(item.description)}</span>
        ${item.rm_name?`<span style="font-size:11px;background:rgba(142,163,255,.12);color:var(--blue);border-radius:3px;padding:1px 6px;font-family:var(--mono);flex-shrink:0">${esc(item.rm_name)}</span>`:''}
        <span style="font-family:var(--mono);font-size:13px;color:var(--t2)">${item.quantity} ${item.unit}</span>
        ${item.unit_price!=null?`<span style="font-family:var(--mono);font-size:13px;color:var(--green)">${fmtCHF(parseFloat(item.unit_price))}</span>`:''}
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
        <div style="font-family:var(--mono);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${label}</div>
        <div style="font-size:13px;font-weight:500;color:var(--t1)">${esc(v)}</div>
      </div>`;
    }).filter(Boolean).join('');
    if (!cells) return '';
    return `<div style="margin-bottom:8px">
      <div style="font-family:var(--mono);font-size:11px;color:${g.color};letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">${g.label}</div>
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
          <div style="font-family:var(--mono);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${esc(k.replace(/_/g,' '))}</div>
          <div style="font-size:13px;font-weight:500;color:var(--t1)">${esc(val)}</div>
        </div>`;
      }).filter(Boolean).join('');
    return extraCells ? `<div style="margin-bottom:8px">
      <div style="font-family:var(--mono);font-size:11px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">Parameter</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px">${extraCells}</div>
    </div>` : '';
  })();

  return groups + extras || '<div style="font-size:13px;color:var(--t3)">Keine Settings geladen</div>';
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
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const icon = _itemChip(i.item_type, 18);
      return `<div onclick="selectDimLinkedItem(${i.id})"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name)}</span>
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

async function selectDimLinkedItem(itemId) {
  document.getElementById('dim-plm-search').value = '';
  document.getElementById('dim-plm-results').style.display = 'none';
  const item = await api('/api/items/' + itemId).catch(() => null);
  if (!item) return;
  set('dim-linked-plm-id', item.id);
  const icon = _itemChip(item.item_type, 18);
  document.getElementById('dim-plm-badge').innerHTML = icon + ' <span style="font-family:var(--mono)">' + esc(item.item_number) + '</span>';
  document.getElementById('dim-plm-name').textContent = item.name + (item.project?.name ? ' · ' + item.project.name : '');
  document.getElementById('dim-plm-selected').style.display = 'flex';
  _showDimStockInfo(item.id);
  if (!V('dim-desc')) set('dim-desc', item.item_number + ' – ' + item.name);
  if (item.default_price != null && !V('dim-price')) set('dim-price', item.default_price);
  // Auto-fill manual print parameters from linked item's print settings
  const ps = item.revisions?.[0]?.print_settings;
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
    document.getElementById('dm-title').textContent = 'Produktionsauftrag bearbeiten';
  } else {
    ['dm-title-f','dm-date','dm-manufacture-date','dm-notes'].forEach(f=>set(f,''));
    document.getElementById('dm-status').value = 'DRAFT';
    cSel.value = ''; oSel.value = '';
    document.getElementById('dm-title').textContent = 'Neuer Produktionsauftrag';
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
    toast('Produktionsauftrag angelegt','ok'); closeModal('deliveryModal');
    await renderDeliveries(); openDeliveryDetail(d.id);
  }
  loadStats();
}

async function delDelivery(id) {
  if (!confirm('Produktionsauftrag löschen?')) return;
  await api(`/api/deliveries/${id}`,'DELETE'); toast('Gelöscht','ok'); closeDetail(); renderDeliveries(); loadStats();
}

async function openDeliveryItemModal(deliveryId, itemId) {
  await loadPsConfig();
  if (!state.rawMaterials?.length) state.rawMaterials = await api('/api/raw-materials').catch(() => []);
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
  document.getElementById('dim-rawmat').value = '';
  set('dim-rawmat-id', '');

  if (itemId) {
    const fresh = await api(`/api/deliveries/${deliveryId}`);
    const it = (fresh.items||[]).find(x=>x.id===itemId);
    if (it) {
      set('dim-desc', it.description); set('dim-qty', it.quantity); set('dim-notes', it.notes||'');
      set('dim-price', it.unit_price!=null ? it.unit_price : '');
      document.getElementById('dim-unit').value = it.unit||'Stk';
      if (it.raw_material_id) {
        document.getElementById('dim-rawmat').value = it.raw_material_id;
        set('dim-rawmat-id', it.raw_material_id);
      }
      if (it.item_id && it.item_number) {
        set('dim-linked-plm-id', it.item_id);
        const icon = _itemChip(it.item_type, 18);
        document.getElementById('dim-plm-badge').innerHTML = icon + ' <span style="font-family:var(--mono)">' + esc(it.item_number) + '</span>';
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
  const rmVal = document.getElementById('dim-rawmat')?.value;
  const body = {
    description: desc, quantity: parseFloat(V('dim-qty'))||1,
    unit: document.getElementById('dim-unit').value,
    unit_price: priceVal !== '' ? parseFloat(priceVal) : null,
    item_id: V('dim-linked-plm-id') ? parseInt(V('dim-linked-plm-id')) : null,
    print_settings_json: settingsJson,
    notes: V('dim-notes'),
    raw_material_id: rmVal ? parseInt(rmVal) : null,
  };
  try {
    if (itemId) {
      const r = await api(`/api/delivery-items/${itemId}`,'PUT',body);
      toast(r?.price_synced ? 'Gespeichert · Preis im Auftrag übernommen' : 'Gespeichert','ok');
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
