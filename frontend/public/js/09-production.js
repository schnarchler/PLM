// 09-production.js — Produktionsaufträge, 3MF-Einstellungen, Positionssuche, CRUD
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DELIVERIES ────────────────────────────────────────────────
// Status-Tabellen (DELIVERY_ST_MAP / _LABEL) stehen zentral in 01-core.js.

let _deliveryFilter = { text:'', status:'', dateFrom:'', dateTo:'' };
function _clearDeliveryFilter(){_deliveryFilter={text:'',status:'',dateFrom:'',dateTo:''};renderDeliveries();}
let _deliveryShowLinked = false;
function _setDeliveryScope(v) { _deliveryShowLinked = v; renderDeliveries(); }

// Aus der Produktionsliste direkt in den Tab „Produktion" des Auftrags springen.
async function openOrderFromProduction(orderId) {
  await gotoView('orders');
  await openOrderDetail(orderId);
  showDetail();
  document.querySelector('#dp-tabs button[onclick*="od-fert"]')?.click();
}

async function renderDeliveries() {
  setLeftHeader(_t('Produktion'), `<button class="btn btn-primary btn-sm" onclick="openDeliveryModal()">${_t('+ Produktionsauftrag')}</button>`);
  const rows = await api('/api/deliveries');
  state.deliveries = rows;
  if (!rows.length) { setLeftBody(`<div class="empty"><div class="empty-icon">🔧</div><div class="empty-text">${_t('Noch keine Produktionsaufträge')}</div></div>`); return; }
  // Produktion zu einem Auftrag wird im Auftrag selbst bearbeitet (Tab
  // "Produktion"). Diese Liste zeigt darum standardmaessig nur eigenstaendige
  // Produktionsauftraege — sonst pflegt man dasselbe an zwei Stellen.
  const linked = rows.filter(d => d.order_id).length;
  setLeftBody(_filterBar(_deliveryFilter,[['DRAFT',_t('Entwurf')],['READY',_t('Bereit')],['DELIVERED',_t('Geliefert')]],'_clearDeliveryFilter','_delivery')+
    `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px;font-size:13px">
      <button class="btn btn-sm ${_deliveryShowLinked ? 'btn-ghost' : 'btn-primary'}"
        onclick="_setDeliveryScope(false)">${_t('Eigenständig')}</button>
      <button class="btn btn-sm ${_deliveryShowLinked ? 'btn-primary' : 'btn-ghost'}"
        onclick="_setDeliveryScope(true)">${_t('Alle')}${linked ? ` (${_t('{n} zu Aufträgen', { n: linked })})` : ''}</button>
      <span style="color:var(--t4);font-size:12.5px">
        ${_t('Produktionsaufträge zu einem Auftrag bearbeitest du im Auftrag unter „Produktion“.')}
      </span>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>${_t('Nummer')}</th><th>${_t('Bezeichnung')}</th><th>${_t('Kunde')}</th><th>${_t('Auftrag')}</th><th>${_t('Pos.')}</th><th>Status</th><th>${_t('Datum')}</th><th></th></tr></thead>
      <tbody id="_delivery-tbody"></tbody>
    </table></div>`);
  _render_deliveryRows();
}

