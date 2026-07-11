// 12-lager.js — Lager/Bestand, Rohmaterial, Artikelnummern-Vergabe
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
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
  const banner = (critical || warn) ? `<div style="background:rgba(241,120,120,.10);border:1px solid rgba(241,120,120,.30);border-radius:var(--r);padding:8px 12px;margin-bottom:12px;font-size:13px;display:flex;gap:12px">
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
          ? `<td style="font-weight:500;vertical-align:top;padding-top:8px" rowspan="${group.items.length}">${esc(i.name)}${isMulti?` <span style="font-size:11px;color:var(--t3);font-weight:400">${group.items.length}×</span>`:''}</td>`
          : '';
        const variantLabel = [i.color, i.material].filter(Boolean);
        const colorTd = isMulti
          ? `<td style="color:var(--t2);font-size:13px;${borderBottom}">${esc(i.color||'—')}</td>
             <td style="color:var(--t2);font-size:13px;${borderBottom}">${esc(i.material||'—')}</td>`
          : `<td style="color:var(--t2);font-size:13px">${esc(i.color||'—')}</td>
             <td style="color:var(--t2);font-size:13px">${esc(i.material||'—')}</td>`;
        const planned = i.planned_qty || 0;
        const avail = (i.stock_qty || 0) - planned;
        const plannedTd = planned > 0
          ? `<td style="font-family:var(--mono);font-size:13px;color:var(--amber);${isMulti&&!isLast?borderBottom:''}">${fmtN(planned,0)} ${i.unit}</td>`
          : `<td style="font-family:var(--mono);font-size:13px;color:var(--t4);${isMulti&&!isLast?borderBottom:''}">—</td>`;
        return `<tr onclick="openInventoryDetail(${i.id})" style="cursor:pointer">
          ${nameTd}
          ${colorTd}
          <td style="font-family:var(--mono);font-size:13px;color:${stockColor};font-weight:${state!=='ok'?600:400};${isMulti&&!isLast?borderBottom:''}">${fmtN(i.stock_qty,2)} ${i.unit}${stockIcon}</td>
          ${plannedTd}
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3);${isMulti&&!isLast?borderBottom:''}">${i.min_qty>0?fmtN(i.min_qty,2)+' '+i.unit:'—'}</td>
          <td style="display:flex;gap:4px;${isMulti&&!isLast?borderBottom:''}">
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openMovementModal(${i.id},'in')">＋</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openMovementModal(${i.id},'out')">－</button>
            <button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delInventoryItem(${i.id})">✕</button>
          </td>
        </tr>`;
      }).join('');
    }).join('');

    return `<tr style="background:var(--bg0)"><td colspan="6" style="font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:var(--t3);padding:6px 10px">${cat}</td></tr>
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Kategorie</div>${item.category}</div>
        ${item.color?`<div><div class="ps-label">Farbe</div>${esc(item.color)}</div>`:''}
        ${item.material?`<div><div class="ps-label">Material</div>${esc(item.material)}</div>`:''}
        <div><div class="ps-label">Bestand</div><span style="font-family:var(--mono);font-weight:600;color:${stockColor}">${fmtN(item.stock_qty,2)} ${item.unit}${stockIcon}</span></div>
        <div><div class="ps-label">Mindestbestand</div>${item.min_qty>0?fmtN(item.min_qty,2)+' '+item.unit:'—'}</div>
        ${item.price_per_unit!=null?`<div><div class="ps-label">Preis / Einheit</div><span style="font-family:var(--mono)">${fmtCHF(item.price_per_unit)}</span></div>`:''}
        ${item.linked_item_number?`<div style="grid-column:span 2"><div class="ps-label">PLM-Teil</div>
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue);cursor:pointer" onclick="gotoPlmItem(${item.item_id})">${esc(item.linked_item_number)} – ${esc(item.linked_item_name||'')}</span>
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
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${(m.created_at||'').slice(0,16).replace('T',' ')}</td>
          <td><span style="font-size:13px;padding:1px 6px;border-radius:10px;background:${m.qty>0?'rgba(91,211,138,.15)':'rgba(241,120,120,.15)'};color:${m.qty>0?'var(--green)':'var(--red)'}">${m.qty>0?'Zugang':'Abgang'}</span></td>
          <td style="font-family:var(--mono);font-size:13px;font-weight:600;color:${m.qty>0?'var(--green)':'var(--red)'}">${m.qty>0?'+':''}${fmtN(m.qty,2)} ${item.unit}</td>
          <td style="color:var(--t3);font-size:13px">${esc(m.reference||'—')}</td>
          <td style="color:var(--t3);font-size:13px">${esc(m.notes||'')}</td>
        </tr>`).join('')}</tbody>
      </table></div>` : '<div style="color:var(--t3);font-size:13px">Noch keine Bewegungen</div>'}
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
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const icon = _itemChip(i.item_type, 18);
      const mc = i.manufacturing_cost;
      const price = i.default_price ?? mc?.total ?? null;
      return `<div onclick="selectInvPlmItem(${i.id})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        ${price!=null?`<span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtCHF(price)}</span>`:''}
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name)}</span>
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

