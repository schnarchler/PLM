// 07-erp-crud.js — Kunden/Aufträge CRUD, Angebote, Positionen, Stücklisten-Import
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
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
      res.innerHTML = `<div style="padding:9px 12px;font-size:13px;color:var(--t3)">Keine Treffer</div>`
        + `<div onclick="selectOrderCustomerFree('${esc(q)}')" style="padding:9px 12px;cursor:pointer;font-size:13px;border-top:1px solid var(--line)"
            onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
            ✏ "${esc(q)}" als Freitext verwenden</div>`;
    } else {
      res.innerHTML = matches.map(c =>
        `<div onclick="selectOrderCustomer(${c.id},'${esc(c.number)} ${esc(c.name)}')"
          style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
          onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${c.number}</span>
          <span style="font-size:13px;flex:1">${esc(c.name)}</span>
        </div>`).join('')
        + `<div onclick="selectOrderCustomerFree('${esc(q)}')" style="padding:9px 12px;cursor:pointer;font-size:13px;color:var(--t3);border-top:1px solid var(--line)"
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
    set('om-hours', o.estimated_hours||0);
    document.getElementById('om-include-hours').checked = !!o.include_hours;
    document.getElementById('om-title').textContent='Auftrag bearbeiten';
  } else {
    ['om-title-f','om-date','om-delivery','om-notes','om-terms'].forEach(f=>set(f,''));
    document.getElementById('om-status').value='DRAFT';
    set('om-tax', state.settings.default_tax_rate ?? '');
    set('om-disc',0);
    set('om-terms', state.settings.default_payment_terms || '');
    set('om-hours', 0);
    document.getElementById('om-include-tax').checked = false;
    document.getElementById('om-include-hours').checked = false;
    document.getElementById('om-title').textContent='Neuer Auftrag';
  }
  set('om-id',id||''); openModal('orderModal');
}

async function saveOrder() {
  const title=V('om-title-f'); if(!title) return toast('Bezeichnung fehlt','err');
  const body={title,...getCustBody('om'),status:document.getElementById('om-status').value,
    notes:V('om-notes'),order_date:V('om-date')||null,delivery_date:V('om-delivery')||null,
    tax_rate:parseFloat(V('om-tax'))||0, discount_pct:parseFloat(V('om-disc'))||0,
    payment_terms:V('om-terms'), include_tax:document.getElementById('om-include-tax').checked?1:0,
    estimated_hours:parseFloat(V('om-hours'))||0, include_hours:document.getElementById('om-include-hours').checked?1:0};
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
  el.innerHTML = rows.map(q=>`<tr data-id="${q.id}" onclick="openQuoteDetail(${q.id})">
    <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${q.number}</td>
    <td style="font-weight:500">${esc(q.title)}</td>
    <td style="color:var(--t2)">${q.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${(q.items||[]).length}</td>
    <td>${_stSel('quote',q.id,q.status)}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(q.valid_until)}</td>
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
    return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-bottom:10px;font-size:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:600;color:var(--t2)">Arbeitszeit</span>
        <button class="btn btn-ghost btn-sm" style="font-size:13px" onclick="openQuoteModal(${id})">✏️ Ändern</button>
      </div>
      <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap">
        <span style="color:var(--t3)">${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h</span>
        <span style="font-family:var(--mono);font-weight:600;color:${q.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>
        <span style="font-size:13px;padding:1px 7px;border-radius:10px;background:${q.include_hours?'rgba(91,211,138,.12)':'var(--bg2)'};color:${q.include_hours?'var(--green)':'var(--t3)'}">${q.include_hours?'eingerechnet':'nicht eingerechnet'}</span>
      </div>
      ${q.include_hours && items.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:flex-end">
        <div style="text-align:right;font-size:13px;color:var(--t2)">Gesamttotal inkl. Arbeitszeit:
          <span style="font-family:var(--mono);font-weight:700;font-size:13px;color:var(--green);margin-left:8px">${fmtCHF(grandTotal)}</span>
        </div>
      </div>` : ''}
    </div>`;
  })() : '';
  document.getElementById('dp-body').innerHTML = `
    <div id="qd-pos">
      ${renderLineItems(q.items||[], 'quote', id, q.tax_rate??0, q.discount_pct||0, !!q.include_tax)}
      ${hoursSection}
      <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openLineItemModal('quote',${id})">+ Position</button>
        <button class="btn btn-ghost btn-sm" onclick="openBomQuoteImport(${id})">📦 Aus BOM kalkullieren</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px">
        <button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'quote')">📄 Angebot PDF</button>
        <button class="btn btn-green btn-sm" onclick="convertQuoteToOrder(${id})">➜ In Auftrag umwandeln</button>
        <button class="btn btn-ghost btn-sm" onclick="switchTab(document.querySelector('[onclick*=qd-info]'), 'qd-info')">⚙ Details / Bearbeiten</button>
      </div>
    </div>
    <div id="qd-info" style="display:none">
      <div class="sep-label">Angebotsdaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('quote',id,q.status)}</div>
        <div><div class="ps-label">Kunde</div>${q.customer_name||'—'}</div>
        <div><div class="ps-label">Datum</div>${fmtD(q.quote_date)}</div>
        <div><div class="ps-label">Gültig bis</div>${fmtD(q.valid_until)}</div>
        <div><div class="ps-label">MwSt.</div>${q.tax_rate??0} % ${q.include_tax?'<span style="color:var(--green);font-size:13px">(ausgewiesen)</span>':'<span style="color:var(--t3);font-size:13px">(ohne)</span>'}</div>
        ${estHours>0?`<div><div class="ps-label">Arbeitszeit</div>${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h = <span style="font-family:var(--mono);color:${q.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>${q.include_hours?' <span style="color:var(--green);font-size:13px">(eingerechnet)</span>':' <span style="color:var(--t3);font-size:13px">(nicht eingerechnet)</span>'}</div>`:''}
        ${(q.discount_pct||0)>0?`<div><div class="ps-label">Gesamtrabatt</div>${q.discount_pct} %</div>`:''}
        ${q.payment_terms?`<div style="grid-column:span 2"><div class="ps-label">Zahlungsbedingungen</div>${esc(q.payment_terms)}</div>`:''}
        ${q.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(q.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openQuoteModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'quote')">&#128196; Angebot PDF</button>
        <button class="btn btn-green btn-sm" onclick="convertQuoteToOrder(${id})">➜ In Auftrag umwandeln</button>
        ${q.status==='DRAFT' ? `<button class="btn btn-red btn-sm" onclick="delQuote(${id})">🗑 Löschen</button>` : ''}
      </div>
    </div>`;
  _markActiveRow(id);
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
  await gotoView('orders');
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
  if (!items.length) return `<div style="color:var(--t3);font-size:13px;padding:8px 0">Noch keine Positionen</div>`;
  return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);margin-bottom:10px">
    <table style="width:100%">
      <thead><tr>
        <th style="text-align:left;padding:7px 8px;font-family:var(--mono);font-size:11px;color:var(--t3);border-bottom:1px solid var(--line)">Beschreibung</th>
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:11px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Menge</th>
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:11px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Preis</th>
        ${showDiscount?`<th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:11px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Rab.</th>`:''}
        <th style="text-align:right;padding:7px 8px;font-family:var(--mono);font-size:11px;color:var(--t3);border-bottom:1px solid var(--line);white-space:nowrap">Total</th>
        <th style="border-bottom:1px solid var(--line)"></th>
      </tr></thead>
      <tbody>
        ${items.map((i,idx)=>{
          const lineTotal = i.quantity*i.unit_price*(1-(i.discount_pct||0)/100);
          const isFirst = idx===0, isLast = idx===items.length-1;
          const mc = i.manufacturing_cost;
          const costTotal = mc ? mc.total * i.quantity : null;
          const margin = (costTotal != null) ? lineTotal - costTotal : null;
          const marginPct = (margin != null && costTotal > 0) ? (margin / costTotal * 100) : null;
          const marginColor = margin == null ? '' : margin < 0 ? 'color:var(--red)' : marginPct != null && marginPct < 15 ? 'color:var(--amber)' : 'color:var(--green)';
          const breakdown = mc ? [
            mc.material > 0 ? `Mat. ${fmtChf(mc.material)}` : '',
            mc.machine  > 0 ? `Druck ${fmtChf(mc.machine)}` : '',
            mc.work     > 0 ? `Arbeit ${fmtChf(mc.work)}` : '',
          ].filter(Boolean).join(' + ') : '';
          const costHint = mc ? `<div style="font-size:11px;margin-top:3px;color:var(--t3)">
            Herst./Stk.: <span style="font-family:var(--mono)">${fmtChf(mc.total)}</span>${breakdown ? ` <span style="color:var(--t4)">(${breakdown})</span>` : ''}
            ${i.quantity>1 ? ` · Total: <span style="font-family:var(--mono)">${fmtChf(costTotal)}</span>` : ''}
            · Marge: <span style="font-family:var(--mono);font-weight:600;${marginColor}">${fmtChf(margin)}${marginPct != null ? ` (${marginPct.toFixed(0)}%)` : ''}</span>
          </div>` : '';
          return `<tr style="border-bottom:1px solid var(--line)" onclick="openLineItemModal('${parentType}',${parentId},${i.id})">
            <td style="padding:3px 4px;width:28px" onclick="event.stopPropagation()">
              <div style="display:flex;flex-direction:column;gap:1px">
                <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:14px;font-size:11px;opacity:${isFirst?0.2:1}" ${isFirst?'disabled':''} onclick="moveLineItem('${parentType}',${i.id},${parentId},'up')">▲</button>
                <button class="btn btn-icon btn-ghost btn-sm" style="padding:0;height:14px;font-size:11px;opacity:${isLast?0.2:1}" ${isLast?'disabled':''} onclick="moveLineItem('${parentType}',${i.id},${parentId},'down')">▼</button>
              </div>
            </td>
            <td style="padding:7px 8px;font-size:13px;cursor:pointer">
              ${esc(i.description)}
              ${i.notes?`<div style="font-size:13px;color:var(--t3)">${esc(i.notes)}</div>`:''}
              ${costHint}
            </td>
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:13px;white-space:nowrap">${i.quantity} ${i.unit}</td>
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:13px;white-space:nowrap">${fmtChf(i.unit_price)}</td>
            ${showDiscount?`<td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:13px;color:var(--amber)">${i.discount_pct||0}%</td>`:''}
            <td style="padding:7px 8px;text-align:right;font-family:var(--mono);font-size:13px">${fmtChf(lineTotal)}</td>
            <td style="padding:7px 8px;white-space:nowrap">
              ${parentType==='order'&&i.item_id?`<button class="btn btn-ghost btn-sm" style="font-size:13px;padding:2px 6px;margin-right:2px" onclick="event.stopPropagation();openInventoryDeductModal(${i.id},${i.item_id},${i.quantity},'${parentId}')">📦</button>`:''}
              <button class="btn btn-icon btn-ghost btn-sm" onclick="event.stopPropagation();delLineItem('${parentType}',${i.id},${parentId})">✕</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="padding:10px 12px;border-top:1px solid var(--line);font-size:13px">
      <div style="display:flex;justify-content:flex-end;gap:24px">
        <div style="text-align:right">
          ${discountPct>0?`<div style="color:var(--t3)">Zwischentotal: <span style="font-family:var(--mono)">${fmtChf(subtotal)}</span></div>
          <div style="color:var(--amber)">Rabatt ${discountPct}%: <span style="font-family:var(--mono)">-${fmtChf(discAmt)}</span></div>`:''}
          <div style="color:var(--t2)">Netto: <span style="font-family:var(--mono)">${fmtChf(net)}</span></div>
          ${includeTax?`<div style="color:var(--t3)">MwSt. ${taxRate}%: <span style="font-family:var(--mono)">${fmtChf(tax)}</span></div>`:''}
          <div style="font-size:13px;font-weight:600;margin-top:4px;color:var(--green)">Total: <span style="font-family:var(--mono)">${fmtChf(total)}</span></div>
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
    if (!items.length) { res.innerHTML='<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>'; res.style.display='block'; return; }
    res.innerHTML = items.map(i => {
      const rev = i.latest_revision;
      const icon = _itemChip(i.item_type, 18);
      return `<div onclick="selectLinkedItem(${i.id})"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${icon}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name)}</span>
        ${rev?`<span class="status st-${rev.status}" style="margin-left:4px">rev${rev.rev}</span>`:''}
      </div>`;
    }).join('');
    res.style.display = 'block';
  }, 200);
}