function _render_deliveryRows() {
  const t = _deliveryFilter.text.toLowerCase(); const s = _deliveryFilter.status;
  const df = _deliveryFilter.dateFrom; const dt = _deliveryFilter.dateTo;
  const rows = (state.deliveries||[]).filter(d =>
    (_deliveryShowLinked || !d.order_id) &&
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
    <td>${d.order_id
      ? `<span style="font-family:var(--mono);font-size:12px;color:var(--blue);cursor:pointer"
           onclick="event.stopPropagation();openOrderFromProduction(${d.order_id})"
           title="${_t('Im Auftrag bearbeiten')}">${esc(d.order_number||_t('Auftrag'))} ↗</span>`
      : '<span style="color:var(--t4);font-size:12.5px">' + _t('eigenständig') + '</span>'}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${d.item_count||0}</td>
    <td>${_stSel('delivery',d.id,d.status)}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(d.delivery_date)}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generateDeliveryDoc(${d.id})" title="${_t('Lieferschein')}">&#128196;</button>
      ${d.status === 'DRAFT' ? `<button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delDelivery(${d.id})">&#x2715;</button>` : ''}
    </td>
  </tr>`).join('') || `<tr><td colspan="8" style="padding:20px;text-align:center;color:var(--t3)">${
    _deliveryShowLinked ? _t('Keine Treffer') : _t('Keine eigenständigen Produktionsaufträge — alle hängen an Aufträgen.')}</td></tr>`;
}

async function openDeliveryDetail(id) {
  const d = await api(`/api/deliveries/${id}`);
  _trackRecent('delivery', d.id, d.title, d.number);
  _pushHistory({ view: 'deliveries', detailType: 'delivery', detailId: d.id });
  document.getElementById('dp-title').innerHTML = `<strong>${d.number}</strong>&nbsp;${esc(d.title)}`;
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'dd-pos')">${_t('Positionen')}</button>
    <button class="tab" onclick="switchTab(this,'dd-info')">Details</button>
    <button class="tab" onclick="switchTab(this,'dd-trace');loadDeliveryTrace(${id})">${_t('Rückverfolgung')}</button>
    ${d.changelog ? `<button class="tab" onclick="switchTab(this,'dd-log')">${_t('Verlauf')}</button>` : ''}`;
  document.getElementById('dp-body').innerHTML = `
    <div id="dd-trace" style="display:none"></div>
    <div id="dd-log" style="display:none">${renderChangelogList(d.changelog)}</div>
    <div id="dd-pos">
      ${renderDeliveryItems(d.items||[], id, d.status === 'DELIVERED')}
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openDeliveryItemModal(${id})">${_t('+ Position')}</button>
    </div>
    <div id="dd-info" style="display:none">
      <div class="sep-label">${_t('Kopfdaten')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('delivery',id,d.status)}</div>
        <div><div class="ps-label">${_t('Kunde')}</div>${d.customer_name||'—'}</div>
        <div><div class="ps-label">${_t('Lieferdatum')}</div>${fmtD(d.delivery_date)}</div>
        ${d.manufacture_date?`<div><div class="ps-label">${_t('Herstellungsdatum')}</div>${fmtD(d.manufacture_date)}</div>`:''}
        ${d.order_number?`<div><div class="ps-label">${_t('Auftrag')}</div>${d.order_number} ${d.order_title?'– '+esc(d.order_title):''}</div>`:''}
        ${d.notes?`<div style="grid-column:span 2"><div class="ps-label">${_t('Notizen')}</div><span style="color:var(--t2)">${esc(d.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openDeliveryModal(${id})">${_t('✏️ Bearbeiten')}</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDeliveryDoc(${id})">${_t('&#128196; Lieferschein')}</button>
        ${d.status === 'DRAFT'
          ? `<button class="btn btn-red btn-sm" onclick="delDelivery(${id})">${_t('🗑 Löschen')}</button>`
          : `<span style="font-size:13px;color:var(--t3);font-family:var(--mono)">${_t('🔒 Löschen nur unter Einstellungen → Admin')}</span>`}
      </div>
    </div>`;
  _markActiveRow(id);
  showDetail();
}

// ── GELIEFERTER STAND ─────────────────────────────────────────
// Eine Position folgt bis zur Lieferung der aktiven Revision (oder einer von
// Hand gewählten) und wird beim Status „Geliefert" fixiert. Darstellung wie in
// der Stückliste: Schloss = fest, ↑revN = inzwischen gibt es eine neuere.
const REV_FIXED_LABEL = { manual: _t('von Hand gewählt'), delivery: _t('beim Liefern fixiert'), migration: _t('nachträglich aus dem Lieferdatum ermittelt') };

function _deliveryRevBadge(item, deliveryId, delivered) {
  const eff = item.effective_rev;
  if (!item.item_id || !eff) return '';
  const fixed = !!item.revision_id;
  const newest = item.active_rev ? 'rev' + item.active_rev.rev : '—';
  const how = REV_FIXED_LABEL[item.rev_fixed] || '';
  const title = delivered
    ? _t('Geliefert als rev{rev}', { rev: eff.rev }) + (how ? ' (' + how + ')' : '') + (item.rev_outdated ? ' — ' + _t('aktuell ist {newest}', { newest }) : '') + '. ' + _t('Klicken für den gelieferten Stand.')
    : fixed
      ? (item.rev_outdated ? _t('Fest auf rev{rev} — aktuell wäre {newest}. Klicken zum Ändern.', { rev: eff.rev, newest }) : _t('Fest auf rev{rev}. Klicken zum Ändern.', { rev: eff.rev }))
      : _t('Folgt automatisch der aktiven Revision ({newest}) und wird beim Liefern fixiert. Klicken zum Fixieren.', { newest });
  return `<span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0;cursor:pointer" title="${esc(title)}"
      onclick="event.stopPropagation();openDeliveryRevPicker(${item.id},${deliveryId})">
      <span class="status st-${eff.status}" style="font-size:11px${fixed ? '' : ';opacity:.7'}">${fixed ? '🔒 ' : ''}rev${esc(eff.rev)}</span>
      ${item.rev_outdated ? `<span style="font-size:10px;font-family:var(--mono);color:var(--amber)">↑${newest}</span>` : ''}
      ${item.rev_fixed === 'migration' ? '<span style="font-size:10px;color:var(--t4)">ermittelt</span>' : ''}
      ${item.structure?.length ? `<span class="chip" style="font-size:10px">${_t('{n} Teile', { n: item.structure.length })}</span>` : ''}
    </span>`;
}

// Gelieferte Struktur einer Baugruppe: jedes Unterteil mit seiner Revision
function _deliveredStructureHtml(rows) {
  if (!rows?.length) return '';
  return `<div class="sep-label">${_t('Gelieferte Struktur')}</div>
    <div style="display:flex;flex-direction:column;gap:3px">
      ${rows.map(r => `<div onclick="_hideDynModal();gotoPlmItem(${r.item_id})" title="${_t('Item öffnen')}"
          style="display:flex;align-items:center;gap:8px;padding:5px 9px 5px ${9 + (r.depth - 1) * 18}px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-xs);cursor:pointer">
          ${_itemChip(r.item_type, 14)}
          <span style="font-family:var(--mono);font-size:12px;color:var(--blue);flex-shrink:0">${esc(r.item_number || '—')}</span>
          <span style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name || '')}</span>
          <span style="font-family:var(--mono);font-size:12px;color:var(--t3);flex-shrink:0">${fmtN(r.quantity, 0)}×</span>
          <span class="status st-${r.rev_status || 'DFT'}" style="font-size:11px;flex-shrink:0">🔒 rev${esc(r.rev || '—')}</span>
          ${r.rev_outdated ? `<span style="font-size:10px;font-family:var(--mono);color:var(--amber);flex-shrink:0" title="${_t('Inzwischen gibt es rev{rev}', { rev: esc(r.active_rev) })}">↑rev${esc(r.active_rev)}</span>` : ''}
        </div>`).join('')}
    </div>`;
}

async function openDeliveryRevPicker(deliveryItemId, deliveryId) {
  let d, item;
  try { d = await api(`/api/deliveries/${deliveryId}`); } catch { return; }
  const pos = (d.items || []).find(x => x.id === deliveryItemId);
  if (!pos?.item_id) return;
  try { item = await api(`/api/items/${pos.item_id}`); }
  catch { return toast(_t('Item konnte nicht geladen werden'), 'err'); }
  const delivered = d.status === 'DELIVERED';
  const revs = item.revisions || [];
  const chosen = pos.revision_id || null;
  const activeId = pos.active_rev?.id;
  const how = REV_FIXED_LABEL[pos.rev_fixed];

  _showDynModal(`<div class="modal" style="max-width:580px">
    <div class="modal-head">
      <div class="modal-title" style="display:flex;align-items:center;gap:8px;min-width:0">
        <span>${delivered ? _t('Gelieferter Stand') : _t('Revision in der Produktion')}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.item_number)}</span>
      </div>
    </div>
    <div class="modal-body" style="max-height:66vh;overflow-y:auto">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">${esc(item.name)} · ${esc(d.number)}</div>
      ${delivered ? `<div style="font-size:13px;color:var(--t2);padding:9px 11px;background:var(--teal-soft);border:1px solid var(--teal-line);border-radius:var(--r-sm);margin-bottom:12px;line-height:1.55">
          🚚 ${_t('Geliefert als {rev}', { rev: `<strong>rev${esc(pos.effective_rev?.rev || '—')}</strong>` })}${how ? ' (' + how + ')' : ''}.
          ${_t('Wurde die falsche Revision erfasst, hier korrigieren. Zum Lösen den Status des Produktionsauftrags zurücksetzen.')}
        </div>` : ''}
      ${delivered ? '' : _revPickRow(!chosen, _t('Automatisch'),
          _t('Folgt der aktiven Revision (rev{rev}) und wird beim Liefern fixiert', { rev: esc(pos.active_rev?.rev || '—') }),
          `_setDeliveryRev(${pos.id},null,${deliveryId})`, '<span class="chip" style="flex-shrink:0">' + _t('Standard') + '</span>')}
      <div class="sep-label">${delivered ? _t('Korrigieren auf') : _t('Fest auf Revision')}</div>
      ${_revPickList(revs, chosen, activeId, r => `_setDeliveryRev(${pos.id},${r.id},${deliveryId})`)}
      ${delivered ? _deliveredStructureHtml(pos.structure) : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Schliessen')}</button>
    </div>
  </div>`);
}

async function _setDeliveryRev(deliveryItemId, revId, deliveryId) {
  _hideDynModal();
  try {
    const r = await api(`/api/delivery-items/${deliveryItemId}/revision`, 'PUT', { rev_id: revId });
    toast(revId ? _t('Fest auf rev{rev}', { rev: r.rev }) : _t('Folgt wieder automatisch'), 'ok');
  } catch { return; }
  if (!refreshOrderProductionIfOpen()) openDeliveryDetail(deliveryId);
}

function renderDeliveryItems(items, deliveryId, delivered = false) {
  if (!items.length) return `<div style="color:var(--t3);font-size:13px;padding:8px 0">${_t('Noch keine Positionen')}</div>`;
  const allBtn = `<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
    ${items.length > 1 ? `<button class="btn btn-teal btn-sm" onclick="printReceiptAll(${deliveryId},'short')">${_t('🖶 Alle kurz')}</button>
    <button class="btn btn-teal btn-sm" onclick="printReceiptAll(${deliveryId},'full')">${_t('🖶 Alle mit Parametern')}</button>` : ''}
    <button class="btn btn-ghost btn-sm" onclick="printPartLabels(${deliveryId})" title="${_t('Etiketten mit Kurzcode und QR-Code für Beutel oder Kiste')}">${_t('🏷 Etiketten')}</button>
  </div>`;
  return allBtn + items.map((item,idx) => {
    const isFirst = idx===0, isLast = idx===items.length-1;
    return `
    <div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:8px;overflow:hidden">
      ${itemHints(item).length ? `<div class="important-note" style="margin:0;border-radius:0;border-width:0 0 1px 4px">
        <span class="important-note-icon">⚠</span>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">${itemHints(item).map(_hintHtml).join('')}</div>
      </div>` : ''}
      <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-bottom:${item.print_settings?'1px solid var(--line)':'none'}">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:11px;opacity:${isFirst?0.2:1}" ${isFirst?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'up')">▲</button>
          <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:13px;font-size:11px;opacity:${isLast?0.2:1}" ${isLast?'disabled':''} onclick="moveDeliveryItem(${item.id},${deliveryId},'down')">▼</button>
        </div>
        ${item.item_number?`<span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${item.item_number}</span>`:''}
        ${_deliveryRevBadge(item, deliveryId, delivered)}
        ${item.short_code?`<span class="chip" style="flex-shrink:0" title="${_t('Kurzcode auf dem Teil')}">${esc(item.short_code + (item.effective_rev ? '-' + item.effective_rev.rev : ''))}</span>`:''}
        <span style="font-size:13px;font-weight:500;flex:1">${esc(item.description)}</span>
        ${item.rm_name?`<span style="font-size:11px;background:rgba(157,180,255,.12);color:var(--blue);border-radius:3px;padding:1px 6px;font-family:var(--mono);flex-shrink:0">${esc(item.rm_name)}</span>`:''}
        <span style="font-family:var(--mono);font-size:13px;color:var(--t2)">${item.quantity} ${_unit(item.unit)}</span>
        ${item.unit_price!=null?`<span style="font-family:var(--mono);font-size:13px;color:var(--green)">${fmtCHF(parseFloat(item.unit_price))}</span>`:''}
        <button class="btn btn-teal btn-icon btn-sm" onclick="printReceipt(${item.id},'short')" title="${_t('Kurzbeleg')}">🖶</button>
        <button class="btn btn-teal btn-icon btn-sm" onclick="printReceipt(${item.id},'full')" title="${_t('Vollbeleg mit Parametern')}">🖶≡</button>
        <button class="btn btn-ghost btn-icon btn-sm" onclick="openDeliveryItemModal(${deliveryId},${item.id})" title="${_t('Bearbeiten')}">✏</button>
        <button class="btn btn-red btn-icon btn-sm" onclick="delDeliveryItem(${item.id},${deliveryId})">✕</button>
      </div>
      ${item.print_settings ? `<div style="padding:8px 10px">${renderSettingsPreview(item.print_settings)}</div>` : ''}
    </div>`;
  }).join('');
}

// ── 3MF SETTINGS RENDERING ────────────────────────────────────
const SETTINGS_GROUPS = [
  { label: _t('Profil'), color: 'var(--blue)', keys: [
    ['print_settings_id',_t('Druckprofil')], ['printer_settings_id',_t('Drucker')], ['filament_settings_id',_t('Filamentprofil')]
  ]},
  { label: _t('Schichten & Wände'), color: 'var(--teal)', keys: [
    ['layer_height',_t('Schichthöhe (mm)')], ['first_layer_height',_t('1. Schicht (mm)')],
    ['perimeters',_t('Perimeter')], ['top_solid_layers',_t('Oben (Lagen)')], ['bottom_solid_layers',_t('Unten (Lagen)')],
    ['spiral_vase',_t('Vase-Modus')]
  ]},
  { label: _t('Füllung'), color: 'var(--amber)', keys: [
    ['fill_density',_t('Füllung (%)')], ['fill_pattern',_t('Muster')],
    ['top_fill_pattern',_t('Oben-Muster')], ['bottom_fill_pattern',_t('Unten-Muster')]
  ]},
  { label: _t('Stützen'), color: 'var(--purple)', keys: [
    ['support_material',_t('Aktiv')], ['support_material_auto',_t('Auto-Support')],
    ['support_material_threshold',_t('Überhangwinkel (°)')], ['support_material_pattern',_t('Muster')],
    ['support_material_style',_t('Stil')], ['raft_layers',_t('Raft-Lagen')]
  ]},
  { label: _t('Temperatur'), color: 'var(--red)', keys: [
    ['temperature',_t('Düsentemperatur (°C)')], ['first_layer_temperature',_t('Düse 1. Schicht (°C)')],
    ['bed_temperature',_t('Betttemperatur (°C)')], ['first_layer_bed_temperature',_t('Bett 1. Schicht (°C)')],
    ['nozzle_temperature',_t('Düsentemperatur (°C)')], ['hot_plate_temp',_t('Betttemperatur (°C)')]
  ]},
  { label: _t('Geschwindigkeit'), color: 'var(--green)', keys: [
    ['perimeter_speed',_t('Perimeter (mm/s)')], ['infill_speed',_t('Füllung (mm/s)')],
    ['travel_speed',_t('Travel (mm/s)')], ['first_layer_speed',_t('1. Schicht (mm/s)')],
    ['bridge_speed',_t('Brücken (mm/s)')]
  ]},
  { label: _t('Kühlung'), color: 'var(--teal)', keys: [
    ['fan_always_on',_t('Lüfter immer an')], ['min_fan_speed',_t('Min-Lüfter (%)')],
    ['max_fan_speed',_t('Max-Lüfter (%)')], ['bridge_fan_speed',_t('Brücken-Lüfter (%)')],
    ['disable_fan_first_layers',_t('Lüfter aus (erste Lagen)')]
  ]},
  { label: _t('Filament'), color: 'var(--amber)', keys: [
    ['filament_type',_t('Typ')], ['filament_diameter',_t('Durchmesser (mm)')],
    ['filament_density',_t('Dichte (g/cm³)')], ['filament_cost',_t('Preis (CHF/kg)')]
  ]},
  { label: _t('Diverses'), color: 'var(--t2)', keys: [
    ['seam_position',_t('Nahtposition')], ['brim_width',_t('Brim (mm)')],
    ['skirts',_t('Skirt-Linien')], ['wipe_tower',_t('Wipe-Tower')],
    ['avoid_crossing_perimeters',_t('Kreuzungen vermeiden')], ['ironing',_t('Bügeln')],
    ['ironing_type',_t('Bügeltyp')], ['nozzle_diameter',_t('Düsendurchmesser (mm)')],
    ['estimated_printing_time_normal_mode',_t('Druckzeit (geschätzt)')]
  ]}
];

function getFirstVal(v) {
  if (!v) return null;
  const first = v.split(';')[0].trim();
  if (first === '0' || first === '') return null;
  if (first === '1') return _t('Ja');
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
      <div style="font-family:var(--mono);font-size:11px;color:var(--t2);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">${_t('Parameter')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:4px">${extraCells}</div>
    </div>` : '';
  })();

  return groups + extras || '<div style="font-size:13px;color:var(--t3)">' + _t('Keine Settings geladen') + '</div>';
}