async function selectInvPlmItem(itemId) {
  document.getElementById('inv-plm-results').style.display = 'none';
  const item = await api('/api/items/' + itemId).catch(() => null);
  if (!item) return;
  document.getElementById('inv-item-id').value = item.id;
  document.getElementById('inv-plm-search').value = item.item_number + ' – ' + item.name;
  const nameEl = document.getElementById('inv-name');
  if (nameEl && !nameEl.value.trim()) nameEl.value = item.item_number + ' – ' + item.name;
  const priceEl = document.getElementById('inv-price');
  if (priceEl && !priceEl.value) {
    const price = item.default_price ?? null;
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

async function _orderRefDatalist(listId) {
  const orders = await api('/api/orders').catch(() => []);
  return `<datalist id="${listId}">${orders.map(o =>
    `<option value="${esc(o.number)}">${esc(o.title)}${o.customer_name ? ' · ' + esc(o.customer_name) : ''}</option>`).join('')}</datalist>`;
}

async function openMovementModal(itemId, defaultType) {
  const refList = await _orderRefDatalist('mov-ref-orders');
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
      <div class="fg"><label class="fl">Referenz</label>
        <input id="mov-ref" class="fi" list="mov-ref-orders" placeholder="Freitext oder Auftrag wählen">${refList}</div>
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
  const order = await api('/api/orders/' + orderId).catch(() => null);
  const refDefault = order?.number || ('AUF-' + orderId);
  const refList = await _orderRefDatalist('ded-ref-orders');

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
        <input id="ded-ref" class="fi" list="ded-ref-orders" value="${esc(refDefault)}" placeholder="Freitext oder Auftrag wählen">${refList}</div>
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
  return `<div style="font-size:13px;padding:7px 10px;border-radius:var(--r-sm);background:${bg};border:1px solid ${border};color:${color}">
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

// ── RAW MATERIALS ─────────────────────────────────────────────
let _rmSort = 'material';
function _rmSetSort(s) {
  _rmSort = s;
  if (window._rmAllItems) {
    const getPrice = i => (i.lots||[]).filter(l=>l.lot_number).map(l=>l.unit_price??Infinity).sort((a,b)=>a-b)[0] ?? Infinity;
    if (s === 'color') window._rmAllItems.sort((a,b) => (a.color||'').localeCompare(b.color||'') || (a.material_type||'').localeCompare(b.material_type||''));
    else if (s === 'price') window._rmAllItems.sort((a,b) => getPrice(a) - getPrice(b));
    else window._rmAllItems.sort((a,b) => (a.material_type||'').localeCompare(b.material_type||'') || (a.color||'').localeCompare(b.color||''));
    _renderRawMaterialsTable();
  } else {
    renderRawMaterials();
  }
}

let _rmShowAll = false;
let _rmQ = '';
function _rmSetSearch(v) { _rmQ = v; _renderRawMaterialsTable(); }
async function renderRawMaterials() {
  setLeftHeader('Rohmaterial', `
    <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
      <input class="fi" id="rm-search-input" placeholder="Suchen…" value="${esc(_rmQ)}"
        oninput="_rmSetSearch(this.value)" autocomplete="off"
        style="width:140px;height:28px;padding:2px 8px;font-size:13px">
      <span style="font-size:11px;color:var(--t4)">Sortierung:</span>
      ${['material','color','price'].map(s => `<button class="btn btn-sm ${_rmSort===s?'btn-primary':'btn-ghost'}" onclick="_rmSetSort('${s}')">${s==='material'?'Material':s==='color'?'Farbe':'Preis'}</button>`).join('')}
      <button class="btn btn-sm ${_rmShowAll?'btn-primary':'btn-ghost'}" onclick="_rmShowAll=!_rmShowAll;renderRawMaterials()" title="Leere anzeigen/ausblenden" style="margin-left:4px">${_rmShowAll?'Alle':'Aktive'}</button>
      <button class="btn btn-primary btn-sm" onclick="openRawMatModal()">+ Material</button>
    </div>`);
  closeDetail();
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px;opacity:.4">⏳</div><div class="empty-text" style="font-size:13px">Lade…</div></div>`);
  const items = await api('/api/raw-materials');
  state.rawMaterials = items;

  // Update badge
  const low = items.filter(i => i.min_qty > 0 && i.stock_qty <= i.min_qty);
  const badge = document.getElementById('badge-rawmat');
  if (badge) badge.textContent = low.length || items.length || '—';

  // Sort
  const getPrice = i => (i.lots||[]).filter(l=>l.lot_number).map(l=>l.unit_price??Infinity).sort((a,b)=>a-b)[0] ?? Infinity;
  if (_rmSort === 'color')    items.sort((a,b) => (a.color||'').localeCompare(b.color||'') || (a.material_type||'').localeCompare(b.material_type||''));
  else if (_rmSort === 'price') items.sort((a,b) => getPrice(a) - getPrice(b));
  else items.sort((a,b) => (a.material_type||'').localeCompare(b.material_type||'') || (a.color||'').localeCompare(b.color||''));

  if (!items.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">🧵</div><div class="empty-text">Noch kein Rohmaterial erfasst</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="openRawMatModal()">Erstes Material anlegen</button></div></div>`);
    return;
  }

  window._rmAllItems = items;
  _renderRawMaterialsTable();
}

function _renderRawMaterialsTable() {
  const items = window._rmAllItems || [];
  if (!items.length) return;

  const q = _rmQ.toLowerCase();
  const filtered = q
    ? items.filter(i => {
        const basic = [i.material_type, i.color, i.brand, i.name, i.dimensions].some(f => (f||'').toLowerCase().includes(q));
        if (basic) return true;
        return (i.lots||[]).some(l => (l.article_number||'').toLowerCase().includes(q) || (l.lot_number||'').toLowerCase().includes(q));
      })
    : items;

  const displayed = _rmShowAll ? filtered : filtered.filter(i => i.stock_qty > 0);
  const hiddenCount = filtered.length - displayed.length;

  const rows = displayed.map(i => {
    const empty    = i.stock_qty <= 0;
    const low      = !empty && i.min_qty > 0 && i.stock_qty <= i.min_qty;
    const dotCol   = empty ? 'var(--red)' : low ? 'var(--amber)' : 'var(--green)';
    const stockCol = empty ? 'var(--red)' : low ? 'var(--amber)' : 'var(--green)';
    const opacity  = empty ? 'opacity:.5' : '';
    const activeLots   = (i.lots||[]).filter(l => (l.remaining_qty ?? l.qty ?? 0) > 0);
    const activeLotCount = activeLots.length;
    const artNrs = activeLots.map(l => l.article_number).filter(Boolean);
    const artNrHtml = artNrs.length
      ? artNrs.map(a => `<span style="font-family:var(--mono);font-size:10px;color:var(--blue);background:rgba(79,158,248,.1);border-radius:3px;padding:1px 4px">${esc(a)}</span>`).join(' ')
      : '';
    return `<tr onclick="openRawMatDetail(${i.id})" style="cursor:pointer;${opacity}">
      <td><span style="color:${dotCol};font-size:11px">●</span></td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.material_type||'—')}</td>
      <td style="font-size:13px">${esc(i.color||'—')}</td>
      <td style="font-size:13px;color:var(--t3)">${esc(i.brand||'—')}</td>
      <td style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${esc(i.name)}</td>
      <td style="font-family:var(--mono);font-size:13px;text-align:right;color:${stockCol};font-weight:600">${fmtN(i.stock_qty,0)}</td>
      <td style="font-size:11px;color:var(--t4)">${esc(i.unit)}</td>
      <td style="font-size:11px;color:var(--t4)">${artNrHtml || (activeLotCount > 0 ? activeLotCount+' Lot'+(activeLotCount!==1?'s':'') : '')}</td>
    </tr>`;
  }).join('');

  const noMatch = filtered.length === 0 && q;

  setLeftBody(`<div class="tbl-wrap"><table>
    <thead><tr>
      <th></th>
      <th onclick="_rmSetSort('material')" style="cursor:pointer">Material ${_rmSort==='material'?'↑':''}</th>
      <th onclick="_rmSetSort('color')" style="cursor:pointer">Farbe ${_rmSort==='color'?'↑':''}</th>
      <th>Marke</th>
      <th>Name</th>
      <th onclick="_rmSetSort('price')" style="cursor:pointer;text-align:right">Bestand ${_rmSort==='price'?'↑':''}</th>
      <th></th>
      <th>Lots</th>
    </tr></thead>
    <tbody>${noMatch ? `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--t4)">Keine Treffer für „${esc(q)}"</td></tr>` : rows}</tbody>
  </table></div>
  ${hiddenCount > 0 ? `<div style="padding:8px 4px;font-size:12px;color:var(--t4);text-align:center">${hiddenCount} leere ausgeblendet — <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="_rmShowAll=true;renderRawMaterials()">alle anzeigen</button></div>` : ''}`);
  // restore focus to search input if it was active
  const si = document.getElementById('rm-search-input');
  if (si && document.activeElement === si) { const v = si.value; si.value = ''; si.value = v; }
}

