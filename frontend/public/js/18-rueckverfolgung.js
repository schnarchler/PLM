// 18-rueckverfolgung.js — Rückverfolgung: was in einem Produktionsauftrag
// steckt (Revision, Material-Charge und Prüfung je Position) und umgekehrt, wo
// eine Charge Rohmaterial verwendet wurde — für einen Rückruf.
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.

const INSPECTION_LABEL = { OK: ['✓ in Ordnung', 'var(--green)'], NOK: ['✗ nicht in Ordnung', 'var(--red)'] };

function _lotLine(l) {
  return `${esc(l.material)} · Charge <strong style="font-family:var(--mono)">${esc(l.lot_number || 'ohne Nr.')}</strong>
    <span style="color:var(--t3)">· ${fmtN(l.qty, 2)} ${esc(l.unit || '')}</span>`;
}

// Prüfung einer Position: Ergebnis mit wer und wann, sonst die Knöpfe zum Erfassen
function _inspectionHtml(p, deliveryId) {
  const i = p.inspection;
  if (i) {
    const [label, col] = INSPECTION_LABEL[i.result] || [i.result, 'var(--t2)'];
    return `<span style="color:${col};font-weight:600">${label}</span>
      <span style="color:var(--t3)">${[i.by, i.at ? fmtD(String(i.at).slice(0, 10)) : ''].filter(Boolean).map(esc).join(' · ')}</span>
      ${i.note ? `<div style="color:var(--t2);margin-top:2px">${esc(i.note)}</div>` : ''}
      <div><button class="btn btn-ghost btn-sm" style="margin-top:4px" onclick="_saveInspection(${p.id},null,${deliveryId})">Zurücksetzen</button></div>`;
  }
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <input class="fi" id="insp-note-${p.id}" placeholder="Bemerkung (optional)" style="flex:1;min-width:140px">
      <button class="btn btn-green btn-sm" onclick="_saveInspection(${p.id},'OK',${deliveryId})">✓ In Ordnung</button>
      <button class="btn btn-red btn-sm" onclick="_saveInspection(${p.id},'NOK',${deliveryId})">✗ Nicht in Ordnung</button>
    </div>`;
}

function _deliveryTraceHtml(t) {
  const row = (label, html) => `<span style="color:var(--t3)">${label}</span><div style="min-width:0">${html}</div>`;
  const noLot = t.material_consumed ? 'keine Charge erfasst' : 'noch kein Material abgebucht';
  return `<div style="font-size:13px;color:var(--t3);margin-bottom:10px">Je Position: welche Revision, welche Material-Charge und wie geprüft.</div>
    ${t.positions.map(p => `<div style="background:var(--bg0);border:1px solid var(--line);border-radius:var(--r);padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        ${p.item_type ? _itemChip(p.item_type, 16) : ''}
        <span style="flex:1;min-width:0;font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.description)}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtN(p.quantity, 0)} ${esc(p.unit || '')}</span>
      </div>
      <div style="display:grid;grid-template-columns:90px 1fr;gap:6px 10px;font-size:13px;align-items:baseline">
        ${row('Teil', p.item_number
          ? `<span style="font-family:var(--mono);color:var(--blue);cursor:pointer" onclick="gotoPlmItem(${p.item_id})">${esc(p.item_number)}</span>
             ${p.revision ? `<span class="status st-${esc(p.revision.status)}" style="font-size:11px">${p.revision.fixed ? '🔒 ' : ''}rev${esc(p.revision.rev)}</span>` : ''}`
          : '<span style="color:var(--t3)">kein PLM-Teil</span>')}
        ${row('Material', p.lots.length ? p.lots.map(_lotLine).join('<br>') : `<span style="color:var(--t3)">${noLot}</span>`)}
        ${row('Prüfung', _inspectionHtml(p, t.id))}
      </div>
    </div>`).join('') || '<div style="color:var(--t3);font-size:13px">Noch keine Positionen</div>'}
    ${t.unassigned_lots.length ? `<div class="sep-label">Material ohne eindeutige Position</div>
      <div style="font-size:13px;line-height:1.7">${t.unassigned_lots.map(_lotLine).join('<br>')}</div>` : ''}`;
}

async function loadDeliveryTrace(deliveryId) {
  const el = document.getElementById('dd-trace');
  if (!el) return;
  try { el.innerHTML = _deliveryTraceHtml(await api(`/api/deliveries/${deliveryId}/trace`)); }
  catch { el.innerHTML = '<div style="color:var(--t3);font-size:13px">Rückverfolgung konnte nicht geladen werden.</div>'; }
}

async function _saveInspection(deliveryItemId, result, deliveryId) {
  const note = document.getElementById(`insp-note-${deliveryItemId}`)?.value || '';
  if (result === 'NOK' && !note.trim() && !confirm('Ohne Bemerkung als „nicht in Ordnung" speichern?')) return;
  try { await api(`/api/delivery-items/${deliveryItemId}/inspection`, 'PUT', { result, note }); }
  catch { return; }
  toast(result ? 'Prüfung gespeichert' : 'Prüfung zurückgesetzt', 'ok');
  loadDeliveryTrace(deliveryId);
}

// Rohmaterial: je Charge, in welchen Produktionsaufträgen, bei welchen Kunden
// und in welchen Teilen sie steckt
function _rawMaterialTraceHtml(rows) {
  if (!rows.length) {
    return '<div style="color:var(--t3);font-size:13px;padding:6px 0">Aus diesem Rohmaterial wurde noch nichts für einen Produktionsauftrag abgebucht.</div>';
  }
  const byLot = new Map();
  rows.forEach(r => { const k = r.lot_number || ''; if (!byLot.has(k)) byLot.set(k, []); byLot.get(k).push(r); });
  return `<div style="font-size:13px;color:var(--t3);margin-bottom:6px">Je Charge: in welchen Produktionsaufträgen, bei welchen Kunden und in welchen Teilen sie steckt.</div>
    ${[...byLot].map(([lot, list]) => {
      const customers = new Set(list.map(r => r.customer_name).filter(Boolean)).size;
      return `<div class="sep-label">Charge <span style="font-family:var(--mono);text-transform:none;letter-spacing:0">${esc(lot || 'ohne Nr.')}</span>
          <span style="font-size:11px;color:var(--t4);font-weight:400;margin-left:6px;text-transform:none;letter-spacing:0">${list.length} ${list.length === 1 ? 'Verwendung' : 'Verwendungen'}${customers ? ` · ${customers} ${customers === 1 ? 'Kunde' : 'Kunden'}` : ''}</span></div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${list.map(r => `<div onclick="gotoView('deliveries').then(() => openDeliveryDetail(${r.delivery_id}))" title="Produktionsauftrag öffnen"
              style="display:flex;align-items:center;gap:8px;padding:6px 9px;background:var(--bg2);border:1px solid var(--line);border-radius:var(--r-xs);cursor:pointer;font-size:13px">
              <span style="font-family:var(--mono);color:var(--blue);flex-shrink:0">${esc(r.delivery_number)}</span>
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.customer_name || '—')} · ${esc(r.description || r.delivery_title || '')}</span>
              ${r.item_number ? `<span style="font-family:var(--mono);color:var(--t3);flex-shrink:0">${esc(r.item_number)}${r.revision ? ' rev' + esc(r.revision.rev) : ''}</span>` : ''}
              <span style="font-family:var(--mono);color:var(--t3);flex-shrink:0">${fmtN(r.qty, 2)}</span>
              ${stBadge('delivery', r.delivery_status, 'font-size:11px;flex-shrink:0')}
            </div>`).join('')}
        </div>`;
    }).join('')}`;
}

async function loadRawMaterialTrace(rawMaterialId) {
  const el = document.getElementById('rm-trace');
  if (!el) return;
  try { el.innerHTML = _rawMaterialTraceHtml(await api(`/api/raw-materials/${rawMaterialId}/trace`)); }
  catch { el.innerHTML = '<div style="color:var(--t3);font-size:13px">Verwendung konnte nicht geladen werden.</div>'; }
}