async function selectLinkedItem(itemId) {
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-plm-results').style.display = 'none';
  const item = await api('/api/items/' + itemId).catch(() => null);
  if (!item) return;
  set('li-linked-plm-id', item.id);
  const sel = document.getElementById('li-plm-selected');
  document.getElementById('li-plm-badge').innerHTML = _itemChip(item.item_type, 15) + ' <span style="font-family:var(--mono)">' + esc(item.item_number) + '</span>';
  const dispWeight = item.effective_weight_g ?? item.weight_g;
  const extras = [];
  if (dispWeight != null) extras.push(`⚖ ${fmtN(dispWeight, 1)} g${item.effective_weight_g != null && item.weight_g == null ? ' (BOM)' : ''}`);
  if (item.default_price != null) extras.push(`VP: ${fmtCHF(item.default_price)}`);
  document.getElementById('li-plm-name').textContent = item.name + (item.project?.name ? ' · ' + item.project.name : '') + (extras.length ? ' · ' + extras.join(' · ') : '');
  sel.style.display = 'flex';
  if (!V('li-desc')) set('li-desc', item.item_number + ' – ' + item.name);
  if (item.default_price != null && !(parseFloat(V('li-price')) > 0)) set('li-price', item.default_price);
  window._liItem = item;
  _calcLiCost();
}

