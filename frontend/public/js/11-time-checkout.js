// 11-time-checkout.js — Zeiterfassung (Auftrag + Item) und Checkout
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
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
      <div class="sep-label" style="margin:0;flex:1">${_t('Zeiterfassung')}</div>
      <span style="font-size:13px;color:var(--t3)">${_t('Total:')} <strong style="color:var(--t1)">${_fmtDur(totalH)}</strong></span>
      ${billableH>0&&hourlyRate>0?`<span style="font-size:13px;color:var(--green)">${_t('verrechenbar:')} <strong>${_fmtDur(billableH)} = ${fmtCHF(billableH*hourlyRate)}</strong></span>`:''}
      <button class="btn btn-primary btn-sm" onclick="openTimeModal()">${_t('+ Eintrag')}</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>${_t('Datum')}</th><th>${_t('Stunden')}</th><th>${_t('Beschreibung')}</th><th>${_t('Verrechnen')}</th><th></th></tr></thead>
      <tbody>${entries.map(e => `<tr>
        <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(e.date)}${_teRangeLine(e)}</td>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600">${_fmtDur(e.hours)}</td>
        <td style="color:var(--t2)">${esc(e.description||'')}</td>
        <td style="text-align:center"><span style="font-size:13px;padding:1px 7px;border-radius:10px;background:${e.billable?'rgba(110,222,156,.12)':'var(--bg2)'};color:${e.billable?'var(--green)':'var(--t3)'}">${e.billable?_t('Ja'):'—'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openTimeModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏</button>
          <button class="btn btn-red btn-sm btn-icon" onclick="delTimeEntry(${e.id})">✕</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`
    : '<div style="color:var(--t3);font-size:13px;padding:12px 0">' + _t('Noch keine Zeiteinträge') + '</div>'}`;
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

// Von / Bis / Dauer: entweder die Dauer direkt eintippen oder Start und Ende —
// sobald beide Uhrzeiten stehen, rechnet PLM die Dauer aus. Bis vor Von
// zählt über Mitternacht. Im Feld steht die Dauer als Stunden:Minuten (1:30),
// gespeichert wird sie in Stunden. p = Präfix der Feld-IDs im Dialog.
function _teMinutes(start, end) {
  if (!start || !end) return null;
  const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return (min(end) - min(start) + 1440) % 1440;
}

// 90 → "1:30"
function _teHM(min) { return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`; }

// Eingetippte Dauer in Minuten: 1:30, 1h30, 1 h 30 min, 90 min oder 1.5 (Stunden)
function _teParseDuration(s) {
  const t = String(s || '').trim().toLowerCase().replace(',', '.');
  let m;
  if ((m = /^(\d+):([0-5]?\d)$/.exec(t))) return +m[1] * 60 + +m[2];
  if ((m = /^(\d+)\s*h\s*(\d+)\s*(?:min|m)?$/.exec(t))) return +m[1] * 60 + +m[2];
  if ((m = /^(\d+)\s*(?:min|m)$/.exec(t))) return +m[1];
  if ((m = /^(\d+(?:\.\d+)?)\s*h?$/.exec(t))) return Math.round(+m[1] * 60);
  return null;
}

function _teTimeFields(p, e) {
  const min = e.hours ? Math.round(e.hours * 60) : 0;
  return `<div class="form-row cols3" style="margin:0">
        <div class="fg"><label class="fl">${_t('Von')}</label>
          <input id="${p}-start" type="time" class="fi" value="${esc(e.start_time||'')}" oninput="_teFromRange('${p}')"></div>
        <div class="fg"><label class="fl">${_t('Bis')}</label>
          <input id="${p}-end" type="time" class="fi" value="${esc(e.end_time||'')}" oninput="_teFromRange('${p}')"></div>
        <div class="fg"><label class="fl">${_t('Dauer (h:min)')}</label>
          <input id="${p}-hours" type="text" class="fi" placeholder="1:30" value="${min ? _teHM(min) : ''}" oninput="_teClearRange('${p}')"></div>
      </div>`;
}

function _teFromRange(p) {
  const min = _teMinutes(document.getElementById(`${p}-start`).value, document.getElementById(`${p}-end`).value);
  if (min != null) document.getElementById(`${p}-hours`).value = _teHM(min);
}

// Wer die Dauer selbst eintippt, gibt sie direkt an — Von/Bis passen dann nicht mehr
function _teClearRange(p) {
  document.getElementById(`${p}-start`).value = '';
  document.getElementById(`${p}-end`).value = '';
}

function _teTimeValues(p) {
  const start = document.getElementById(`${p}-start`).value;
  const end = document.getElementById(`${p}-end`).value;
  const both = !!(start && end);
  const min = _teParseDuration(document.getElementById(`${p}-hours`).value);
  return { hours: min ? min / 60 : NaN,
           start_time: both ? start : null, end_time: both ? end : null };
}

// Uhrzeiten unter dem Datum in der Liste, leer wenn nur die Dauer erfasst ist
function _teRangeLine(e) {
  return e.start_time && e.end_time
    ? `<div style="font-size:12px;color:var(--t4)">${esc(e.start_time)}–${esc(e.end_time)}</div>` : '';
}

function openTimeModal(entry) {
  const e = entry || {};
  const hourlyRate = parseFloat(state.settings?.hourly_rate) || 0;
  _showDynModal(`<div class="modal" style="max-width:380px">
    <div class="modal-head"><div class="modal-title">${e.id ? _t('Zeiteintrag bearbeiten') : _t('Zeiteintrag erfassen')}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">${_t('Datum')}</label>
        <input id="te-date" type="date" class="fi" value="${e.date||new Date().toISOString().slice(0,10)}"></div>
      ${_teTimeFields('te', e)}
      <div class="fg"><label class="fl">${_t('Beschreibung')}</label>
        <input id="te-desc" type="text" class="fi" placeholder="${_t('Konstruktion, Montage …')}" value="${esc(e.description||'')}"></div>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:6px 0;border-top:1px solid var(--line)">
        <input type="checkbox" id="te-billable" ${e.billable?'checked':''} style="width:15px;height:15px;cursor:pointer;accent-color:var(--blue)">
        <span style="color:var(--t2)">${_t('Zeit verrechnen')}</span>
        ${hourlyRate>0?`<span style="color:var(--t3);margin-left:4px">(${fmtCHF(hourlyRate)}/h)</span>`:''}
      </label>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
      <button class="btn btn-primary" onclick="saveTimeEntry(${e.id||'null'})">${_t('Speichern')}</button>
    </div>
  </div>`);
}

