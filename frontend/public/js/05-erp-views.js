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
  const mbg = m => m == null ? '' : m < 0 ? 'background:rgba(255,142,142,.06)' : m < 20 ? 'background:rgba(245,192,97,.06)' : '';

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
    th('Projekt','project') + th('Nummer','number') + th('Name / Klassifizierung','name') +
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

// ── GESCHÄFTSPARTNER ──────────────────────────────────────────
// Kunden und Lieferanten teilen sich die Darstellung: Karten oder Liste,
// Suche über mehrere Wörter, Filter, Sortierung und dasselbe Detail-Layout.
// Was je Art anders ist (Kennzahlen, Filter, Aktionen), steht in ihrer
// Konfiguration (_registerPartnerKind). Ansicht und eine selbst gewählte
// Sortierung merkt sich der Browser; ohne eigene Wahl wird nach Name sortiert.

// Initialen mit fester Farbe je Name, damit man Partner schneller wiedererkennt
const _PARTNER_HUES = ['blue', 'green', 'amber', 'purple', 'teal'];
function _avatar(name, size = 38) {
  const words = String(name || '').trim().split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w));
  const first = w => [...(w || '')][0] || '';
  const ini = (words.length > 1 ? first(words[0]) + first(words[1]) : [...(words[0] || '?')].slice(0, 2).join('')).toUpperCase();
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  const hue = _PARTNER_HUES[h % _PARTNER_HUES.length];
  const bg = hue === 'blue' ? 'var(--blue-glow)' : `var(--${hue}-soft)`;
  return `<span class="partner-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.37)}px;background:${bg};color:var(--${hue})">${esc(ini)}</span>`;
}
const _cityLine = p => [p.postal_code, p.city].filter(Boolean).join(' ');
// Strukturierte Adresse, sonst das frühere Freitextfeld
const _addrLines = p => {
  const lines = [p.street, _cityLine(p), p.country].filter(Boolean);
  return lines.length ? lines : String(p.address || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
};
const _telHref = phone => String(phone || '').replace(/[^\d+]/g, '');
const _mailLink = email => `<a href="mailto:${esc(email)}" onclick="event.stopPropagation()" title="E-Mail schreiben">✉ ${esc(email)}</a>`;
const _telLink = phone => `<a href="tel:${esc(_telHref(phone))}" onclick="event.stopPropagation()" title="Anrufen">☎ ${esc(phone)}</a>`;
const _pill = (cls, text, title) => `<span class="partner-pill ${cls}" title="${esc(title)}">${text}</span>`;

const _partner = {};   // je Art: { cfg, prefs, filter }
function _registerPartnerKind(kind, cfg) {
  const prefs = { view: 'cards', sort: 'name' };
  try {
    const saved = JSON.parse(localStorage.getItem(cfg.prefsKey) || '{}');
    if (saved.view) prefs.view = saved.view;
    if (saved.sortChosen && saved.sort) Object.assign(prefs, { sort: saved.sort, sortChosen: true });
  } catch {}
  _partner[kind] = { cfg, prefs, filter: { text: '', show: '' } };
}
function _savePartnerPrefs(kind) {
  const p = _partner[kind];
  try { localStorage.setItem(p.cfg.prefsKey, JSON.stringify(p.prefs)); } catch {}
}
function _partnerSetView(kind, view) {
  _partner[kind].prefs.view = view;
  _savePartnerPrefs(kind);
  _partner[kind].cfg.header();
  _renderPartnerRows(kind);
}
function _partnerSetSort(kind, sort) {
  Object.assign(_partner[kind].prefs, { sort, sortChosen: true });
  _savePartnerPrefs(kind);
  _renderPartnerRows(kind);
}
function _partnerSetFilter(kind, key, value) { _partner[kind].filter[key] = value; _renderPartnerRows(kind); }
function _partnerClearFilter(kind) { _partner[kind].filter = { text: '', show: '' }; _partner[kind].cfg.render(); }

function _partnerViewToggle(kind) {
  const v = _partner[kind].prefs.view;
  const seg = (key, label, title) =>
    `<button class="${v === key ? 'active' : ''}" onclick="_partnerSetView('${kind}','${key}')" title="${title}">${label}</button>`;
  return `<div class="partner-seg">${seg('cards', '▦ Karten', 'Kartenansicht')}${seg('list', '☰ Liste', 'Listenansicht')}</div>`;
}

// Suchfeld, Filter und Sortierung; die Treffer rendert _renderPartnerRows
function _partnerBody(kind) {
  const { cfg, filter, prefs } = _partner[kind];
  return `<div class="partner-toolbar">
      <input class="fi" style="flex:1;min-width:200px" placeholder="${esc(cfg.searchHint)}" value="${esc(filter.text)}"
        oninput="_partnerSetFilter('${kind}','text',this.value)">
      <select class="fs" style="width:auto" title="Filter" onchange="_partnerSetFilter('${kind}','show',this.value)">
        ${_selOpts(cfg.filters, filter.show)}</select>
      <select class="fs" style="width:auto" title="Sortierung" onchange="_partnerSetSort('${kind}',this.value)">
        ${_selOpts(cfg.sorts, prefs.sort)}</select>
    </div>
    <div class="partner-count" id="_${kind}-count"></div>
    <div id="_${kind}-rows"></div>`;
}

// Jeder Suchbegriff muss irgendwo vorkommen: "muster zürich" findet die Muster AG in Zürich
function _visiblePartners(kind) {
  const { cfg, filter, prefs } = _partner[kind];
  const terms = filter.text.toLowerCase().split(/\s+/).filter(Boolean);
  const byName = (a, b) => a.name.localeCompare(b.name, 'de-CH', { sensitivity: 'base' });
  const recent = p => p.last_activity || (p.created_at || '').slice(0, 10);
  const cmp = {
    name:   byName,
    recent: (a, b) => recent(b).localeCompare(recent(a)),
    value:  (a, b) => (cfg.value(b) || 0) - (cfg.value(a) || 0),
    number: (a, b) => String(b.number || '').localeCompare(String(a.number || ''), undefined, { numeric: true }),
  }[prefs.sort] || byName;
  return cfg.rows().filter(p => {
    const hay = cfg.searchFields(p).filter(Boolean).join(' ').toLowerCase();
    return terms.every(t => hay.includes(t)) && (!filter.show || cfg.show[filter.show](p));
  }).sort((a, b) => cmp(a, b) || byName(a, b));
}

function _renderPartnerRows(kind) {
  const { cfg, filter, prefs } = _partner[kind];
  const el = document.getElementById(`_${kind}-rows`);
  if (!el) return;
  const rows = _visiblePartners(kind);
  const total = cfg.rows().length;
  const [one, many] = cfg.noun;
  document.getElementById(`_${kind}-count`).innerHTML = (filter.text || filter.show)
    ? `${rows.length} von ${total} ${many} · <a href="#" onclick="event.preventDefault();_partnerClearFilter('${kind}')">Filter zurücksetzen</a>`
    : `${total} ${total === 1 ? one : many}`;
  el.innerHTML = !rows.length
    ? `<div class="empty" style="padding:40px 20px"><div class="empty-text">Keine Treffer</div></div>`
    : prefs.view === 'list'
      ? _partnerTable(kind, rows)
      : `<div class="partner-grid">${rows.map(p => _partnerCard(kind, p)).join('')}</div>`;
  if (!document.getElementById('detail-panel')?.classList.contains('hidden')) _markActiveRow(cfg.detailId());
}

const _partnerSub = p => `<span class="partner-num">${esc(p.number || '')}</span>${_cityLine(p) ? ' · ' + esc(_cityLine(p)) : ''}`;

function _partnerCard(kind, p) {
  const { cfg } = _partner[kind];
  const s = cfg.card(p, false);
  const open = cfg.openFn;
  return `<div class="card partner-card" data-id="${p.id}" tabindex="0" onclick="${open}(${p.id})"
      onkeydown="if(event.key==='Enter'&&event.target===this)${open}(${p.id})">
    ${s.quick ? `<button class="btn btn-ghost btn-sm partner-quick" title="${esc(s.quick.title)}"
      onclick="event.stopPropagation();${s.quick.onclick}">${s.quick.label}</button>` : ''}
    <div class="partner-head">
      ${_avatar(p.name)}
      <div style="min-width:0">
        <div class="partner-name" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="partner-sub">${_partnerSub(p)}</div>
      </div>
    </div>
    ${s.contact.length ? `<div class="partner-contact">${s.contact.join('')}</div>` : `<div class="partner-contact partner-muted">Keine Kontaktdaten</div>`}
    ${s.pills ? `<div class="partner-pills">${s.pills}</div>` : ''}
    <div class="partner-foot">
      <span class="partner-muted">${s.meta}</span>
      ${s.value > 0 ? `<span class="partner-value" title="${esc(cfg.valueTitle)}">${fmtCHF(s.value)}</span>` : ''}
    </div>
  </div>`;
}

function _partnerTable(kind, rows) {
  const { cfg } = _partner[kind];
  return `<div class="tbl-wrap"><table class="partner-table">
    <thead><tr><th>${cfg.noun[0]}</th><th>Kontakt</th><th>Offen</th><th style="text-align:right">${cfg.valueLabel}</th></tr></thead>
    <tbody>${rows.map(p => {
      const s = cfg.card(p, true);
      return `<tr data-id="${p.id}" onclick="${cfg.openFn}(${p.id})">
      <td><div class="partner-head" style="max-width:240px">${_avatar(p.name, 28)}
        <div style="min-width:0"><div class="partner-name" style="font-size:13px;font-weight:500" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="partner-sub">${_partnerSub(p)}</div></div></div></td>
      <td><div class="partner-contact" style="max-width:180px">${s.contact.join('') || '<span class="partner-muted">—</span>'}</div></td>
      <td><div class="partner-pills" style="flex-wrap:nowrap">${s.pills || '<span class="partner-muted">—</span>'}</div></td>
      <td style="text-align:right;white-space:nowrap;font-family:var(--mono)">
        <div style="color:${s.value > 0 ? 'var(--green)' : 'var(--t4)'}">${s.value > 0 ? fmtCHF(s.value) : '—'}</div>
        ${p.last_activity ? `<div style="font-size:12px;color:var(--t3);margin-top:2px">${fmtD(p.last_activity)}</div>` : ''}</td>
    </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ── Detail-Bausteine ──
const _partnerTitle = p => `${_avatar(p.name, 26)} <strong>${esc(p.name)}</strong>
  <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(p.number || '')}</span>`;
const _partnerTabCount = n => ` <span class="chip" style="margin-left:5px">${n}</span>`;
const _partnerList = rows => `<div class="partner-list">${rows.join('')}</div>`;
const _partnerEmpty = msg => `<div class="partner-muted" style="font-size:13px;padding:10px 2px">${msg}</div>`;
const _partnerKpis = kpis => `<div class="partner-kpis">${kpis.map(([label, val, sub, color]) => `<div class="partner-kpi">
    <div class="ps-label">${label}</div>
    <div class="partner-kpi-val"${color ? ` style="color:${color}"` : ''}>${val}</div>
    ${sub ? `<div class="partner-kpi-sub">${sub}</div>` : ''}
  </div>`).join('')}</div>`;

function _partnerDocRow(onclick, badge, title, meta, total, count) {
  return `<div class="partner-row" onclick="${onclick}">
    ${badge}
    <div style="min-width:0">
      <div class="partner-row-title">${esc(title)}</div>
      <div class="partner-row-meta">${meta}</div>
    </div>
    <div style="text-align:right">
      <div style="font-family:var(--mono);font-size:13px">${total}</div>
      <div class="partner-row-meta">${count} Pos.</div>
    </div>
  </div>`;
}

// Belege nach Phase gruppiert; was in keine Gruppe passt, landet unter "Sonstige"
function _partnerGroups(groups, docs, rowFn) {
  const others = docs.filter(d => !groups.some(([, s]) => s.includes(d.status)));
  return [...groups.map(([label, sts]) => [label, docs.filter(d => sts.includes(d.status))]), ['Sonstige', others]]
    .filter(([, rows]) => rows.length)
    .map(([label, rows]) => `<div class="sep-label">${label} · ${rows.length}</div>${_partnerList(rows.map(rowFn))}`)
    .join('');
}

// Adresse (mit Kopieren), Kontakt und Notizen; extra = weitere Felder vor E-Mail
function _partnerInfo(p, copyCall, extra = []) {
  const addr = _addrLines(p);
  const field = (label, html, first) => `<div class="ps-label"${first ? '' : ' style="margin-top:10px"'}>${label}</div><div class="ps-val">${html}</div>`;
  const dash = '<span class="partner-muted">—</span>';
  const contact = [...extra,
    ['E-Mail', p.email ? `<a href="mailto:${esc(p.email)}" style="color:var(--blue)">${esc(p.email)}</a>` : dash],
    ['Telefon', p.phone ? `<a href="tel:${esc(_telHref(p.phone))}" style="color:var(--blue)">${esc(p.phone)}</a>` : dash]];
  return `<div class="partner-info">
    <div>
      <div class="ps-label">Adresse</div>
      ${addr.length
        ? `<div class="ps-val" style="line-height:1.5">${addr.map(esc).join('<br>')}</div>
           <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="${copyCall}">⧉ Adresse kopieren</button>`
        : `<div class="partner-muted">—</div>`}
    </div>
    <div>${contact.map(([l, h], i) => field(l, h, i === 0)).join('')}</div>
    ${p.notes ? `<div style="grid-column:span 2"><div class="ps-label">Notizen</div>
      <div class="ps-val" style="white-space:pre-wrap;color:var(--t2);font-weight:400">${esc(p.notes)}</div></div>` : ''}
  </div>`;
}
const _partnerAddressText = p => [p.name, ..._addrLines(p)].join('\n');

// ── CUSTOMERS ─────────────────────────────────────────────────
_registerPartnerKind('customer', {
  prefsKey: 'plm_customer_view',
  noun: ['Kunde', 'Kunden'],
  rows: () => state.customers || [],
  detailId: () => state.customerDetailId,
  openFn: 'openCustomerDetail',
  render: () => renderCustomers(),
  header: () => setLeftHeader('Kunden', _customerHeaderActions()),
  searchHint: 'Suchen nach Name, Ort, E-Mail, Telefon…',
  searchFields: c => [c.name, c.number, c.email, c.phone, c.street, c.postal_code, c.city, c.country, c.notes],
  filters: [['', 'Alle Kunden'], ['open', 'Mit offenen Vorgängen'], ['none', 'Ohne Aufträge']],
  show: { open: c => (c.open_order_count + c.open_quote_count) > 0, none: c => !c.order_count },
  sorts: [['name', 'Name A–Z'], ['recent', 'Zuletzt aktiv'], ['value', 'Umsatz'], ['number', 'Nummer']],
  value: c => c.revenue,
  valueLabel: 'Umsatz',
  valueTitle: 'Umsatz aus bestätigten, gelieferten und fakturierten Aufträgen',
  card: (c, short) => {
    const open = c.open_order_count || 0, quotes = c.open_quote_count || 0;
    return {
      contact: [c.email && _mailLink(c.email), c.phone && _telLink(c.phone)].filter(Boolean),
      pills: (open ? _pill('amber', short ? open : `${open} ${open === 1 ? 'offener Auftrag' : 'offene Aufträge'}`,
                'Offene Aufträge (Entwurf, bestätigt, geliefert)') : '')
           + (quotes ? _pill('blue', short ? `${quotes} Ang.` : `${quotes} ${quotes === 1 ? 'Angebot' : 'Angebote'} offen`,
                'Offene Angebote') : ''),
      meta: c.order_count
        ? `${c.order_count} Auftr${c.order_count === 1 ? 'ag' : 'äge'}${c.last_activity ? ' · zuletzt ' + fmtD(c.last_activity) : ''}`
        : 'Noch keine Aufträge',
      value: c.revenue,
      quick: { label: '+ Auftrag', title: 'Neuen Auftrag für diesen Kunden anlegen', onclick: `openOrderModal(null,{customerId:${c.id}})` },
    };
  },
});

function _customerHeaderActions() {
  return `<div style="display:flex;gap:8px;align-items:center">
    ${_partnerViewToggle('customer')}
    <button class="btn btn-primary btn-sm" onclick="openCustomerModal()">+ Kunde</button>
  </div>`;
}

async function renderCustomers() {
  _partner.customer.cfg.header();
  state.customers = await api('/api/customers');
  if (!state.customers.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">👤</div><div class="empty-text">Noch keine Kunden</div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openCustomerModal()">+ Ersten Kunden anlegen</button></div>`);
    return;
  }
  setLeftBody(_partnerBody('customer'));
  _renderPartnerRows('customer');
}

// Auftragsphasen in der Reihenfolge des Ablaufs; Angebote sind die erste Phase
const _CUST_ORDER_GROUPS = [
  ['Angebote', ['QUOTE']],
  ['In Arbeit', ['DRAFT', 'CONFIRMED']],
  ['Geliefert, noch nicht fakturiert', ['DELIVERED']],
  ['Fakturiert', ['INVOICED']],
  ['Abgelehnt / Storniert', ['DECLINED', 'CANCELLED']],
];
const _CUST_OPEN_STATUSES = ['QUOTE', 'DRAFT', 'CONFIRMED', 'DELIVERED'];

// Aus dem Kunden direkt in den Beleg springen, nicht nur in die Liste
async function _openFromCustomer(view, id) {
  await gotoView(view);
  if (view === 'orders') openOrderDetail(id); else openDeliveryDetail(id);
}

function _custOrderRow(o) {
  const today = new Date().toISOString().slice(0, 10);
  const validity = o.status === 'QUOTE' && o.valid_until
    ? (o.valid_until < today ? `<span style="color:var(--red)">abgelaufen ${fmtD(o.valid_until)}</span>` : 'gültig bis ' + fmtD(o.valid_until))
    : '';
  const meta = [esc(o.number), o.order_date ? fmtD(o.order_date) : '', validity,
    o.status !== 'QUOTE' && o.delivery_date ? '📅 ' + fmtD(o.delivery_date) : ''].filter(Boolean).join(' · ');
  return _partnerDocRow(`_openFromCustomer('orders',${o.id})`, stBadge('order', o.status), o.title, meta, fmtCHF(o.total || 0), o.item_count);
}
function _custDeliveryRow(d) {
  const meta = [esc(d.number), d.order_number ? 'Auftrag ' + esc(d.order_number) : '',
    d.delivery_date ? fmtD(d.delivery_date) : ''].filter(Boolean).join(' · ');
  return _partnerDocRow(`_openFromCustomer('deliveries',${d.id})`, stBadge('delivery', d.status), d.title, meta,
    d.total != null ? fmtCHF(d.total) : '—', d.item_count);
}

async function _copyCustomerAddress(id) {
  const c = (state.customers || []).find(x => x.id === id) || await api(`/api/customers/${id}`);
  copyText(_partnerAddressText(c), 'Adresse kopiert');
}

async function openCustomerDetail(id) {
  const c = await api(`/api/customers/${id}`);
  state.customerDetailId = c.id;
  _trackRecent('customer', c.id, c.name, c.number);
  _pushHistory({ view: 'customers', detailType: 'customer', detailId: c.id });

  const openOrders = c.orders.filter(o => _CUST_OPEN_STATUSES.includes(o.status));
  const nQuotes = openOrders.filter(o => o.status === 'QUOTE').length;
  const nOpen = openOrders.length - nQuotes;
  const lastDate = c.orders.map(o => o.order_date || (o.created_at || '').slice(0, 10)).sort().pop();

  document.getElementById('dp-title').innerHTML = _partnerTitle(c);
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'cd-overview')">Übersicht</button>
    <button class="tab" onclick="switchTab(this,'cd-orders')">Aufträge${_partnerTabCount(c.orders.length)}</button>
    <button class="tab" onclick="switchTab(this,'cd-deliveries')">Produktion${_partnerTabCount(c.deliveries.length)}</button>`;

  document.getElementById('dp-body').innerHTML = `
    <div id="cd-overview">
      <div class="partner-actions">
        <button class="btn btn-primary btn-sm" onclick="openOrderModal(null,{customerId:${c.id}})">+ Auftrag</button>
        <button class="btn btn-ghost btn-sm" onclick="openOrderModal(null,{customerId:${c.id},status:'QUOTE'})">+ Angebot</button>
        <span style="flex:1"></span>
        <button class="btn btn-ghost btn-sm" onclick="openCustomerModal(${c.id})">✏️ Bearbeiten</button>
        <button class="btn btn-red btn-sm" onclick="delCustomer(${c.id})">🗑 Löschen</button>
      </div>
      ${_partnerKpis([
        ['Umsatz', c.revenue > 0 ? fmtCHF(c.revenue) : '—', 'bestätigt bis fakturiert', c.revenue > 0 ? 'var(--green)' : ''],
        ['Offene Aufträge', nOpen, '', nOpen ? 'var(--amber)' : ''],
        ['Offene Angebote', nQuotes, '', nQuotes ? 'var(--blue)' : ''],
        ['Letzter Auftrag', lastDate ? fmtD(lastDate) : '—', c.created_at ? 'Kunde seit ' + fmtD(c.created_at) : ''],
      ])}
      ${_partnerInfo(c, `_copyCustomerAddress(${c.id})`)}
      <div class="sep-label">Offene Vorgänge</div>
      ${openOrders.length ? _partnerList(openOrders.map(_custOrderRow))
        : _partnerEmpty(c.orders.length ? 'Nichts offen — alle Aufträge sind abgeschlossen.' : 'Noch keine Aufträge für diesen Kunden.')}
    </div>
    <div id="cd-orders" style="display:none">
      ${c.orders.length ? `<div class="partner-sum"><span>${c.orders.length} Aufträge und Angebote</span>
        <span>Umsatz <b style="font-family:var(--mono);color:var(--t1)">${fmtCHF(c.revenue || 0)}</b></span></div>
        ${_partnerGroups(_CUST_ORDER_GROUPS, c.orders, _custOrderRow)}`
        : _partnerEmpty('Noch keine Aufträge für diesen Kunden.')}
    </div>
    <div id="cd-deliveries" style="display:none">
      ${c.deliveries.length ? _partnerList(c.deliveries.map(_custDeliveryRow)) : _partnerEmpty('Keine Produktionsaufträge')}
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
    <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(o.order_date)}</td>
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
            <div style="font-size:13px;color:var(--t3)">${fmtD(e.date,'')}</div></td>
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
  state.orderDetailId = o.id;
  _trackRecent('order', o.id, o.title, o.number);
  _pushHistory({ view: 'orders', detailType: 'order', detailId: o.id });
  document.getElementById('dp-title').innerHTML = `<strong>${o.number}</strong>&nbsp;${esc(o.title)}`
    + (o.status === 'QUOTE' ? ` <span class="chip" style="margin-left:6px">Angebot${
        o.valid_until ? ' · gültig bis ' + fmtD(o.valid_until) : ''}</span>` : '')
    + (o.origin_quote_number && o.origin_quote_number !== o.number
        ? ` <span class="chip" style="margin-left:4px" title="Ursprüngliche Angebotsnummer">${esc(o.origin_quote_number)}</span>` : '');
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'od-pos')">Positionen</button>
    <button class="tab" onclick="switchTab(this,'od-fert');loadOrderProduction(${id})">Produktion${
      (o.deliveries||[]).length ? ` <span class="chip" style="margin-left:5px">${o.deliveries.length}</span>` : ''}</button>
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
        <span style="font-size:13px;padding:1px 7px;border-radius:10px;background:${o.include_hours?'rgba(110,222,156,.12)':'var(--bg2)'};color:${o.include_hours?'var(--green)':'var(--t3)'}">${o.include_hours?'eingerechnet':'nicht eingerechnet'}</span>
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
    <div id="od-fert" style="display:none">
      <div id="od-fert-body"><div style="color:var(--t3);font-size:13px;padding:8px 0">Wird geladen…</div></div>
    </div>
    <div id="od-info" style="display:none">
      <div class="sep-label">Auftragsdaten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:12px">
        <div><div class="ps-label">Status</div>${_stSel('order',id,o.status)}</div>
        <div><div class="ps-label">Kunde</div>${o.customer_name||'—'}</div>
        <div><div class="ps-label">Datum</div>${fmtD(o.order_date)}</div>
        <div><div class="ps-label">Lieferdatum</div><span id="od-delivery-date">${fmtD(o.delivery_date)}</span></div>
        <div><div class="ps-label">MwSt.</div>${o.tax_rate??0} % ${o.include_tax?'<span style="color:var(--green);font-size:13px">(ausgewiesen)</span>':'<span style="color:var(--t3);font-size:13px">(ohne)</span>'}</div>
        ${estHours>0?`<div><div class="ps-label">Arbeitszeit</div>${fmtN(estHours,2)} h × ${fmtCHF(hourlyRate)}/h = <span style="font-family:var(--mono);color:${o.include_hours?'var(--green)':'var(--t3)'}">${fmtCHF(hoursCost)}</span>${o.include_hours?' <span style="color:var(--green);font-size:13px">(eingerechnet)</span>':' <span style="color:var(--t3);font-size:13px">(nicht eingerechnet)</span>'}</div>`:''}
        ${(o.discount_pct||0)>0?`<div><div class="ps-label">Gesamtrabatt</div>${o.discount_pct} %</div>`:''}
        ${o.payment_terms?`<div style="grid-column:span 2"><div class="ps-label">Zahlungsbedingungen</div>${esc(o.payment_terms)}</div>`:''}
        ${o.notes?`<div style="grid-column:span 2"><div class="ps-label">Notizen</div><span style="color:var(--t2)">${esc(o.notes)}</span></div>`:''}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openOrderModal(${id})">✏️ Bearbeiten</button>
        ${o.status === 'QUOTE'
          ? `<button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'order-quote')">&#128196; Angebot PDF</button>`
          : `<button class="btn btn-ghost btn-sm" onclick="generateDoc(${id},'invoice')">&#128196; Rechnung PDF</button>`}
        <button class="btn btn-ghost btn-sm" onclick="cloneOrder(${id})">⧉ Dublizieren</button>
        ${o.status === 'QUOTE'
          ? `<button class="btn btn-primary btn-sm" onclick="acceptQuotePhase(${id})">✓ Angebot angenommen</button>
             <button class="btn btn-ghost btn-sm" onclick="declineQuotePhase(${id})">Abgelehnt</button>`
          : `<button class="btn btn-primary btn-sm" onclick="orderToDelivery(${id})">🔧 Produktionsauftrag anlegen</button>`}
        ${(o.status==='DRAFT'||o.status==='QUOTE'||o.status==='DECLINED') ? `<button class="btn btn-red btn-sm" onclick="delOrder(${id})">🗑 Löschen</button>` : ''}
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
    <div class="modal-head"><div class="modal-title">Produktionsauftrag anlegen</div>
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
  toast(`Produktionsauftrag ${d.number} angelegt`, 'ok');
  // Wurde die Fertigung aus dem Auftrag heraus gestartet, dort bleiben —
  // der Wechsel in die Produktionsliste war genau der stoerende Schritt.
  _fertLos[orderId] = d.id;
  if (refreshOrderProductionIfOpen()) return;
  await renderDeliveries();
  openDeliveryDetail(d.id);
}


// ── ANGEBOTSPHASE ─────────────────────────────────────────────
// Ein Angebot ist die erste Phase eines Auftrags. Angenommen heisst: weiter
// zu "Bestätigt" — ohne neuen Datensatz und ohne Nummernwechsel.
async function acceptQuotePhase(orderId) {
  try {
    await api(`/api/orders/${orderId}/status`, 'PUT', { status: 'CONFIRMED' });
    toast('Angebot angenommen', 'ok');
    const rec = (state.orders||[]).find(x => x.id === orderId);
    if (rec) rec.status = 'CONFIRMED';
    await renderOrders();
    openOrderDetail(orderId);
    loadStats();
  } catch { toast('Status konnte nicht gesetzt werden', 'err'); }
}

async function declineQuotePhase(orderId) {
  try {
    await api(`/api/orders/${orderId}/status`, 'PUT', { status: 'DECLINED' });
    toast('Als abgelehnt markiert', 'ok');
    const rec = (state.orders||[]).find(x => x.id === orderId);
    if (rec) rec.status = 'DECLINED';
    await renderOrders();
    openOrderDetail(orderId);
    loadStats();
  } catch { toast('Status konnte nicht gesetzt werden', 'err'); }
}

// ── PRODUKTION IM AUFTRAG ─────────────────────────────────────
// Der Produktionsauftrag bleibt ein eigener Datensatz (Belege und Historie
// laufen weiter), wird aber hier bearbeitet. Kein Wechsel in die
// Produktionsliste mehr. Mehrere Produktionsaufträge (Teillieferungen)
// erscheinen als Unterreiter.
let _fertLos = {};   // orderId -> gewähltes Los

async function loadOrderProduction(orderId, losId) {
  const host = document.getElementById('od-fert-body');
  if (!host) return;
  let o;
  try { o = await api(`/api/orders/${orderId}`); }
  catch { host.innerHTML = '<div style="color:var(--red);font-size:13px">Konnte nicht geladen werden.</div>'; return; }

  const lose = o.deliveries || [];
  // Zaehler im Reiter nachfuehren — so bleibt der Tab aktiv und die Seite
  // muss nicht neu aufgebaut werden.
  const tabBtn = document.querySelector('#dp-tabs button[onclick*="od-fert"]');
  if (tabBtn) tabBtn.innerHTML = 'Produktion'
    + (lose.length ? ` <span class="chip" style="margin-left:5px">${lose.length}</span>` : '');

  if (!lose.length) {
    host.innerHTML = `<div class="empty" style="padding:28px 16px">
      <div class="empty-text">Noch kein Produktionsauftrag</div>
      <div style="font-size:13px;color:var(--t3);margin:6px 0 14px">
        Die Positionen des Auftrags werden übernommen. Der Auftrag wird dabei bestätigt.
      </div>
      <button class="btn btn-primary btn-sm" onclick="orderToDelivery(${orderId})">🔧 Produktion starten</button>
    </div>`;
    return;
  }

  const current = lose.find(l => l.id === (losId || _fertLos[orderId])) || lose[0];
  _fertLos[orderId] = current.id;
  const d = await api(`/api/deliveries/${current.id}`).catch(() => null);
  if (!d) { host.innerHTML = '<div style="color:var(--red);font-size:13px">Produktionsauftrag konnte nicht geladen werden.</div>'; return; }

  const losTabs = lose.length > 1 ? `
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px">
      ${lose.map(l => `<button class="btn btn-sm ${l.id === current.id ? 'btn-primary' : 'btn-ghost'}"
        onclick="loadOrderProduction(${orderId},${l.id})">${esc(l.number)}
        <span style="opacity:.7;margin-left:4px">${l.item_count || 0}</span></button>`).join('')}
      <button class="btn btn-ghost btn-sm" onclick="orderToDelivery(${orderId})" title="Weiterer Produktionsauftrag (Teillieferung)">＋</button>
    </div>` : '';

  host.innerHTML = `
    ${losTabs}
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 11px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:12px">
      <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(d.number)}</span>
      ${_stSel('delivery', d.id, d.status)}
      ${d.delivery_date ? `<span style="font-size:13px;color:var(--t3)">Liefertermin ${fmtD(d.delivery_date)}</span>` : ''}
      ${d.material_consumed ? '<span class="chip" style="color:var(--green);border-color:var(--green-line)">Material abgebucht</span>' : ''}
      <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="generateDeliveryDoc(${d.id})">&#128196; Lieferschein</button>
        <button class="btn btn-ghost btn-sm" onclick="openDeliveryModal(${d.id})">✏️ Kopfdaten</button>
        ${lose.length === 1 ? `<button class="btn btn-ghost btn-sm" onclick="orderToDelivery(${orderId})" title="Weiterer Produktionsauftrag (Teillieferung)">＋ Produktionsauftrag</button>` : ''}
      </div>
    </div>
    <div id="dd-pos">
      ${renderDeliveryItems(d.items || [], d.id, d.status === 'DELIVERED')}
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="openDeliveryItemModal(${d.id})">+ Position</button>
    </div>`;
}

// Nach Änderungen an einem Los den Tab neu zeichnen, falls er offen ist.
function refreshOrderProductionIfOpen() {
  const pane = document.getElementById('od-fert');
  if (!pane || pane.style.display === 'none') return false;
  const id = state.orderDetailId;
  if (!id) return false;
  loadOrderProduction(id);
  return true;
}

// ── SUCHE ─────────────────────────────────────────────────────
// Die Klassifizierung ist ein echter Filter: ein Klick auf einen Chip zeigt
// nur Items dieser Klassifizierung (auch ohne Suchwort), ein zweiter Klick hebt
// ihn auf. Die Zahl am Chip gilt für das aktuelle Suchwort. Mehrere Wörter
// müssen alle vorkommen („Halter PETG").
let _searchClass = '';
let searchTimer;
let _searchSeq = 0;

function renderSearchView() {
  setLeftHeader('Suche', '');
  setLeftBody(`
    <div id="search-chips" style="padding:12px 0 8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-bottom:1px solid var(--line);margin-bottom:12px"></div>
    <div id="search-results"><div style="padding:20px;text-align:center;color:var(--t3)">Suchbegriff oben eingeben oder eine Klassifizierung wählen …</div></div>`);
  _runSearch(document.getElementById('globalSearch')?.value || '');
}

function onSearch(q) {
  clearTimeout(searchTimer);
  if ((!q || q.length < 2) && !_searchClass) return;
  searchTimer = setTimeout(() => _showSearch(q), 300);
}
function _showSearch(q) {
  if (state.view !== 'search') {
    state.view = 'search';
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('ni-search')?.classList.add('active');
    renderSearchView();
    return;
  }
  _runSearch(q);
}

// Enter — auch vom Barcode-Scanner, der nach dem QR-Inhalt Enter schickt:
// ein Kurzcode-Treffer öffnet Teil und Revision direkt, sonst normale Suche.
async function onSearchEnter(q) {
  q = String(q || '').trim();
  clearTimeout(searchTimer);
  if (q.length < 2) return;
  let r;
  try { r = await api('/api/search?' + new URLSearchParams({ q })); } catch { return; }
  if (r.code_match) _openCodeMatch(r.code_match);
  else _showSearch(q);
}
let _lastCodeMatch = null;
async function _openCodeMatch(m) {
  if (!m) return;
  if (m.rev_requested && !m.revision) toast(`Revision ${m.rev_requested} gibt es bei ${m.item.item_number} nicht`, 'err');
  await openProjectAndItem(m.item.project_id, m.item.id, m.revision?.id);
}

// Treffer über Kurzcode oder Etiketten-QR: oben als eigene Karte
function _renderCodeMatch(m) {
  if (!m) return '';
  _lastCodeMatch = m;
  const it = m.item, rev = m.revision, latest = m.latest_revision;
  const shown = it.short_code + (m.rev_requested ? '-' + (rev?.rev || m.rev_requested) : '');
  const note = m.rev_requested && !rev
    ? `<span style="color:var(--red)">Revision ${esc(m.rev_requested)} gibt es nicht${latest ? ' — neueste ist rev' + esc(latest.rev) : ''}</span>`
    : rev && latest && latest.id !== rev.id
      ? `<span style="color:var(--amber)">Neuere Revision vorhanden: rev${esc(latest.rev)}</span>`
      : rev ? '<span style="color:var(--green)">Aktueller Stand</span>' : '';
  const revBadge = r => r ? `<span class="status st-${r.status}" title="${esc(PLM_ST_LABEL[r.status] || '')}">rev${esc(r.rev)} · ${r.status}</span>` : '';
  return `<div class="sep-label" style="margin-top:4px">Kurzcode-Treffer</div>
    <div class="code-hit" onclick="_openCodeMatch(_lastCodeMatch)" title="Öffnen (Enter)">
      <div class="print-code-val">${esc(shown)}</div>
      <div style="min-width:0;flex:1">
        <div style="font-weight:600">${esc(it.name)}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">
          <span style="font-family:var(--mono);color:var(--blue)">${esc(it.item_number)}</span> · ${esc(it.project_name || '')}</div>
        <div style="font-size:12px;margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">${revBadge(rev || latest)} ${note}</div>
      </div>
      <span class="chip" style="flex-shrink:0">Öffnen ↵</span>
    </div>`;
}

function setSearchClass(name) {
  _searchClass = _searchClass.toLowerCase() === String(name).toLowerCase() ? '' : name;
  if (state.view !== 'search') { gotoView('search'); return; }
  _runSearch(document.getElementById('globalSearch')?.value || '');
}

function _renderSearchChips(counts) {
  const el = document.getElementById('search-chips');
  if (!el) return;
  const countOf = new Map((counts || []).map(c => [String(c.name || '').toLowerCase(), c.count]));
  const list = getClassifications();
  const known = new Set(list.map(c => c.name.toLowerCase()));
  const orphans = (counts || []).filter(c => c.name && !known.has(c.name.toLowerCase()));
  const chip = (value, label, color, count, title, dashed) => {
    const active = !!_searchClass && _searchClass.toLowerCase() === value.toLowerCase();
    return `<button type="button" data-cls="${esc(value)}" onclick="setSearchClass(this.dataset.cls)" title="${esc(title)}"
      style="font-family:var(--mono);font-size:11px;padding:3px 9px;border-radius:12px;cursor:pointer;transition:opacity .12s;
        background:${active ? color : color + '20'};color:${active ? 'var(--bg0)' : color};
        border:1px ${dashed ? 'dashed' : 'solid'} ${color}66;opacity:${count || active ? 1 : .45}">
      ${esc(label)} <span style="opacity:.75">${count || 0}</span></button>`;
  };
  el.innerHTML = `<span style="font-size:13px;color:var(--t4);margin-right:4px">Klassifizierung:</span>`
    + list.map(c => chip(c.name, c.name, c.color || '#9aa3b2', countOf.get(c.name.toLowerCase()),
        _searchClass.toLowerCase() === c.name.toLowerCase() ? 'Filter aufheben' : `Nur Items mit „${c.name}"`)).join('')
    + orphans.map(c => chip(c.name, c.name, '#9aa3b2', c.count,
        `„${c.name}" steht nicht in der Liste (Einstellungen → PLM)`, true)).join('')
    + chip('__none__', 'ohne', '#737b8a', countOf.get(''), 'Items ohne Klassifizierung', true)
    + (_searchClass ? `<button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="setSearchClass(_searchClass)">✕ Filter aufheben</button>` : '');
}

async function _runSearch(q) {
  q = String(q || '').trim();
  const seq = ++_searchSeq;
  const resEl = document.getElementById('search-results');
  const params = new URLSearchParams({ q });
  if (_searchClass) params.set('class', _searchClass);
  let r;
  try { r = await api('/api/search?' + params); } catch { return; }
  if (seq !== _searchSeq) return;   // eine neuere Suche läuft schon
  _renderSearchChips(r.class_counts);
  if (!resEl) return;
  if (!_searchClass && q.length < 2) {
    resEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--t3)">Suchbegriff oben eingeben oder eine Klassifizierung wählen …</div>';
    return;
  }
  resEl.innerHTML = `<div style="padding-bottom:20px">${_renderSearchResults(r, q)}</div>`;
}

