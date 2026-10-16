// 13-normteile-einkauf.js — Normteile, Bestell-PDF, Einkauf/Bestellwesen
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── NORMTEILE ─────────────────────────────────────────────────
async function renderNormteile() {
  setLeftHeader('Normteile', `
    <button class="btn btn-ghost btn-sm" onclick="checkoutNormteile()" title="Alle Normteil-Dateien in Checkout-Ordner kopieren">⬇ Auschecken</button>
    <button class="btn btn-ghost btn-sm" onclick="exportNormteile()" title="Alle Normteile als normteile.json exportieren">↓ Export</button>
    <label class="btn btn-ghost btn-sm" title="normteile.json importieren" style="cursor:pointer">↑ Import<input type="file" accept=".json" style="display:none" onchange="importNormteileFile(this)"></label>
    <button class="btn btn-primary btn-sm" onclick="openNormteilModal()">+ Normteil</button>`);
  closeDetail();
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px;opacity:.4">⏳</div><div class="empty-text" style="font-size:13px">Lade…</div></div>`);
  const parts = await api('/api/standard-parts');
  const badge = document.getElementById('badge-normteile');
  if (badge) badge.textContent = parts.length || '—';
  if (!parts.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">⚙</div><div class="empty-text">Noch keine Normteile erfasst</div><div style="margin-top:10px"><button class="btn btn-primary" onclick="openNormteilModal()">Erstes Normteil anlegen</button></div></div>`);
    return;
  }
  // Group by standard + std_number
  const groups = {};
  for (const p of parts) {
    const key = [p.standard, p.std_number].filter(Boolean).join(' ') || 'Sonstige';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }
  const html = Object.entries(groups).map(([grp, items]) => `
    <div class="sep-label" style="margin-top:12px">${esc(grp)}</div>
    ${items.map(p => `
      <div onclick="openNormteilDetail(${p.id})" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:3px;font-size:10px;font-weight:700;background:rgba(157,180,255,.15);color:var(--blue);flex-shrink:0">N</span>
        <span style="flex:1;font-size:13px">${esc(p.designation)}</span>
        ${p.material ? `<span style="font-size:11px;color:var(--t4);font-family:var(--mono)">${esc(p.material)}</span>` : ''}
        ${p.unit_price ? `<span style="font-size:11px;color:var(--t3);font-family:var(--mono)">${fmtChf(p.unit_price)}</span>` : ''}
      </div>`).join('')}`).join('');
  setLeftBody(html);
}

async function openNormteilDetail(id) {
  const [parts, files] = await Promise.all([
    api('/api/standard-parts'),
    api(`/api/standard-parts/${id}/files`)
  ]);
  const p = parts.find(x => x.id === id);
  if (!p) return;

  const fmtSize = b => b < 1024 ? b+'B' : b < 1048576 ? (b/1024).toFixed(0)+'KB' : (b/1048576).toFixed(1)+'MB';
  const dsIcon = t => ({CAD:'📐',GCODE:'⚙',PDF:'📕',IMG:'🖼',DOC:'📄'}[t]||'📎');

  document.getElementById('dp-title').innerHTML =
    `<span style="font-size:11px;color:var(--t4);font-family:var(--mono);display:block">${esc([p.standard,p.std_number].filter(Boolean).join(' '))}</span>${esc(p.designation)}`;
  document.getElementById('dp-tabs').innerHTML =
    `<button class="tab active" onclick="switchTab(this,'nt-info')">Details</button>
     <button class="tab" onclick="switchTab(this,'nt-files')">Dateien <span style="font-size:11px">${files.length||''}</span></button>`;
  document.getElementById('dp-body').innerHTML = `
    <div id="nt-info">
      <div style="display:flex;gap:6px;margin-bottom:14px">
        <button class="btn btn-ghost btn-sm" onclick="openNormteilModal(${id})">✎ Bearbeiten</button>
        <button class="btn btn-ghost btn-sm" onclick="cloneNormteil(${id})">⧉ Dublizieren</button>
        <button class="btn btn-red btn-sm" onclick="delNormteil(${id})">🗑</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
        ${p.size     ? `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:5px 10px;font-size:13px"><div style="color:var(--t4);font-size:11px">Grösse</div><span style="font-family:var(--mono)">${esc(p.size)}</span></div>` : ''}
        ${p.material ? `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:5px 10px;font-size:13px"><div style="color:var(--t4);font-size:11px">Material</div>${esc(p.material)}</div>` : ''}
        ${p.unit_price!=null ? `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:5px 10px;font-size:13px"><div style="color:var(--t4);font-size:11px">Stückpreis</div><span style="font-family:var(--mono)">${fmtChf(p.unit_price)}</span></div>` : ''}
      </div>
      ${p.name  ? `<div style="font-size:13px;color:var(--t3);margin-bottom:6px">${esc(p.name)}</div>` : ''}
      ${p.notes ? `<div style="font-size:13px;color:var(--t3)">${esc(p.notes)}</div>` : ''}
    </div>
    <div id="nt-files" style="display:none">
      <div style="margin-bottom:12px">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">
          📎 Datei hochladen
          <input type="file" style="display:none" multiple onchange="uploadNtFiles(${id}, this)">
        </label>
      </div>
      ${files.length ? `<div style="display:flex;flex-direction:column;gap:4px">
        ${files.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
            <span style="font-size:15px">${dsIcon(f.ds_type)}</span>
            <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.original_name)}</span>
            <span style="font-size:11px;color:var(--t4);font-family:var(--mono)">${fmtSize(f.file_size||0)}</span>
            <a class="btn btn-ghost btn-sm btn-icon" href="/api/standard-part-files/${f.id}/download" title="Herunterladen">⬇</a>
            <button class="btn btn-red btn-sm btn-icon" onclick="delNtFile(${f.id},${id})">✕</button>
          </div>`).join('')}
      </div>` : `<div style="color:var(--t3);font-size:13px">Noch keine Dateien</div>`}
    </div>`;
  showDetail();
}

async function uploadNtFiles(stdPartId, input) {
  const files = Array.from(input.files);
  if (!files.length) return;
  for (const file of files) {
    const fd = new FormData(); fd.append('file', file);
    await fetch(`/api/standard-parts/${stdPartId}/files`, { method: 'POST', body: fd });
  }
  toast(`${files.length} Datei${files.length>1?'en':''} hochgeladen`, 'ok');
  openNormteilDetail(stdPartId);
}