// ── 3MF UPLOAD HANDLING ───────────────────────────────────────
async function handle3mfUpload(file) {
  if (!file) return;
  const status = document.getElementById('dim-3mf-status');
  const preview = document.getElementById('dim-3mf-preview');
  status.textContent = _t('⏳ Wird analysiert…');
  status.style.color = 'var(--amber)';
  preview.style.display = 'none';
  set('dim-settings-json', '');

  const fd = new FormData();
  fd.append('file', file);
  try {
    const r = await fetch('/api/parse-3mf', { method: 'POST', body: fd });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      status.textContent = '✕ ' + (e.error || _t('Fehler beim Parsen'));
      status.style.color = 'var(--red)';
      return;
    }
    const { settings } = await r.json();
    set('dim-settings-json', JSON.stringify(settings));
    const keyCount = Object.keys(settings).length;
    status.textContent = '✓ ' + _t('{n} Parameter geladen', { n: keyCount }) + ` · ${file.name}`;
    status.style.color = 'var(--green)';
    preview.style.display = 'block';
    preview.innerHTML = renderSettingsPreview(settings);
  } catch(e) {
    status.textContent = _t('✕ Verbindungsfehler');
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
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:13px;color:var(--t3)">' + _t('Keine Treffer') + '</div>'; res.style.display='block'; return; }
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
    el.innerHTML = `<b>${_t('Lager:')} ${fmtN(s.stock_qty, 0)} ${_unit(s.unit)}</b>`
      + (s.planned_qty > 0 ? ' · ' + _t('{n} geplant (offene Aufträge)', { n: fmtN(s.planned_qty, 0) }) : '')
      + ` · <b style="color:${color}">${_t('Verfügbar:')} ${fmtN(avail, 0)} ${_unit(s.unit)}</b>`
      + (s.stock_qty <= 0 ? ' — <b>' + _t('Kein Bestand!') + '</b>' : '');
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
  cSel.innerHTML = '<option value="">' + _t('— keiner —') + '</option><option value="__free__">' + _t('✏ Name eingeben...') + '</option>' + customers.map(c=>`<option value="${c.id}">${c.number} ${esc(c.name)}</option>`).join('');
  oSel.innerHTML = '<option value="">' + _t('— keiner —') + '</option>' + orders.map(o=>`<option value="${o.id}">${o.number} – ${esc(o.title)}</option>`).join('');
  if (id) {
    const d = await api(`/api/deliveries/${id}`);
    set('dm-title-f', d.title); setCustFields('dm',d.customer_id,d.customer_name_free); oSel.value = d.order_id||'';
    document.getElementById('dm-status').value = d.status||'DRAFT';
    set('dm-date', d.delivery_date||''); set('dm-manufacture-date', d.manufacture_date||''); set('dm-notes', d.notes||'');
    document.getElementById('dm-title').textContent = _t('Produktionsauftrag bearbeiten');
  } else {
    ['dm-title-f','dm-date','dm-manufacture-date','dm-notes'].forEach(f=>set(f,''));
    document.getElementById('dm-status').value = 'DRAFT';
    cSel.value = ''; oSel.value = '';
    document.getElementById('dm-title').textContent = _t('Neuer Produktionsauftrag');
  }
  set('dm-id', id||''); openModal('deliveryModal');
}