async function saveTimeEntry(id) {
  const date = document.getElementById('te-date').value;
  const time = _teTimeValues('te');
  const description = document.getElementById('te-desc').value.trim();
  const billable = document.getElementById('te-billable').checked ? 1 : 0;
  if (!time.hours || time.hours <= 0) { toast(_t('Dauer (z.B. 1:30) oder Von und Bis eingeben'), 'err'); return; }
  try {
    if (id) {
      await api(`/api/time-entries/${id}`, 'PUT', { date, ...time, description, billable });
    } else {
      await api('/api/time-entries', 'POST', { order_id: _teOrderId, date, ...time, description, billable });
    }
    _hideDynModal();
    loadTimeEntries(_teOrderId);
    refreshOrderPositionen(_teOrderId);
  } catch(e) {
    _hideDynModal();
    toast(_t('Fehler beim Speichern'), 'err');
  }
}

async function delTimeEntry(id) {
  if (!confirm(_t('Eintrag löschen?'))) return;
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
    el.innerHTML = '<div style="color:var(--t3);font-size:13px;padding:8px 0">' + _t('Dieses Item wird in keiner Baugruppe verwendet.') + '</div>';
    return;
  }

  // Group rows by parent item id
  const grouped = [];
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.id)) {
      const entry = { ...r, revs: [] };
      seen.set(r.id, entry);
      grouped.push(entry);
    }
    seen.get(r.id).revs.push({ rev_id: r.rev_id, rev: r.rev, status: r.status,
      quantity: r.quantity, unit: r.unit, pinned_rev: r.pinned_rev, rev_outdated: r.rev_outdated });
  }

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">
    ${grouped.map(g => `
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div onclick="openProjectAndItem(${g.project_id},${g.id})" style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          ${_itemChip(g.item_type, 16)}
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(g.item_number)}</span>
          <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.name)}</span>
          ${_classChip(g.classification, 10)}
          <span style="font-size:13px;color:var(--t4);font-family:var(--mono)">${esc(g.project_number)}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;padding:5px 10px 8px;border-top:1px solid var(--line)">
          ${g.revs.map(rv => {
            // Welcher Stand dieses Teils steckt in dieser Verwendung?
            const pin = rv.pinned_rev;
            const title = `${fmtN(rv.quantity,0)} ${esc(_unit(rv.unit))}`
              + (pin ? ' · ' + _t('fest auf rev{rev}', { rev: pin.rev }) + (rv.rev_outdated ? ' ' + _t('(nicht mehr aktuell)') : '')
                     : ' ' + _t('· folgt automatisch der aktuellen Revision'));
            return `<span style="display:inline-flex;align-items:center;gap:4px">
              <span class="status st-${rv.status}" style="font-size:11px;cursor:pointer" title="${title}"
                onclick="openProjectAndItem(${g.project_id},${g.id},${rv.rev_id})">
                rev${rv.rev}
              </span>
              ${pin ? `<span style="font-size:10px;font-family:var(--mono);color:${rv.rev_outdated ? 'var(--amber)' : 'var(--t4)'}" title="${title}">🔒rev${esc(pin.rev)}</span>` : ''}
            </span>`;
          }).join('')}
          <span style="font-size:12px;color:var(--t4);align-self:center;margin-left:2px">${_t(g.revs.length === 1 ? '1 Revision' : '{n} Revisionen', { n: g.revs.length })}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

async function loadErpUsage(itemId) {
  const el = document.getElementById('it-erp-list');
  if (!el) return;
  const { orders, deliveries, via_assembly } = await api(`/api/items/${itemId}/erp-usage`)
    .catch(() => ({ orders: [], deliveries: [], via_assembly: [] }));

  // Angebote sind Aufträge in der Phase „Angebot" — Status und Wörter kommen
  // aus den zentralen Tabellen in 01-core.js
  const row = (label, num, title, badge, date, qty, unit, price, cb, extra = '') =>
    `<div onclick="${cb}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
      <span style="font-size:10px;color:var(--t4);min-width:44px">${label}</span>
      <span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${esc(num)}</span>
      <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title||'—')}</span>
      ${extra}
      <span style="font-family:var(--mono);font-size:12px;color:var(--t3);flex-shrink:0">${fmtN(qty,0)} ${esc(_unit(unit))}</span>
      ${price != null ? `<span style="font-family:var(--mono);font-size:12px;color:var(--t2);flex-shrink:0">${fmtCHF(price)}</span>` : ''}
      ${badge}
      ${date ? `<span style="font-size:11px;color:var(--t4);flex-shrink:0">${fmtD(date)}</span>` : ''}
    </div>`;

  // Welcher Stand steckt in diesem Produktionsauftrag? Fixiert = Schloss,
  // vor der Lieferung automatisch (blass), ↑ = es gibt inzwischen eine neuere
  const revTag = d => !d.rev ? '' : `<span style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0"
      title="${d.rev_auto ? _t('folgt automatisch der aktiven Revision') : d.status === 'DELIVERED' ? _t('gelieferter Stand') : _t('fest gewählt')}">
      <span class="status st-${d.rev_status || 'DFT'}" style="font-size:11px${d.rev_auto ? ';opacity:.7' : ''}">${d.rev_auto ? '' : '🔒 '}rev${esc(d.rev)}</span>
      ${d.rev_outdated ? '<span style="font-size:10px;font-family:var(--mono);color:var(--amber)">↑</span>' : ''}
    </span>`;

  const section = (title, items, renderFn, hint = '') => items.length ? `
    <div style="font-size:11px;text-transform:uppercase;color:var(--t3);letter-spacing:.06em;margin:12px 0 5px">${title}</div>
    ${hint ? `<div style="font-size:12px;color:var(--t4);margin:-2px 0 6px">${hint}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:4px">${items.map(renderFn).join('')}</div>` : '';

  const activeOrders = orders.filter(o => ['CONFIRMED','DELIVERED','INVOICED'].includes(o.status));
  const totalQty = activeOrders.reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0);
  const totalRev = activeOrders.reduce((s, o) => s + ((parseFloat(o.quantity)||0) * (parseFloat(o.unit_price)||0)), 0);

  const summaryHtml = (orders.length > 0) ? `
    <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:4px;flex-wrap:wrap">
      <span style="font-size:11px;text-transform:uppercase;color:var(--t4);letter-spacing:.06em">${_t('Total Aufträge')}</span>
      <span style="font-family:var(--mono);font-size:14px;font-weight:600;color:var(--green)">${fmtCHF(totalRev)}</span>
      <span style="font-size:12px;color:var(--t3)">${fmtN(totalQty,0)} ${_unit('Stk')} · ${_t(activeOrders.length === 1 ? '1 Auftrag' : '{n} Aufträge', { n: activeOrders.length })}</span>
      ${orders.length !== activeOrders.length ? `<span style="font-size:11px;color:var(--t4)">${_t('(nur bestätigte, gelieferte und fakturierte)')}</span>` : ''}
    </div>` : '';

  // Ein Produktionsauftrag kann direkt und als Teil einer Baugruppe auftauchen — einmal zählen
  const outdated = new Set([...deliveries, ...via_assembly].filter(d => d.status === 'DELIVERED' && d.rev_outdated).map(d => d.id)).size;
  const html = summaryHtml + [
    section(_t('Aufträge und Angebote'), orders, o => row(o.status === 'QUOTE' ? _t('ANGEBOT') : _t('AUFTRAG'), o.number, o.title,
      stBadge('order', o.status, 'font-size:11px;flex-shrink:0'), o.order_date, o.quantity, o.unit, o.unit_price,
      `gotoView('orders');openOrderDetail(${o.id})`)),
    section(_t('Produktionsaufträge'), deliveries, d => row(_t('PROD.'), d.number, d.customer_name || d.title,
      stBadge('delivery', d.status, 'font-size:11px;flex-shrink:0'), d.delivery_date, d.quantity, d.unit, null,
      `gotoView('deliveries');openDeliveryDetail(${d.id})`, revTag(d)),
      outdated ? `<span style="color:var(--amber)">↑</span> ${_t(outdated === 1 ? '1 gelieferter Produktionsauftrag hat einen älteren Stand als die aktuelle Revision' : '{n} gelieferte Produktionsaufträge haben einen älteren Stand als die aktuelle Revision', { n: outdated })}` : ''),
    section(_t('Geliefert als Teil einer Baugruppe'), via_assembly, d => row(_t('IN BG'), d.number, `${d.via_item_number || ''} · ${d.customer_name || d.title}`,
      stBadge('delivery', d.status, 'font-size:11px;flex-shrink:0'), d.delivery_date, d.quantity, d.unit, null,
      `gotoView('deliveries');openDeliveryDetail(${d.id})`, revTag(d))),
  ].join('');

  el.innerHTML = html || '<div style="color:var(--t3);font-size:13px;padding:8px 0">' + _t('Dieses Item wurde noch in keinem Auftrag, Angebot oder Produktionsauftrag verwendet.') + '</div>';
}