async function delNtFile(fileId, stdPartId) {
  await api(`/api/standard-part-files/${fileId}`, 'DELETE');
  toast('Datei gelöscht', 'ok');
  openNormteilDetail(stdPartId);
}

function openNormteilModal(id) {
  _showDynModal(`<div class="modal" style="max-width:560px">
    <div class="modal-head"><div class="modal-title">${id ? 'Normteil bearbeiten' : 'Neues Normteil'}</div><button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" id="nt-modal-body"><div style="color:var(--t3);font-size:13px">Lädt…</div></div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="saveNormteil(${id||''})">Speichern</button>
    </div>
  </div>`);
  _loadNormteilForm(id);
}

async function _loadNormteilForm(id) {
  let p = {};
  if (id) { const all = await api('/api/standard-parts'); p = all.find(x => x.id === id) || {}; }
  const stdOpts = ['DIN','ISO','EN','ASME','ÖNORM','SN','Sonstiges'].map(s =>
    `<option ${(p.standard||'')=== s?'selected':''}>${s}</option>`).join('');
  document.getElementById('nt-modal-body').innerHTML = `
    <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
      Felder ausfüllen → Bezeichnung wird automatisch generiert (oder manuell überschreiben).
    </div>
    <div class="form-row cols3">
      <div class="fg"><label class="fl">Norm</label>
        <select class="fs" id="nt-std" onchange="_ntAutoDesig()">${stdOpts}</select>
      </div>
      <div class="fg"><label class="fl">Norm-Nr.</label>
        <input class="fi" id="nt-num" value="${esc(p.std_number||'')}" placeholder="z.B. 912" oninput="_ntAutoDesig()">
      </div>
      <div class="fg"><label class="fl">Grösse / Mass</label>
        <input class="fi" id="nt-size" value="${esc(p.size||'')}" placeholder="z.B. M4x12" oninput="_ntAutoDesig()">
      </div>
    </div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Kurzbezeichnung</label>
        <input class="fi" id="nt-name" value="${esc(p.name||'')}" placeholder="z.B. Zylinderschraube" oninput="_ntAutoDesig()">
      </div>
      <div class="fg"><label class="fl">Material / Güte</label>
        <input class="fi" id="nt-mat" value="${esc(p.material||'')}" placeholder="z.B. A2-70, 8.8" oninput="_ntAutoDesig()">
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label class="fl">Bezeichnung (auto-generiert, editierbar)</label>
        <input class="fi" id="nt-desig" value="${esc(p.designation||'')}" placeholder="z.B. DIN 912 Zylinderschraube M4x12 A2-70">
      </div>
    </div>
    <div class="form-row cols2">
      <div class="fg"><label class="fl">Stückpreis (CHF)</label>
        <input class="fi" type="number" id="nt-price" value="${p.unit_price??''}" placeholder="0.00" min="0" step="0.01">
      </div>
      <div class="fg"><label class="fl">Notizen</label>
        <input class="fi" id="nt-notes" value="${esc(p.notes||'')}">
      </div>
    </div>`;
  if (!id) _ntAutoDesig();
}

function _ntAutoDesig() {
  const std  = document.getElementById('nt-std')?.value  || '';
  const num  = document.getElementById('nt-num')?.value  || '';
  const name = document.getElementById('nt-name')?.value || '';
  const size = document.getElementById('nt-size')?.value || '';
  const mat  = document.getElementById('nt-mat')?.value  || '';
  const parts = [std, num, name, size, mat].filter(Boolean);
  const desig = document.getElementById('nt-desig');
  if (desig) desig.value = parts.join(' ');
}

async function saveNormteil(id) {
  const designation = document.getElementById('nt-desig')?.value.trim();
  if (!designation) { toast('Bezeichnung erforderlich', 'err'); return; }
  const body = {
    designation,
    standard:   document.getElementById('nt-std')?.value.trim(),
    std_number: document.getElementById('nt-num')?.value.trim(),
    name:       document.getElementById('nt-name')?.value.trim(),
    size:       document.getElementById('nt-size')?.value.trim(),
    material:   document.getElementById('nt-mat')?.value.trim(),
    unit_price: parseFloat(document.getElementById('nt-price')?.value) || null,
    notes:      document.getElementById('nt-notes')?.value.trim(),
  };
  if (id) await api(`/api/standard-parts/${id}`, 'PUT', body);
  else await api('/api/standard-parts', 'POST', body);
  _hideDynModal();
  toast('Gespeichert', 'ok');
  await renderNormteile();
}

function exportNormteile() {
  window.open(API + '/api/standard-parts/export', '_blank');
}

async function importNormteileFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const parts = data.parts || (Array.isArray(data) ? data : null);
    if (!parts) { toast('Ungültiges Format — erwartet { parts: [...] }', 'err'); return; }
    const r = await api('/api/standard-parts/import', 'POST', { parts });
    toast(`${r.added} importiert, ${r.skipped} bereits vorhanden`, 'ok');
    await renderNormteile();
  } catch(e) {
    toast('Import fehlgeschlagen: ' + (e.message||''), 'err');
  }
  input.value = '';
}

async function checkoutNormteile() {
  const r = await api('/api/checkout/normteile', 'POST', {});
  if (!r.copied.length && !r.message) {
    toast('Keine Dateien bei Normteilen hinterlegt', 'err'); return;
  }
  // Group by designation for display
  const byDesig = {};
  for (const f of r.copied) {
    if (!byDesig[f.designation]) byDesig[f.designation] = [];
    byDesig[f.designation].push(f.name);
  }
  _showDynModal(`<div class="modal" style="max-width:560px">
    <div class="modal-head">
      <div class="modal-title">✓ Normteile ausgecheckt</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="font-size:13px;color:var(--t3);margin-bottom:12px">
        ${r.copied.length} Datei${r.copied.length!==1?'en':''} nach
        <span style="font-family:var(--mono);color:var(--t2)">${esc(r.dir)}/</span> kopiert.
        Der Ordner heisst immer <span style="font-family:var(--mono);color:var(--blue)">normteile</span> — Solid Edge findet die Dateien über den konfigurierten Suchpfad.
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;max-height:320px;overflow-y:auto">
        ${Object.entries(byDesig).map(([desig, names]) => `
          <div style="padding:7px 10px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm)">
            <div style="font-size:13px;font-weight:500;margin-bottom:3px">${esc(desig)}</div>
            <div style="font-family:var(--mono);font-size:11px;color:var(--t4)">${names.map(n=>esc(n)).join(' · ')}</div>
          </div>`).join('')}
        ${r.errors.length ? `<div style="font-size:13px;color:var(--red);padding:7px 10px;background:var(--red-soft);border:1px solid var(--red-line);border-radius:var(--r-sm)">
          ⚠ Fehler bei: ${r.errors.map(e=>esc(e)).join(', ')}</div>` : ''}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-primary" onclick="_hideDynModal()">OK</button>
    </div>
  </div>`);
}