async function saveDelivery() {
  const title = V('dm-title-f'); if (!title) return toast(_t('Bezeichnung fehlt'),'err');
  const body = { title, ...getCustBody('dm'), order_id: V('dm-order')||null,
    status: document.getElementById('dm-status').value, delivery_date: V('dm-date')||null,
    manufacture_date: V('dm-manufacture-date')||null, notes: V('dm-notes') };
  if (editingDeliveryId) {
    await api(`/api/deliveries/${editingDeliveryId}`,'PUT',body);
    toast(_t('Gespeichert'),'ok'); closeModal('deliveryModal');
    openDeliveryDetail(editingDeliveryId);
  } else {
    const d = await api('/api/deliveries','POST',body);
    toast(_t('Produktionsauftrag angelegt'),'ok'); closeModal('deliveryModal');
    await renderDeliveries(); openDeliveryDetail(d.id);
  }
  loadStats();
}

async function delDelivery(id) {
  if (!confirm(_t('Produktionsauftrag löschen?'))) return;
  await api(`/api/deliveries/${id}`,'DELETE'); toast(_t('Gelöscht'),'ok'); closeDetail(); renderDeliveries(); loadStats();
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
  document.getElementById('dim-title').textContent = itemId ? _t('Position bearbeiten') : _t('Position hinzufügen');
  document.getElementById('dim-save').textContent = itemId ? _t('Speichern') : _t('Hinzufügen');
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
      document.getElementById('dim-unit').value = it.unit||'pcs';
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
        st.textContent = '✓ ' + _t('{n} Parameter gespeichert', { n: keyCount });
        st.style.color = 'var(--green)';
        document.getElementById('dim-3mf-preview').style.display = 'block';
        document.getElementById('dim-3mf-preview').innerHTML = renderSettingsPreview(settings);
      }
    }
  } else {
    ['dim-desc','dim-notes'].forEach(f=>set(f,''));
    set('dim-qty', 1); set('dim-price', '');
    document.getElementById('dim-unit').value = 'pcs';
  }
  openModal('deliveryItemModal');
}