let _calcLiCostTimer;
function _calcLiCost() {
  clearTimeout(_calcLiCostTimer);
  _calcLiCostTimer = setTimeout(_doCalcLiCost, 150);
}

// ── BOM QUOTE IMPORT ──────────────────────────────────────────
let _bomQItems = [];

async function openBomQuoteImport(quoteId) {
  _bomQItems = [];
  if (!state.rawMaterials?.length) {
    state.rawMaterials = await api('/api/raw-materials').catch(() => []);
  }
  _showDynModal(`<div class="modal" style="max-width:780px;width:96vw">
    <div class="modal-head">
      <div class="modal-title">📦 Aus BOM kalkullieren</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        Baugruppe wählen → alle BOM-Teile werden einzeln kalkuliert und als Positionen übernommen.
      </div>
      <div style="position:relative;margin-bottom:14px">
        <input class="fi" id="bqm-search" placeholder="Baugruppe suchen (ASM)…" oninput="_bqmSearch(this.value)" autocomplete="off">
        <div id="bqm-results" style="display:none;position:absolute;z-index:300;left:0;right:0;top:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:200px;overflow-y:auto"></div>
      </div>
      <div id="bqm-asm-badge" style="display:none;background:var(--bg3);border:1px solid var(--blue);border-radius:var(--r);padding:7px 12px;margin-bottom:14px;font-size:13px;display:none;align-items:center;gap:8px">
        <span id="bqm-asm-label" style="font-family:var(--mono);color:var(--blue)"></span>
        <span id="bqm-asm-name" style="flex:1"></span>
      </div>
      <div class="form-row cols2" style="margin-bottom:12px">
        <div class="fg"><label class="fl">Rohmaterial (für alle Teile, optional)</label>
          <select class="fs" id="bqm-rawmat" onchange="_bqmCalcAll()">
            <option value="">— kein Rohmaterial —</option>
            ${(state.rawMaterials||[]).map(m => `<option value="${m.id}" data-unit="${esc(m.unit)}">${esc(m.name)} — ${fmtN(m.stock_qty,0)} ${m.unit}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label class="fl">Stundenansatz (CHF/h)</label>
          <input class="fi" type="number" id="bqm-rate" value="${parseFloat(state.settings?.hourly_rate)||0}" min="0" step="1" oninput="_bqmCalcAll()">
        </div>
      </div>
      <div id="bqm-parts" style="display:none">
        <div class="sep-label" style="margin-top:0">BOM-Teile</div>
        <div id="bqm-parts-list" style="display:flex;flex-direction:column;gap:4px;max-height:340px;overflow-y:auto"></div>
        <div id="bqm-total" style="margin-top:10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);font-size:13px"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" id="bqm-add-btn" style="display:none" onclick="doBomQuoteImport(${quoteId})">✓ Alle als Positionen übernehmen</button>
    </div>
  </div>`);
}

let _bqmSearchTimer;
function _bqmSearch(q) {
  clearTimeout(_bqmSearchTimer);
  const res = document.getElementById('bqm-results');
  if (!q || q.length < 1) { res.style.display = 'none'; return; }
  _bqmSearchTimer = setTimeout(async () => {
    const items = await api('/api/items-all?q=' + encodeURIComponent(q));
    const asms = items.filter(i => i.item_type === 'asm');
    if (!asms.length) { res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Baugruppen gefunden</div>'; res.style.display = 'block'; return; }
    res.innerHTML = asms.map(i => `
      <div onclick="_bqmSelectAsm(${i.id})"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${_itemChip('asm', 16)}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name)}</span>
      </div>`).join('');
    res.style.display = 'block';
  }, 200);
}

async function _bqmSelectAsm(itemId) {
  document.getElementById('bqm-results').style.display = 'none';
  document.getElementById('bqm-search').value = '';
  document.getElementById('bqm-parts').style.display = 'block';
  document.getElementById('bqm-parts-list').innerHTML = '<div style="color:var(--t3);font-size:13px">Lade BOM…</div>';
  const item = await api('/api/items/' + itemId).catch(() => null);
  if (!item) { document.getElementById('bqm-parts-list').innerHTML = '<div style="color:var(--red);font-size:13px">Fehler beim Laden</div>'; return; }
  const badge = document.getElementById('bqm-asm-badge');
  document.getElementById('bqm-asm-label').textContent = item.item_number;
  document.getElementById('bqm-asm-name').textContent = item.name;
  badge.style.display = 'flex';

  const bom = await api(`/api/items/${item.id}/bom-for-quote`);
  if (!bom.length) {
    document.getElementById('bqm-parts-list').innerHTML = '<div style="color:var(--amber);font-size:13px">⚠ Keine BOM-Teile gefunden</div>';
    return;
  }
  _bomQItems = bom;
  _bqmRenderParts();
  await _bqmCalcAll();
  document.getElementById('bqm-add-btn').style.display = '';
}

function _bqmRenderParts() {
  const list = document.getElementById('bqm-parts-list');
  list.innerHTML = _bomQItems.map((b, i) => `
    <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span>${_itemChip(b.item_type, 15)}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(b.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(b.name)}</span>
        <span style="font-size:11px;color:var(--t4);font-family:var(--mono)">${fmtN(b.quantity,0)} ${b.unit}</span>
        ${b.weight_g!=null ? `<span style="font-size:11px;color:var(--t4)">⚖ ${fmtN(b.weight_g,1)}g</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <label style="font-size:11px;color:var(--t4);flex-shrink:0">Arbeitszeit/Stk (h):</label>
        <input type="number" id="bqm-h-${i}" value="" min="0" step="0.25" placeholder="0"
          style="width:70px;font-size:13px;background:var(--bg3);border:1px solid var(--line);border-radius:var(--r-xs);padding:2px 6px"
          oninput="_bqmCalcAll()">
        <span id="bqm-cost-${i}" style="font-size:13px;font-family:var(--mono);color:var(--t3);margin-left:auto"></span>
      </div>
    </div>`).join('');
}