async function cloneNormteil(id) {
  const p = await api(`/api/standard-parts/${id}/clone`, 'POST');
  await renderNormteile();
  openNormteilDetail(p.id);
  openNormteilModal(p.id);
}

async function delNormteil(id) {
  if (!confirm('Normteil löschen? Es wird auch aus allen BOMs entfernt.')) return;
  await api(`/api/standard-parts/${id}`, 'DELETE');
  closeDetail();
  renderNormteile();
}

async function delRawMat(id) {
  if (!confirm('Material und alle Buchungen löschen?')) return;
  await api(`/api/raw-materials/${id}`, 'DELETE');
  _refreshRawMaterials();
  closeDetail();
  renderRawMaterials();
}

// ── BESTELLUNGS-PDF ───────────────────────────────────────────
async function generatePoDoc(id) {
  const po = await api('/api/purchase-orders/' + id);
  const s = state.settings || {};
  const today = new Date().toLocaleDateString('de-CH');
  const total = (po.items||[]).reduce((sum, i) => sum + (i.unit_price != null ? i.quantity * i.unit_price : 0), 0);

  const companyLines = [s.company_street, [s.company_postal_code, s.company_city].filter(Boolean).join(' ')].filter(Boolean);

  const supAddrLines = po.supplier_address ? po.supplier_address.split(/\r?\n/).filter(Boolean) : [];

  const itemRows = (po.items||[]).map((i, idx) => `
    <tr style="${idx % 2 === 0 ? 'background:#fafafa' : ''}">
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px">${escHtml(i.description)}${i.notes?`<div style="font-size:11px;color:#9ca3af;margin-top:1px">${escHtml(i.notes)}</div>`:''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:monospace;text-align:right;white-space:nowrap">${fmtN(i.quantity, 2)} ${escHtml(i.unit)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:monospace;text-align:right">${i.unit_price != null ? fmtN(i.unit_price, 2) : '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;font-family:monospace;text-align:right;font-weight:${i.unit_price != null ? '600' : '400'}">${i.unit_price != null ? fmtN(i.quantity * i.unit_price, 2) : '—'}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="de-CH"><head><meta charset="UTF-8">
  <title>Bestellung ${escHtml(po.number)}</title>
  <style>
    body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;color:#1f2937;margin:0;padding:32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #1d4ed8}
    .company-name{font-size:20px;font-weight:700;color:#1d4ed8}
    .doc-label{font-size:26px;font-weight:700;color:#111827;margin-bottom:4px}
    .meta{color:#6b7280;font-size:13px;line-height:1.7}
    .addr-label{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;margin-bottom:3px}
    table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;padding:7px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;text-align:left;border-bottom:2px solid #e5e7eb}
    th.r{text-align:right}
    @media print{body{padding:16px}}
  </style></head><body>

  <div class="header">
    <div>
      <div class="company-name">${escHtml(s.company_name||'')}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px;line-height:1.6">
        ${companyLines.map(l=>escHtml(l)).join('<br>')}
        ${s.company_phone?'<br>'+escHtml(s.company_phone):''}
        ${s.company_email?'<br>'+escHtml(s.company_email):''}
      </div>
    </div>
    <div style="text-align:right">
      <div class="doc-label">Bestellung</div>
      <div style="font-family:monospace;font-size:14px;color:#1d4ed8;margin-bottom:4px">${escHtml(po.number)}</div>
      <div class="meta">
        Datum: ${today}<br>
        ${po.expected_date?'Lieferdatum bis: <strong>'+po.expected_date+'</strong><br>':''}
      </div>
    </div>
  </div>

  <div style="display:flex;gap:48px;margin-bottom:28px">
    <div>
      <div class="addr-label">Lieferant</div>
      <div style="font-weight:600;font-size:13px">${escHtml(po.supplier_name||'—')}</div>
      ${po.supplier_address ? `<div style="margin-top:3px;line-height:1.7;color:#374151">${supAddrLines.map(l=>escHtml(l)).join('<br>')}</div>` : ''}
      ${po.supplier_email ? `<div style="margin-top:3px;color:#6b7280">${escHtml(po.supplier_email)}</div>` : ''}
      ${po.supplier_phone ? `<div style="color:#6b7280">${escHtml(po.supplier_phone)}</div>` : ''}
    </div>
    <div>
      <div class="addr-label">Von</div>
      <div style="font-weight:600;font-size:13px">${escHtml(s.company_name||'')}</div>
      ${companyLines.length ? `<div style="margin-top:3px;line-height:1.7;color:#374151">${companyLines.map(l=>escHtml(l)).join('<br>')}</div>` : ''}
    </div>
  </div>

  ${po.notes ? `<div style="margin-bottom:16px;padding:10px 14px;background:#eff6ff;border-radius:6px;font-size:13px;color:#374151">${escHtml(po.notes)}</div>` : ''}

  <table>
    <thead><tr>
      <th>Bezeichnung</th>
      <th class="r" style="width:100px">Menge</th>
      <th class="r" style="width:90px">EP (CHF)</th>
      <th class="r" style="width:90px">Total (CHF)</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
    ${total > 0 ? `<tfoot><tr>
      <td colspan="3" style="padding:8px 10px;text-align:right;font-size:13px;font-weight:700;color:#6b7280;border-top:2px solid #e5e7eb">Total CHF</td>
      <td style="padding:8px 10px;text-align:right;font-family:monospace;font-size:15px;font-weight:700;border-top:2px solid #e5e7eb">${fmtN(total,2)}</td>
    </tr></tfoot>` : ''}
  </table>

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280">
    Bitte bestätigen Sie diese Bestellung und teilen Sie uns die voraussichtliche Lieferzeit mit.
    ${s.company_email?'<br>Rückfragen an: '+escHtml(s.company_email):''}
  </div>

  <div style="margin-top:16px;font-size:12px;color:#d1d5db;text-align:right">${escHtml(po.number)} · ${today}</div>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=950,height=750');
  w.document.write(html);
  w.document.close();
}

// ── EINKAUF / BESTELLWESEN ────────────────────────────────────
const PO_ST = { DRAFT:'Entwurf', ORDERED:'Bestellt', RECEIVED:'Erhalten', CANCELLED:'Storniert' };
const PO_ST_CLS = { DRAFT:'st-DFT', ORDERED:'st-REV', RECEIVED:'st-REL', CANCELLED:'st-OBS' };

// Einkauf hat zwei Reiter: Bestellungen und Lieferanten. Der Browser merkt sich den letzten.
let _purchasingTab = 'orders';
try { if (localStorage.getItem('plm_purchasing_tab') === 'suppliers') _purchasingTab = 'suppliers'; } catch {}
function _setPurchasingTab(tab, render = true) {
  _purchasingTab = tab;
  try { localStorage.setItem('plm_purchasing_tab', tab); } catch {}
  if (render) { closeDetail(); renderPurchasing(); }
}
function _purchasingTitle() {
  const seg = (key, label) =>
    `<button class="${_purchasingTab === key ? 'active' : ''}" onclick="_setPurchasingTab('${key}')">${label}</button>`;
  return `<strong>Einkauf</strong><div class="partner-seg" style="margin-left:6px">${seg('orders', 'Bestellungen')}${seg('suppliers', 'Lieferanten')}</div>`;
}
function _purchasingActions() {
  return _purchasingTab === 'suppliers'
    ? `<div style="display:flex;gap:8px;align-items:center">${_partnerViewToggle('supplier')}
        <button class="btn btn-primary btn-sm" onclick="openSupplierModal()">+ Lieferant</button></div>`
    : `<button class="btn btn-primary btn-sm" onclick="openPoModal()">+ Bestellung</button>`;
}

async function renderPurchasing() {
  setLeftHeader(_purchasingTitle(), _purchasingActions());
  const [pos, suppliers] = await Promise.all([api('/api/purchase-orders'), api('/api/suppliers')]);
  state._poSuppliers = suppliers;
  state.suppliers = suppliers;
  if (_purchasingTab === 'suppliers') return _renderSupplierTab();

  const poRows = pos.map(po => {
    const total = po.total > 0 ? `<span style="font-family:var(--mono);font-size:13px;color:var(--t2)">${fmtCHF(po.total)}</span>` : '';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='var(--bg2)'">
      <div onclick="openPoDetail(${po.id})" style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer;min-width:0">
        <span class="status ${PO_ST_CLS[po.status]||'st-DFT'}" style="font-size:11px;flex-shrink:0">${PO_ST[po.status]||po.status}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${esc(po.number)}</span>
        <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(po.supplier_name||'—')}</span>
        <span style="font-size:12px;color:var(--t4)">${po.item_count} Pos.</span>
        ${total}
        <span style="font-size:12px;color:var(--t4)">${fmtD(po.order_date,'')}</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();generatePoDoc(${po.id})" title="PDF" style="flex-shrink:0;padding:2px 6px">&#128196;</button>
    </div>`;
  }).join('');

  setLeftBody(`
    <div style="display:flex;flex-direction:column;gap:4px;max-width:860px">
      ${poRows || '<div style="color:var(--t3);font-size:13px">Noch keine Bestellungen</div>'}
    </div>`);
}

