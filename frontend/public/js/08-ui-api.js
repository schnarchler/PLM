// 08-ui-api.js — Detail-Panel, UI-Helfer, API-Client, Utilities, Shutdown
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DETAIL PANEL ──────────────────────────────────────────────
function showDetail() { document.getElementById('detail-panel').classList.remove('hidden'); }
function closeDetail() { document.getElementById('detail-panel').classList.add('hidden'); }
function _markActiveRow(id) {
  document.querySelectorAll('#left-body tr.row-active').forEach(r => r.classList.remove('row-active'));
  if (id != null) {
    const tr = document.querySelector(`#left-body tr[data-id="${id}"]`);
    if (tr) tr.classList.add('row-active');
  }
}
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

let _loadStatsTimer;
async function loadStats() {
  clearTimeout(_loadStatsTimer);
  _loadStatsTimer = setTimeout(async () => {
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
    const br = document.getElementById('badge-rawmat');
    if (br) br.textContent = s.raw_materials ?? '—';
    const bn = document.getElementById('badge-normteile');
    if (bn) bn.textContent = s.standard_parts ?? '—';
    const bp = document.getElementById('badge-purchasing');
    if (bp) bp.textContent = s.open_pos ?? '—';
  }, 800);
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
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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
    _showDynModal(`<div class="modal" style="max-width:640px;width:95vw">
      <div class="modal-head">
        <div class="modal-title" style="color:var(--amber)">⚠ Aktive Checkouts</div>
      </div>
      <div class="modal-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:var(--t2)">${checkouts.length} Checkout(s) aktiv · ${totalFiles} Dateien</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${checkouts.map(c => `<div style="font-size:13px;font-family:var(--mono);color:var(--t3)">
            ${_itemChip(c.item_type,14)} <span style="color:var(--blue)">${esc(c.item_number)}</span> – ${esc(c.item_name)}
          </div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3);padding-top:4px">Vor dem Beenden einchecken (Checkout-Ordner werden gelöscht)?</div>
      </div>
      <div class="modal-foot" style="gap:6px;flex-wrap:wrap">
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
          ${allFiles.map(f => `<div style="font-size:13px;color:var(--t3)">${f}</div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3)">Jetzt erfassen oder später?</div>
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
        <div style="font-size:13px;color:var(--t3);margin-top:6px">Die Weboberfläche ist danach nicht mehr erreichbar.</div>
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
  try { fetch('/api/shutdown', { method: 'POST', keepalive: true }); } catch {}
  // Seite sofort ersetzen — Server braucht ~500ms bis process.exit
  document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#0a0b0d;color:#ecedef;font-family:Manrope,sans-serif;gap:16px">
    <div style="font-size:36px;color:#4a5470">■</div>
    <div style="font-size:17px;font-weight:600">PLM & ERP wurde beendet</div>
    <div style="font-size:13px;color:#4a5470;margin-bottom:8px">Der Server wurde gestoppt.</div>
    <button onclick="window.close()" style="background:#1d2029;border:1px solid #2a2d3a;color:#ecedef;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-family:Manrope,sans-serif">✕ Tab schliessen</button>
  </div>`;
  // Tab schliessen versuchen (funktioniert wenn Tab per Skript geöffnet wurde)
  setTimeout(() => window.close(), 600);
}