async function loadItemTimeEntries(itemId) {
  _teItemId = itemId;
  const el = document.getElementById('item-time-list');
  if (!el) return;
  const entries = await api(`/api/time-entries?item_id=${itemId}`);
  const totalH = entries.reduce((s, e) => s + (parseFloat(e.hours)||0), 0);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:13px;color:var(--t3)">${entries.length ? _t('{n} Einträge · {time} gesamt', { n: entries.length, time: _fmtDur(totalH) }) : _t('Noch keine Einträge')}</span>
      <button class="btn btn-primary btn-sm" onclick="openItemTimeModal()">${_t('+ Eintrag')}</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr>
        <th>${_t('Datum')}</th><th>${_t('Stunden')}</th><th>${_t('Beschreibung')}</th><th></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => `<tr>
          <td style="font-family:var(--mono);font-size:13px">${fmtD(e.date)}${_teRangeLine(e)}</td>
          <td style="font-family:var(--mono);font-size:13px;white-space:nowrap">${_fmtDur(e.hours)}</td>
          <td style="font-size:13px;color:var(--t2)">${esc(e.description||'—')}</td>
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
      <div class="modal-title">${e.id ? _t('Zeit bearbeiten') : _t('Zeit erfassen')}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
      <div class="fg"><label class="fl">${_t('Datum')}</label>
        <input id="ite-date" type="date" class="fi" value="${e.date||new Date().toISOString().slice(0,10)}"></div>
      ${_teTimeFields('ite', e)}
      <div class="fg"><label class="fl">${_t('Beschreibung')}</label>
        <input id="ite-desc" type="text" class="fi" placeholder="${_t('Konstruktion, Recherche, CAD …')}" value="${esc(e.description||'')}"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
      <button class="btn btn-primary" onclick="saveItemTimeEntry(${e.id||'null'})">${_t('Speichern')}</button>
    </div>
  </div>`);
}

async function saveItemTimeEntry(id) {
  const date  = document.getElementById('ite-date').value;
  const time  = _teTimeValues('ite');
  const description = document.getElementById('ite-desc').value.trim();
  if (!time.hours || time.hours <= 0) { toast(_t('Dauer (z.B. 1:30) oder Von und Bis eingeben'), 'err'); return; }
  if (id) {
    await api(`/api/time-entries/${id}`, 'PUT', { date, ...time, description, billable: 0 });
  } else {
    await api('/api/time-entries', 'POST', { item_id: _teItemId, date, ...time, description, billable: 0 });
  }
  _hideDynModal();
  loadItemTimeEntries(_teItemId);
}