async function openRawMatDetail(id) {
  const [item, movements] = await Promise.all([
    api(`/api/raw-materials`).then(all => all.find(x => x.id === id)),
    api(`/api/raw-materials/${id}/movements`)
  ]);
  if (!item) return;

  const isLow = item.min_qty > 0 && item.stock_qty <= item.min_qty;
  const isEmpty = item.stock_qty <= 0;
  const statusColor = isEmpty ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--green)';
  const statusLabel = isEmpty ? 'Leer' : isLow ? 'Niedrig' : 'OK';

  document.getElementById('dp-title').innerHTML =
    `<span style="font-size:11px;color:var(--t4);font-family:var(--mono);display:block">${esc(item.material_type||'')}</span>${esc(item.name)}`;
  document.getElementById('dp-tabs').innerHTML =
    `<button class="tab active" onclick="switchTab(this,'rm-info')">Details</button>
     <button class="tab" onclick="switchTab(this,'rm-moves')">Buchungen</button>`;
  document.getElementById('dp-body').innerHTML = `
    <div id="rm-info">
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" onclick="openRawMatModal(${id})">✎ Bearbeiten</button>
        <button class="btn btn-red btn-sm" onclick="delRawMat(${id})">🗑</button>
      </div>
      <div style="display:flex;align-items:center;gap:16px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;margin-bottom:14px">
        <div style="text-align:center">
          <div style="font-size:24px;font-weight:700;font-family:var(--mono);color:${statusColor}">${fmtN(item.stock_qty,0)}</div>
          <div style="font-size:13px;color:var(--t3)">${item.unit}</div>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:3px">
          ${item.color      ? `<div style="font-size:13px"><span style="color:var(--t4)">Farbe:</span> ${esc(item.color)}</div>` : ''}
          ${item.dimensions ? `<div style="font-size:13px"><span style="color:var(--t4)">Abmessungen:</span> <span style="font-family:var(--mono)">${esc(item.dimensions)}</span></div>` : ''}
          ${item.weight_g != null ? `<div style="font-size:13px"><span style="color:var(--t4)">Gewicht:</span> <span style="font-family:var(--mono)">${fmtN(item.weight_g,1)} g</span></div>` : ''}
          ${item.print_temp ? `<div style="font-size:13px"><span style="color:var(--t4)">Drucktemp:</span> <span style="font-family:var(--mono)">${item.print_temp}°C</span></div>` : ''}
          ${item.bed_temp   ? `<div style="font-size:13px"><span style="color:var(--t4)">Bett:</span> <span style="font-family:var(--mono)">${item.bed_temp}°C</span></div>` : ''}
          ${item.min_qty > 0 ? `<div style="font-size:13px"><span style="color:var(--t4)">Mindestbestand:</span> ${fmtN(item.min_qty,0)} ${item.unit}</div>` : ''}
          <div style="font-size:13px;color:${statusColor}">● ${statusLabel}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="openRawMatAdjust(${id},'in')">+ Einbuchen</button>
          <button class="btn btn-ghost btn-sm" onclick="openRawMatAdjust(${id},'out')">− Ausbuchen</button>
        </div>
      </div>
      ${item.notes ? `<div style="font-size:13px;color:var(--t3);margin-bottom:10px">${esc(item.notes)}</div>` : ''}
      ${(() => {
        const lots = item.lots || [];
        if (!lots.length) return '';
        // Sort: active lots first, depleted last
        const sorted = [...lots].sort((a, b) => {
          const aEmpty = (a.remaining_qty ?? a.qty ?? 0) <= 0;
          const bEmpty = (b.remaining_qty ?? b.qty ?? 0) <= 0;
          return aEmpty - bEmpty;
        });
        const activeCount   = sorted.filter(l => (l.remaining_qty ?? l.qty ?? 0) > 0).length;
        const depletedCount = sorted.length - activeCount;
        return `<div class="sep-label" style="margin-top:4px">Lots
          <span style="font-size:11px;color:var(--t4);font-weight:400;margin-left:6px">${activeCount} aktiv${depletedCount?' · '+depletedCount+' leer':''} · ${fmtN(item.stock_qty,0)} ${item.unit} gesamt</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${sorted.map((l, lotIdx) => {
            const rem      = l.remaining_qty ?? l.qty ?? 0;
            const depleted = rem <= 0;
            const label    = l.lot_number || (l.last_date ? l.last_date.slice(0,10) : '—');
            const bg = depleted ? 'background:rgba(74,79,91,.18)' : 'background:var(--bg2)';
            const artNr = l.article_number || '';
            // Daten sicher in globalem Objekt speichern — kein Encoding in onclick-Attributen
            const lotKey = `${item.id}_${lotIdx}`;
            window._rmLotMap = window._rmLotMap || {};
            window._rmLotMap[lotKey] = { rmId: item.id, lotNumber: l.lot_number || '', artNr };
            return `<div style="display:grid;grid-template-columns:1fr auto auto auto auto auto;align-items:center;gap:6px;padding:7px 10px;${bg};border:1px solid var(--line);border-radius:var(--r-sm)">
              <span>
                <span style="font-family:var(--mono);font-size:13px;${depleted?'color:var(--t4)':!l.lot_number?'color:var(--t4)':''}">
                  ${depleted?'<span style="color:var(--red);font-size:11px;margin-right:4px">●</span>':'<span style="color:var(--green);font-size:11px;margin-right:4px">●</span>'}${esc(label)}
                </span>
                ${artNr
                  ? `<span id="artnr-${lotKey}" style="font-family:var(--mono);font-size:11px;color:var(--blue);margin-left:8px">${esc(artNr)}</span>`
                  : `<button id="artnr-${lotKey}" class="btn btn-ghost btn-sm" style="font-size:10px;padding:1px 5px;margin-left:6px;color:var(--t4)" onclick="assignRmArticleNr('${lotKey}')">+ Nr.</button>`}
              </span>
              <span style="font-family:var(--mono);font-size:13px;${depleted?'color:var(--t4)':'color:var(--t3)'};text-align:right">${fmtN(rem,0)} ${item.unit}</span>
              <span style="font-family:var(--mono);font-size:13px;${depleted?'color:var(--t4)':'color:var(--teal)'};text-align:right">${l.unit_price!=null?fmtChf(l.unit_price)+'/'+item.unit:'—'}</span>
              <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px" onclick="openRmPrintModal('${lotKey}')" title="Etikett drucken">🖶</button>
              ${l.id ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="editLotRow(${l.id},'${esc(l.lot_number||'')}',${l.qty},${l.unit_price??'null'},'${esc(item.unit)}',${item.id})" title="Bearbeiten">✎</button>` : '<span></span>'}
            </div>`;
          }).join('')}
        </div>`;
      })()}
    </div>
    <div id="rm-moves" style="display:none">
      ${movements.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Datum</th><th>Typ</th><th style="text-align:right">Menge</th><th style="text-align:right">Saldo</th><th style="text-align:right">Preis/Stk</th><th>Lot</th><th>Notiz</th></tr></thead>
        <tbody>${movements.map(m => `<tr>
          <td style="font-family:var(--mono);font-size:11px;color:var(--t4);white-space:nowrap">${m.created_at?.slice(0,16)||'—'}</td>
          <td><span style="color:${m.type==='in'?'var(--green)':'var(--amber)'};font-size:13px;white-space:nowrap">${m.type==='in'?'↑ Eingang':'↓ Ausgang'}</span></td>
          <td style="font-family:var(--mono);font-size:13px;text-align:right;color:${m.type==='in'?'var(--green)':'var(--amber)'};white-space:nowrap">${m.type==='in'?'+':'−'}${fmtN(m.qty,0)} ${item.unit}</td>
          <td style="font-family:var(--mono);font-size:13px;text-align:right;color:var(--t3);white-space:nowrap">${fmtN(m.balance??0,0)} ${item.unit}</td>
          <td style="font-family:var(--mono);font-size:13px;text-align:right;color:var(--t3)">${m.unit_price!=null?fmtChf(m.unit_price):'—'}</td>
          <td style="font-family:var(--mono);font-size:11px;color:var(--t4)">${esc(m.lot_number||'—')}</td>
          <td style="font-size:13px;color:var(--t3)">${esc(m.notes||'')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="font-size:11px;color:var(--t4);margin-top:6px">${movements.length} Buchung${movements.length!==1?'en':''} total</div>`
      : `<div style="color:var(--t3);font-size:13px">Noch keine Buchungen</div>`}
    </div>`;
  showDetail();
}

function openRawMatModal(id) {
  _showDynModal(`<div class="modal" style="max-width:560px">
    <div class="modal-head"><div class="modal-title">${id ? 'Material bearbeiten' : 'Neues Material'}</div><button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" id="rawmat-modal-body"><div style="color:var(--t3);font-size:13px">Lädt…</div></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveRawMat(${id||''})">Speichern</button>
    </div>
  </div>`);
  _loadRawMatForm(id);
}

async function _loadRawMatForm(id) {
  const all = await api('/api/raw-materials').catch(() => state.rawMaterials || []);
  state.rawMaterials = all;
  const item = id ? (all.find(x => x.id === id) || {}) : {};
  document.getElementById('rawmat-modal-body').innerHTML = `
    <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
      Felder ausfüllen → Name wird automatisch vorgeschlagen (oder manuell überschreiben).
    </div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Materialtyp *</label>
        <input class="fi" id="rm-type" list="rm-type-list" value="${esc(item.material_type||'')}" placeholder="PLA, PETG, ABS, TPU …" oninput="_rmAutoName();_rmAutoFillTemps()">
        <datalist id="rm-type-list">
          <option>PLA</option><option>PETG</option><option>ABS</option><option>ASA</option>
          <option>TPU</option><option>Nylon</option><option>HIPS</option><option>PC</option>
          <option>Aluminium</option><option>Stahl</option><option>Holz</option><option>Sonstiges</option>
        </datalist>
      </div>
      <div class="fg"><label class="fl">Farbe</label><input class="fi" id="rm-col" value="${esc(item.color||'')}" placeholder="z.B. Schwarz, Galaxy Black" oninput="_rmAutoName()"></div>
    </div>
    <div class="form-row cols3">
      <div class="fg"><label class="fl">Marke / Hersteller</label>
        <input class="fi" id="rm-brand" value="${esc(item.brand||'')}" placeholder="z.B. Prusament" oninput="_rmAutoName()" list="rm-brand-list">
        <datalist id="rm-brand-list">
          ${[...new Set((state.rawMaterials||[]).map(m=>m.brand).filter(Boolean))].map(b=>`<option value="${esc(b)}">`).join('')}
        </datalist>
      </div>
      <div class="fg"><label class="fl">Lotnummer</label><input class="fi" id="rm-lot" value="${esc(item.lot_number||'')}" placeholder="z.B. LOT-2024-001"></div>
      <div class="fg"><label class="fl">Einheit</label>
        <select class="fs" id="rm-unit">
          ${['Stk','g','kg','m','cm','mm','ml','l'].map(u=>`<option ${(item.unit||'Stk')===u?'selected':''}>${u}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Abmessungen / Grösse</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="fi" id="rm-dim" value="${esc(item.dimensions||'')}" placeholder="z.B. 2x20x200mm, 1000g, Ø12mm, 1m" style="flex:1" oninput="_rmAutoName()">
          <button type="button" class="btn btn-ghost btn-sm" style="flex-shrink:0;font-size:15px" title="Durchmesserzeichen einfügen" onclick="const el=document.getElementById('rm-dim');const s=el.selectionStart,e=el.selectionEnd;el.value=el.value.slice(0,s)+'Ø'+el.value.slice(e);el.selectionStart=el.selectionEnd=s+1;el.focus()">Ø</button>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Name (auto-generiert, editierbar) *</label><input class="fi" id="rm-name" value="${esc(item.name||'')}" placeholder="z.B. PETG Schwarz 1000g Prusament"></div>
    </div>
    <div class="form-row cols3">
      <div class="fg"><label class="fl">Mindestbestand (Warnung)</label>
        <input class="fi" type="number" id="rm-min" value="${item.min_qty||''}" placeholder="0" min="0" step="any">
      </div>
      <div class="fg"><label class="fl">Gewicht / Stück (g)</label>
        <input class="fi" type="number" id="rm-weight" value="${item.weight_g!=null?item.weight_g:''}" placeholder="z.B. 250" min="0" step="0.1">
      </div>
    </div>
    ${!id ? `<div class="sep-label" style="margin-top:4px">Anfangsbestand einbuchen</div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Menge</label>
        <input class="fi" type="number" id="rm-stock" value="" placeholder="0" min="0" step="any">
      </div>
      <div class="fg"><label class="fl">Einkaufspreis / Einheit (optional)</label>
        <input class="fi" type="number" id="rm-init-price" placeholder="z.B. 24.90" min="0" step="0.01">
      </div>
    </div>` : ''}
    <div class="sep-label" style="margin-top:4px">Druckparameter (optional)</div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Drucktemp (°C)</label>
        <input class="fi" type="number" id="rm-print-temp" value="${item.print_temp||''}" placeholder="z.B. 215" min="0" step="1"></div>
      <div class="fg"><label class="fl">Bett (°C)</label>
        <input class="fi" type="number" id="rm-bed-temp" value="${item.bed_temp||''}" placeholder="z.B. 60" min="0" step="1"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Notizen</label><textarea class="ft" id="rm-notes" rows="2">${esc(item.notes||'')}</textarea></div>
    </div>`;
}

async function saveRawMat(id) {
  const name = document.getElementById('rm-name')?.value.trim();
  if (!name) { toast('Name erforderlich', 'err'); return; }
  const body = {
    name,
    material_type: document.getElementById('rm-type')?.value.trim(),
    color: document.getElementById('rm-col')?.value.trim(),
    brand: document.getElementById('rm-brand')?.value.trim(),
    lot_number: document.getElementById('rm-lot')?.value.trim(),
    dimensions: document.getElementById('rm-dim')?.value.trim(),
    weight_g:    document.getElementById('rm-weight')?.value ? parseFloat(document.getElementById('rm-weight').value) : null,
    print_temp:  document.getElementById('rm-print-temp')?.value ? parseFloat(document.getElementById('rm-print-temp').value) : null,
    bed_temp:    document.getElementById('rm-bed-temp')?.value  ? parseFloat(document.getElementById('rm-bed-temp').value)  : null,
    min_qty: parseFloat(document.getElementById('rm-min')?.value)||0,
    unit: document.getElementById('rm-unit')?.value,
    notes: document.getElementById('rm-notes')?.value.trim(),
  };
  if (!body.name) { toast('Name erforderlich', 'err'); return; }
  if (id) {
    await api(`/api/raw-materials/${id}`, 'PUT', body);
  } else {
    const initQty   = parseFloat(document.getElementById('rm-stock')?.value) || 0;
    const initPriceRaw = document.getElementById('rm-init-price')?.value.trim();
    const initPrice = initPriceRaw !== '' ? parseFloat(initPriceRaw) : null;
    const initLot   = body.lot_number || null;
    body.stock_qty = 0; // start at 0, then book via movement so price is tracked
    const created = await api('/api/raw-materials', 'POST', body);
    if (initQty > 0) {
      await api(`/api/raw-materials/${created.id}/adjust`, 'POST',
        { qty: initQty, type: 'in', notes: 'Anfangsbestand', unit_price: initPrice, lot_number: initLot });
    }
  }
  _hideDynModal();
  // Refresh state and all open raw material dropdowns
  state.rawMaterials = await api('/api/raw-materials').catch(() => state.rawMaterials);
  state._psConfigLoaded = false;
  const newOpts = _buildRmOptions(state.rawMaterials);
  // Refresh select-based dropdowns (dim-rawmat, bqm-rawmat)
  ['dim-rawmat','bqm-rawmat'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = newOpts;
  });
  // li-rawmat is search-based — no innerHTML needed
  toast('Gespeichert', 'ok');
  await renderRawMaterials();
}

function _rmAutoName() {
  const type  = document.getElementById('rm-type')?.value.trim()  || '';
  const col   = document.getElementById('rm-col')?.value.trim()   || '';
  const dim   = document.getElementById('rm-dim')?.value.trim()   || '';
  const brand = document.getElementById('rm-brand')?.value.trim() || '';
  const parts = [type, col, dim, brand].filter(Boolean);
  const el = document.getElementById('rm-name');
  if (el) el.value = parts.join(' ');
}

function _rmAutoFillTemps() {
  const type = document.getElementById('rm-type')?.value.trim();
  if (!type) return;
  const tempEl = document.getElementById('rm-print-temp');
  const bedEl  = document.getElementById('rm-bed-temp');
  // Only fill if fields are still empty
  if ((tempEl?.value || bedEl?.value)) return;
  const match = (state.rawMaterials||[]).find(
    m => m.material_type?.toLowerCase() === type.toLowerCase() && (m.print_temp || m.bed_temp)
  );
  if (!match) return;
  if (match.print_temp && tempEl) tempEl.value = match.print_temp;
  if (match.bed_temp   && bedEl)  bedEl.value  = match.bed_temp;
}

// ── Artikel-Nr. vergeben (inline, kein Modal) ──────────────────
async function assignRmArticleNr(lotKey) {
  const entry = (window._rmLotMap || {})[lotKey];
  if (!entry) { toast('Lot-Daten nicht gefunden', 'err'); return; }
  const { rmId, lotNumber } = entry;
  const btn = document.getElementById('artnr-' + lotKey);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const r = await api(`/api/raw-materials/${rmId}/lots/assign-number`, 'POST', { lot_number: lotNumber });
    if (r.article_number) {
      entry.artNr = r.article_number;
      const el = document.getElementById('artnr-' + lotKey);
      if (el) {
        const span = document.createElement('span');
        span.id = 'artnr-' + lotKey;
        span.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--blue);margin-left:8px';
        span.textContent = r.article_number;
        el.replaceWith(span);
      }
      if (window._rmAllItems) {
        const updated = await api('/api/raw-materials');
        window._rmAllItems = updated;
        _renderRawMaterialsTable();
      }
    }
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = '+ Nr.'; }
    toast('Fehler: ' + (e.message||'?'), 'err');
  }
}