async function _bqmCalcAll() {
  if (!_bomQItems.length) return;
  const rmId  = document.getElementById('bqm-rawmat')?.value;
  const rate  = parseFloat(document.getElementById('bqm-rate')?.value) || 0;
  const rm    = rmId ? (state.rawMaterials||[]).find(r => r.id == rmId) : null;
  let rmPrice = null;
  if (rmId) {
    const prices = await api(`/api/raw-materials/${rmId}/prices`).catch(() => []);
    rmPrice = prices[0]?.unit_price ?? null;
  }

  let grandTotal = 0;
  _bomQItems.forEach((b, i) => {
    const hours = parseFloat(document.getElementById(`bqm-h-${i}`)?.value) || 0;
    const qty   = b.quantity || 1;
    let costPerPiece = 0;

    const mc = b.manufacturing_cost;
    if (mc?.total > 0) costPerPiece += mc.total;

    if (rm && rmPrice != null && b.weight_g != null) {
      const rmWeight = parseFloat(rm.weight_g) || 0;
      if (rmWeight > 0) costPerPiece += (rmPrice / rmWeight) * b.weight_g;
    }
    if (hours > 0 && rate > 0) costPerPiece += hours * rate;

    const lineTotal = costPerPiece * qty;
    grandTotal += lineTotal;
    b._calcPrice = costPerPiece;
    b._calcHours = hours;
    const el = document.getElementById(`bqm-cost-${i}`);
    if (el) el.textContent = lineTotal > 0 ? `${fmtCHF(costPerPiece)}/Stk × ${qty} = ${fmtCHF(lineTotal)}` : '—';
  });

  const tot = document.getElementById('bqm-total');
  if (tot) tot.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
    <span style="color:var(--t3)">Gesamtkosten (alle Teile):</span>
    <strong style="font-family:var(--mono);font-size:15px;color:var(--blue)">${fmtCHF(grandTotal)}</strong>
  </div>`;
}

async function doBomQuoteImport(quoteId) {
  if (!_bomQItems.length) return;
  const rmVal = document.getElementById('bqm-rawmat')?.value;
  for (const b of _bomQItems) {
    await api(`/api/quotes/${quoteId}/items`, 'POST', {
      item_id: b.id,
      description: b.item_number + ' – ' + b.name,
      quantity: b.quantity || 1,
      unit: b.unit || 'Stk',
      unit_price: b._calcPrice || 0,
      raw_material_id: rmVal ? parseInt(rmVal) : null,
      estimated_hours: b._calcHours || null,
      notes: ''
    });
  }
  _hideDynModal();
  toast(`${_bomQItems.length} Position${_bomQItems.length !== 1 ? 'en' : ''} hinzugefügt`, 'ok');
  await renderQuotes();
  openQuoteDetail(quoteId);
}

async function _doCalcLiCost() {
  const hint = document.getElementById('li-cost-hint');
  if (!hint) return;
  const item = window._liItem;
  const rmId = document.getElementById('li-rawmat')?.value;
  const hours = parseFloat(document.getElementById('li-hours')?.value) || 0;
  const qty   = parseFloat(V('li-qty')) || 1;
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;

  const rows = [];
  let total = 0;

  // Effective weight: direct weight_g, or BOM sum for assemblies
  const effectiveWeight = item ? (item.effective_weight_g ?? item.weight_g ?? null) : null;
  const weightLabel = item?.effective_weight_g != null && item?.weight_g == null ? ' (BOM-Summe)' : '';

  // Show item weight info when linked (even without raw material)
  if (effectiveWeight != null && !rmId) {
    rows.push({ label: 'Bauteilgewicht', val: null, info: `${fmtN(effectiveWeight, 1)} g${weightLabel} — Rohmaterial wählen für Materialkostenrechnung` });
  }

  // Material cost from selected lot
  if (rmId) {
    const rm  = (state.rawMaterials||[]).find(r => r.id == rmId);
    const lot = window._liSelectedLot;
    let price = lot?.unit_price ?? null;
    if (price == null) {
      const prices = await api(`/api/raw-materials/${rmId}/prices`).catch(()=>[]);
      price = prices[0]?.unit_price ?? null;
    }
    if (price != null) {
      const rmWeight   = parseFloat(rm?.weight_g) || 0;
      const itemWeight = effectiveWeight;
      const lotLabel   = lot?.lot_number ? ` (Lot ${lot.lot_number})` : '';
      if (rmWeight > 0 && itemWeight != null) {
        const matCost = (price / rmWeight) * itemWeight;
        const detail  = `${fmtN(itemWeight,1)}g${weightLabel} × ${fmtCHF(price)}/${fmtN(rmWeight,0)}g${lotLabel}`;
        if (matCost > 0) { rows.push({ label: 'Material', val: matCost, detail }); total += matCost; }
      } else {
        const missing = [];
        if (itemWeight == null) missing.push(`Bauteilgewicht fehlt (direkt am Teil oder über BOM-Teile)`);
        if (rmWeight <= 0)      missing.push(`Rohmaterialgewicht fehlt (Spool-Gewicht im Rohmaterial eintragen)`);
        rows.push({ label: 'Material', val: null, warn: `⚠ ${missing.join(' · ')}` });
      }
    }
  }

  // Work time
  if (hours > 0 && hourlyRate > 0) {
    const workCost = hours * hourlyRate;
    rows.push({ label: 'Arbeitszeit', val: workCost, detail: `${hours}h × ${fmtCHF(hourlyRate)}/h` });
    total += workCost;
  }

  // Print cost (printer × estimated print hours)
  const printerName  = document.getElementById('li-printer')?.value;
  const printHours   = parseFloat(document.getElementById('li-print-hours')?.value) || 0;
  if (printerName && printHours > 0) {
    const printer = (state.printers||[]).find(p => p.name === printerName);
    const costHr  = parseFloat(printer?.cost_per_hour) || 0;
    if (costHr > 0) {
      const printCost = printHours * costHr;
      rows.push({ label: 'Druckzeit', val: printCost, detail: `${printHours}h × ${fmtCHF(costHr)}/h (${esc(printerName)})` });
      total += printCost;
    }
  }

  if (!rows.length) { hint.style.display = 'none'; return; }

  const totalPerPiece = total;
  const totalAll = total * qty;
  hint.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:4px">
      ${rows.map(r => r.warn ? `
        <div style="font-size:11px;color:var(--amber);padding:3px 0">${r.warn}</div>` : r.info ? `
        <div style="font-size:11px;color:var(--t3);padding:3px 0">${r.info}</div>` : `
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <span style="color:var(--t4)">${r.label}${r.detail?` <span style="font-size:11px">(${r.detail})</span>`:''}</span>
          <span style="font-family:var(--mono)">${fmtCHF(r.val)}</span>
        </div>`).join('')}
      ${total > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line2);padding-top:6px;margin-top:2px;gap:8px">
        <span style="color:var(--t3)">Kalkuliert / Stk${qty>1?` (× ${qty} = ${fmtCHF(totalAll)} total)`:''}:</span>
        <div style="display:flex;align-items:center;gap:8px">
          <strong style="font-family:var(--mono);color:var(--blue)">${fmtCHF(totalPerPiece)}</strong>
          <button class="btn btn-primary btn-sm" onclick="set('li-price','${totalPerPiece.toFixed(2)}')">Als Preis übernehmen</button>
        </div>
      </div>` : ''}
    </div>`;
  hint.style.display = 'block';
}

function clearLinkedItem() {
  set('li-linked-plm-id', '');
  window._liItem = null;
  document.getElementById('li-plm-selected').style.display = 'none';
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-cost-hint').style.display = 'none';
}

function openLineItemModal(parentType, parentId, itemId) {
  set('li-parent-type', parentType);
  set('li-parent-id', parentId);
  set('li-item-id', itemId||'');
  set('li-linked-plm-id', '');
  set('li-hours', '');
  set('li-print-hours', '');
  window._liItem = null;
  window._liSelectedLot = null;
  // Ensure raw materials + printers are loaded
  const _liLoadPromises = [];
  if (!state.rawMaterials?.length)
    _liLoadPromises.push(api('/api/raw-materials').then(mats => { state.rawMaterials = mats; }).catch(()=>{}));
  if (!state.printers?.length)
    _liLoadPromises.push(api('/api/printers').then(p => { state.printers = p; }).catch(()=>{}));
  Promise.all(_liLoadPromises).then(() => {
    // li-rawmat is now a hidden input + search field — no innerHTML needed
    const prSel = document.getElementById('li-printer');
    if (prSel) prSel.innerHTML = '<option value="">— kein Drucker —</option>' +
      (state.printers||[]).map(p => `<option value="${esc(p.name)}" data-cost="${p.cost_per_hour}">${esc(p.name)} (${fmtChf(p.cost_per_hour)}/h)</option>`).join('');
  });
  document.getElementById('li-title').textContent = itemId ? 'Position bearbeiten' : 'Position hinzufügen';
  document.getElementById('li-save').textContent = itemId ? 'Speichern' : 'Hinzufügen';
  document.getElementById('li-plm-results').style.display = 'none';
  document.getElementById('li-plm-search').value = '';
  document.getElementById('li-cost-hint').style.display = 'none';
  // Reset raw material search field
  const rmSearch = document.getElementById('li-rawmat-search');
  if (rmSearch) rmSearch.value = '';
  set('li-rawmat', '');

  if (itemId) {
    const src = parentType === 'order' ? state.orders : (state.quotes||[]);
    const parent = src.find(x=>x.id===parentId);
    const li = (parent?.items||[]).find(x=>x.id===itemId);
    if (li) {
      set('li-desc',li.description); set('li-qty',li.quantity); set('li-price',li.unit_price);
      set('li-disc',li.discount_pct||0); set('li-notes',li.notes||'');
      set('li-hours', li.estimated_hours||'');
      set('li-print-hours', li.estimated_print_hours||'');
      document.getElementById('li-unit').value = li.unit||'Stk';
      if (li.item_id && li.item_number) {
        set('li-linked-plm-id', li.item_id);
        const icon = _itemChip(li.item_type, 18);
        document.getElementById('li-plm-badge').innerHTML = icon + ' <span style="font-family:var(--mono)">' + esc(li.item_number) + '</span>';
        document.getElementById('li-plm-name').textContent = li.description;
        document.getElementById('li-plm-selected').style.display = 'flex';
        // Load full item so weight + effective_weight_g are available for cost calc
        api('/api/items/' + li.item_id).then(fullItem => {
          if (!fullItem) return;
          window._liItem = fullItem;
          setTimeout(() => {
            if (li.raw_material_id) _rmSetValue('li-rawmat', li.raw_material_id);
            if (li.printer_name)    document.getElementById('li-printer').value = li.printer_name;
            _calcLiCost();
          }, 50);
        }).catch(() => {});
        // Show cost hint from already-loaded backend data while item loads
        const hint = document.getElementById('li-cost-hint');
        const mc = li.manufacturing_cost;
        if (mc) {
          const parts = [];
          if (mc.material > 0) parts.push(`Mat. ${fmtCHF(mc.material)}`);
          if (mc.machine  > 0) parts.push(`Druck ${fmtCHF(mc.machine)}`);
          if (mc.work     > 0) parts.push(`Arbeit ${fmtCHF(mc.work)}`);
          const margin = li.unit_price != null ? li.unit_price - mc.total : null;
          const marginPct = (margin != null && mc.total > 0) ? (margin / mc.total * 100) : null;
          const marginColor = margin == null ? 'var(--t3)' : margin < 0 ? 'var(--red)' : marginPct != null && marginPct < 15 ? 'var(--amber)' : 'var(--green)';
          hint.innerHTML = `<span style="color:var(--t3)">Herst./Stk.:</span> <strong>${fmtCHF(mc.total)}</strong>`
            + (parts.length ? ` <span style="color:var(--t4)">(${parts.join(' + ')})</span>` : '')
            + (margin != null ? ` &nbsp;·&nbsp; <span style="color:${marginColor};font-weight:600">Marge ${fmtCHF(margin)}${marginPct != null ? ` (${marginPct.toFixed(0)}%)` : ''}</span>` : '');
          hint.style.display = 'block';
        } else {
          hint.style.display = 'none';
        }
      } else {
        document.getElementById('li-plm-selected').style.display = 'none';
        setTimeout(() => {
          if (li.raw_material_id) _rmSetValue('li-rawmat', li.raw_material_id);
          if (li.printer_name)    document.getElementById('li-printer').value = li.printer_name;
          if (li.raw_material_id || li.printer_name || li.estimated_hours || li.estimated_print_hours)
            _calcLiCost();
        }, 300);
      }
    }
  } else {
    ['li-desc','li-notes'].forEach(f=>set(f,''));
    set('li-qty',1); set('li-price',0); set('li-disc',0);
    document.getElementById('li-unit').value = 'Stk';
    document.getElementById('li-plm-selected').style.display = 'none';
    _rmSetValue('li-rawmat', '', '');
  }
  openModal('lineItemModal');
}

async function saveLineItem() {
  const parentType = V('li-parent-type');
  const parentId = parseInt(V('li-parent-id'));
  const itemId = V('li-item-id');
  const desc = V('li-desc'); if(!desc) return toast('Beschreibung fehlt','err');
  const linkedPlmId = V('li-linked-plm-id') ? parseInt(V('li-linked-plm-id')) : null;
  const rmVal = document.getElementById('li-rawmat')?.value;
  const body = { description:desc, quantity:parseFloat(V('li-qty'))||1,
    unit:document.getElementById('li-unit').value,
    unit_price:parseFloat(V('li-price'))||0,
    discount_pct:parseFloat(V('li-disc'))||0,
    notes:V('li-notes'),
    item_id: linkedPlmId,
    raw_material_id: rmVal ? parseInt(rmVal) : null,
    estimated_hours: parseFloat(V('li-hours'))||null,
    printer_name: document.getElementById('li-printer')?.value || null,
    estimated_print_hours: parseFloat(V('li-print-hours'))||null };
  if (itemId) {
    const r = await api(`/api/${parentType === 'order' ? 'order' : 'quote'}-items/${itemId}`,'PUT',body);
    toast(r?.price_synced ? `Gespeichert · Preis in ${r.price_synced} Produktionsposition${r.price_synced>1?'en':''} übernommen` : 'Gespeichert','ok');
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