async function delItemTimeEntry(id) {
  if (!confirm(_t('Eintrag löschen?'))) return;
  await api(`/api/time-entries/${id}`, 'DELETE');
  loadItemTimeEntries(_teItemId);
}

// ── CHECKOUT ──────────────────────────────────────────────────
const CHECKOUT_TYPES = [
  { key: 'CAD',         label: _t('CAD-Dateien'),     hint: '.step, .stp, .par, .asm, .3mf …' },
  { key: 'STL',         label: 'STL',              hint: '.stl' },
  { key: 'GCODE',       label: 'G-Code',           hint: '.gcode, .nc …' },
  { key: 'PDF',         label: 'PDF',              hint: '.pdf' },
  { key: 'IMAGE',       label: _t('Bilder'),           hint: '.png, .jpg …' },
  { key: 'DOC',         label: _t('Dokumente'),        hint: '.docx, .txt …' },
  { key: 'SPREADSHEET', label: _t('Tabellen'),         hint: '.xlsx, .csv …' },
  { key: 'OTHER',       label: _t('Sonstige'),         hint: '' },
];

function openCheckoutModal(itemId, itemNumber, itemType, hasRel) {
  const isAsm = itemType === 'asm';
  _showDynModal(`<div class="modal" style="max-width:460px">
    <div class="modal-head">
      <div class="modal-title">${_t('Auschecken — {number}', { number: esc(itemNumber) })}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      ${isAsm ? `<div style="background:rgba(157,180,255,.08);border:1px solid rgba(157,180,255,.2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:14px;font-size:13px;color:var(--t2)">
        ${_t('Baugruppe: alle Parts aus der BOM werden rekursiv mitgeladen, damit die CAD-Verlinkungen bestehen bleiben.')}
      </div>` : ''}
      <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${_t('Revision')}</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:7px;padding:7px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;flex:1">
          <input type="radio" name="co-revmode" value="latest" checked style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer;flex-shrink:0">
          <div><div style="font-size:13px;font-weight:500">${_t('Neueste Revision')}</div></div>
        </label>
        <label style="display:flex;align-items:center;gap:7px;padding:7px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;flex:1${hasRel ? '' : ';opacity:.4;pointer-events:none'}">
          <input type="radio" name="co-revmode" value="released" ${hasRel ? '' : 'disabled'} style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0">
          <div><div style="font-size:13px;font-weight:500">${_t('Freigegeben (REL)')}</div></div>
        </label>
      </div>
      <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${_t('Dateitypen auswählen')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px">
        ${CHECKOUT_TYPES.map(t => `
          <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--line3)'" onmouseout="this.style.borderColor='var(--line2)'">
            <input type="checkbox" class="co-type" value="${t.key}" checked style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer;flex-shrink:0">
            <div>
              <div style="font-size:13px;font-weight:500">${t.label}</div>
              ${t.hint?`<div style="font-size:13px;color:var(--t4);font-family:var(--mono)">${t.hint}</div>`:''}
            </div>
          </label>`).join('')}
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer">
        <input type="checkbox" id="co-all" checked style="accent-color:var(--blue);width:14px;height:14px" onchange="document.querySelectorAll('.co-type').forEach(c=>c.checked=this.checked)">
        <span style="font-size:13px;color:var(--t3)">${_t('Alle Typen auswählen')}</span>
      </label>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
      <button class="btn btn-teal" onclick="doCheckout(${itemId})">${_t('⬇ Auschecken')}</button>
    </div>
  </div>`);
}

