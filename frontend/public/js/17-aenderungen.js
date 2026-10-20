// 17-aenderungen.js — Änderungsanträge (ECR): eine Änderung mit Begründung für
// ein oder mehrere Teile, mit ihrer Auswirkung auf Baugruppen, offene Aufträge,
// Produktion und Lager. Offen → Genehmigt → In Umsetzung → Erledigt, oder
// Abgelehnt. Umsetzen legt je Teil die Revision an, in der geändert wird.
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.

const ECR_ST = {
  OPEN: ['Offen', 'st-REV'], APPROVED: ['Genehmigt', 'st-DFT'], IN_WORK: ['In Umsetzung', 'st-ECO'],
  DONE: ['Erledigt', 'st-REL'], REJECTED: ['Abgelehnt', 'st-OBS'],
};
function ecrBadge(status) {
  const [label, cls] = ECR_ST[status] || [status, 'st-DFT'];
  return `<span class="status ${cls}" style="font-size:11px">${esc(label)}</span>`;
}
const _ecrDate = d => (d ? fmtD(String(d).slice(0, 10)) : '');

async function renderEcrList() {
  setLeftHeader('Änderungen', `<button class="btn btn-primary btn-sm" onclick="openEcrModal()">+ Änderungsantrag</button>`);
  const list = await api('/api/ecrs');
  if (!list.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">🛠</div><div class="empty-text">Noch keine Änderungsanträge</div>
      <div style="font-size:13px;color:var(--t3);max-width:420px;margin:8px auto 0;line-height:1.6">Ein Änderungsantrag hält fest, was an welchen Teilen
        geändert werden soll und warum — mit den betroffenen Baugruppen, Aufträgen und dem Lagerbestand.</div>
      <div style="margin-top:12px"><button class="btn btn-primary" onclick="openEcrModal()">Ersten Änderungsantrag anlegen</button></div></div>`);
    return;
  }
  setLeftBody(`<div class="tbl-wrap"><table>
    <thead><tr><th>Nummer</th><th>Titel</th><th>Teile</th><th>Status</th><th>Angelegt</th></tr></thead>
    <tbody>${list.map(e => `<tr data-id="${e.id}" onclick="openEcrDetail(${e.id})">
      <td style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(e.number)}</td>
      <td style="font-weight:500">${esc(e.title)}</td>
      <td style="font-family:var(--mono);font-size:13px;color:var(--t3)">${e.item_count}</td>
      <td>${ecrBadge(e.status)}</td>
      <td style="font-size:13px;color:var(--t3)">${_ecrDate(e.created_at)}${e.created_by ? ' · ' + esc(e.created_by) : ''}</td>
    </tr>`).join('')}</tbody></table></div>`);
}

async function openEcrDetail(id) {
  let e;
  try { e = await api(`/api/ecrs/${id}`); } catch { return; }
  document.getElementById('dp-title').innerHTML = `<strong>${esc(e.number)}</strong>&nbsp;${esc(e.title)}`;
  document.getElementById('dp-tabs').innerHTML = '';
  document.getElementById('dp-body').innerHTML = _ecrDetailHtml(e, typeof canRelease === 'function' ? canRelease() : true);
  _markActiveRow(id);
  showDetail();
}

// Ein Teil im Antrag: Stand vorher → Revision der Änderung, und was davon abhängt
function _ecrItemHtml(x) {
  const link = (onclick, txt) => `<span style="font-family:var(--mono);color:var(--blue);cursor:pointer" onclick="${onclick}">${esc(txt)}</span>`;
  const revTag = r => r ? `<span class="status st-${esc(r.status)}" style="font-size:11px">rev${esc(r.rev)}</span>` : '—';
  const im = x.impact || {};
  const line = (label, list, render) => list?.length
    ? `<div><span style="color:var(--t3)">${label}:</span> ${list.map(render).join(', ')}</div>` : '';
  const impact = [
    line('Verbaut in', im.parents, p => link(`gotoPlmItem(${p.id})`, p.item_number)),
    line('Offene Aufträge und Angebote', im.orders, o => link(`gotoView('orders').then(() => openOrderDetail(${o.id}))`, o.number)),
    line('Offene Produktion', im.production, d => link(`gotoView('deliveries').then(() => openDeliveryDetail(${d.id}))`, d.number)),
    im.stock > 0 ? `<div><span style="color:var(--t3)">Lagerbestand:</span> ${fmtN(im.stock, 0)} — noch verwendbar?</div>` : '',
  ].join('');
  return `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-bottom:8px;font-size:13px">
    <div style="display:flex;align-items:center;gap:8px">
      ${_itemChip(x.item_type, 16)}
      ${link(`gotoPlmItem(${x.item_id})`, x.item_number)}
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;flex-shrink:0" title="Stand beim Anlegen → Revision der Änderung">${revTag(x.before)}${x.after ? ` → ${revTag(x.after)}` : ''}</span>
    </div>
    ${x.note ? `<div style="color:var(--t2);margin-top:6px;white-space:pre-wrap">${esc(x.note)}</div>` : ''}
    <div style="margin-top:6px;line-height:1.7">${impact || '<span style="color:var(--t3)">Keine weiteren Auswirkungen gefunden</span>'}</div>
  </div>`;
}

function _ecrDetailHtml(e, mayDecide) {
  const who = (by, at) => [by, _ecrDate(at)].filter(Boolean).map(esc).join(' · ');
  const decided = e.decided_at ? `<div style="font-size:13px;color:var(--t3);margin-top:4px">${e.status === 'REJECTED' ? 'Abgelehnt' : 'Genehmigt'}: ${who(e.decided_by, e.decided_at)}${
    e.decision_note ? ` — <span style="color:var(--t2)">${esc(e.decision_note)}</span>` : ''}</div>` : '';
  // Im einfachen Workflow gibt es keine Freigabe — dort nicht nach REL zählen
  const simple = state.settings?.workflow_mode === 'simple';
  const pending = simple ? 0 : e.items.filter(x => x.after && x.after.status !== 'REL').length;
  const decideBtn = (approve, label, cls) => mayDecide
    ? `<button class="btn ${cls} btn-sm" onclick="_ecrDecide(${e.id},${approve})">${label}</button>`
    : `<span title="Genehmigen und Ablehnen dürfen Superuser und Admins" style="display:inline-flex"><button class="btn ${cls} btn-sm" disabled>${label}</button></span>`;
  const actions = {
    OPEN: `<button class="btn btn-ghost btn-sm" onclick="openEcrModal(${e.id})">✏ Bearbeiten</button>
      ${decideBtn(true, '✓ Genehmigen', 'btn-green')} ${decideBtn(false, '✗ Ablehnen', 'btn-red')}
      <button class="btn btn-ghost btn-sm" onclick="_ecrDelete(${e.id})">🗑 Löschen</button>`,
    APPROVED: `<button class="btn btn-primary btn-sm" onclick="_ecrImplement(${e.id})">⚙ Umsetzen — Revisionen anlegen</button>`,
    IN_WORK: `<button class="btn btn-green btn-sm" onclick="_ecrClose(${e.id},${pending})">✓ Abschliessen</button>
      ${simple ? '' : `<span style="font-size:13px;color:var(--t3)">${pending
        ? `${pending} von ${e.items.length} neuen Revisionen noch nicht freigegeben` : 'alle neuen Revisionen freigegeben'}</span>`}`,
    REJECTED: `<button class="btn btn-ghost btn-sm" onclick="_ecrDelete(${e.id})">🗑 Löschen</button>`,
  }[e.status] || '';
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      ${ecrBadge(e.status)}
      <span style="font-size:13px;color:var(--t3)">angelegt ${who(e.created_by, e.created_at)}</span>
    </div>
    ${decided}
    ${actions ? `<div class="btn-row" style="margin-top:10px;align-items:center">${actions}</div>` : ''}
    <div class="sep-label">Begründung</div>
    <div style="font-size:13px;color:var(--t2);white-space:pre-wrap;line-height:1.6">${e.reason ? esc(e.reason) : '<span style="color:var(--t3)">—</span>'}</div>
    ${e.description ? `<div class="sep-label">Was wird geändert</div>
      <div style="font-size:13px;color:var(--t2);white-space:pre-wrap;line-height:1.6">${esc(e.description)}</div>` : ''}
    <div class="sep-label">Betroffene Teile <span style="font-family:var(--mono);color:var(--t3);text-transform:none;letter-spacing:0">${e.items.length}</span></div>
    ${e.items.map(_ecrItemHtml).join('')}`;
}

// ── Anlegen und bearbeiten ────────────────────────────────────
let _ecrDraft = null;   // { id, items: [{ item_id, item_number, name, item_type, note }] }

async function openEcrModal(id = null, preset = []) {
  let e = null;
  if (id) { try { e = await api(`/api/ecrs/${id}`); } catch { return; } }
  _ecrDraft = { id, items: e
    ? e.items.map(x => ({ item_id: x.item_id, item_number: x.item_number, name: x.name, item_type: x.item_type, note: x.note || '' }))
    : preset.map(x => ({ note: '', ...x })) };
  _showDynModal(`<div class="modal" style="max-width:620px;width:95vw">
    <div class="modal-head"><div class="modal-title">${e ? 'Änderungsantrag bearbeiten' : 'Neuer Änderungsantrag'}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;max-height:70vh;overflow-y:auto">
      <div class="fg"><label class="fl">Titel *</label>
        <input class="fi" id="ecr-title" value="${esc(e?.title || '')}" placeholder="z.B. Wandstärke Halter erhöhen"></div>
      <div class="fg"><label class="fl">Begründung — warum?</label>
        <textarea class="ft" id="ecr-reason" placeholder="z.B. Bruch beim Kunden, Reklamation …">${esc(e?.reason || '')}</textarea></div>
      <div class="fg"><label class="fl">Was wird geändert?</label>
        <textarea class="ft" id="ecr-desc" placeholder="z.B. Wand von 1.6 auf 2.4 mm, Radius an der Kante">${esc(e?.description || '')}</textarea></div>
      <div class="fg"><label class="fl">Betroffene Teile *</label>
        <div style="position:relative">
          <input class="fi" id="ecr-search" placeholder="Teil suchen: Nummer oder Name …" autocomplete="off" oninput="_ecrSearch(this.value)">
          <div id="ecr-results" style="display:none;position:absolute;z-index:300;left:0;right:0;top:100%;background:var(--bg2);border:1px solid var(--line2);border-radius:var(--r);box-shadow:0 8px 24px rgba(0,0,0,.5);max-height:220px;overflow-y:auto"></div>
        </div>
        <div id="ecr-items" style="display:flex;flex-direction:column;gap:6px;margin-top:6px"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">Abbrechen</button>
      <button class="btn btn-primary" onclick="_saveEcr()">${e ? 'Speichern' : 'Anlegen'}</button>
    </div>
  </div>`);
  _renderEcrItems();
}

// Aus dem Datenblatt: Antrag für das offene Teil
function openEcrForItem() {
  const i = state.item;
  if (i) openEcrModal(null, [{ item_id: i.id, item_number: i.item_number, name: i.name, item_type: i.item_type }]);
}

function _renderEcrItems() {
  const el = document.getElementById('ecr-items');
  if (!el) return;
  el.innerHTML = _ecrDraft.items.map((x, i) => `<div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-sm);padding:7px 9px">
      <div style="display:flex;align-items:center;gap:8px">
        ${_itemChip(x.item_type, 14)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(x.item_number)}</span>
        <span style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span>
        <button class="btn btn-icon btn-ghost btn-sm" title="Entfernen" onclick="_ecrDraft.items.splice(${i},1);_renderEcrItems()">✕</button>
      </div>
      <input class="fi" style="margin-top:6px" placeholder="Was ändert sich an diesem Teil? (optional)" value="${esc(x.note || '')}" oninput="_ecrDraft.items[${i}].note=this.value">
    </div>`).join('') || '<div style="font-size:13px;color:var(--t3)">Noch kein Teil gewählt</div>';
}

let _ecrSearchTimer, _ecrHits = [];
function _ecrSearch(q) {
  clearTimeout(_ecrSearchTimer);
  const res = document.getElementById('ecr-results');
  if (!q.trim()) { res.style.display = 'none'; return; }
  _ecrSearchTimer = setTimeout(async () => {
    _ecrHits = (await api('/api/items-all?q=' + encodeURIComponent(q)).catch(() => []))
      .filter(i => !_ecrDraft.items.some(x => x.item_id === i.id)).slice(0, 20);
    res.innerHTML = _ecrHits.length ? _ecrHits.map((i, n) => `<div onclick="_ecrAdd(${n})"
        style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--line)"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        ${_itemChip(i.item_type, 14)}
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${esc(i.item_number)}</span>
        <span style="flex:1;font-size:13px">${esc(i.name)}</span>
        <span style="font-size:13px;color:var(--t3)">${esc(i.project_name || '')}</span>
      </div>`).join('') : '<div style="padding:10px;font-size:13px;color:var(--t3)">Keine Treffer</div>';
    res.style.display = 'block';
  }, 200);
}

function _ecrAdd(n) {
  const i = _ecrHits[n];
  if (!i) return;
  _ecrDraft.items.push({ item_id: i.id, item_number: i.item_number, name: i.name, item_type: i.item_type, note: '' });
  document.getElementById('ecr-results').style.display = 'none';
  document.getElementById('ecr-search').value = '';
  _renderEcrItems();
}

async function _saveEcr() {
  const body = {
    title: document.getElementById('ecr-title').value.trim(),
    reason: document.getElementById('ecr-reason').value,
    description: document.getElementById('ecr-desc').value,
    items: _ecrDraft.items.map(x => ({ item_id: x.item_id, note: x.note })),
  };
  if (!body.title) { toast('Titel fehlt', 'err'); return; }
  if (!body.items.length) { toast('Mindestens ein Teil wählen', 'err'); return; }
  let e;
  try { e = await api(_ecrDraft.id ? `/api/ecrs/${_ecrDraft.id}` : '/api/ecrs', _ecrDraft.id ? 'PUT' : 'POST', body); }
  catch { return; }
  _hideDynModal();
  toast(_ecrDraft.id ? 'Gespeichert' : `${e.number} angelegt`, 'ok');
  _ecrRefresh(e.id);
}

// ── Ablauf ────────────────────────────────────────────────────
// Nach jeder Aktion: Liste, Detail und Zähler in der Seitenleiste
async function _ecrRefresh(id) {
  if (state.view === 'ecr') await renderEcrList();
  else await gotoView('ecr');
  if (id) await openEcrDetail(id);
  loadStats();
}

async function _ecrDecide(id, approve) {
  const note = prompt(approve ? 'Genehmigen — Bemerkung (optional):' : 'Ablehnen — Begründung:', '');
  if (note === null) return;
  try { await api(`/api/ecrs/${id}/decision`, 'PUT', { approve, note }); } catch { return; }
  toast(approve ? 'Genehmigt' : 'Abgelehnt', 'ok');
  _ecrRefresh(id);
}

async function _ecrImplement(id) {
  if (!confirm('Für jedes betroffene Teil die Revision anlegen, in der geändert wird?\n'
    + 'Freigegebene Teile bekommen eine neue Revision (ECO), ein offener Entwurf wird weiterverwendet.')) return;
  try { await api(`/api/ecrs/${id}/implement`, 'POST', {}); } catch { return; }
  toast('Revisionen angelegt — jetzt die Teile ändern', 'ok');
  _ecrRefresh(id);
}

async function _ecrClose(id, pending) {
  if (pending && !confirm(`${pending} neue Revision(en) sind noch nicht freigegeben. Trotzdem abschliessen?`)) return;
  try { await api(`/api/ecrs/${id}/close`, 'POST', {}); } catch { return; }
  toast('Änderungsantrag erledigt', 'ok');
  _ecrRefresh(id);
}

async function _ecrDelete(id) {
  if (!confirm('Änderungsantrag löschen?')) return;
  try { await api(`/api/ecrs/${id}`, 'DELETE'); } catch { return; }
  toast('Gelöscht', 'ok');
  closeDetail();
  _ecrRefresh(null);
}