async function openRmPrintModal(lotKey) {
  const entry = (window._rmLotMap || {})[lotKey];
  if (!entry) { toast('Lot-Daten nicht gefunden', 'err'); return; }
  const { rmId, lotNumber, artNr } = entry;

  // Direkt drucken — kein Modal, genau wie Produktion
  const btnEl = document.querySelector(`[onclick="openRmPrintModal('${lotKey}')"]`);
  const orig = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.textContent = '⏳'; btnEl.disabled = true; }

  try {
    const rm = await api(`/api/raw-materials/${rmId}/label?lot_number=${encodeURIComponent(lotNumber)}`);
    await api('/api/print-label', 'POST', {
      article_number: artNr || rm.article_number || '',
      name:           rm.name,
      lot_number:     lotNumber,
      brand:          rm.brand,
      color:          rm.color,
      material_type:  rm.material_type,
      print_temp:     rm.print_temp,
      bed_temp:       rm.bed_temp,
      unit:           rm.unit,
      line_width:     32,
    });
    toast('Etikett gedruckt ✓', 'ok');
  } catch(e) {
    showPrinterError(e);
  } finally {
    if (btnEl) { btnEl.textContent = orig; btnEl.disabled = false; }
  }
}

async function openRmLabelModal(rmId, lotNumber, _unused) {
  const PIPSTA = 'http://localhost:8765';

  // Artikel-Nummer zuweisen falls noch nicht vorhanden
  let artNr = '';
  let isNewNumber = false;
  try {
    const r = await api(`/api/raw-materials/${rmId}/lots/assign-number`, 'POST', { lot_number: lotNumber });
    artNr = r.article_number || '';
    isNewNumber = r.is_new || false;
  } catch (e) { toast('Artikel-Nummer konnte nicht vergeben werden: ' + (e.message||'?'), 'warn'); }

  // Label-Daten laden (enthält jetzt auch article_number nach Zuweisung)
  const label = await api(`/api/raw-materials/${rmId}/label?lot_number=${encodeURIComponent(lotNumber)}`);
  if (!artNr && label.article_number) artNr = label.article_number;

  // Linke Liste aktualisieren wenn neue Nummer vergeben wurde
  if (window._rmAllItems) {
    const updated = await api('/api/raw-materials');
    window._rmAllItems = updated;
    _renderRawMaterialsTable();
  }

  const qrContent = artNr || lotNumber || label.name;
  const specLine = [label.material_type, label.color, label.brand].filter(Boolean).join(' · ');
  const previewLines = [
    // Kompaktes Produktetikett-Layout: QR links, Text rechts
    `<div style="display:flex;gap:10px;align-items:center">
      <div style="background:#fff;border:1px solid var(--line);border-radius:4px;padding:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;width:72px;height:72px">
        <div id="rm-label-qr-preview" style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--t4);text-align:center">
          <svg viewBox="0 0 40 40" width="60" height="60" fill="currentColor" opacity=".3">
            <rect x="1" y="1" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="5" y="5" width="8" height="8"/>
            <rect x="23" y="1" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="27" y="5" width="8" height="8"/>
            <rect x="1" y="23" width="16" height="16" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>
            <rect x="5" y="27" width="8" height="8"/>
            <rect x="23" y="23" width="4" height="4"/><rect x="29" y="23" width="4" height="4"/>
            <rect x="23" y="29" width="4" height="4"/><rect x="33" y="29" width="4" height="4"/>
            <rect x="29" y="33" width="4" height="4"/>
          </svg>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;min-width:0">
        ${artNr ? `<span style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--t1)">${esc(artNr)}</span>` : '<span style="color:var(--t4);font-size:12px">Artikel-Nr. wird vergeben…</span>'}
        <span style="font-size:13px;color:var(--t2)">${esc(label.name)}</span>
        ${lotNumber ? `<span style="font-size:12px;color:var(--t3);font-family:var(--mono)">LOT: ${esc(lotNumber)}</span>` : ''}
        ${specLine ? `<span style="font-size:11px;color:var(--t4)">${esc(specLine)}</span>` : ''}
        ${label.print_temp ? `<span style="font-size:11px;color:var(--t4)">${label.print_temp}°C / ${label.bed_temp||'—'}°C</span>` : ''}
      </div>
    </div>`,
    `<div style="font-size:11px;color:var(--t4);margin-top:4px">QR: <span style="font-family:var(--mono);color:var(--blue)">${esc(qrContent)}</span></div>`,
  ].filter(Boolean).join('');

  const statusHtml = '';

  const modalHtml = `
    <div class="overlay" id="rmLabelModal" onclick="if(event.target===this)closeModal('rmLabelModal')">
      <div class="modal" style="max-width:380px">
        <div class="modal-head"><span>Etikett drucken</span><button class="btn-close" onclick="closeModal('rmLabelModal')">✕</button></div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
          <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px;line-height:1.8;font-size:13px">
            ${previewLines}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <label style="font-size:12px;color:var(--t3)">QR-Grösse:</label>
            <select id="rm-label-qr-size" class="fi" style="width:80px;padding:3px 6px">
              <option value="3">Klein</option>
              <option value="4" selected>Mittel</option>
              <option value="6">Gross</option>
            </select>
            <label style="font-size:12px;color:var(--t3);margin-left:8px">Breite:</label>
            <select id="rm-label-width" class="fi" style="width:100px;padding:3px 6px">
              <option value="32" selected>32 Zeichen</option>
              <option value="42">42 Zeichen</option>
              <option value="48">48 Zeichen</option>
            </select>
          </div>
          ${statusHtml}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal('rmLabelModal')">Abbrechen</button>
          <button class="btn btn-primary" id="rm-label-print-btn" onclick="printRmLabel()">🖶 Drucken</button>
        </div>
      </div>
    </div>`;

  // Label-Daten sicher in globaler Variable speichern (kein JSON in onclick)
  window._rmLabelData = label;

  document.getElementById('rmLabelModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function printRmLabel() {
  const label = window._rmLabelData;
  if (!label) { toast('Keine Label-Daten', 'err'); return; }
  const btn = document.getElementById('rm-label-print-btn');
  if (btn) btn.disabled = true;
  try {
    const payload = {
      article_number: label.article_number || '',
      name:           label.name,
      lot_number:     label.lot_number,
      brand:          label.brand,
      color:          label.color,
      material_type:  label.material_type,
      print_temp:     label.print_temp,
      bed_temp:       label.bed_temp,
      qr_content:     label.article_number || label.lot_number || label.name,
      line_width:     parseInt(document.getElementById('rm-label-width')?.value || '32'),
      qr_size:        parseInt(document.getElementById('rm-label-qr-size')?.value || '4'),
    };
    console.log('[Label] Sende an /api/print-label:', payload);
    const d = await api('/api/print-label', 'POST', payload);
    if (d.ok) {
      toast('Etikett gedruckt', 'ok');
      closeModal('rmLabelModal');
    } else {
      const firstLine = (d.error || '?').split('\n').filter(l => l.startsWith('FEHLER:') || !l.startsWith('INFO:'))[0] || d.error || '?';
      toast('Druckfehler: ' + firstLine, 'err');
    }
  } catch (e) {
    toast('Druckfehler: ' + (e.message || '?'), 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function editLotRow(movId, lotNr, qty, price, unit, matId) {
  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title">Lot bearbeiten</div><button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-row cols2">
        <div class="fg"><label class="fl">Lotnummer</label>
          <input class="fi" id="el-lot" value="${esc(lotNr)}" placeholder="—"></div>
        <div class="fg"><label class="fl">Menge (${unit})</label>
          <input class="fi" type="number" id="el-qty" value="${qty!=null?qty:''}" min="0" step="any"></div>
      </div>
      <div class="form-row">
        <div class="fg"><label class="fl">Einkaufspreis / ${unit}</label>
          <input class="fi" type="number" id="el-price" value="${price!=null?price:''}" min="0" step="0.01" placeholder="—"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveLotRow(${movId},${matId})">Speichern</button>
    </div>
  </div>`);
}