async function doCheckout(itemId) {
  const types = [...document.querySelectorAll('.co-type:checked')].map(c => c.value);
  if (!types.length) { toast(_t('Mindestens einen Dateityp wählen'), 'err'); return; }
  const modeEl = document.querySelector('input[name="co-revmode"]:checked');
  const mode = modeEl ? modeEl.value : 'latest';

  const btn = document.querySelector('.modal-foot .btn-teal');
  const orig = btn?.textContent;
  if (btn) { btn.textContent = _t('⏳ Wird kopiert…'); btn.disabled = true; }

  try {
    let r = await api(`/api/items/${itemId}/checkout`, 'POST', { types, mode });
    // Schon auf einem anderen PC ausgecheckt: dort Bearbeitetes wäre hier nicht dabei
    if (r.ask === 'elsewhere') {
      const lines = r.elsewhere.map(c => `• ${c.item_number} ${c.item_name} — ` + _t('auf {host} seit {date}', { host: c.host, date: fmtDate(c.checked_out || c.created_at) }));
      if (!confirm(_t('Schon ausgecheckt auf einem anderen PC:') + `\n\n${lines.join('\n')}\n\n`
        + _t('Was dort bearbeitet wird, ist hier nicht dabei — am besten dort zuerst einchecken. Trotzdem auschecken?'))) {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
        return;
      }
      r = await api(`/api/items/${itemId}/checkout`, 'POST', { types, mode, force: true });
    }
    _hideDynModal();
    if (r.warning) { toast(r.warning, 'err'); return; }
    await loadCheckouts();
    if (document.getElementById('project-tree')) renderProjectTree(state.project);
    if (state.item) renderItemDetail(state.item, state.activeRevId);
    _showCheckoutResult(r);
  } catch(e) {
    if (btn) { btn.textContent = orig; btn.disabled = false; }
    toast(_t('Fehler beim Auschecken'), 'err');
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
      <div class="modal-title"><span style="color:var(--green)">✓</span> ${_t('Ausgecheckt — {n} Dateien', { n: r.files.length })}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:12px">
        <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${_t('Ordner')}</div>
        <div style="font-family:var(--mono);font-size:13px;color:var(--t1);word-break:break-all;user-select:all">${esc(r.folder)}</div>
      </div>
      ${r.files.some(f=>f.readonly) ? `<div style="background:rgba(245,192,97,.08);border:1px solid rgba(245,192,97,.25);border-radius:var(--r-sm);padding:7px 10px;margin-bottom:10px;font-size:13px;color:var(--amber)">
        ${_t('🔒 Freigegebene Dateien (REL) sind schreibgeschützt kopiert worden.')}
      </div>` : ''}
      <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
        ${r.files.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-xs);background:var(--bg2)">
            <span class="ds-type dt-${f.ds_type}" style="font-size:11px;flex-shrink:0">${f.ds_type}</span>
            <span style="font-size:13px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
            <span style="font-size:13px;color:var(--t4);font-family:var(--mono);flex-shrink:0">${esc(f.item_number)}</span>
            ${f.readonly ? `<span title="${_t('Schreibgeschützt (REL)')}" style="font-size:13px;color:var(--amber)">🔒</span>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-red btn-sm" onclick="_coIn(0,this)">${_t('⬆ Einchecken')}</button>
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Schliessen')}</button>
      <button class="btn btn-teal" onclick="_coOpen(0)">${_t('📂 Ordner öffnen')}</button>
    </div>
  </div>`);
}

// Einchecken: übernommen wird nur, was geändert wurde. Betrifft eine Änderung
// ein Teil, das nicht im Entwurf ist (freigegeben, in Review, veraltet,
// geliefert), fragt PLM nach: als neue Revision hochladen, verwerfen oder
// abbrechen. null = abgebrochen, der Checkout-Ordner bleibt.
async function _checkin(folder) {
  const r = await api('/api/checkout/checkin', 'POST', { folder });
  if (r.ask !== 'rel_changed') return r;
  const choice = await _askRelChanged(r);
  return choice ? api('/api/checkout/checkin', 'POST', { folder, rel_changes: choice }) : null;
}

// Was mit einer Änderung passiert, je nach heutigem Stand des Teils
const CHECKIN_LOCKED = {
  REL: [_t('freigegeben'), _t('die Freigabe bleibt, die Änderung kommt per ECO in eine neue Revision')],
  REV: [_t('in Review'), _t('die Revision geht zurück auf Entwurf und bekommt die Änderung')],
  OBS: [_t('veraltet'), _t('eine neue Revision bekommt den bisherigen Inhalt und die Änderung')],
  ECO: [_t('im ECO'), _t('eine neue Revision bekommt den bisherigen Inhalt und die Änderung')],
  DELIVERED: [_t('geliefert'), _t('eine neue Revision bekommt den bisherigen Inhalt und die Änderung')],
};

function _askRelChanged(r) {
  return new Promise(resolve => {
    window._relChoice = v => { _hideDynModal(); resolve(v); };
    const n = r.files.length;
    const byItem = new Map();
    for (const f of r.files) byItem.set(f.item_number, [...(byItem.get(f.item_number) || []), f]);
    const groups = [...byItem].map(([number, files]) => {
      const [label, what] = CHECKIN_LOCKED[files[0].status] || [_t('gesperrt'), _t('eine neue Revision bekommt die Änderung')];
      return `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 10px">
        <div style="font-size:13px"><span style="font-family:var(--mono);color:var(--blue)">${esc(number)}</span>
          <span style="color:var(--t3)">${_t('rev{rev} ist', { rev: esc(files[0].rev) })}</span> <strong style="color:var(--amber)">${label}</strong></div>
        ${files.map(f => `<div style="font-family:var(--mono);font-size:12.5px;color:var(--t2);margin-top:3px">✎ ${esc(f.name)}</div>`).join('')}
        <div style="font-size:12.5px;color:var(--t3);margin-top:4px">${_t('Hochladen: {what}.', { what })}</div>
      </div>`;
    }).join('');
    _showDynModal(`<div class="modal" style="max-width:580px;width:95vw">
      <div class="modal-head">
        <div class="modal-title" style="color:var(--amber)">${_t(n === 1 ? '1 geänderte Datei — neu hochladen?' : '{n} geänderte Dateien — neu hochladen?', { n })}</div>
        <button class="btn btn-icon btn-ghost" onclick="_relChoice(null)">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:8px">
        <div style="font-size:13px;color:var(--t2)">${_t(n === 1 ? 'Im Checkout wurde eine Datei geändert, deren Stand in PLM gesperrt ist.' : 'Im Checkout wurden Dateien geändert, deren Stand in PLM gesperrt ist.')}
          ${_t('Die Dateien in PLM bleiben unangetastet, bis du entscheidest.')}</div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto">${groups}</div>
        <div style="font-size:12.5px;color:var(--t3)">${_t('<strong style="color:var(--t2)">Verwerfen</strong> löscht die geänderten Dateien mit dem Checkout-Ordner.')}
          ${_t('<strong style="color:var(--t2)">Abbrechen</strong> lässt den Ordner stehen.')}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="_relChoice(null)">${_t('Abbrechen')}</button>
        <button class="btn btn-red" onclick="_relChoice('discard')">${_t('Änderungen verwerfen')}</button>
        <button class="btn btn-primary" onclick="_relChoice('new_revision')">${_t('Als neue Revision hochladen')}</button>
      </div>
    </div>`);
    document.getElementById('dynModal').addEventListener('click', e => { if (e.target.id === 'dynModal') resolve(null); });
  });
}

function _checkinMessage(r) {
  const count = r.uploaded?.length || 0;
  const locked = (r.revisions || []).filter(x => x.was && x.was !== 'DFT');
  if (locked.length) return _t('Eingecheckt — Änderungen in {list}', { list: locked.map(x => `${x.item_number} rev${x.rev}`).join(', ') })
    + (r.discarded ? ', ' + _t('{n} verworfen', { n: r.discarded }) : '') + ', ' + _t('Ordner gelöscht');
  if (r.discarded) return _t('Eingecheckt — Änderungen verworfen') + (count ? ', ' + _t('{n} in den Entwurf übernommen', { n: count }) : '') + ', ' + _t('Ordner gelöscht');
  return count > 0
    ? _t(count === 1 ? 'Eingecheckt — 1 geänderte Datei übernommen, Ordner gelöscht' : 'Eingecheckt — {n} geänderte Dateien übernommen, Ordner gelöscht', { n: count })
    : _t('Eingecheckt — nichts geändert, Ordner gelöscht');
}

async function doCheckin(folder, btn) {
  if (!confirm(_t('Geänderte Dateien in PLM übernehmen und Checkout-Ordner löschen?\n\nUnveränderte Dateien bleiben in PLM, wie sie sind.'))) return;
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '⏳…'; btn.disabled = true; }
  try {
    const r = await _checkin(folder);
    await loadCheckouts();
    _hideDynModal();
    if (!r) {
      if (btn) { btn.innerHTML = orig; btn.disabled = false; }
      toast(_t('Nicht eingecheckt — der Checkout-Ordner bleibt'), 'ok');
      return;
    }
    toast(_checkinMessage(r), 'ok');
    await _refreshOpenViews(null, r.revisions?.length ? null : state.activeRevId);
  } catch(e) {
    if (btn) { btn.innerHTML = orig; btn.disabled = false; }
    toast('Fehler beim Einchecken: ' + (e.message||''), 'err');
  }
}