async function saveDeliveryItem() {
  const deliveryId = parseInt(V('dim-delivery-id'));
  const itemId = V('dim-item-id');
  const desc = V('dim-desc'); if (!desc) return toast(_t('Beschreibung fehlt'),'err');
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
      toast(r?.price_synced ? _t('Gespeichert · Preis im Auftrag übernommen') : _t('Gespeichert'),'ok');
    } else {
      await api(`/api/deliveries/${deliveryId}/items`,'POST',body);
      toast(_t('Position hinzugefügt'),'ok');
    }
    closeModal('deliveryItemModal');
    await renderDeliveries(); openDeliveryDetail(deliveryId);
  } catch(e) {
    closeModal('deliveryItemModal'); // immer schliessen damit UI nicht blockiert bleibt
  }
}

async function delDeliveryItem(itemId, deliveryId) {
  await api(`/api/delivery-items/${itemId}`,'DELETE');
  toast(_t('Position entfernt'),'ok');
  await renderDeliveries(); openDeliveryDetail(deliveryId);
}
async function moveDeliveryItem(itemId, deliveryId, direction) {
  await api(`/api/delivery-items/${itemId}/move`,'PUT',{direction});
  const d = await api(`/api/deliveries/${deliveryId}`);
  document.getElementById('dd-pos').innerHTML = renderDeliveryItems(d.items||[], deliveryId, d.status === 'DELIVERED') +
    `<button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openDeliveryItemModal(${deliveryId})">${_t('+ Position')}</button>`;
}