async function openPoDetail(id) {
  const po = await api('/api/purchase-orders/' + id);
  const editable = po.status === 'DRAFT';
  const canOrder = po.status === 'DRAFT';
  const canReceive = po.status === 'ORDERED';
  const total = (po.items||[]).reduce((s,i) => s + (i.unit_price != null ? i.quantity * i.unit_price : 0), 0);

  const itemRows = (po.items||[]).map(i => `
    <tr>
      <td style="padding:5px 8px;border:1px solid var(--line);font-size:13px">${esc(i.description)}</td>
      <td style="padding:5px 8px;border:1px solid var(--line);font-size:13px;font-family:var(--mono);text-align:right">${fmtN(i.quantity,0)} ${esc(i.unit)}</td>
      <td style="padding:5px 8px;border:1px solid var(--line);font-size:13px;font-family:var(--mono);text-align:right">${i.unit_price != null ? fmtCHF(i.unit_price) : '—'}</td>
      <td style="padding:5px 8px;border:1px solid var(--line);font-size:13px;font-family:var(--mono);text-align:right">${i.unit_price != null ? fmtCHF(i.quantity * i.unit_price) : '—'}</td>
      <td style="padding:5px 8px;border:1px solid var(--line);font-size:12px;color:var(--t3)">
        ${i.inv_name ? esc(i.inv_name) : i.rm_name ? `🧵 ${esc(i.rm_name)}` : ''}
      </td>
      ${editable ? `<td style="padding:4px 6px;border:1px solid var(--line);white-space:nowrap">
        <button class="btn btn-ghost btn-sm" style="padding:1px 5px" onclick="openPoItemEditModal(${po.id},${i.id})">✏</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red);padding:1px 5px" onclick="deletePoItem(${po.id},${i.id})">✕</button>
      </td>` : '<td style="border:1px solid var(--line)"></td>'}
    </tr>`).join('');

  document.getElementById('dp-title').innerHTML =
    `<span class="status ${PO_ST_CLS[po.status]||'st-DFT'}" style="font-size:11px">${PO_ST[po.status]||po.status}</span>`
    + `<span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(po.number)}</span>`
    + `<strong>${esc(po.supplier_name||'Kein Lieferant')}</strong>`;

  document.getElementById('dp-tabs').innerHTML = '';
  document.getElementById('dp-body').innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      ${editable ? `<button class="btn btn-ghost btn-sm" onclick="openPoModal(${po.id})">✏ Bearbeiten</button>` : ''}
      ${canOrder ? `<button class="btn btn-primary btn-sm" onclick="setPoStatus(${po.id},'ORDERED')">Bestellen →</button>` : ''}
      ${canReceive ? `<button class="btn btn-green btn-sm" onclick="setPoStatus(${po.id},'RECEIVED')">✓ Als erhalten markieren</button>` : ''}
      ${po.status !== 'CANCELLED' && po.status !== 'RECEIVED' ? `<button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="setPoStatus(${po.id},'CANCELLED')">Stornieren</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="generatePoDoc(${po.id})" title="PDF">&#128196; PDF</button>
      <button class="btn btn-ghost btn-sm" style="color:var(--red);margin-left:auto" onclick="deletePo(${po.id})">Löschen</button>
    </div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--t3);margin-bottom:14px">
      ${po.order_date ? `<span>Bestellt: <strong style="color:var(--t1)">${fmtD(po.order_date)}</strong></span>` : ''}
      ${po.expected_date ? `<span>Erwartet: <strong style="color:var(--t1)">${po.expected_date}</strong></span>` : ''}
      ${po.supplier_email ? `<span>${esc(po.supplier_email)}</span>` : ''}
      ${po.supplier_phone ? `<span>${esc(po.supplier_phone)}</span>` : ''}
    </div>
    ${po.notes ? `<div style="font-size:13px;color:var(--t3);margin-bottom:14px;padding:8px 10px;background:var(--bg2);border-radius:var(--r-sm)">${esc(po.notes)}</div>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px;text-align:left;color:var(--t3)">Bezeichnung</th>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px;text-align:right;color:var(--t3)">Menge</th>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px;text-align:right;color:var(--t3)">EP</th>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px;text-align:right;color:var(--t3)">Total</th>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px;text-align:left;color:var(--t3)">Verknüpfung</th>
        <th style="padding:5px 8px;background:var(--bg2);border:1px solid var(--line);font-size:11px"></th>
      </tr></thead>
      <tbody>${itemRows}</tbody>
      ${total > 0 ? `<tfoot><tr>
        <td colspan="3" style="padding:5px 8px;border:1px solid var(--line);text-align:right;font-size:13px;font-weight:600;color:var(--t3)">Total</td>
        <td style="padding:5px 8px;border:1px solid var(--line);font-family:var(--mono);font-weight:700;text-align:right">${fmtCHF(total)}</td>
        <td colspan="2" style="border:1px solid var(--line)"></td>
      </tr></tfoot>` : ''}
    </table>
    ${editable ? `<button class="btn btn-ghost btn-sm" onclick="openPoItemModal(${po.id})">+ Position</button>` : ''}`;

  showDetail();
}

// preset: { supplierId } — "+ Bestellung" direkt beim Lieferanten
async function openPoModal(id, preset = {}) {
  const suppliers = state._poSuppliers || await api('/api/suppliers');
  document.getElementById('po-supplier-id').innerHTML = '<option value="">— Freie Eingabe —</option>' +
    suppliers.map(s => `<option value="${s.id}">${esc(s.number)} ${esc(s.name)}</option>`).join('');

  if (id) {
    const po = await api('/api/purchase-orders/' + id);
    document.getElementById('po-modal-title').textContent = 'Bestellung bearbeiten';
    document.getElementById('po-edit-id').value = id;
    document.getElementById('po-supplier-id').value = po.supplier_id || '';
    document.getElementById('po-supplier-name').value = po.supplier_name_free || '';
    document.getElementById('po-order-date').value = po.order_date || '';
    document.getElementById('po-expected-date').value = po.expected_date || '';
    document.getElementById('po-notes').value = po.notes || '';
    document.getElementById('po-supplier-free').style.display = po.supplier_id ? 'none' : 'block';
  } else {
    document.getElementById('po-modal-title').textContent = 'Bestellung erstellen';
    document.getElementById('po-edit-id').value = '';
    document.getElementById('po-supplier-id').value = preset.supplierId || '';
    document.getElementById('po-supplier-name').value = '';
    document.getElementById('po-order-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('po-expected-date').value = '';
    document.getElementById('po-notes').value = '';
    document.getElementById('po-supplier-free').style.display = preset.supplierId ? 'none' : 'block';
  }
  openModal('poModal');
}

async function savePo() {
  const id = document.getElementById('po-edit-id').value;
  const body = {
    supplier_id: document.getElementById('po-supplier-id').value || null,
    supplier_name_free: document.getElementById('po-supplier-name').value,
    order_date: document.getElementById('po-order-date').value,
    expected_date: document.getElementById('po-expected-date').value,
    notes: document.getElementById('po-notes').value,
  };
  const po = id ? await api(`/api/purchase-orders/${id}`, 'PUT', body) : await api('/api/purchase-orders', 'POST', body);
  toast(id ? 'Gespeichert' : 'Bestellung angelegt', 'ok');
  closeModal('poModal');
  _setPurchasingTab('orders', false);
  await renderPurchasing();
  openPoDetail(po.id);
  loadStats();
}

async function openPoItemModal(poId) {
  document.getElementById('poi-po-id').value = poId;
  document.getElementById('poi-desc').value = '';
  document.getElementById('poi-qty').value = '1';
  document.getElementById('poi-unit').value = 'Stk';
  document.getElementById('poi-price').value = '';
  document.getElementById('poi-notes').value = '';
  const [invItems, rawMats, stdParts] = await Promise.all([
    api('/api/inventory').catch(() => []),
    api('/api/raw-materials').catch(() => []),
    api('/api/standard-parts').catch(() => []),
  ]);
  // Normteile, die ueber den Einkauf schon einen Lagerartikel haben, werden
  // dort gefuehrt — sie doppelt anzubieten wuerde nur verwirren.
  const linkedStd = new Set(invItems.map(i => i.std_part_id).filter(Boolean));
  const freeStd = stdParts.filter(sp => !linkedStd.has(sp.id));
  document.getElementById('poi-link-id').innerHTML = '<option value="">— kein —</option>' +
    (invItems.length ? `<optgroup label="Lagerartikel">${invItems.map(i => `<option value="inv:${i.id}">${esc(i.name)}${i.sku?' ('+esc(i.sku)+')':''}</option>`).join('')}</optgroup>` : '') +
    (rawMats.length ? `<optgroup label="Rohmaterial">${rawMats.map(r => `<option value="rm:${r.id}">${esc(r.name)}${r.material_type?' · '+esc(r.material_type):''}${r.color?' · '+esc(r.color):''}</option>`).join('')}</optgroup>` : '') +
    (freeStd.length ? `<optgroup label="Normteile">${freeStd.map(sp => `<option value="std:${sp.id}" data-desig="${esc(sp.designation||'')}" data-price="${sp.unit_price ?? ''}">${esc(sp.designation || sp.name)}</option>`).join('')}</optgroup>` : '');
  openModal('poItemModal');
}

// Bei Auswahl eines Normteils Bezeichnung und Preis vorbelegen, damit die
// Position nicht noch einmal abgetippt werden muss.
function onPoLinkChange(sel) {
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !sel.value.startsWith('std:')) return;
  const desc = document.getElementById('poi-desc');
  const price = document.getElementById('poi-price');
  if (desc && !desc.value.trim()) desc.value = opt.dataset.desig || opt.textContent.trim();
  if (price && !price.value && opt.dataset.price) price.value = opt.dataset.price;
}

async function savePoItem() {
  const poId = document.getElementById('poi-po-id').value;
  const desc = document.getElementById('poi-desc').value.trim();
  if (!desc) return toast('Bezeichnung eingeben', 'err');
  const link = document.getElementById('poi-link-id').value;
  const invId = link.startsWith('inv:') ? link.slice(4) : null;
  const rmId  = link.startsWith('rm:')  ? link.slice(3) : null;
  const stdId = link.startsWith('std:') ? link.slice(4) : null;
  await api(`/api/purchase-orders/${poId}/items`, 'POST', {
    description: desc,
    quantity: document.getElementById('poi-qty').value,
    unit: document.getElementById('poi-unit').value,
    unit_price: document.getElementById('poi-price').value || null,
    inventory_item_id: invId,
    raw_material_id: rmId,
    std_part_id: stdId,
    notes: document.getElementById('poi-notes').value,
  });
  toast('Position hinzugefügt', 'ok');
  closeModal('poItemModal');
  openPoDetail(parseInt(poId));
}

async function deletePoItem(poId, itemId) {
  await api(`/api/purchase-orders/${poId}/items/${itemId}`, 'DELETE');
  openPoDetail(poId);
}

async function openPoItemEditModal(poId, itemId) {
  const po = await api('/api/purchase-orders/' + poId);
  const item = (po.items||[]).find(i => i.id === itemId);
  if (!item) return;
  document.getElementById('poie-po-id').value = poId;
  document.getElementById('poie-item-id').value = itemId;
  document.getElementById('poie-desc').value = item.description;
  document.getElementById('poie-qty').value = item.quantity;
  document.getElementById('poie-unit').value = item.unit;
  document.getElementById('poie-price').value = item.unit_price ?? '';
  document.getElementById('poie-notes').value = item.notes || '';
  openModal('poItemEditModal');
  document.getElementById('poie-desc').focus();
}

async function savePoItemEdit() {
  const poId = document.getElementById('poie-po-id').value;
  const itemId = document.getElementById('poie-item-id').value;
  const desc = document.getElementById('poie-desc').value.trim();
  if (!desc) return toast('Bezeichnung eingeben', 'err');
  await api(`/api/purchase-orders/${poId}/items/${itemId}`, 'PUT', {
    description: desc,
    quantity: document.getElementById('poie-qty').value,
    unit: document.getElementById('poie-unit').value,
    unit_price: document.getElementById('poie-price').value || null,
    notes: document.getElementById('poie-notes').value,
  });
  toast('Gespeichert', 'ok');
  closeModal('poItemEditModal');
  openPoDetail(parseInt(poId));
}

async function setPoStatus(poId, status) {
  if (status === 'RECEIVED') {
    const po = await api('/api/purchase-orders/' + poId);
    const rmItems = (po.items||[]).filter(i => i.raw_material_id);
    if (rmItems.length) {
      // Ask for lot numbers via modal
      window._poReceiveId = poId;
      window._poReceiveRmItems = rmItems;
      document.getElementById('po-receive-rows').innerHTML = '';
      document.getElementById('lot-all').value = '';
      _setLotMode(rmItems.length > 1 ? 'same' : 'individual');
      const invLinked = (po.items||[]).filter(i => i.inventory_item_id).length;
      document.getElementById('po-receive-inv-hint').textContent = invLinked
        ? `${invLinked} Lagerartikel werden ohne Lot-Nr. eingebucht.` : '';
      openModal('poReceiveModal');
      return;
    }
    const invLinked = (po.items||[]).filter(i => i.inventory_item_id).length;
    if (invLinked && !confirm(`${invLinked} Lagerartikel werden eingebucht. Fortfahren?`)) return;
  }
  await api(`/api/purchase-orders/${poId}/status`, 'PUT', { status });
  toast(PO_ST[status] || status, 'ok');
  await renderPurchasing();
  openPoDetail(poId);
  loadStats();
}

function _setLotMode(mode) {
  window._lotMode = mode;
  document.getElementById('po-receive-same').style.display = mode === 'same' ? '' : 'none';
  document.getElementById('po-receive-rows').style.display  = mode === 'individual' ? '' : 'none';
  document.getElementById('lot-mode-same').className       = 'btn btn-sm ' + (mode === 'same' ? 'btn-primary' : 'btn-ghost');
  document.getElementById('lot-mode-individual').className = 'btn btn-sm ' + (mode === 'individual' ? 'btn-primary' : 'btn-ghost');
  if (mode === 'individual') _renderIndividualLotRows();
  else setTimeout(() => document.getElementById('lot-all')?.focus(), 50);
}

function _renderIndividualLotRows() {
  const rmItems = window._poReceiveRmItems || [];
  document.getElementById('po-receive-rows').innerHTML = rmItems.map(i => {
    const units = Math.max(1, Math.round(i.quantity));
    const unitInputs = units === 1
      ? `<input class="fi" id="lot-${i.id}-0" placeholder="Lot-Nr. (optional)" style="font-family:var(--mono);font-size:13px">`
      : Array.from({length: units}, (_, u) =>
          `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
            <span style="font-size:12px;color:var(--t4);width:56px;flex-shrink:0">Nr. ${u+1}</span>
            <input class="fi" id="lot-${i.id}-${u}" placeholder="Lot-Nr. (optional)" style="font-family:var(--mono);font-size:13px">
          </div>`).join('');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:13px;font-weight:600;margin-bottom:2px">🧵 ${esc(i.rm_name)}</div>
      <div style="font-size:12px;color:var(--t3);margin-bottom:4px">${esc(i.description)} · ${fmtN(i.quantity,2)} ${esc(i.unit)}</div>
      ${unitInputs}
    </div>`;
  }).join('');
}

