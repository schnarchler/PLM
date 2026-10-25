// 03-dashboard.js — Dashboard und Historie
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DASHBOARD ─────────────────────────────────────────────────
// Nur was offen ist: Produktion, Aufträge, Angebote, Freigabe, Lager. Leere
// Bereiche erscheinen nicht, Fristen stehen direkt in der Zeile.
const DASH_MAX = 8;   // mehr pro Bereich → Link auf die ganze Liste

// Frist als kurzer Hinweis: rot überfällig, gelb in den nächsten drei Tagen
function _dashDue(date, kind) {
  if (!date) return '';
  const days = Math.round((new Date(date) - new Date(new Date().toLocaleDateString('sv-SE'))) / 86400000);
  const quote = kind === 'quote';
  const txt = days < 0 ? (quote ? 'abgelaufen' : `${-days} T. überfällig`)
    : days === 0 ? (quote ? 'läuft heute ab' : 'heute fällig')
    : days <= 14 ? (quote ? `läuft in ${days} T. ab` : `fällig in ${days} T.`)
    : (quote ? 'gültig bis ' : 'fällig ') + fmtD(date);
  const col = days < 0 ? 'var(--red)' : days <= 3 ? 'var(--amber)' : 'var(--t3)';
  return `<span style="font-size:13px;color:${col};white-space:nowrap">${txt}</span>`;
}