// ── MATERIALVERBRAUCH BEIM ABSCHLIESSEN ───────────────────────
// Rohmaterial wird in Spulen gefuehrt, der Verbrauch faellt in Gramm an.
// Der Dialog zeigt beides und laesst die Menge korrigieren — abgebucht wird
// nur, was hier bestaetigt wird.
// Woher das Gewicht pro Stück stammt — der Server liefert den deutschen Namen
const WEIGHT_SOURCE_LABEL = {
  Produktionsposition: _t('Produktionsposition'), Druckparameter: _t('Druckparameter'), Teilegewicht: _t('Teilegewicht'),
};
async function offerMaterialConsumption(deliveryId) {
  let data;
  try { data = await api(`/api/deliveries/${deliveryId}/material-usage`); }
  catch { return; }
  if (data.delivery.material_consumed) return;

  const usable = (data.rows || []).filter(r => r.qty_to_deduct != null);
  const unusable = (data.rows || []).filter(r => r.qty_to_deduct == null);
  if (!usable.length && !unusable.length) return;   // keine Position mit Rohmaterial

  window._matRows = usable;

  const row = (r, i) => {
    const lotOpts = (r.lots || []).map(l =>
      `<option value="${esc(l.lot_number || '')}">${l.lot_number ? esc(l.lot_number) : _t('— ohne Lot —')} · ${_t('Rest')} ${fmtN(l.remaining_qty, 2)} ${esc(_unit(r.unit))}</option>`).join('');
    const short = r.qty_to_deduct > (parseFloat(r.stock_qty) || 0);
    return `<div style="display:flex;flex-direction:column;gap:5px;padding:9px 11px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:13px;font-weight:500;color:var(--t1);flex:1;min-width:0">${esc(r.description)}</span>
        <span class="chip">${fmtN(r.quantity, 0)}×</span>
      </div>
      <div style="font-size:12.5px;color:var(--t3)">
        ${esc(r.raw_material_name)} · ${fmtN(r.grams_per_piece, 1)} ${_t('g/Stück')} × ${fmtN(r.quantity, 0)}
        = <strong style="color:var(--t2)">${fmtN(r.total_grams, 1)} g</strong>
        <span style="color:var(--t4)">(${_t('Spule {g} g', { g: fmtN(r.spool_weight_g, 0) })} · ${_t('Quelle:')} ${esc(WEIGHT_SOURCE_LABEL[r.source] || r.source)})</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
        <span style="font-family:var(--mono);font-size:11px;color:var(--t4);text-transform:uppercase;letter-spacing:.6px">${_t('Abbuchen')}</span>
        <input type="number" step="0.0001" min="0" value="${r.qty_to_deduct}" data-idx="${i}"
          class="fi mat-qty" style="width:96px;font-family:var(--mono);font-size:13px;padding:3px 7px">
        <span style="font-size:13px;color:var(--t3)">${esc(_unit(r.unit))}</span>
        ${lotOpts ? `<select class="fs mat-lot" data-idx="${i}" style="max-width:230px;font-size:13px;padding:3px 7px">${lotOpts}</select>` : ''}
        <span style="font-size:12px;color:${short ? 'var(--amber)' : 'var(--t4)'};margin-left:auto">
          ${_t('Bestand')} ${fmtN(r.stock_qty, 2)} ${esc(_unit(r.unit))}${short ? ' ' + _t('⚠ reicht nicht') : ''}</span>
      </div>
    </div>`;
  };

  _showDynModal(`<div class="modal" style="max-width:640px">
    <div class="modal-head"><div class="modal-title">${_t('Material abbuchen')} · ${esc(data.delivery.number)}</div></div>
    <div class="modal-body" style="max-height:60vh;overflow-y:auto">
      ${usable.length ? `<div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        ${_t('Der Produktionsauftrag ist abgeschlossen. Diese Mengen werden vom Rohmaterial abgezogen — Werte lassen sich vorher anpassen.')}
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">${usable.map(row).join('')}</div>` : ''}
      ${unusable.length ? `<div class="sep-label">${_t('Nicht berechenbar')}</div>
        <div style="font-size:12.5px;color:var(--t3)">
          ${unusable.map(r => `${esc(r.description)} — ${esc(r.raw_material_name)}:
            ${r.grams_per_piece == null ? _t('kein Gewicht hinterlegt') : _t('kein Spulengewicht am Rohmaterial')}`).join('<br>')}
          <div style="margin-top:5px;color:var(--t4)">${_t('Diese Positionen bleiben unberührt und können im Lager von Hand gebucht werden.')}</div>
        </div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_skipMaterialConsumption(${deliveryId})">${_t('Nicht abbuchen')}</button>
      ${usable.length ? `<button class="btn btn-primary" onclick="_doConsumeMaterial(${deliveryId})">${_t('Abbuchen')}</button>` : ''}
    </div>
  </div>`);
}

function _skipMaterialConsumption() { _hideDynModal(); }

async function _doConsumeMaterial(deliveryId) {
  const rows = window._matRows || [];
  const qtyEls = [...document.querySelectorAll('.mat-qty')];
  const lotEls = [...document.querySelectorAll('.mat-lot')];
  const consumptions = qtyEls.map(el => {
    const i = parseInt(el.dataset.idx);
    const lot = lotEls.find(l => parseInt(l.dataset.idx) === i);
    return { raw_material_id: rows[i].raw_material_id, delivery_item_id: rows[i].delivery_item_id,
      qty: parseFloat(el.value) || 0, lot_number: lot ? lot.value : '' };
  }).filter(c => c.qty > 0);

  _hideDynModal();
  try {
    const r = await api(`/api/deliveries/${deliveryId}/consume-material`, 'POST', { consumptions });
    toast(r.booked.length ? _t('{n} Position(en) abgebucht', { n: r.booked.length }) : _t('Nichts abgebucht'), 'ok');
    if (typeof renderRawMaterials === 'function' && state.view === 'rawmaterials') renderRawMaterials();
  } catch (e) {
    toast(e.message || _t('Abbuchen fehlgeschlagen'), 'err');
  }
}