async function confirmPoReceive() {
  const poId = window._poReceiveId;
  const rmItems = window._poReceiveRmItems || [];
  const lot_numbers = {};
  if (window._lotMode === 'same') {
    const sharedLot = document.getElementById('lot-all')?.value.trim();
    // send as string → backend uses full item.quantity in one movement
    rmItems.forEach(i => { if (sharedLot) lot_numbers[i.id] = sharedLot; });
  } else {
    rmItems.forEach(i => {
      const units = Math.max(1, Math.round(i.quantity));
      // collect array of lot strings (one per unit)
      const arr = Array.from({length: units}, (_, u) =>
        document.getElementById(`lot-${i.id}-${u}`)?.value.trim() || '');
      lot_numbers[i.id] = arr;
    });
  }
  closeModal('poReceiveModal');
  await api(`/api/purchase-orders/${poId}/status`, 'PUT', { status: 'RECEIVED', lot_numbers });
  toast('Erhalten', 'ok');
  await renderPurchasing();
  openPoDetail(poId);
  loadStats();
}

async function deletePo(id) {
  if (!confirm('Bestellung löschen?')) return;
  await api(`/api/purchase-orders/${id}`, 'DELETE');
  toast('Gelöscht', 'ok');
  closeDetail();
  renderPurchasing();
  loadStats();
}