// Kennzahlen zur Datenbank — ruhig am Ende, die offenen Dinge stehen oben
function _dashStats(st) {
  if (!st) return '';
  const num = v => fmtN(v || 0, 0);
  // Sicherung kurz: „heute 15:58“, „gestern 15:58“ oder das Datum
  const when = iso => {
    if (!iso) return null;
    const t = new Date(iso), day = t.toLocaleDateString('sv-SE');
    const hm = t.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    if (day === new Date().toLocaleDateString('sv-SE')) return `heute ${hm}`;
    if (day === new Date(Date.now() - 86400000).toLocaleDateString('sv-SE')) return `gestern ${hm}`;
    return t.toLocaleDateString('de-CH');
  };
  const v = st.version || {};
  const group = (title, rows) => `<div>
      <div style="font-family:var(--mono);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--t4);margin-bottom:4px">${title}</div>
      ${rows.map(([k, val]) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0;font-size:13px">
        <span style="color:var(--t3);white-space:nowrap">${k}</span><span style="font-family:var(--mono);color:var(--t2);text-align:right;white-space:nowrap">${val ?? '—'}</span></div>`).join('')}
    </div>`;
  return `<div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:12px 16px;margin-top:4px">
    <div style="font-size:13px;font-weight:600;margin-bottom:10px">Datenbank</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 28px">
      ${group('PLM', [['Projekte', num(st.projects)], ['Baugruppen', num(st.assemblies)], ['Teile', num(st.parts)],
        ['Dokumente', num(st.documents)], ['Freigegeben', num(st.released)], ['Revisionen', num(st.revisions)],
        ['Normteile', num(st.standard_parts)]])}
      ${group('ERP', [['Kunden', num(st.customers)], ['Aufträge', num(st.orders)], ['Geliefert', num(st.delivered)],
        ['Erfasste Zeit', _fmtDur(st.hours)]])}
      ${group('Daten', [['Dateien', st.files ? `${num(st.files)} · ${fmtSize(st.files_bytes)}` : '0'],
        ['Datenbank', fmtSize(st.db_bytes)], ['Letzte Sicherung', when(st.last_backup)],
        ['Im Einsatz seit', st.since ? fmtD(st.since) : null],
        ['PLM-Version', v.version ? 'v' + esc(v.version) + (v.dirty ? ' · geändert' : '') : null]])}
    </div>
  </div>`;
}

async function renderDashboard() {
  const today = new Date().toLocaleDateString('de-CH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  setLeftHeader('Dashboard', `<span style="font-size:13px;color:var(--t3);font-family:var(--mono)">${today}</span><button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="renderDashboard()">↺</button>`);
  closeDetail();
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px;opacity:.4">⏳</div><div class="empty-text" style="font-size:13px">Lade…</div></div>`);
  const d = await api('/api/dashboard');

  const row = (onclick, left, title, sub, right) => `
    <div onclick="${onclick}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex-shrink:0">${left}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div>
        ${sub ? `<div style="font-size:13px;color:var(--t3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sub}</div>` : ''}
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px">${right}</div>
    </div>`;
  const section = (title, list, view, render) => !list.length ? '' : `
    <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);padding:10px 6px 6px;margin-bottom:12px">
      <div style="display:flex;align-items:baseline;gap:8px;padding:0 10px 6px">
        <span style="font-size:13px;font-weight:600">${title}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--t3)">${list.length}</span>
        ${view ? `<span onclick="gotoView('${view}')" style="margin-left:auto;font-size:13px;color:var(--blue);cursor:pointer">${list.length > DASH_MAX ? `alle ${list.length} →` : 'Liste →'}</span>` : ''}
      </div>
      ${list.slice(0, DASH_MAX).map(render).join('')}
    </div>`;
  const money = v => `<span style="font-family:var(--mono);font-size:13px;color:var(--t1)">${fmtCHF(v || 0)}</span>`;
  const who = x => `${esc(x.number)} · ${esc(x.customer_name || '—')}`;

  const sections = [
    section('Produktion', d.openDeliveries, 'deliveries', x => row(`gotoView('deliveries');openDeliveryDetail(${x.id})`,
      stBadge('delivery', x.status), esc(x.title), who(x), _dashDue(x.delivery_date, 'delivery'))),
    section('Aufträge', d.openOrders, 'orders', o => row(`gotoView('orders');openOrderDetail(${o.id})`,
      stBadge('order', o.status), esc(o.title), who(o), money(o.total) + _dashDue(o.delivery_date, 'order'))),
    section('Angebote', d.openQuotes, 'orders', q => row(`gotoView('orders');openOrderDetail(${q.id})`,
      stBadge('order', q.status), esc(q.title), who(q), money(q.total) + _dashDue(q.valid_until, 'quote'))),
    section('Zur Freigabe', d.inReview, '', r => row(`gotoPlmItem(${r.id})`,
      _itemChip(r.item_type, 18), esc(r.name), `${esc(r.item_number)} · ${esc(r.project_number)}`,
      `<span class="status st-REV">rev${esc(r.rev)}</span>`)),
    section('Änderungen', d.openEcrs || [], 'ecr', e => row(`gotoView('ecr').then(() => openEcrDetail(${e.id}))`,
      ecrBadge(e.status), esc(e.title), `${esc(e.number)} · ${e.item_count} ${e.item_count === 1 ? 'Teil' : 'Teile'}`, '')),
    section('Lager nachbestellen', d.lowStock, 'inventory', i => {
      const col = i.stock_qty < i.min_qty ? 'var(--red)' : 'var(--amber)';
      return row(`gotoView('inventory');openInventoryDetail(${i.id})`,
        `<span style="display:block;width:7px;height:7px;border-radius:50%;background:${col}"></span>`,
        esc(i.name), [i.color, i.material].filter(Boolean).map(esc).join(' · '),
        `<span style="font-family:var(--mono);font-size:13px;color:${col}">${fmtN(i.stock_qty, 1)} / min ${fmtN(i.min_qty, 1)} ${esc(i.unit || '')}</span>`);
    }),
  ].join('');

  const month = new Date().toLocaleDateString('de-CH', { month: 'long' });
  setLeftBody(`<div style="max-width:760px;padding-bottom:24px">
    <div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap;margin-bottom:14px;font-size:13px;color:var(--t3)">
      <span>Umsatz ${month} <strong style="font-family:var(--mono);color:var(--t1);font-size:15px;margin-left:4px">${fmtCHF(d.revenueMonth || 0)}</strong></span>
      <span>gesamt <span style="font-family:var(--mono);color:var(--t2);margin-left:4px">${fmtCHF(d.revenueTotal || 0)}</span></span>
    </div>
    ${sections || `<div class="empty"><div class="empty-icon" style="color:var(--green)">✓</div><div class="empty-text">Nichts offen — alles erledigt.</div></div>`}
    ${_dashStats(d.stats)}
  </div>`);
}

// ── HISTORIE ──────────────────────────────────────────────────
let _changelogRows = [];
const HISTORY_TYPE_LABEL = { item: 'Item', revision: 'Revision', project: 'Projekt', order: 'Auftrag',
  delivery: 'Produktionsauftrag', customer: 'Kunde', inventory: 'Lagerartikel', raw_material: 'Rohmaterial', settings: 'Einstellungen',
  user: 'Person', ecr: 'Änderungsantrag' };
function exportChangelog() {
  if (!_changelogRows.length) { toast('Keine Daten zum Exportieren','warn'); return; }
  const header = ['Datum','Zeit','Person','Typ','Referenz','Bezeichnung','Aktion','Details'];
  const csvRows = _changelogRows.map(r => {
    const local = r.created_at ? parseDbDate(r.created_at) : null;
    const date = local ? local.toLocaleDateString('de-CH', { day:'2-digit', month:'2-digit', year:'numeric' }) : '';
    const time = local ? local.toLocaleTimeString('de-CH', { hour:'2-digit', minute:'2-digit' }) : '';
    return [date, time, r.user_name || '', HISTORY_TYPE_LABEL[r.entity_type] || r.entity_type || '', r.ref||'', r.label||'', r.action||'', r.details||''];
  });
  const csv = [header, ...csvRows].map(row => row.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'historie-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
// Klick auf die Referenz öffnet den Datensatz, um den es geht
function _historyOpen(r) {
  if (r.item_id) return `gotoPlmItem(${r.item_id})`;
  if (r.entity_type === 'project' && r.project_id) return `openProject(${r.project_id})`;
  if (r.entity_type === 'order') return `gotoView('orders').then(()=>openOrderDetail(${r.entity_id}))`;
  if (r.entity_type === 'delivery') return `gotoView('deliveries').then(()=>openDeliveryDetail(${r.entity_id}))`;
  if (r.entity_type === 'customer') return `gotoView('customers').then(()=>openCustomerDetail(${r.entity_id}))`;
  if (r.entity_type === 'ecr') return `gotoView('ecr').then(()=>openEcrDetail(${r.entity_id}))`;
  return '';
}
async function renderChangelog() {
  setLeftHeader('Historie', `
    <button class="btn btn-ghost btn-sm" onclick="renderChangelog()">↺ Aktualisieren</button>
    <button class="btn btn-ghost btn-sm" onclick="exportChangelog()">&#x2B07; CSV</button>`);
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px">⏳</div><div class="empty-text">Lade…</div></div>`);
  const rows = await api('/api/changelog?limit=2000');
  _changelogRows = rows;
  if (!rows.length) {
    setLeftBody(`<div class="empty"><div class="empty-icon">📋</div><div class="empty-text">Noch keine Einträge</div></div>`);
    return;
  }
  const actionIcon = a => {
    if (/hinzugefügt|angelegt|Erstellt|hochgeladen|Neue Revision/.test(a)) return '✚';
    if (/gelöscht|entfernt/i.test(a)) return '✕';
    if (a.includes('Status')) return '⇄';
    if (a.includes('hinweis')) return '⚠';
    if (a.includes('ECO')) return '⚡';
    if (/Stand|fixiert/.test(a)) return '🔒';
    if (/BOM|Stückliste/.test(a)) return '📋';
    if (a.includes('Druckparameter')) return '🖨';
    if (a.includes('Sicherung')) return '💾';
    if (/Geändert|geändert|gespeichert|umbenannt|korrigiert/.test(a)) return '✏';
    return '·';
  };
  const typeColor = t => ({item:'var(--blue)',revision:'var(--teal)',project:'var(--amber)'}[t]||'var(--t3)');
  const itemTypeIcon = t => _itemChip(t, 16);

  // Group by date
  const byDate = {};
  rows.forEach(r => {
    const d = r.created_at ? parseDbDate(r.created_at).toLocaleDateString('sv-SE') : '?';   // JJJJ-MM-TT in Ortszeit
    (byDate[d] = byDate[d]||[]).push(r);
  });

  const html = Object.entries(byDate).map(([date, entries]) => `
    <div style="margin-bottom:18px">
      <div style="font-family:var(--mono);font-size:13px;color:var(--t3);letter-spacing:1px;text-transform:uppercase;padding:4px 0;border-bottom:1px solid var(--line);margin-bottom:6px">${date}</div>
      ${entries.map(r => `
        <div style="display:flex;gap:10px;padding:7px 6px;border-radius:var(--r);transition:background .1s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
          <div style="width:18px;text-align:center;flex-shrink:0;font-size:13px;margin-top:1px">${actionIcon(r.action)}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:500">${esc(r.action)}</span>${_clUser(r)}
              ${r.ref ? `<span style="font-family:var(--mono);font-size:13px;color:var(--blue);cursor:pointer" onclick="${_historyOpen(r)}">${r.item_type ? itemTypeIcon(r.item_type) : ({ project: '📁', order: '📋', delivery: '🚚', customer: '👤', ecr: '🛠' }[r.entity_type] || '')} ${esc(r.ref)}</span>` : ''}
            </div>
            ${r.details ? `<div style="font-size:13px;color:var(--t3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px">${esc(r.details)}</div>` : ''}
            ${r.label ? `<div style="font-size:13px;color:var(--t2);margin-top:1px">${esc(r.label)}</div>` : ''}
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--t3);flex-shrink:0;white-space:nowrap;margin-top:2px">${r.created_at ? parseDbDate(r.created_at).toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
        </div>`).join('')}
    </div>`).join('');

  setLeftBody(`<div style="padding-bottom:20px">${html}</div>`);
}