async function doCheckinAll() {
  if (!state.checkouts.length) return;
  if (!confirm(_t('Alle {n} Checkouts einchecken und Ordner löschen?', { n: state.checkouts.length }))) return;
  let kept = 0;
  for (const c of [...state.checkouts]) {
    try { if (!await _checkin(c.folder)) kept++; } catch {}
  }
  await loadCheckouts();
  _hideDynModal();
  toast(kept ? _t(kept === 1 ? 'Eingecheckt — 1 Checkout bleibt bestehen' : 'Eingecheckt — {n} Checkouts bleiben bestehen', { n: kept }) : _t('Alle Checkouts eingecheckt'), 'ok');
  await _refreshOpenViews(null, state.activeRevId);
}

// Nach Einchecken oder Import: Projektbaum und offenes Item frisch vom Server.
// itemId: nur dieses Item neu laden; ohne Angabe das offene.
async function _refreshOpenViews(itemId, revId) {
  await refreshOpenProject();
  if (!state.item || (itemId != null && state.item.id !== itemId)) return;
  state.item = await api('/api/items/' + state.item.id);
  renderItemDetail(state.item, revId);
}

async function openCheckoutFolder(folder) {
  try {
    await api('/api/checkout/open', 'POST', { folder });
    toast(_t('Ordner wird geöffnet…'), 'ok');
  } catch(e) {
    toast(_t('Ordner öffnen fehlgeschlagen — Pfad kopiert'), 'err');
    try { navigator.clipboard.writeText(folder); } catch {}
  }
}

// Dateien löschen, die PLM schon hat — der Server prüft den Inhalt noch einmal
async function cleanupCheckoutDir(btn) {
  const n = _scanResult.in_plm?.length || 0;
  if (!confirm(_t(n === 1 ? '1 Datei aus dem Checkout-Verzeichnis löschen?' : '{n} Dateien aus dem Checkout-Verzeichnis löschen?', { n }) + '\n\n' + _t('Gelöscht wird nur, was inhaltlich gleich schon in PLM liegt.'))) return;
  if (btn) btn.disabled = true;
  const r = await api('/api/checkout/cleanup', 'POST', {});
  toast(_t(r.deleted.length === 1 ? '1 Datei aufgeräumt' : '{n} Dateien aufgeräumt', { n: r.deleted.length }), 'ok');
  showCheckoutList();
}

// Vermerk eines anderen PCs entfernen (der Ordner dort bleibt, wie er ist)
async function _coForget(i, btn) {
  const c = state.checkoutsElsewhere[i];
  if (!c || !confirm(_t('Vermerk „{number} auf {host}“ entfernen?', { number: c.item_number, host: c.host }) + '\n\n'
    + _t('Nur sinnvoll, wenn es den Checkout dort nicht mehr gibt (PC ausgemustert, Ordner gelöscht). Die Dateien auf dem anderen PC bleiben unberührt.'))) return;
  btn.disabled = true;
  try { await api('/api/checkout/forget', 'POST', { host: c.host, folder: c.folder }); }
  catch { btn.disabled = false; return; }
  showCheckoutList();
  if (state.item) renderItemDetail(state.item, state.activeRevId);
}