// ── LIEFERANTEN ───────────────────────────────────────────────
// Gleiche Darstellung wie Kunden (siehe GESCHÄFTSPARTNER in 05-erp-views.js)
const _PO_GROUPS = [
  ['Entwurf', ['DRAFT']],
  ['Bestellt', ['ORDERED']],
  ['Erhalten', ['RECEIVED']],
  ['Storniert', ['CANCELLED']],
];
const _PO_OPEN_STATUSES = ['DRAFT', 'ORDERED'];

_registerPartnerKind('supplier', {
  prefsKey: 'plm_supplier_view',
  noun: ['Lieferant', 'Lieferanten'],
  rows: () => state.suppliers || [],
  detailId: () => state.supplierDetailId,
  openFn: 'openSupplierDetail',
  render: () => renderPurchasing(),
  header: () => setLeftHeader(_purchasingTitle(), _purchasingActions()),
  searchHint: 'Suchen nach Name, Kontaktperson, Ort, E-Mail…',
  searchFields: s => [s.name, s.number, s.contact_person, s.email, s.phone, s.street, s.postal_code, s.city, s.country, s.address, s.notes],
  filters: [['', 'Alle Lieferanten'], ['open', 'Mit offenen Bestellungen'], ['none', 'Ohne Bestellungen']],
  show: { open: s => s.open_po_count > 0, none: s => !s.po_count },
  sorts: [['name', 'Name A–Z'], ['recent', 'Zuletzt aktiv'], ['value', 'Bestellvolumen'], ['number', 'Nummer']],
  value: s => s.volume,
  valueLabel: 'Volumen',
  valueTitle: 'Bestellvolumen aus bestellten und erhaltenen Bestellungen',
  card: (s, short) => {
    const open = s.open_po_count || 0, inv = s.inventory_count || 0;
    return {
      contact: [s.contact_person && `<span title="Kontaktperson">👤 ${esc(s.contact_person)}</span>`,
        s.email && _mailLink(s.email), s.phone && _telLink(s.phone)].filter(Boolean),
      pills: (open ? _pill('amber', short ? open : `${open} ${open === 1 ? 'offene Bestellung' : 'offene Bestellungen'}`,
                'Entwurf oder bestellt, noch nicht erhalten') : '')
           + (inv && !short ? _pill('', `${inv} Lagerartikel`, 'Lagerartikel mit diesem Lieferanten') : ''),
      meta: s.po_count
        ? `${s.po_count} Bestellung${s.po_count === 1 ? '' : 'en'}${s.last_activity ? ' · zuletzt ' + fmtD(s.last_activity) : ''}`
        : 'Noch keine Bestellungen',
      value: s.volume,
      quick: { label: '+ Bestellung', title: 'Neue Bestellung bei diesem Lieferanten', onclick: `openPoModal(null,{supplierId:${s.id}})` },
    };
  },
});

