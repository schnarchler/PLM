// 11-time-checkout.js — Zeiterfassung (Auftrag + Artikel) und Checkout
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
      <div class="sep-label" style="margin:0;flex:1">Zeiterfassung</div>
      <span style="font-size:13px;color:var(--t3)">Total: <strong style="color:var(--t1)">${fmtN(totalH,2)} h</strong></span>
      ${billableH>0&&hourlyRate>0?`<span style="font-size:13px;color:var(--green)">verrechenbar: <strong>${fmtN(billableH,2)} h = ${fmtCHF(billableH*hourlyRate)}</strong></span>`:''}
      <button class="btn btn-primary btn-sm" onclick="openTimeModal()">+ Eintrag</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr><th>Datum</th><th>Stunden</th><th>Beschreibung</th><th>Verrechnen</th><th></th></tr></thead>
      <tbody>${entries.map(e => `<tr>
        <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtD(e.date)}</td>
        <td style="font-family:var(--mono);font-size:13px;font-weight:600">${fmtN(e.hours,2)} h</td>
        <td style="color:var(--t2)">${esc(e.description||'')}</td>
        <td style="text-align:center"><span style="font-size:13px;padding:1px 7px;border-radius:10px;background:${e.billable?'rgba(91,211,138,.12)':'var(--bg2)'};color:${e.billable?'var(--green)':'var(--t3)'}">${e.billable?'Ja':'—'}</span></td>
        <td style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-sm btn-icon" onclick="openTimeModal(${JSON.stringify(e).replace(/"/g,'&quot;')})">✏</button>
          <button class="btn btn-red btn-sm btn-icon" onclick="delTimeEntry(${e.id})">✕</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`
    : '<div style="color:var(--t3);font-size:13px;padding:12px 0">Noch keine Zeiteinträge</div>'}`;
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
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;padding:6px 0;border-top:1px solid var(--line)">
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
    el.innerHTML = '<div style="color:var(--t3);font-size:13px;padding:8px 0">Dieses Teil wird in keiner Baugruppe verwendet.</div>';
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
    seen.get(r.id).revs.push({ rev_id: r.rev_id, rev: r.rev, status: r.status, quantity: r.quantity, unit: r.unit });
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
          ${g.revs.map(rv => `
            <span class="status st-${rv.status}" style="font-size:11px;cursor:pointer" title="${fmtN(rv.quantity,0)} ${esc(rv.unit||'Stk')}"
              onclick="openProjectAndItem(${g.project_id},${g.id},${rv.rev_id})">
              rev${rv.rev}
            </span>`).join('')}
          <span style="font-size:12px;color:var(--t4);align-self:center;margin-left:2px">${g.revs.length} Revision${g.revs.length > 1 ? 'en' : ''}</span>
        </div>
      </div>`).join('')}
  </div>`;
}

async function loadErpUsage(itemId) {
  const el = document.getElementById('it-erp-list');
  if (!el) return;
  const { orders, quotes, deliveries } = await api(`/api/items/${itemId}/erp-usage`).catch(() => ({ orders:[], quotes:[], deliveries:[] }));

  const oSt = { DRAFT:'st-DFT', CONFIRMED:'st-REV', DELIVERED:'st-REL', INVOICED:'st-ECO', CANCELLED:'st-OBS' };
  const qSt = { DRAFT:'st-DFT', SENT:'st-REV', ACCEPTED:'st-REL', DECLINED:'st-OBS' };
  const dSt = { DRAFT:'st-DFT', READY:'st-REV', DELIVERED:'st-REL' };
  const oLbl = { DRAFT:'Entwurf', CONFIRMED:'Bestätigt', DELIVERED:'Geliefert', INVOICED:'Fakturiert', CANCELLED:'Storniert' };
  const qLbl = { DRAFT:'Entwurf', SENT:'Versendet', ACCEPTED:'Akzeptiert', DECLINED:'Abgelehnt' };
  const dLbl = { DRAFT:'Entwurf', READY:'Bereit', DELIVERED:'Geliefert' };

  const row = (label, id, num, title, status, stMap, lblMap, date, qty, unit, price, cb) =>
    `<div onclick="${cb}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
      <span style="font-size:10px;color:var(--t4);min-width:44px">${label}</span>
      <span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${esc(num)}</span>
      <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title||'—')}</span>
      <span style="font-family:var(--mono);font-size:12px;color:var(--t3);flex-shrink:0">${fmtN(qty,0)} ${esc(unit||'Stk')}</span>
      ${price != null ? `<span style="font-family:var(--mono);font-size:12px;color:var(--t2);flex-shrink:0">${fmtCHF(price)}</span>` : ''}
      <span class="status ${stMap[status]||'st-DFT'}" style="font-size:11px;flex-shrink:0">${lblMap[status]||status}</span>
      ${date ? `<span style="font-size:11px;color:var(--t4);flex-shrink:0">${fmtD(date)}</span>` : ''}
    </div>`;

  const none = '<div style="color:var(--t4);font-size:13px;padding:4px 0">—</div>';

  const section = (title, items, renderFn) => items.length ? `
    <div style="font-size:11px;text-transform:uppercase;color:var(--t3);letter-spacing:.06em;margin:12px 0 5px">${title}</div>
    <div style="display:flex;flex-direction:column;gap:4px">${items.map(renderFn).join('')}</div>` : '';

  const activeOrders = orders.filter(o => ['CONFIRMED','DELIVERED','INVOICED'].includes(o.status));
  const totalQty = activeOrders.reduce((s, o) => s + (parseFloat(o.quantity) || 0), 0);
  const totalRev = activeOrders.reduce((s, o) => s + ((parseFloat(o.quantity)||0) * (parseFloat(o.unit_price)||0)), 0);

  const summaryHtml = (orders.length > 0) ? `
    <div style="display:flex;gap:12px;align-items:center;padding:10px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:4px;flex-wrap:wrap">
      <span style="font-size:11px;text-transform:uppercase;color:var(--t4);letter-spacing:.06em">Total Aufträge</span>
      <span style="font-family:var(--mono);font-size:14px;font-weight:600;color:var(--green)">${fmtCHF(totalRev)}</span>
      <span style="font-size:12px;color:var(--t3)">${fmtN(totalQty,0)} Stk · ${activeOrders.length} Auftrag${activeOrders.length!==1?'e':''}</span>
      ${orders.length !== activeOrders.length ? `<span style="font-size:11px;color:var(--t4)">(nur bestätigte/gelieferte/fakturierte)</span>` : ''}
    </div>` : '';

  const html = summaryHtml + [
    section('Aufträge', orders, o => row('AUFTRAG', o.id, o.number, o.title, o.status, oSt, oLbl, o.order_date, o.quantity, o.unit, o.unit_price, `gotoView('orders');openOrderDetail(${o.id})`)),
    section('Angebote', quotes, q => row('ANGEBOT', q.id, q.number, q.title, q.status, qSt, qLbl, q.quote_date, q.quantity, q.unit, q.unit_price, `gotoView('quotes');openQuoteDetail(${q.id})`)),
    section('Produktion', deliveries, d => row('PROD', d.id, d.number, d.title, d.status, dSt, dLbl, d.delivery_date, d.quantity, d.unit, null, `gotoView('deliveries');openDeliveryDetail(${d.id})`)),
  ].join('');

  el.innerHTML = html || '<div style="color:var(--t3);font-size:13px;padding:8px 0">Dieses Teil wurde noch in keinem Auftrag, Angebot oder Produktionsauftrag verwendet.</div>';
}

async function loadItemTimeEntries(itemId) {
  _teItemId = itemId;
  const el = document.getElementById('item-time-list');
  if (!el) return;
  const entries = await api(`/api/time-entries?item_id=${itemId}`);
  const totalH = entries.reduce((s, e) => s + (parseFloat(e.hours)||0), 0);
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:13px;color:var(--t3)">${entries.length ? `${entries.length} Einträge · ${fmtN(totalH,2)} h gesamt` : 'Noch keine Einträge'}</span>
      <button class="btn btn-primary btn-sm" onclick="openItemTimeModal()">+ Eintrag</button>
    </div>
    ${entries.length ? `<div class="tbl-wrap"><table>
      <thead><tr>
        <th>Datum</th><th>Stunden</th><th>Beschreibung</th><th></th>
      </tr></thead>
      <tbody>
        ${entries.map(e => `<tr>
          <td style="font-family:var(--mono);font-size:13px">${fmtD(e.date)}</td>
          <td style="font-family:var(--mono);font-size:13px;white-space:nowrap">${fmtN(parseFloat(e.hours)||0,2)} h</td>
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
  { key: 'CAD',         label: 'CAD-Dateien',     hint: '.step, .stp, .par, .asm, .3mf …' },
  { key: 'STL',         label: 'STL',              hint: '.stl' },
  { key: 'GCODE',       label: 'G-Code',           hint: '.gcode, .nc …' },
  { key: 'PDF',         label: 'PDF',              hint: '.pdf' },
  { key: 'IMAGE',       label: 'Bilder',           hint: '.png, .jpg …' },
  { key: 'DOC',         label: 'Dokumente',        hint: '.docx, .txt …' },
  { key: 'SPREADSHEET', label: 'Tabellen',         hint: '.xlsx, .csv …' },
  { key: 'OTHER',       label: 'Sonstige',         hint: '' },
];

function openCheckoutModal(itemId, itemNumber, itemType, hasRel) {
  const isAsm = itemType === 'asm';
  _showDynModal(`<div class="modal" style="max-width:460px">
    <div class="modal-head">
      <div class="modal-title">Auschecken — ${esc(itemNumber)}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      ${isAsm ? `<div style="background:rgba(142,163,255,.08);border:1px solid rgba(142,163,255,.2);border-radius:var(--r-sm);padding:9px 12px;margin-bottom:14px;font-size:13px;color:var(--t2)">
        Baugruppe: alle Parts aus der BOM werden rekursiv mitgeladen, damit die CAD-Verlinkungen bestehen bleiben.
      </div>` : ''}
      <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Revision</div>
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:7px;padding:7px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;flex:1">
          <input type="radio" name="co-revmode" value="latest" checked style="accent-color:var(--blue);width:14px;height:14px;cursor:pointer;flex-shrink:0">
          <div><div style="font-size:13px;font-weight:500">Neueste Revision</div></div>
        </label>
        <label style="display:flex;align-items:center;gap:7px;padding:7px 12px;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);cursor:pointer;flex:1${hasRel ? '' : ';opacity:.4;pointer-events:none'}">
          <input type="radio" name="co-revmode" value="released" ${hasRel ? '' : 'disabled'} style="accent-color:var(--green);width:14px;height:14px;cursor:pointer;flex-shrink:0">
          <div><div style="font-size:13px;font-weight:500">Freigegeben (REL)</div></div>
        </label>
      </div>
      <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Dateitypen auswählen</div>
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
        <span style="font-size:13px;color:var(--t3)">Alle Typen auswählen</span>
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
  const modeEl = document.querySelector('input[name="co-revmode"]:checked');
  const mode = modeEl ? modeEl.value : 'latest';

  const btn = document.querySelector('.modal-foot .btn-teal');
  const orig = btn?.textContent;
  if (btn) { btn.textContent = '⏳ Wird kopiert…'; btn.disabled = true; }

  try {
    const r = await api(`/api/items/${itemId}/checkout`, 'POST', { types, mode });
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
        <div style="font-size:13px;color:var(--t4);font-family:var(--mono);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Ordner</div>
        <div style="font-family:var(--mono);font-size:13px;color:var(--t1);word-break:break-all;user-select:all">${esc(r.folder)}</div>
      </div>
      ${r.files.some(f=>f.readonly) ? `<div style="background:rgba(239,177,74,.08);border:1px solid rgba(239,177,74,.25);border-radius:var(--r-sm);padding:7px 10px;margin-bottom:10px;font-size:13px;color:var(--amber)">
        🔒 Freigegebene Dateien (REL) sind schreibgeschützt kopiert worden.
      </div>` : ''}
      <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px">
        ${r.files.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:var(--r-xs);background:var(--bg2)">
            <span class="ds-type dt-${f.ds_type}" style="font-size:11px;flex-shrink:0">${f.ds_type}</span>
            <span style="font-size:13px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span>
            <span style="font-size:13px;color:var(--t4);font-family:var(--mono);flex-shrink:0">${esc(f.item_number)}</span>
            ${f.readonly ? `<span title="Schreibgeschützt (REL)" style="font-size:13px;color:var(--amber)">🔒</span>` : ''}
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
  if (!confirm('Dateien in PLM hochladen und Checkout-Ordner löschen?')) return;
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '⏳…'; btn.disabled = true; }
  try {
    const r = await api('/api/checkout/checkin', 'POST', { folder });
    await loadCheckouts();
    _hideDynModal();
    const count = r.uploaded?.length || 0;
    const msg = count > 0
      ? `Eingecheckt — ${count} Datei${count!==1?'en':''} hochgeladen, Ordner gelöscht`
      : `Eingecheckt — Ordner gelöscht (REL-Element, keine Dateien hochgeladen)`;
    toast(msg, 'ok');
    if (state.project) renderProjectTree(state.project);
    if (state.item) { const fresh = await api('/api/items/'+state.item.id); renderItemDetail(fresh, state.activeRevId); }
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

  _showDynModal(`<div class="modal" style="max-width:720px;width:95vw">
    <div class="modal-head">
      <div class="modal-title">Checkouts${list.length ? ` <span style="font-family:var(--mono);font-size:13px;color:var(--teal);font-weight:400">${list.length} aktiv · ${totalFiles} Dateien</span>` : ''}${newCount ? ` <span style="font-family:var(--mono);font-size:13px;color:var(--amber);font-weight:400">+${newCount} neu erkannt</span>` : ''}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="padding:12px 16px;display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto">

      ${newCount ? `<div>
        <div style="font-size:13px;font-weight:600;color:var(--amber);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Neue Dateien erkannt</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${_scanResult.item_files.map((g, gi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:13px;font-weight:500;margin-bottom:4px">
                In <span style="font-family:var(--mono);color:var(--blue)">${esc(g.item_number)}</span> – ${esc(g.item_name)}
              </div>
              <div style="font-family:var(--mono);font-size:13px;color:var(--t3);margin-bottom:6px">${g.new_files.map(f=>`${esc(f.name)} <span style="color:var(--t4)">[${f.ds_type}]</span>`).join(' · ')}</div>
              <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                onclick="importCheckoutFiles(_scanResult.item_files[${gi}])">⬇ Zu Bauteil hinzufügen</button>
            </div>`).join('')}
          ${_scanResult.root_files.map((f, fi) => `
            <div style="background:var(--amber-soft);border:1px solid var(--amber-line);border-radius:var(--r-sm);padding:10px 12px">
              <div style="font-size:13px;font-weight:500;margin-bottom:4px">
                Neue Datei auf oberster Ebene: <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span>
                <span style="font-size:13px;color:var(--t4);margin-left:6px">[${f.ds_type}]</span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber);border:1px solid var(--amber-line)"
                  onclick="importNewItem(_scanResult.root_files[${fi}])">+ Als neues Bauteil erfassen (mit Datei)</button>
                <button class="btn btn-sm btn-ghost"
                  onclick="attachCheckoutFileToItem(_scanResult.root_files[${fi}])">+ An Bauteil anhängen</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      ${list.length ? `<div>
        <div style="font-size:13px;font-weight:600;color:var(--t3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Aktive Checkouts</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${list.map((c, i) => {
            const dt = new Date(c.checked_out).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
            return `<div style="background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r-sm);padding:10px 12px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                ${_itemChip(c.item_type,18)}
                <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(c.item_number)}</span>
                <span style="font-size:13px;font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.item_name)}</span>
                <span style="font-size:13px;color:var(--t4);flex-shrink:0">${dt}</span>
              </div>
              <div style="font-family:var(--mono);font-size:13px;color:var(--t3);margin-bottom:6px;user-select:all;word-break:break-all">${esc(c.folder)}</div>
              <div style="font-size:13px;color:var(--t4);margin-bottom:6px">${c.files?.length||0} Dateien${c.files?.some(f=>f.readonly)?' · <span style="color:var(--amber)">🔒 schreibgeschützte</span>':''}</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="_coOpen(${i})">📂 Öffnen</button>
                <button class="btn btn-red btn-sm" onclick="_coIn(${i},this)">⬆ Einchecken</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : (!newCount ? `<div style="color:var(--t3);font-size:13px;padding:16px 0;text-align:center">Keine aktiven Checkouts</div>` : '')}

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
  window._importFile = f;
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
      <div style="font-size:13px;color:var(--t3)">Datei: <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span></div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">Projekt</label>
        <select id="imp-project" class="input" style="width:100%">
          ${_importProjects.map(p => `<option value="${p.id}">${esc(p.number)} – ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">Typ</label>
        <select id="imp-type" class="input" style="width:100%">
          <option value="prt"${suggestedType==='prt'?' selected':''}>🔩 Part (prt)</option>
          <option value="asm"${suggestedType==='asm'?' selected':''}>📦 Baugruppe (asm)</option>
          <option value="doc"${suggestedType==='doc'?' selected':''}>📄 Dokument (doc)</option>
        </select>
      </div>
      <div>
        <label style="font-size:13px;color:var(--t3);margin-bottom:4px;display:block">Name</label>
        <input id="imp-name" class="input" style="width:100%" value="${esc(suggestedName)}" placeholder="Bauteilname">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="showCheckoutList()">Zurück</button>
      <button class="btn btn-primary" onclick="_doImportNewItem()">Bauteil erstellen</button>
    </div>
  </div>`);
}

async function _doImportNewItem() {
  const f = window._importFile;
  if (!f) { toast('Datei nicht mehr verfügbar', 'err'); return; }
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

async function attachCheckoutFileToItem(f) {
  window._atfFile = f;
  _showDynModal(`<div class="modal" style="max-width:480px">
    <div class="modal-head">
      <div class="modal-title">An Bauteil anhängen</div>
      <button class="btn btn-icon btn-ghost" onclick="showCheckoutList()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:13px;color:var(--t3)">
        Datei: <span style="font-family:var(--mono);color:var(--t2)">${esc(f.name)}</span>
      </div>
      <div class="fg"><label class="fl">Bauteil suchen *</label>
        <div style="position:relative">
          <input class="fi" id="atf-search" placeholder="Teilenummer oder Name…"
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
      <button class="btn btn-ghost" onclick="showCheckoutList()">Zurück</button>
      <button class="btn btn-primary" onclick="_doAttachCheckoutFile()">Anhängen</button>
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
    if (!items.length) { res.innerHTML = '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>'; res.style.display = 'block'; return; }
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
  if (!f) { toast('Datei nicht mehr verfügbar', 'err'); return; }
  const itemId = document.getElementById('atf-item-id')?.value;
  if (!itemId) { toast('Bauteil auswählen', 'err'); return; }
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
      toast('Datei nicht gefunden – Pfad prüfen', 'err');
      return;
    }
    toast(`${esc(f.name)} angehängt (Rev ${r.rev})`, 'ok');
    await loadCheckouts();
    showCheckoutList();
  } catch(e) {
    toast('Fehler beim Anhängen', 'err');
  }
}

async function createNewItemFromCheckout() {
  const projects = await api('/api/projects').catch(() => []);
  _showDynModal(`<div class="modal" style="max-width:420px">
    <div class="modal-head">
      <div class="modal-title">Neues Bauteil anlegen</div>
      <button class="btn btn-icon btn-ghost" onclick="showCheckoutList()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div class="fg"><label class="fl">Projekt *</label>
        <select id="cnb-project" class="fs">
          ${projects.map(p => `<option value="${p.id}">${esc(p.number)} – ${esc(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label class="fl">Typ *</label>
        <select id="cnb-type" class="fs">
          <option value="prt">🔩 Part (prt)</option>
          <option value="asm">📦 Baugruppe (asm)</option>
          <option value="doc">📄 Dokument (doc)</option>
        </select>
      </div>
      <div class="fg"><label class="fl">Name *</label>
        <input id="cnb-name" class="fi" placeholder="z.B. Halterung M4">
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="showCheckoutList()">Zurück</button>
      <button class="btn btn-primary" onclick="_doCreateNewItemFromCheckout()">Bauteil anlegen</button>
    </div>
  </div>`);
}

async function _doCreateNewItemFromCheckout() {
  const project_id = document.getElementById('cnb-project')?.value;
  const item_type  = document.getElementById('cnb-type')?.value;
  const name       = document.getElementById('cnb-name')?.value?.trim();
  if (!project_id || !item_type || !name) { toast('Alle Felder ausfüllen', 'err'); return; }
  const body = { name, description: '', item_type, parent_id: null,
    source_url: null, default_price: null };
  const item = await api(`/api/projects/${project_id}/items`, 'POST', body).catch(e => { toast(e.message, 'err'); });
  if (!item) return;
  toast(`${item.item_number} – ${esc(name)} angelegt`, 'ok');
  _hideDynModal();
  showCheckoutList();
  // Navigate to the new item if the project is open
  if (state.project?.id == project_id) {
    const p = await api(`/api/projects/${project_id}`);
    openProjectDetail(p);
  }
}