async function showCheckoutList() {
  await loadCheckouts();
  const list = state.checkouts;
  const elsewhere = state.checkoutsElsewhere || [];
  _coFolders = list.map(c => c.folder);
  const totalFiles = list.reduce((s, c) => s + (c.files?.length || 0), 0);
  const newCount = _scanNewCount();

  _showDynModal(`<div class="modal" style="max-width:720px;width:95vw">
    <div class="modal-head">
      <div class="modal-title">Checkouts${list.length ? ` <span style="font-family:var(--mono);font-size:13px;color:var(--teal);font-weight:400">${_t('{n} aktiv · {files} Dateien', { n: list.length, files: totalFiles })}</span>` : ''}${newCount ? ` <span style="font-family:var(--mono);font-size:13px;color:var(--amber);font-weight:400">${_t('+{n} neu erkannt', { n: newCount })}</span>` : ''}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto">

      ${newCount ? `<div>
        <div style="font-size:13px;font-weight:600;color:var(--amber);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">${_t('Neue Dateien erkannt')}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_scanResult.item_files.map((g, gi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:13px;font-weight:500;margin-bottom:4px">
                In <span style="font-family:var(--mono);color:var(--blue)">${esc(g.item_number)}</span> – ${esc(g.item_name)}
              </div>
              <div style="font-family:var(--mono);font-size:13px;color:var(--t3);margin-bottom:6px">${g.new_files.map(f=>`${esc(f.name)} <span style="color:var(--t4)">[${f.ds_type}]</span>`).join(' · ')}</div>
              <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                onclick="importCheckoutFiles(_scanResult.item_files[${gi}])">${_t('⬇ Zum Item hinzufügen')}</button>
            </div>`).join('')}
          ${_scanResult.root_files.map((f, fi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:13px;font-weight:500;margin-bottom:4px">
                ${_t('Neue Datei auf oberster Ebene:')} <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span>
                <span style="font-size:13px;color:var(--t4);margin-left:6px">[${f.ds_type}]</span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                  onclick="importNewItem(_scanResult.root_files[${fi}])">${_t('+ Als neues Item anlegen (mit Datei)')}</button>
                <button class="btn btn-sm btn-ghost"
                  onclick="attachCheckoutFileToItem(_scanResult.root_files[${fi}])">${_t('+ An Item anhängen')}</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${_scanResult.in_plm?.length ? `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:10px 12px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--t2);flex:1;min-width:200px">
            ${_t(_scanResult.in_plm.length === 1 ? '<strong>1 Datei</strong> im Checkout-Verzeichnis ist schon in PLM (als Item angelegt oder angehängt).' : '<strong>{n} Dateien</strong> im Checkout-Verzeichnis sind schon in PLM (als Item angelegt oder angehängt).', { n: _scanResult.in_plm.length })}
          </span>
          <button class="btn btn-ghost btn-sm" onclick="cleanupCheckoutDir(this)">${_t('🧹 Aufräumen')}</button>
        </div>
        <div style="font-family:var(--mono);font-size:12.5px;color:var(--t3);margin-top:6px;line-height:1.6">${_scanResult.in_plm.map(f => esc(f.name)).join(' · ')}</div>
      </div>` : ''}

      ${list.length ? `<div>
        <div style="font-size:13px;font-weight:600;color:var(--t3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">${_t('Aktive Checkouts')}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${list.map((c, i) => {
            const dt = parseDbDate(c.checked_out).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
            return `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                ${_itemChip(c.item_type,18)}
                <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(c.item_number)}</span>
                <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.item_name)}</span>
                <span style="font-size:13px;color:var(--t4);flex-shrink:0">${dt}</span>
              </div>
              <div style="font-family:var(--mono);font-size:13px;color:var(--t3);margin-bottom:6px;user-select:all;word-break:break-all">${esc(c.folder)}</div>
              <div style="font-size:13px;color:var(--t4);margin-bottom:6px">${_t('{n} Dateien', { n: c.files?.length||0 })}${c.files?.some(f=>f.readonly)?' · <span style="color:var(--amber)">' + _t('🔒 schreibgeschützte') + '</span>':''}</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="_coOpen(${i})">${_t('📂 Öffnen')}</button>
                <button class="btn btn-red btn-sm" onclick="_coIn(${i},this)">${_t('⬆ Einchecken')}</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : (!newCount && !elsewhere.length ? `<div style="color:var(--t3);font-size:13px;padding:16px 0;text-align:center">${_t('Keine aktiven Checkouts')}</div>` : '')}

      ${elsewhere.length ? `<div>
        <div style="font-size:13px;font-weight:600;color:var(--t3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">${_t('Auf anderen PCs ausgecheckt')}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${elsewhere.map((c, i) => `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                ${_itemChip(c.item_type,18)}
                <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(c.item_number)}</span>
                <span style="font-size:13px;font-weight:500;flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.item_name)}</span>
                <span style="font-size:13px;color:var(--amber);flex-shrink:0">auf ${esc(c.host)}</span>
                <span style="font-size:13px;color:var(--t4);flex-shrink:0">${fmtDate(c.checked_out)}</span>
                <button class="btn btn-ghost btn-sm" title="${_t('Nur den Vermerk entfernen — z.B. wenn es den PC nicht mehr gibt')}" onclick="_coForget(${i},this)">${_t('Vermerk entfernen')}</button>
              </div>
            </div>`).join('')}
        </div>
        <div style="font-size:12px;color:var(--t4);margin-top:6px">${_t('Eingecheckt wird an dem PC, auf dem ausgecheckt wurde.')}</div>
      </div>` : ''}

    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Schliessen')}</button>
      ${list.length ? `<button class="btn btn-red" onclick="doCheckinAll()">${_t('⬆ Alle einchecken ({n})', { n: list.length })}</button>` : ''}
    </div>
  </div>`);
}

async function importCheckoutFiles(g) {
  const files = g.new_files;
  if (!confirm(_t('{n} Datei(en) zu "{item}" hinzufügen?', { n: files.length, item: `${g.item_number} – ${g.item_name}` }))) return;
  try {
    const r = await api('/api/checkout/import', 'POST', { mode: 'item', item_id: g.item_id, folder: g.folder, files });
    await loadCheckouts();
    _showDynModal(null);
    toast(_t('{n} Datei(en) zu rev{rev} hinzugefügt', { n: r.count, rev: r.rev }), 'ok');
    await _refreshOpenViews(g.item_id, state.activeRevId);
    showCheckoutList();
  } catch(e) { toast(_t('Import fehlgeschlagen:') + ' ' + (e.message||''), 'err'); }
}

let _importProjects = [];
async function importNewItem(f) {
  window._importFile = f;
  _importProjects = await api('/api/projects').catch(() => []);
  const extMap = { par:'prt', psm:'prt', asm:'asm', dft:'doc', pdf:'doc' };
  const ext = f.name.split('.').pop().toLowerCase();
  const suggestedType = extMap[ext] || 'prt';
  const suggestedName = f.name.replace(/\.[^.]+$/, '');

  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head">
      <div class="modal-title">${_t('Neues Item anlegen')}</div>
      <button class="btn btn-icon btn-ghost" onclick="showCheckoutList()">✕</button>
    </div>
    <div class="modal-body" style="padding:16px;display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--t3)">${_t('Datei:')} <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span></div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">${_t('Projekt')}</label>
        <select id="imp-project" class="input" style="width:100%">
          ${_importProjects.map(p => `<option value="${p.id}">${esc(p.number)} – ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">${_t('Typ')}</label>
        <select id="imp-type" class="input" style="width:100%">
          <option value="prt"${suggestedType==='prt'?' selected':''}>${_t('🔩 Part (prt)')}</option>
          <option value="asm"${suggestedType==='asm'?' selected':''}>${_t('📦 Baugruppe (asm)')}</option>
          <option value="doc"${suggestedType==='doc'?' selected':''}>${_t('📄 Dokument (doc)')}</option>
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">Name</label>
        <input id="imp-name" class="input" style="width:100%" value="${esc(suggestedName)}" placeholder="Name">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="showCheckoutList()">${_t('Zurück')}</button>
      <button class="btn btn-primary" onclick="_doImportNewItem()">${_t('Item anlegen')}</button>
    </div>
  </div>`);
}

async function _doImportNewItem() {
  const f = window._importFile;
  if (!f) { toast(_t('Datei nicht mehr verfügbar'), 'err'); return; }
  const project_id = document.getElementById('imp-project')?.value;
  const item_type  = document.getElementById('imp-type')?.value;
  const name       = document.getElementById('imp-name')?.value?.trim();
  if (!project_id || !item_type || !name) { toast(_t('Alle Felder ausfüllen'), 'err'); return; }
  try {
    const r = await api('/api/checkout/import', 'POST', {
      mode: 'new',
      new_item: { project_id, item_type, name, file_path: f.path, file_name: f.name, ds_type: f.ds_type }
    });
    await loadCheckouts();
    toast(_t('Item {number} angelegt', { number: r.item_number }), 'ok');
    showCheckoutList();
    await refreshOpenProject(project_id);
  } catch(e) { toast(_t('Fehler:') + ' ' + (e.message||''), 'err'); }
}

async function attachCheckoutFileToItem(f) {
  window._atfFile = f;
  _showDynModal(`<div class="modal" style="max-width:480px">
    <div class="modal-head">
      <div class="modal-title">${_t('An Item anhängen')}</div>
      <button class="btn btn-icon btn-ghost" onclick="showCheckoutList()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--t3)">
        ${_t('Datei:')} <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span>
      </div>
      <div class="fg"><label class="fl">${_t('Item suchen *')}</label>
        <div style="position:relative">
          <input class="fi" id="atf-search" placeholder="${_t('Item-Nummer oder Name…')}"
            oninput="_atfSearch(this.value)" autocomplete="off">
          <div id="atf-results" style="display:none;position:absolute;z-index:300;left:0;right:0;top:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:220px;overflow-y:auto"></div>
        </div>
      </div>
      <div id="atf-selected" style="display:none;background:var(--bg3);border:1px solid var(--blue);border-radius:var(--r);padding:7px 12px;font-size:13px;align-items:center;gap:8px">
        <span id="atf-badge" style="font-family:var(--mono);color:var(--blue)"></span>
        <span id="atf-name" style="flex:1"></span>
        <button class="btn btn-icon btn-ghost btn-sm" onclick="document.getElementById('atf-selected').style.display='none';document.getElementById('atf-item-id').value=''">✕</button>
      </div>
      <input type="hidden" id="atf-item-id">
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="showCheckoutList()">${_t('Zurück')}</button>
      <button class="btn btn-primary" onclick="_doAttachCheckoutFile()">${_t('Anhängen')}</button>
    </div>
  </div>`);
}

let _atfTimer;
function _atfSearch(q) {
  clearTimeout(_atfTimer);
  const res = document.getElementById('atf-results');
  if (!q || q.length < 1) { res.style.display = 'none'; return; }
  _atfTimer = setTimeout(async () => {
    const items = await api('/api/items-all?q=' + encodeURIComponent(q));
    if (!items.length) { res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">' + _t('Keine Treffer') + '</div>'; res.style.display = 'block'; return; }
    res.innerHTML = items.map(i => `
      <div onclick="_atfSelect(${i.id},'${esc(i.item_number)}','${esc(i.name)}')"
        style="padding:9px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <span>${_itemChip(i.item_type, 15)}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name)}</span>
      </div>`).join('');
    res.style.display = 'block';
  }, 200);
}

function _atfSelect(id, number, name) {
  document.getElementById('atf-item-id').value = id;
  document.getElementById('atf-badge').textContent = number;
  document.getElementById('atf-name').textContent = name;
  document.getElementById('atf-selected').style.display = 'flex';
  document.getElementById('atf-results').style.display = 'none';
  document.getElementById('atf-search').value = '';
}

async function _doAttachCheckoutFile() {
  const f = window._atfFile;
  if (!f) { toast(_t('Datei nicht mehr verfügbar'), 'err'); return; }
  const itemId = document.getElementById('atf-item-id')?.value;
  if (!itemId) { toast(_t('Item auswählen'), 'err'); return; }
  const sep = f.path?.includes('\\') ? '\\' : '/';
  const lastSep = Math.max(f.path?.lastIndexOf('/') ?? -1, f.path?.lastIndexOf('\\') ?? -1);
  const folder = (f.path && lastSep >= 0) ? f.path.substring(0, lastSep) : '.';
  try {
    const r = await api('/api/checkout/import', 'POST', {
      mode: 'item',
      item_id: parseInt(itemId),
      folder,
      files: [{ name: f.name, ds_type: f.ds_type }]
    });
    if (!r.count) {
      toast(_t('Datei nicht gefunden – Pfad prüfen'), 'err');
      return;
    }
    toast(_t('{name} angehängt (rev{rev})', { name: esc(f.name), rev: r.rev }), 'ok');
    await loadCheckouts();
    showCheckoutList();
    await _refreshOpenViews(parseInt(itemId), state.activeRevId);
  } catch(e) {
    toast(_t('Fehler beim Anhängen'), 'err');
  }
}