function _renderSupplierTab() {
  if (!(state.suppliers || []).length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">🏭</div><div class="empty-text">Noch keine Lieferanten</div>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" onclick="openSupplierModal()">+ Ersten Lieferanten anlegen</button></div>`);
    return;
  }
  setLeftBody(_partnerBody('supplier'));
  _renderPartnerRows('supplier');
}

// Aus dem Lieferanten direkt in die Bestellung springen
async function _openPoFromSupplier(id) {
  _setPurchasingTab('orders', false);
  await renderPurchasing();
  openPoDetail(id);
}

function _poRowForSupplier(po) {
  const meta = [po.order_date ? fmtD(po.order_date) : '', po.expected_date ? 'erwartet ' + fmtD(po.expected_date) : '',
    po.notes ? esc(po.notes.split('\n')[0]) : ''].filter(Boolean).join(' · ');
  return _partnerDocRow(`_openPoFromSupplier(${po.id})`,
    `<span class="status ${PO_ST_CLS[po.status] || 'st-DFT'}">${PO_ST[po.status] || po.status}</span>`,
    po.number, meta || '—', po.total > 0 ? fmtCHF(po.total) : '—', po.item_count);
}

function _invRowForSupplier(i) {
  const low = i.min_qty != null && i.stock_qty <= i.min_qty;
  return `<div class="partner-row" onclick="gotoView('inventory').then(()=>openInventoryDetail(${i.id}))">
    <span class="status ${low ? 'st-OBS' : 'st-REL'}">${low ? 'KNAPP' : 'LAGER'}</span>
    <div style="min-width:0">
      <div class="partner-row-title">${esc(i.name)}</div>
      <div class="partner-row-meta">${[i.sku ? esc(i.sku) : '', i.category ? esc(i.category) : ''].filter(Boolean).join(' · ') || '—'}</div>
    </div>
    <div style="text-align:right">
      <div style="font-family:var(--mono);font-size:13px">${fmtN(i.stock_qty || 0, 1)} ${esc(i.unit || 'Stk')}</div>
      <div class="partner-row-meta">${i.price_per_unit != null ? fmtCHF(i.price_per_unit) + '/' + esc(i.unit || 'Stk') : ''}</div>
    </div>
  </div>`;
}

async function _copySupplierAddress(id) {
  const s = (state.suppliers || []).find(x => x.id === id) || await api('/api/suppliers/' + id);
  copyText(_partnerAddressText(s), 'Adresse kopiert');
}

async function openSupplierDetail(id) {
  const s = await api('/api/suppliers/' + id);
  state.supplierDetailId = s.id;
  const pos = s.purchase_orders || [], inv = s.inventory_items || [];
  const open = pos.filter(p => _PO_OPEN_STATUSES.includes(p.status));
  const lastDate = pos.map(p => p.order_date || (p.created_at || '').slice(0, 10)).sort().pop();

  document.getElementById('dp-title').innerHTML = _partnerTitle(s);
  document.getElementById('dp-tabs').innerHTML = `
    <button class="tab active" onclick="switchTab(this,'sd-overview')">Übersicht</button>
    <button class="tab" onclick="switchTab(this,'sd-orders')">Bestellungen${_partnerTabCount(pos.length)}</button>
    <button class="tab" onclick="switchTab(this,'sd-inventory')">Lagerartikel${_partnerTabCount(inv.length)}</button>`;

  document.getElementById('dp-body').innerHTML = `
    <div id="sd-overview">
      <div class="partner-actions">
        <button class="btn btn-primary btn-sm" onclick="openPoModal(null,{supplierId:${s.id}})">+ Bestellung</button>
        <span style="flex:1"></span>
        <button class="btn btn-ghost btn-sm" onclick="openSupplierModal(${s.id})">✏️ Bearbeiten</button>
        <button class="btn btn-red btn-sm" onclick="deleteSupplier(${s.id})">🗑 Löschen</button>
      </div>
      ${_partnerKpis([
        ['Bestellvolumen', s.volume > 0 ? fmtCHF(s.volume) : '—', 'bestellt und erhalten', s.volume > 0 ? 'var(--green)' : ''],
        ['Offene Bestellungen', open.length, '', open.length ? 'var(--amber)' : ''],
        ['Lagerartikel', inv.length, '', ''],
        ['Letzte Bestellung', lastDate ? fmtD(lastDate) : '—', s.created_at ? 'Lieferant seit ' + fmtD(s.created_at) : ''],
      ])}
      ${_partnerInfo(s, `_copySupplierAddress(${s.id})`,
        [['Kontaktperson', s.contact_person ? esc(s.contact_person) : '<span class="partner-muted">—</span>']])}
      <div class="sep-label">Offene Bestellungen</div>
      ${open.length ? _partnerList(open.map(_poRowForSupplier))
        : _partnerEmpty(pos.length ? 'Nichts offen — alle Bestellungen sind erhalten oder storniert.' : 'Noch keine Bestellungen bei diesem Lieferanten.')}
    </div>
    <div id="sd-orders" style="display:none">
      ${pos.length ? `<div class="partner-sum"><span>${pos.length} Bestellung${pos.length === 1 ? '' : 'en'}</span>
        <span>Volumen <b style="font-family:var(--mono);color:var(--t1)">${fmtCHF(s.volume || 0)}</b></span></div>
        ${_partnerGroups(_PO_GROUPS, pos, _poRowForSupplier)}`
        : _partnerEmpty('Noch keine Bestellungen bei diesem Lieferanten.')}
    </div>
    <div id="sd-inventory" style="display:none">
      ${inv.length ? _partnerList(inv.map(_invRowForSupplier)) : _partnerEmpty('Keine Lagerartikel mit diesem Lieferanten.')}
    </div>`;

  _markActiveRow(s.id);
  showDetail();
}

async function openSupplierModal(id) {
  const f = k => document.getElementById('sup-' + k);
  f('edit-id').value = id || '';
  const s = id ? await api('/api/suppliers/' + id) : {};
  f('modal-title').textContent = id ? 'Lieferant bearbeiten' : 'Neuer Lieferant';
  for (const [k, v] of [['name', s.name], ['contact', s.contact_person], ['phone', s.phone], ['email', s.email],
    ['street', s.street], ['plz', s.postal_code], ['city', s.city], ['notes', s.notes]]) f(k).value = v || '';
  // Land nur bei neuen Lieferanten vorbelegen — bei bestehenden gilt, was gespeichert ist
  f('country').value = id ? (s.country || '') : 'Schweiz';
  // Frühere Freitext-Adresse anzeigen, solange sie nicht übernommen ist
  const legacy = id && s.address && !(s.street || s.postal_code || s.city);
  f('legacy').style.display = legacy ? '' : 'none';
  f('legacy-text').textContent = legacy ? s.address : '';
  openModal('supplierModal');
}

async function saveSupplier() {
  const v = k => document.getElementById('sup-' + k).value.trim();
  const id = v('edit-id');
  const body = {
    name: v('name'), contact_person: v('contact'), phone: v('phone'), email: v('email'),
    street: v('street'), postal_code: v('plz'), city: v('city'), country: v('country'), notes: v('notes'),
  };
  if (!body.name) return toast('Name eingeben', 'err');
  const s = id
    ? await api('/api/suppliers/' + id, 'PUT', body)
    : await api('/api/suppliers', 'POST', body);
  toast(id ? 'Gespeichert' : 'Lieferant angelegt', 'ok');
  closeModal('supplierModal');
  _setPurchasingTab('suppliers', false);
  await renderPurchasing();
  openSupplierDetail(s.id);
}

async function deleteSupplier(id) {
  const s = (state.suppliers || []).find(x => x.id === id);
  if (!confirm(`Lieferant ${s ? s.number + ' ' + s.name : ''} löschen?\nBestehende Bestellungen behalten den Namen.`)) return;
  await api('/api/suppliers/' + id, 'DELETE');
  toast('Gelöscht', 'ok');
  closeDetail();
  state.supplierDetailId = null;
  renderPurchasing();
}