async function saveLotRow(movId, matId) {
  const lot_number  = document.getElementById('el-lot')?.value.trim();
  const qty         = parseFloat(document.getElementById('el-qty')?.value);
  const priceRaw    = document.getElementById('el-price')?.value.trim();
  const unit_price  = priceRaw !== '' ? parseFloat(priceRaw) : null;
  if (!qty || qty <= 0) { toast('Menge erforderlich', 'err'); return; }
  await api(`/api/raw-material-movements/${movId}`, 'PUT', { lot_number, qty, unit_price });
  _hideDynModal();
  toast('Lot gespeichert', 'ok');
  _refreshRawMaterials();
  await renderRawMaterials();
  openRawMatDetail(matId);
}

async function openRawMatAdjust(id, type) {
  // Load lots for 'out' mode
  let lotsHtml = '';
  if (type === 'out') {
    const mats = await api('/api/raw-materials').catch(() => []);
    const mat  = mats.find(m => m.id === id);
    const lots = (mat?.lots || []).filter(l => l.lot_number);
    if (lots.length) {
      lotsHtml = `<div class="form-row">
        <div class="fg"><label class="fl">Von Lot abbuchen (optional)</label>
          <select class="fs" id="adj-lot-sel">
            <option value="">— ohne Lot-Zuordnung —</option>
            ${lots.map(l => {
              const rem = l.remaining_qty ?? l.qty ?? 0;
              const depleted = rem <= 0;
              return `<option value="${esc(l.lot_number)}" ${depleted?'disabled':''} style="${depleted?'text-decoration:line-through;color:var(--t4)':''}">
                ${esc(l.lot_number)} — ${fmtN(rem,0)} verfügbar${l.unit_price!=null?' · '+fmtChf(l.unit_price):''}
              </option>`;
            }).join('')}
          </select>
        </div>
      </div>`;
    }
  }
  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head"><div class="modal-title">${type==='in'?'+ Einbuchen':'− Ausbuchen'}</div><button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body">
      ${lotsHtml}
      <div class="form-row cols2">
        <div class="fg"><label class="fl">Menge *</label><input class="fi" type="number" id="adj-qty" min="0.001" step="any" placeholder="0"></div>
        <div class="fg"><label class="fl">Notiz</label><input class="fi" id="adj-notes" placeholder="z.B. neue Spule, Produktion XY"></div>
      </div>
      ${type==='in' ? `<div class="form-row cols2">
        <div class="fg"><label class="fl">Lotnummer (optional)</label>
          <input class="fi" id="adj-lot" placeholder="z.B. LOT-2025-042"></div>
        <div class="fg"><label class="fl">Einkaufspreis / Einheit (optional)</label>
          <input class="fi" type="number" id="adj-price" min="0" step="0.01" placeholder="z.B. 24.90"></div>
      </div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveRawMatAdjust(${id},'${type}')">Buchen</button>
    </div>
  </div>`);
}

async function saveRawMatAdjust(id, type) {
  const qty = parseFloat(document.getElementById('adj-qty')?.value);
  if (!qty || qty <= 0) { toast('Menge erforderlich', 'err'); return; }
  const notes = document.getElementById('adj-notes')?.value.trim();
  const unit_price = parseFloat(document.getElementById('adj-price')?.value) || null;
  // 'in': lot from text field; 'out': lot from dropdown selector
  const lot_number = type === 'out'
    ? (document.getElementById('adj-lot-sel')?.value || null)
    : (document.getElementById('adj-lot')?.value.trim() || null);
  const r = await api(`/api/raw-materials/${id}/adjust`, 'POST', { qty, type, notes, unit_price, lot_number });
  _hideDynModal();
  toast(`Gebucht — neuer Bestand: ${fmtN(r.stock_qty,0)}`, 'ok');
  await renderRawMaterials();
  openRawMatDetail(id);
}
