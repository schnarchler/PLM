// 05-erp-views.js — Gewinnübersicht, Kunden, Aufträge (Ansicht), Suche
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── PROFIT OVERVIEW ───────────────────────────────────────────
let _profitData = [];
let _profitState = { sort: 'number', dir: 1, text: '', margin: '' };

function _exportProfitCsv() {
  const { sort, dir, text, margin, type, project, sold } = _profitState;
  const q = text.toLowerCase();
  let rows = _profitData.filter(i => {
    if (q && !i.item_number.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q)
           && !i.project_number.toLowerCase().includes(q) && !(i.project_name||'').toLowerCase().includes(q)) return false;
    if (type    && i.item_type !== type) return false;
    if (project && i.project_number !== project) return false;
    if (sold    && !(i.order_qty > 0)) return false;
    if (margin === 'pos'     && !(i.margin != null && i.margin >= 0)) return false;
    if (margin === 'neg'     && !(i.margin != null && i.margin < 0))  return false;
    if (margin === 'missing' && i.margin != null) return false;
    return true;
  });
  const sortVal = i => ({
    project: i.project_number, number: i.item_number, name: i.name,
    cost: i.avg_calc_cost ?? -Infinity,
    price: i.default_price ?? -Infinity, margin_pct: i.margin_pct ?? -Infinity,
  })[sort] ?? '';
  rows.sort((a, b) => { const av = sortVal(a), bv = sortVal(b); return dir * (typeof av === 'string' ? av.localeCompare(bv) : av - bv); });

  const csvNum = v => v == null ? '' : String(v).replace('.', ',');
  const csvStr = s => '"' + String(s||'').replace(/"/g, '""') + '"';
  const lines = [
    ['Projekt','Nummer','Typ','Name','Klassifizierung','Gewicht (g)','Ø Herst.-kosten (CHF)','Ø VP (CHF)','Marge (%)','Stk. verkauft','Umsatz (CHF)','Theor. Marge (CHF)'].join(';'),
    ...rows.map(i => [
      csvStr(i.project_number), csvStr(i.item_number),
      csvStr(i.item_type === 'asm' ? 'Baugruppe' : 'Part'),
      csvStr(i.name), csvStr(i.classification||''),
      csvNum(i.weight_g != null ? i.weight_g : null),
      csvNum(i.avg_calc_cost != null ? i.avg_calc_cost.toFixed(2) : null),
      csvNum(i.avg_unit_price != null ? i.avg_unit_price.toFixed(2) : null),
      csvNum(i.margin_pct != null ? i.margin_pct.toFixed(1) : null),
      csvNum(i.order_qty || 0),
      csvNum(i.order_revenue != null ? i.order_revenue.toFixed(2) : null),
      csvNum(i.theor_gain != null ? i.theor_gain.toFixed(2) : null),
    ].join(';'))
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Kalkulation_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function renderProfitOverview() {
  setLeftHeader('Kalkulation', `<div style="display:flex;gap:6px">
    <button class="btn btn-ghost btn-sm" onclick="_exportProfitCsv()">↓ CSV</button>
    <button class="btn btn-ghost btn-sm" onclick="renderProfitOverview()">↺</button>
  </div>`);
  closeDetail();
  _profitData = await api('/api/profit-overview');
  _profitState = { sort: 'number', dir: 1, text: '', margin: '', type: '', project: '', sold: false };

  const withPrice  = _profitData.filter(i => i.avg_unit_price != null);
  const withBoth   = _profitData.filter(i => i.avg_calc_cost != null && i.avg_unit_price != null);
  const withSales  = _profitData.filter(i => i.order_qty > 0);
  const avgMargPct = withBoth.length ? (withBoth.reduce((s,i) => s + (i.margin_pct||0), 0) / withBoth.length) : null;
  const totalRev   = _profitData.reduce((s,i) => s + (i.order_revenue||0), 0);
  const totalTheor = _profitData.filter(i => i.theor_gain != null).reduce((s,i) => s + i.theor_gain, 0);
  const mc = m => m == null ? 'var(--t3)' : m < 0 ? 'var(--red)' : m < 20 ? 'var(--amber)' : 'var(--green)';

  const projects = [...new Set(_profitData.map(i => i.project_number))].sort();

  const kpi = (label, val, sub, color='var(--t1)') =>
    `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);padding:10px 16px;min-width:130px;flex:1">
      <div style="font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${label}</div>
      <div style="font-size:20px;font-weight:600;color:${color}">${val}</div>
      ${sub ? `<div style="font-size:11px;color:var(--t4);margin-top:3px">${sub}</div>` : ''}
    </div>`;

  setLeftBody(`<div style="padding:4px 0;max-width:1200px">
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${kpi('Teile gesamt', _profitData.length, `${withPrice.length} mit VP`)}
      ${kpi('Kalkulierbar', withBoth.length, `Ø Herst.-kosten + Ø VP vorhanden`)}
      ${kpi('Ø Marge', avgMargPct != null ? avgMargPct.toFixed(0)+'%' : '—', `VP vs. Ø Herst.-kosten`, mc(avgMargPct))}
      ${kpi('Verkaufte Teile', withSales.length, `${withSales.reduce((s,i)=>s+(i.order_qty||0),0)} Stk. total`)}
      ${kpi('Umsatz (Aufträge)', totalRev > 0 ? fmtCHF(totalRev) : '—', 'nicht stornierte Aufträge')}
      ${kpi('Theor. Marge', withBoth.filter(i=>i.theor_gain!=null).length ? fmtCHF(totalTheor) : '—', 'Marge × Stk. verk.', mc(totalTheor > 0 ? 20 : totalTheor < 0 ? -1 : null))}
    </div>

    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <input class="fi" id="profit-search" placeholder="Nummer, Name, Projekt …"
        oninput="_profitState.text=this.value;_renderProfitRows()"
        style="max-width:240px;font-size:13px">
      <select class="fs" id="profit-project-filter" onchange="_profitState.project=this.value;_renderProfitRows()" style="font-size:13px">
        <option value="">Alle Projekte</option>
        ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <select class="fs" id="profit-type-filter" onchange="_profitState.type=this.value;_renderProfitRows()" style="font-size:13px">
        <option value="">Alle Typen</option>
        <option value="prt">Parts</option>
        <option value="asm">Baugruppen</option>
      </select>
      <select class="fs" id="profit-margin-filter" onchange="_profitState.margin=this.value;_renderProfitRows()" style="font-size:13px">
        <option value="">Alle Marge</option>
        <option value="pos">Positiv (≥ 0)</option>
        <option value="neg">Negativ</option>
        <option value="missing">Unvollständig</option>
      </select>
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;color:var(--t2)">
        <input type="checkbox" id="profit-sold-filter" onchange="_profitState.sold=this.checked;_renderProfitRows()" style="accent-color:var(--blue)">
        Nur verkaufte
      </label>
    </div>

    <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead style="position:sticky;top:0;z-index:2;background:var(--bg1)"><tr style="border-bottom:2px solid var(--line)" id="profit-thead"></tr></thead>
      <tbody id="profit-tbody"></tbody>
      <tfoot id="profit-tfoot"></tfoot>
    </table></div>
  </div>`);

  _renderProfitRows();
}

function _profitSortBy(col) {
  if (_profitState.sort === col) _profitState.dir *= -1;
  else { _profitState.sort = col; _profitState.dir = 1; }
  _renderProfitRows();
}

function _renderProfitRows() {
  const { sort, dir, text, margin, type, project, sold } = _profitState;
  const q = text.toLowerCase();
  const mc  = m => m == null ? 'var(--t3)' : m < 0 ? 'var(--red)' : m < 20 ? 'var(--amber)' : 'var(--green)';
  const mbg = m => m == null ? '' : m < 0 ? 'background:rgba(241,120,120,.06)' : m < 20 ? 'background:rgba(239,177,74,.06)' : '';

  let rows = _profitData.filter(i => {
    if (q && !i.item_number.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q)
           && !i.project_number.toLowerCase().includes(q) && !(i.project_name||'').toLowerCase().includes(q)
           && !(i.classification||'').toLowerCase().includes(q)) return false;
    if (type    && i.item_type !== type) return false;
    if (project && i.project_number !== project) return false;
    if (sold    && !(i.order_qty > 0)) return false;
    if (margin === 'pos'     && !(i.margin != null && i.margin >= 0)) return false;
    if (margin === 'neg'     && !(i.margin != null && i.margin < 0))  return false;
    if (margin === 'missing' && i.margin != null) return false;
    return true;
  });

  const sortVal = i => ({
    project:       i.project_number,
    number:        i.item_number,
    name:          i.name,
    weight:        i.weight_g ?? -Infinity,
    avg_price:     i.avg_calc_cost ?? -Infinity,
    price:         i.avg_unit_price ?? -Infinity,
    margin_pct:    i.margin_pct ?? -Infinity,
    order_qty:     i.order_qty ?? -Infinity,
    order_revenue: i.order_revenue ?? -Infinity,
    theor_gain:    i.theor_gain ?? -Infinity,
  })[sort] ?? '';

  rows.sort((a, b) => {
    const av = sortVal(a), bv = sortVal(b);
    return dir * (typeof av === 'string' ? av.localeCompare(bv) : av - bv);
  });

  const arrow = col => sort === col ? (dir === 1 ? ' ▲' : ' ▼') : '';
  const th = (label, col, align='left', title='') =>
    `<th style="text-align:${align};padding:6px 8px;color:${sort===col?'var(--t1)':'var(--t3)'};font-weight:600;cursor:pointer;user-select:none;white-space:nowrap"
      onclick="_profitSortBy('${col}')"${title?` title="${title}"`:''}>${label}${arrow(col)}</th>`;

  document.getElementById('profit-thead').innerHTML =
    th('Projekt','project') + th('Nummer','number') + th('Name / Klasse','name') +
    th('Gew.','weight','right','Gewicht (g)') +
    th('Ø Herst.-kosten','avg_price','right','Gewichteter Ø der kalkulierten Kosten aus Aufträgen (Material + Druck + Arbeit)') +
    th('Ø VP','price','right','Gewichteter Ø Verkaufspreis aus nicht-stornierten Aufträgen') +
    th('Marge %','margin_pct','right','(VP − Ø Herst.-kosten) / Ø Herst.-kosten') +
    th('Stk.','order_qty','right','Stück verkauft') +
    th('Umsatz','order_revenue','right') +
    th('Theor. Marge','theor_gain','right','Marge × Stk. verkauft');

  // Summary footer
  const sumRev   = rows.reduce((s,i) => s + (i.order_revenue||0), 0);
  const sumTheor = rows.filter(i=>i.theor_gain!=null).reduce((s,i) => s + i.theor_gain, 0);
  const sumQty   = rows.reduce((s,i) => s + (i.order_qty||0), 0);
  const hasTheor = rows.some(i => i.theor_gain != null);

  document.getElementById('profit-tfoot').innerHTML = rows.length > 1 ? `
    <tr style="border-top:2px solid var(--line);background:var(--bg2);font-size:13px;font-weight:600">
      <td colspan="7" style="padding:6px 8px;color:var(--t3)">Total (${rows.length} Einträge)</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--mono)">${sumQty > 0 ? fmtN(sumQty,0) : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--mono)">${sumRev > 0 ? fmtCHF(sumRev) : '—'}</td>
      <td style="padding:6px 8px;text-align:right;font-family:var(--mono);color:${mc(sumTheor > 0 ? 20 : sumTheor < 0 ? -1 : null)}">${hasTheor ? fmtCHF(sumTheor) : '—'}</td>
    </tr>` : '';

  document.getElementById('profit-tbody').innerHTML = rows.length ? rows.map(i => {
    const pct     = i.margin_pct;
    const pctBar  = pct != null ? `<div style="height:3px;border-radius:2px;margin-top:3px;width:${Math.min(Math.abs(pct),100)}%;background:${mc(pct)}"></div>` : '';
    const tgColor = i.theor_gain == null ? 'var(--t3)' : i.theor_gain < 0 ? 'var(--red)' : i.theor_gain > 0 ? 'var(--green)' : 'var(--t3)';
    const classChip = i.classification ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--t3);border:1px solid var(--line2);margin-left:4px">${esc(i.classification)}</span>` : '';
    const orderCount = i.order_qty > 0 ? `<span style="font-size:10px;color:var(--t4)" title="${i.order_qty} Stk. aus Aufträgen (gewichteter Ø)"> n=${fmtN(i.order_qty,0)}</span>` : '';
    return `<tr style="border-bottom:1px solid var(--line);cursor:pointer;${mbg(pct)}" onclick="openProjectAndItem(${i.project_db_id},${i.id})" title="Im PLM öffnen">
      <td style="padding:5px 8px;font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.project_number)}</td>
      <td style="padding:5px 8px;font-size:13px;white-space:nowrap">${_itemChip(i.item_type,15)} <span style="font-family:var(--mono)">${esc(i.item_number)}</span></td>
      <td style="padding:5px 8px;max-width:200px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(i.name)}${classChip}</div></td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px;color:var(--t3)">${i.weight_g != null ? fmtN(i.weight_g,1) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px">${i.avg_calc_cost != null ? fmtCHF(i.avg_calc_cost)+orderCount : '<span style="color:var(--t4)">—</span>'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px">${i.avg_unit_price != null ? fmtCHF(i.avg_unit_price) : '<span style="color:var(--t4)">—</span>'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px;font-weight:600;color:${mc(pct)};min-width:70px">${pct != null ? pct.toFixed(0)+'%' : '—'}${pctBar}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px;color:${i.order_qty ? 'var(--t2)' : 'var(--t4)'}">${i.order_qty || '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px;color:${i.order_revenue ? 'var(--t2)' : 'var(--t4)'}">${i.order_revenue ? fmtCHF(i.order_revenue) : '—'}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--mono);font-size:13px;font-weight:${i.theor_gain != null ? 600 : 400};color:${tgColor}">${i.theor_gain != null ? fmtCHF(i.theor_gain) : '—'}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="10" style="padding:24px;text-align:center;color:var(--t3)">Keine Einträge</td></tr>`;
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
      <thead><tr><th>Nummer</th><th>Name</th><th>Aufträge</th><th>E-Mail</th><th>Telefon</th><th>Adresse</th><th></th></tr></thead>
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
  el.innerHTML = rows.map(c=>`<tr data-id="${c.id}" onclick="openCustomerDetail(${c.id})">
    <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${c.number}</td>
    <td style="font-weight:500">${esc(c.name)}</td>
    <td style="text-align:center">${c.order_count > 0 ? `<span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:12px;padding:1px 8px;font-family:var(--mono)">${c.order_count}</span>` : '<span style="color:var(--t4)">—</span>'}</td>
    <td style="color:var(--t2)">${c.email||'—'}</td>
    <td style="color:var(--t2)">${c.phone||'—'}</td>
    <td style="color:var(--t3);font-size:13px">${[c.street,c.postal_code&&c.city?c.postal_code+' '+c.city:'',c.country].filter(Boolean).join(', ')||'—'}</td>
    <td><button class="btn btn-red btn-icon btn-sm" onclick="event.stopPropagation();delCustomer(${c.id})">✕</button></td>
  </tr>`).join('') || '<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--t3)">Keine Treffer</td></tr>';
}

async function openCustomerDetail(id) {
  const c = await api(`/api/customers/${id}`);
  _trackRecent('customer', c.id, c.name, c.number);
  _pushHistory({ view: 'customers', detailType: 'customer', detailId: c.id });
  const ostLabel = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
  const ostCls   = {DRAFT:'st-DFT',CONFIRMED:'st-REV',DELIVERED:'st-REL',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
  const qstLabel = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
  const qstCls   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
  const dstLabel = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
  const dstCls   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
  const fmtChfD  = v => v != null ? fmtCHF(parseFloat(v)) : '—';
  const empty    = msg => `<div style="color:var(--t3);font-size:13px;padding:6px 0">${msg}</div>`;

  const orderRevTotal  = c.orders.reduce((s,o)  => s + (o.total||0), 0);
  const delivRevTotal  = c.deliveries.reduce((s,d) => s + (d.total||0), 0);

  document.getElementById('dp-title').innerHTML =
    `👤 <strong>${esc(c.name)}</strong> <span style="font-family:var(--mono);font-size:13px;color:var(--blue);margin-left:6px">${c.number}</span>`;

  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'cd-orders')">Aufträge <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:13px;padding:1px 6px;margin-left:3px">${c.orders.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-quotes')">Angebote <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:13px;padding:1px 6px;margin-left:3px">${c.quotes.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-deliveries')">Lieferungen <span style="background:var(--bg3);border:1px solid var(--line2);border-radius:10px;font-size:13px;padding:1px 6px;margin-left:3px">${c.deliveries.length}</span></button>
    <button class="tab" onclick="switchTab(this,'cd-info')">Stammdaten</button>`;

  const orderRows = c.orders.length ? c.orders.map(o => `
    <div onclick="gotoView('orders')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${ostCls[o.status]||'st-DFT'}">${ostLabel[o.status]||o.status}</span>
      <div>
        <div style="font-weight:500">${esc(o.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:2px">${o.number}${o.order_date?' · '+o.order_date.slice(0,10):''}${o.delivery_date?' · 📅 '+o.delivery_date.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:13px">${fmtChfD(o.total)}</div>
        <div style="font-size:13px;color:var(--t3)">${o.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Aufträge');

  const quoteRows = c.quotes.length ? c.quotes.map(q => `
    <div onclick="gotoView('quotes')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${qstCls[q.status]||'st-DFT'}">${qstLabel[q.status]||q.status}</span>
      <div>
        <div style="font-weight:500">${esc(q.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:2px">${q.number}${q.quote_date?' · '+q.quote_date.slice(0,10):''}${q.valid_until?' · gültig bis '+q.valid_until.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:13px">${fmtChfD(q.total)}</div>
        <div style="font-size:13px;color:var(--t3)">${q.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Angebote');

  const delivRows = c.deliveries.length ? c.deliveries.map(d => `
    <div onclick="gotoView('deliveries')" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${dstCls[d.status]||'st-DFT'}">${dstLabel[d.status]||d.status}</span>
      <div>
        <div style="font-weight:500">${esc(d.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:2px">${d.number}${d.order_number?' · Auftrag '+d.order_number:''}${d.delivery_date?' · '+d.delivery_date.slice(0,10):''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:var(--mono);font-size:13px">${fmtChfD(d.total)}</div>
        <div style="font-size:13px;color:var(--t3)">${d.item_count} Pos.</div>
      </div>
    </div>`).join('') : empty('Keine Lieferungen');

  document.getElementById('dp-body').innerHTML = `
    <div id="cd-orders">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--line);font-size:13px;color:var(--t3)">
        <span>${c.orders.length} Aufträge</span>
        <span style="font-family:var(--mono);color:var(--t1)">Total ${fmtChfD(orderRevTotal)}</span>
      </div>
      ${orderRows}
    </div>
    <div id="cd-quotes" style="display:none">
      ${quoteRows}
    </div>
    <div id="cd-deliveries" style="display:none">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg3);border-bottom:1px solid var(--line);font-size:13px;color:var(--t3)">
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

  _markActiveRow(c.id);
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
  el.innerHTML = rows.map(o=>`<tr data-id="${o.id}" onclick="openOrderDetail(${o.id})">
    <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${o.number}</td>
    <td style="font-weight:500">${esc(o.title)}</td>
    <td style="color:var(--t2)">${o.customer_name||'—'}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${(o.items||[]).length}</td>
    <td>${_stSel('order',o.id,o.status)}</td>
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${o.order_date||'—'}</td>
    <td style="font-family:var(--mono);font-size:13px;text-align:right;color:var(--green)">${o.computed_total != null ? fmtChf(o.computed_total) : '—'}</td>
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
    <div style="padding:6px 8px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:11px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Arbeitszeit (verrechenbar)</div>
    <table style="width:100%"><tbody>
      ${billable.map(e => {
        const cost = e.hours * hourlyRate;
        return `<tr style="border-bottom:1px solid var(--line)">
          <td style="padding:6px 8px;width:28px"></td>
          <td style="padding:6px 8px;font-size:13px">${esc(e.description||'Arbeitszeit')}
            <div style="font-size:13px;color:var(--t3)">${e.date||''}</div></td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:13px;white-space:nowrap">${fmtN(e.hours,2)} h</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:13px;white-space:nowrap">${fmtCHF(hourlyRate)}/h</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--mono);font-size:13px">${fmtCHF(cost)}</td>
          <td style="padding:6px 8px"></td>
        </tr>`;
      }).join('')}
    </tbody></table>
    <div style="padding:10px 12px;border-top:1px solid var(--line);font-size:13px">
      <div style="display:flex;justify-content:flex-end;gap:24px">
        <div style="text-align:right">
          <div style="color:var(--t3)">Positionen: <span style="font-family:var(--mono)">${fmtCHF(netItems)}</span></div>
          <div style="color:var(--t2)">+ Arbeitszeit ${fmtN(billableH,2)} h: <span style="font-family:var(--mono)">${fmtCHF(timeCost)}</span></div>
          ${includeTax?`<div style="color:var(--t3)">MwSt. ${taxRate}%: <span style="font-family:var(--mono)">${fmtCHF(tax)}</span></div>`:''}
          <div style="font-size:13px;font-weight:600;margin-top:4px;color:var(--green)">Gesamttotal: <span style="font-family:var(--mono)">${fmtCHF(grandTotal)}</span></div>
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
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const estHours = o.estimated_hours || 0;
  const hoursCost = estHours * hourlyRate;
  const orderHoursSection = estHours > 0 ? (() => {
    const discAmt = subtotal * (o.discount_pct||0) / 100;
    const net = subtotal - discAmt;
    const grandNet = o.include_hours ? net + hoursCost : net;
    const tax = o.include_tax ? grandNet * (o.tax_rate||0) / 100 : 0;
    const grandTotal = grandNet + tax;
    return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-bottom:10px;font-size:13px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-weight:600;color:var(--t2)">Arbeitszeit</span>
        <button class="btn btn-ghost btn-sm" style="font-size:13px" onclick="openOrderModal(${id})">✏️ Ändern</button>
      </div>
      <div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap">
        <span style="color:var(--t3)">${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h</span>
        <span style="font-family:var(--mono);font-weight:600;color:${o.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>
        <span style="font-size:13px;padding:1px 7px;border-radius:10px;background:${o.include_hours?'rgba(91,211,138,.12)':'var(--bg2)'};color:${o.include_hours?'var(--green)':'var(--t3)'}">${o.include_hours?'eingerechnet':'nicht eingerechnet'}</span>
      </div>
      ${o.include_hours && items.length ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);display:flex;justify-content:flex-end">
        <div style="text-align:right;font-size:13px;color:var(--t2)">Gesamttotal inkl. Arbeitszeit:
          <span style="font-family:var(--mono);font-weight:700;font-size:13px;color:var(--green);margin-left:8px">${fmtCHF(grandTotal)}</span>
        </div>
      </div>` : ''}
    </div>`;
  })() : '';
  document.getElementById('dp-body').innerHTML = `
    <div id="od-pos">
      ${renderLineItems(items, 'order', id, o.tax_rate??0, o.discount_pct||0, !!o.include_tax)}
      ${orderHoursSection}
      ${_renderBillableTimeSection(timeEntries, o.tax_rate??0, o.discount_pct||0, !!o.include_tax, subtotal)}
      <button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="openLineItemModal('order',${id})">+ Position</button>
    </div>
    <div id="od-info" style="display:none">
      <div class="sep-label">Auftragsdaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('order',id,o.status)}</div>
        <div><div class="ps-label">Kunde</div>${o.customer_name||'—'}</div>
        <div><div class="ps-label">Datum</div>${o.order_date||'—'}</div>
        <div><div class="ps-label">Lieferdatum</div><span id="od-delivery-date">${o.delivery_date||'—'}</span></div>
        <div><div class="ps-label">MwSt.</div>${o.tax_rate??0} % ${o.include_tax?'<span style="color:var(--green);font-size:13px">(ausgewiesen)</span>':'<span style="color:var(--t3);font-size:13px">(ohne)</span>'}</div>
        ${estHours>0?`<div><div class="ps-label">Arbeitszeit</div>${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h = <span style="font-family:var(--mono);color:${o.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>${o.include_hours?' <span style="color:var(--green);font-size:13px">(eingerechnet)</span>':' <span style="color:var(--t3);font-size:13px">(nicht eingerechnet)</span>'}</div>`:''}
        ${(o.discount_pct||0)>0?`<div><div class="ps-label">Gesamtrabatt</div>${o.discount_pct} %</div>`:''}
        ${o.payment_terms?`<div style="grid-column:span 2"><div class="ps-label">Zahlungsbedingungen</div>${esc(o.payment_terms)}</div>`:''}
        ${o.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(o.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openOrderModal(${id})">✏️ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'invoice')">&#128196; Rechnung PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="cloneOrder(${id})">⧉ Dublizieren</button>
        <button class="btn btn-primary btn-sm" onclick="orderToDelivery(${id})">🔧 Produktionsauftrag erstellen</button>
        ${o.status==='DRAFT' ? `<button class="btn btn-red btn-sm" onclick="delOrder(${id})">🗑 Löschen</button>` : ''}
      </div>
    </div>
    <div id="od-time" style="display:none">
      <div id="time-entries-list"><div style="color:var(--t3);font-size:13px">Wird geladen…</div></div>
    </div>`;
  _markActiveRow(o.id);
  showDetail();
}

async function orderToDelivery(orderId) {
  const timeEntries = await api(`/api/time-entries?order_id=${orderId}`);
  const billable = timeEntries.filter(e => e.billable);
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  const billableH = billable.reduce((s,e)=>s+(e.hours||0),0);
  _showDynModal(`<div class="modal" style="max-width:400px">
    <div class="modal-head"><div class="modal-title">Produktionsauftrag erstellen</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--t2)">Alle Positionen des Auftrags werden übernommen.</div>
      ${billable.length ? `<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r)">
        <input type="checkbox" id="dtd-include-time" checked style="width:15px;height:15px;margin-top:1px;cursor:pointer;accent-color:var(--blue);flex-shrink:0">
        <div>
          <div style="font-size:13px;font-weight:500;color:var(--t1)">Verrechenbare Zeiten übernehmen</div>
          <div style="font-size:13px;color:var(--t3);margin-top:2px">${billable.length} Einträge · ${fmtN(billableH,2)} h${hourlyRate>0?' · '+fmtCHF(billableH*hourlyRate):''}</div>
        </div>
      </label>` : `<div style="font-size:13px;color:var(--t3);padding:8px 0">Keine verrechenbaren Zeiteinträge vorhanden.</div>`}
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
  toast(`Produktionsauftrag ${d.number} erstellt`, 'ok');
  await renderDeliveries();
  openDeliveryDetail(d.id);
}

// ── SEARCH ────────────────────────────────────────────────────
function renderSearchView() {
  setLeftHeader('Suche', '');
  const classes = getClassifications();
  const chips = classes.map(c => {
    const [color, bg] = _classColor(c.name);
    return `<span onclick="document.getElementById('globalSearch').value='${esc(c.name)}';onSearch('${esc(c.name)}')"
      style="font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:12px;background:${bg};color:${color};cursor:pointer;border:1px solid ${color}40;transition:opacity .12s" onmouseover="this.style.opacity='.7'" onmouseout="this.style.opacity='1'">${esc(c.name)}</span>`;
  }).join('');
  setLeftBody(`
    <div style="padding:12px 0 8px;display:flex;flex-wrap:wrap;gap:6px;border-bottom:1px solid var(--line);margin-bottom:12px">
      <span style="font-size:13px;color:var(--t4);align-self:center;margin-right:4px">Klasse:</span>
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
    const ostC = {DRAFT:'st-DFT',CONFIRMED:'st-REV',DELIVERED:'st-REL',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
    const qstL = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
    const qstC = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
    const dstL = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
    const dstC = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};

    const section = (label, count) => `<div class="sep-label" style="margin-top:16px">${label}${count?` <span style="color:var(--t4);font-weight:400">(${count})</span>`:''}</div>`;
    const noHits = `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Keine Treffer für „${esc(q)}"</div></div>`;
    const total = (r.projects?.length||0)+(r.items?.length||0)+(r.datasets?.length||0)+(r.orders?.length||0)+(r.quotes?.length||0)+(r.customers?.length||0)+(r.deliveries?.length||0);

    // Sort items: prt/asm first, then doc, then by item_number
    const typeOrder = { prt: 0, asm: 1, doc: 2 };
    const sortedItems = (r.items||[]).slice().sort((a, b) =>
      (typeOrder[a.item_type] ?? 9) - (typeOrder[b.item_type] ?? 9) || a.item_number.localeCompare(b.item_number));

    const html = total ? `
      ${sortedItems.length ? section('PLM Items', sortedItems.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nummer</th><th>Name</th><th>Typ</th><th>Klasse</th><th>Projekt</th><th>Rev</th><th>Status</th></tr></thead>
        <tbody>${sortedItems.map(i=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${i.project_id},${i.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${i.item_number}</td>
          <td>${esc(i.name)}</td>
          <td style="font-family:var(--mono);font-size:11px;color:var(--t3)">${i.item_type||'—'}</td>
          <td>${i.classification ? _classChip(i.classification, 10) : '<span style="color:var(--t4)">—</span>'}</td>
          <td style="color:var(--t3)">${i.project_name}</td>
          <td style="font-family:var(--mono);font-size:13px">${i.latest_revision?.rev||'—'}</td>
          <td>${i.latest_revision?`<span class="status st-${i.latest_revision.status}">${i.latest_revision.status}</span>`:''}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.orders?.length ? section('Aufträge', r.orders.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Lieferdatum</th></tr></thead>
        <tbody>${r.orders.map(o=>`<tr style="cursor:pointer" onclick="gotoView('orders');openOrderDetail(${o.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(o.number)}</td>
          <td>${esc(o.title)}</td><td style="color:var(--t3)">${esc(o.customer_name||'—')}</td>
          <td><span class="status ${ostC[o.status]||''}">${ostL[o.status]||o.status}</span></td>
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${o.delivery_date||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.quotes?.length ? section('Angebote', r.quotes.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Gültig bis</th></tr></thead>
        <tbody>${r.quotes.map(q=>`<tr style="cursor:pointer" onclick="gotoView('quotes');openQuoteDetail(${q.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(q.number)}</td>
          <td>${esc(q.title)}</td><td style="color:var(--t3)">${esc(q.customer_name||'—')}</td>
          <td><span class="status ${qstC[q.status]||''}">${qstL[q.status]||q.status}</span></td>
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${q.valid_until||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.deliveries?.length ? section('Produktion', r.deliveries.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Datum</th></tr></thead>
        <tbody>${r.deliveries.map(d=>`<tr style="cursor:pointer" onclick="gotoView('deliveries');openDeliveryDetail(${d.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(d.number)}</td>
          <td>${esc(d.title)}</td><td style="color:var(--t3)">${esc(d.customer_name||'—')}</td>
          <td><span class="status ${dstC[d.status]||''}">${dstL[d.status]||d.status}</span></td>
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${d.delivery_date||'—'}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.customers?.length ? section('Kunden', r.customers.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Nr.</th><th>Name</th><th>E-Mail</th><th>Ort</th></tr></thead>
        <tbody>${r.customers.map(c=>`<tr style="cursor:pointer" onclick="gotoView('customers');openCustomerDetail(${c.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(c.number)}</td>
          <td>${esc(c.name)}</td><td style="color:var(--t3)">${esc(c.email||'—')}</td>
          <td style="color:var(--t3)">${esc(c.city||'—')}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.rawMaterials?.length ? section('Rohmaterial', r.rawMaterials.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Artikel-Nr.</th><th>Name</th><th>LOT</th><th style="text-align:right">Bestand</th></tr></thead>
        <tbody>${r.rawMaterials.map(m=>`<tr style="cursor:pointer" onclick="gotoView('rawmaterials');openRawMatDetail(${m.id})">
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(m.article_number||'—')}</td>
          <td>${esc(m.name)}</td>
          <td style="font-family:var(--mono);font-size:12px;color:var(--t3)">${esc(m.lot_number||'—')}</td>
          <td style="font-family:var(--mono);font-size:13px;text-align:right">${fmtN(m.stock_qty,0)} ${esc(m.unit)}</td>
        </tr>`).join('')}</tbody></table></div>` : ''}
      ${r.projects?.length ? section('Projekte', r.projects.length) + `<div class="card-grid">${r.projects.map(p=>`
        <div class="card" onclick="openProject(${p.id})"><div class="card-accent"></div>
        <div class="card-num">${p.number}</div><div class="card-name">${esc(p.name)}</div></div>`).join('')}</div>` : ''}
      ${r.datasets?.length ? section('Dateien', r.datasets.length) + `<div class="tbl-wrap"><table>
        <thead><tr><th>Datei</th><th>Item</th><th>Projekt</th><th>Rev</th><th>Grösse</th><th></th></tr></thead>
        <tbody>${r.datasets.map(d=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${d.project_id},${d.item_id})">
          <td><span style="margin-right:5px">${dsIcon(d.ds_type)}</span>${esc(d.original_name)}</td>
          <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${d.item_number}</td>
          <td style="color:var(--t3)">${d.project_name}</td>
          <td style="font-family:var(--mono);font-size:13px">${d.rev||'—'}</td>
          <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtSz(d.file_size)}</td>
          <td onclick="event.stopPropagation()"><a href="/api/datasets/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Download" download>&#x2B07;</a></td>
        </tr>`).join('')}</tbody></table></div>` : ''}
    ` : noHits;
    const resEl = document.getElementById('search-results');
    if (resEl) resEl.innerHTML = `<div style="padding-bottom:20px">${html}</div>`;
    else setLeftBody(`<div style="padding-bottom:20px">${html}</div>`);
  }, 300);
}