function _renderSearchResults(r, q) {
  const fmtSz = b => !b?'—':b<1024?b+'B':b<1048576?(b/1024).toFixed(0)+'KB':(b/1048576).toFixed(1)+'MB';
  const dsIcon = t => ({CAD:'📐',GCODE:'⚙',PDF:'📕',IMAGE:'🖼',DOC:'📄'}[t]||'📎');
  const section = (label, count, total) => `<div class="sep-label" style="margin-top:16px">${label}${count ? ` <span style="color:var(--t4);font-weight:400">(${total && total > count ? count + ' von ' + total : count})</span>` : ''}</div>`;
  const filterLabel = _searchClass === '__none__' ? 'ohne Klassifizierung' : `Klassifizierung „${esc(_searchClass)}"`;
  const noHits = `<div class="empty"><div class="empty-icon">🔍</div><div class="empty-text">Keine Treffer${q ? ` für „${esc(q)}"` : ''}${_searchClass ? ' mit ' + filterLabel : ''}</div></div>`;
  const total = ['projects','items','datasets','orders','customers','deliveries','rawMaterials'].reduce((n, k) => n + (r[k]?.length || 0), 0);
  const codeHit = _searchClass ? '' : _renderCodeMatch(r.code_match);
  if (!total) return codeHit || noHits;

  // Bauteile und Baugruppen vor Dokumenten, innerhalb davon nach Relevanz (Serverreihenfolge)
  const typeOrder = { prt: 0, asm: 0, doc: 1 };
  const items = (r.items || []).map((x, i) => ({ ...x, _i: i }))
    .sort((a, b) => (typeOrder[a.item_type] ?? 9) - (typeOrder[b.item_type] ?? 9) || a._i - b._i);

  return `${codeHit}
    ${_searchClass ? `<div style="font-size:13px;color:var(--t3);margin-bottom:4px">Gefiltert nach ${filterLabel}${q ? ` · Suchwort „${esc(q)}"` : ''}</div>` : ''}
    ${items.length ? section('Items', items.length, r.items_total) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Nummer</th><th>Name</th><th>Typ</th><th>Klassifizierung</th><th>Projekt</th><th>Revision</th><th>Status</th></tr></thead>
      <tbody>${items.map(i=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${i.project_id},${i.id})">
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}${i.short_code && i.item_type !== 'doc' ? ` <span class="chip" title="Kurzcode">${esc(i.short_code)}</span>` : ''}</td>
        <td>${esc(i.name)}</td>
        <td style="font-family:var(--mono);font-size:11px;color:var(--t3)">${(i.item_type||'—').toUpperCase()}</td>
        <td>${i.classification ? _classChip(i.classification, 10) : '<span style="color:var(--t4)">—</span>'}</td>
        <td style="color:var(--t3)">${esc(i.project_name)}</td>
        <td style="font-family:var(--mono);font-size:13px">${i.latest_revision ? 'rev' + esc(i.latest_revision.rev) : '—'}</td>
        <td>${i.latest_revision?`<span class="status st-${i.latest_revision.status}" title="${esc(PLM_ST_LABEL[i.latest_revision.status]||'')}">${i.latest_revision.status}</span>`:''}</td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    ${r.orders?.length ? section('Aufträge und Angebote', r.orders.length) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Datum</th></tr></thead>
      <tbody>${r.orders.map(o=>`<tr style="cursor:pointer" onclick="gotoView('orders');openOrderDetail(${o.id})">
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(o.number)}</td>
        <td>${esc(o.title)}</td><td style="color:var(--t3)">${esc(o.customer_name||'—')}</td>
        <td>${stBadge('order', o.status)}</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--t3)" title="${o.status === 'QUOTE' ? 'gültig bis' : 'Liefertermin'}">${fmtD(o.status === 'QUOTE' ? o.valid_until : o.delivery_date)}</td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    ${r.deliveries?.length ? section('Produktionsaufträge', r.deliveries.length) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Nr.</th><th>Bezeichnung</th><th>Kunde</th><th>Status</th><th>Lieferdatum</th></tr></thead>
      <tbody>${r.deliveries.map(d=>`<tr style="cursor:pointer" onclick="${d.order_id ? `openOrderFromProduction(${d.order_id})` : `gotoView('deliveries');openDeliveryDetail(${d.id})`}">
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(d.number)}</td>
        <td>${esc(d.title)}</td><td style="color:var(--t3)">${esc(d.customer_name||'—')}</td>
        <td>${stBadge('delivery', d.status)}</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(d.delivery_date)}</td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    ${r.customers?.length ? section('Kunden', r.customers.length) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Nr.</th><th>Name</th><th>E-Mail</th><th>Ort</th></tr></thead>
      <tbody>${r.customers.map(c=>`<tr style="cursor:pointer" onclick="gotoView('customers');openCustomerDetail(${c.id})">
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(c.number)}</td>
        <td>${esc(c.name)}</td><td style="color:var(--t3)">${esc(c.email||'—')}</td>
        <td style="color:var(--t3)">${esc(c.city||'—')}</td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    ${r.rawMaterials?.length ? section('Rohmaterial', r.rawMaterials.length) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Artikel-Nr.</th><th>Name</th><th>Lot</th><th style="text-align:right">Bestand</th></tr></thead>
      <tbody>${r.rawMaterials.map(m=>`<tr style="cursor:pointer" onclick="gotoView('rawmaterials');openRawMatDetail(${m.id})">
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(m.article_number||'—')}</td>
        <td>${esc(m.name)}</td>
        <td style="font-family:var(--mono);font-size:12px;color:var(--t3)">${esc(m.lot_number||'—')}</td>
        <td style="font-family:var(--mono);font-size:13px;text-align:right">${fmtN(m.stock_qty,0)} ${esc(m.unit)}</td>
      </tr>`).join('')}</tbody></table></div>` : ''}
    ${r.projects?.length ? section('Projekte', r.projects.length) + `<div class="card-grid">${r.projects.map(p=>`
      <div class="card" onclick="openProject(${p.id})"><div class="card-accent"></div>
      <div class="card-num">${esc(p.number)}</div><div class="card-name">${esc(p.name)}</div></div>`).join('')}</div>` : ''}
    ${r.datasets?.length ? section('Dateien', r.datasets.length) + `<div class="tbl-wrap"><table>
      <thead><tr><th>Datei</th><th>Item</th><th>Projekt</th><th>Revision</th><th>Grösse</th><th></th></tr></thead>
      <tbody>${r.datasets.map(d=>`<tr style="cursor:pointer" onclick="openProjectAndItem(${d.project_id},${d.item_id})">
        <td><span style="margin-right:5px">${dsIcon(d.ds_type)}</span>${esc(d.original_name)}</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(d.item_number)}</td>
        <td style="color:var(--t3)">${esc(d.project_name)}</td>
        <td style="font-family:var(--mono);font-size:13px">${d.rev ? 'rev' + esc(d.rev) : '—'}</td>
        <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtSz(d.file_size)}</td>
        <td onclick="event.stopPropagation()"><a href="/api/datasets/${d.id}/download" class="btn btn-icon btn-ghost btn-sm" title="Herunterladen" download>&#x2B07;</a></td>
      </tr>`).join('')}</tbody></table></div>` : ''}`;
}
