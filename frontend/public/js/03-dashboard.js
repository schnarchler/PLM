// 03-dashboard.js — Dashboard und Changelog
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DASHBOARD ─────────────────────────────────────────────────
async function renderDashboard() {
  const today = new Date().toLocaleDateString('de-CH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  setLeftHeader('Dashboard', `<span style="font-size:13px;color:var(--t3);font-family:var(--mono)">${today}</span><button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="renderDashboard()">↺</button>`);
  closeDetail();
  setLeftBody(`<div class="empty"><div class="empty-icon" style="font-size:20px;opacity:.4">⏳</div><div class="empty-text" style="font-size:13px">Lade…</div></div>`);
  const [s, d, invItems] = await Promise.all([api('/api/stats'), api('/api/dashboard'), api('/api/inventory')]);

  const ostCls   = {DRAFT:'st-DFT',CONFIRMED:'st-REV',DELIVERED:'st-REL',INVOICED:'st-ECO',CANCELLED:'st-OBS'};
  const ostLabel = {DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',CANCELLED:'Storniert'};
  const qstCls   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
  const qstLabel = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
  const dstCls   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
  const dstLabel = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
  const stColors = {DFT:'var(--blue)',REV:'var(--amber)',REL:'var(--green)',ECO:'var(--purple)',OBS:'var(--t3)'};
  const itemIcon = t => _itemChip(t, 18);

  const invCritical = invItems.filter(i => i.min_qty > 0 && i.stock_qty < i.min_qty);
  const invWarn     = invItems.filter(i => i.min_qty > 0 && i.stock_qty === i.min_qty);
  const invLow      = [...invCritical, ...invWarn];
  const activeDeliveries = d.recentDeliveries.filter(x => x.status !== 'DELIVERED');

  // ── KPI tiles ──
  const kpiTile = (label, value, sub, accent, click) => `
    <div onclick="${click||''}" style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;cursor:${click?'pointer':'default'};transition:border-color .15s" onmouseover="this.style.borderColor='var(--line3)'" onmouseout="this.style.borderColor='var(--line)'">
      <div style="font-size:13px;color:var(--t3);margin-bottom:8px;display:flex;align-items:center;gap:5px">
        <span style="width:6px;height:6px;border-radius:50%;background:${accent};flex-shrink:0;display:inline-block"></span>
        ${label}
      </div>
      <div style="font-family:var(--mono);font-size:24px;font-weight:600;color:var(--t1);line-height:1;letter-spacing:-0.02em">${value}</div>
      ${sub ? `<div style="font-size:13px;color:var(--t3);margin-top:6px">${sub}</div>` : ''}
    </div>`;

  const confirmedOrders = d.openOrders.filter(o => o.status === 'CONFIRMED').length;
  const sentQuotes = d.openQuotes.filter(q => q.status === 'SENT').length;
  const invAlert = invCritical.length
    ? `<span style="color:var(--red)">${invCritical.length} kritisch</span>${invWarn.length ? ` · <span style="color:var(--amber)">${invWarn.length} Warnung</span>` : ''}`
    : invWarn.length ? `<span style="color:var(--amber)">${invWarn.length} auf Min.</span>` : '<span style="color:var(--green)">alles ok</span>';

  // Revenue tile wider than others
  const kpiHtml = `
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:24px">
      <div style="background:var(--bg2);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px">
        <div style="font-size:13px;color:var(--t3);margin-bottom:8px;display:flex;align-items:center;gap:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
          Umsatz
        </div>
        <div style="font-family:var(--mono);font-size:22px;font-weight:600;color:var(--t1);line-height:1;letter-spacing:-0.02em">${fmtCHF(d.revenueMonth||0)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:6px">diesen Monat · <span style="color:var(--t2)">${fmtCHF(d.revenueTotal||0)} gesamt</span></div>
      </div>
      ${kpiTile('Aufträge', d.openOrders.length, confirmedOrders + ' bestätigt', 'var(--blue)', "gotoView('orders')")}
      ${kpiTile('Angebote', d.openQuotes.length, sentQuotes + ' versendet', 'var(--teal)', "gotoView('quotes')")}
      ${kpiTile('Lieferungen', activeDeliveries.length, 'aktiv offen', 'var(--amber)', "gotoView('deliveries')")}
      ${kpiTile('Freigabe', d.inReview.length, 'warten auf REV', 'var(--purple)', '')}
      ${kpiTile('Lager', invLow.length || '—', invAlert, invCritical.length ? 'var(--red)' : invWarn.length ? 'var(--amber)' : 'var(--green)', "gotoView('inventory')")}
      ${kpiTile('Rohmaterial', d.rawMatActive + ' / ' + d.rawMatCount, d.rawMatValue > 0 ? fmtCHF(d.rawMatValue) + ' Warenwert' : '—', 'var(--teal)', "gotoView('rawmaterials')")}
    </div>`;

  // ── Section header ──
  const sh = label => `<div style="font-family:var(--mono);font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:var(--t4);font-weight:500;padding-bottom:8px;border-bottom:1px solid var(--line);margin-bottom:8px">${label}</div>`;
  const emptyRow = msg => `<div style="color:var(--t3);font-size:13px;padding:10px 0">${msg}</div>`;

  // ── Aufträge ──
  const ordersHtml = d.openOrders.length ? d.openOrders.map(o => `
    <div onclick="gotoView('orders')" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${ostCls[o.status]||'st-DFT'}" style="flex-shrink:0">${ostLabel[o.status]||o.status}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px">${o.number} · ${esc(o.customer_name||'—')}${o.delivery_date?' · '+fmtD(o.delivery_date):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:13px;color:var(--t1)">${fmtCHF(o.total||0)}</div>
        <div style="font-size:13px;color:var(--t4);margin-top:1px">${o.item_count} Pos.</div>
      </div>
    </div>`).join('') : emptyRow('Keine offenen Aufträge');

  // ── Angebote ──
  const quotesHtml = d.openQuotes.length ? d.openQuotes.map(q => `
    <div onclick="gotoView('quotes')" style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span class="status ${qstCls[q.status]||'st-DFT'}" style="flex-shrink:0">${qstLabel[q.status]||q.status}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px">${q.number} · ${esc(q.customer_name||'—')}${q.valid_until?' · bis '+fmtD(q.valid_until):''}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:13px;color:var(--t1)">${fmtCHF(q.total||0)}</div>
        <div style="font-size:13px;color:var(--t4);margin-top:1px">${q.item_count} Pos.</div>
      </div>
    </div>`).join('') : emptyRow('Keine offenen Angebote');

  // ── Freigabe ──
  const reviewHtml = d.inReview.length ? d.inReview.map(r => `
    <div onclick="gotoPlmItem(${r.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:22px;height:22px;border-radius:var(--r-xs);background:var(--amber-soft);display:grid;place-items:center;flex-shrink:0">
        <span style="font-size:13px">${itemIcon(r.item_type)}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px;font-family:var(--mono)">${r.item_number} · ${esc(r.project_number)}</div>
      </div>
      <span class="status st-REV">rev${r.rev}</span>
    </div>`).join('') : emptyRow('Keine Items in Prüfung');

  // ── Fällige Produktionsaufträge ──
  const todayIso = new Date().toISOString().slice(0,10);
  const dueSoon = d.dueSoon || [];
  const dueSoonHtml = dueSoon.length ? dueSoon.map(ls => {
    const daysLeft = Math.round((new Date(ls.delivery_date) - new Date(todayIso)) / 86400000);
    const urgent = daysLeft <= 3;
    const color = daysLeft < 0 ? 'var(--red)' : urgent ? 'var(--amber)' : 'var(--t2)';
    const label = daysLeft < 0 ? `${Math.abs(daysLeft)}d überfällig` : daysLeft === 0 ? 'Heute' : `in ${daysLeft}d`;
    return `<div onclick="gotoView('deliveries');openDeliveryDetail(${ls.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ls.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px">${ls.number} · ${esc(ls.customer_name||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:${color}">${label}</div>
        <div style="font-size:13px;color:var(--t4)">${fmtD(ls.delivery_date)}</div>
      </div>
    </div>`;
  }).join('') : emptyRow('Keine Produktionsaufträge fällig in 14 Tagen');

  // ── Ablaufende Angebote ──
  const quotesExpiring = d.quotesExpiring || [];
  const quotesExpHtml = quotesExpiring.length ? quotesExpiring.map(q => {
    const daysLeft = Math.round((new Date(q.valid_until) - new Date(todayIso)) / 86400000);
    const color = daysLeft < 0 ? 'var(--red)' : daysLeft <= 3 ? 'var(--amber)' : 'var(--t3)';
    const label = daysLeft < 0 ? 'Abgelaufen' : daysLeft === 0 ? 'Heute' : `in ${daysLeft}d`;
    return `<div onclick="gotoView('quotes');openQuoteDetail(${q.id})" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(q.title)}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px">${q.number} · ${esc(q.customer_name||'—')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:13px;font-weight:600;color:${color}">${label}</div>
        <div style="font-family:var(--mono);font-size:13px;color:var(--t3)">${fmtCHF(q.total||0)}</div>
      </div>
    </div>`;
  }).join('') : emptyRow('Keine Angebote laufen in 14 Tagen ab');

  // ── Produktion ──
  const grouped = {};
  d.inProduction.forEach(x => {
    if (!grouped[x.delivery_id]) grouped[x.delivery_id] = { number: x.delivery_number, status: x.delivery_status, customer: x.customer_name, items: [] };
    grouped[x.delivery_id].items.push(x);
  });
  const prodHtml = Object.values(grouped).length ? Object.values(grouped).map(g => `
    <div style="border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:6px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg3)">
        <span class="status ${dstCls[g.status]||'st-DFT'}">${dstLabel[g.status]||g.status}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--blue)">${g.number}</span>
        <span style="font-size:13px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(g.customer||'—')}</span>
      </div>
      ${g.items.map(x => `
        <div onclick="openProject(${x.project_id})" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--line);cursor:pointer;transition:background .1s" onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''">
          <span style="font-family:var(--mono);font-size:13px;color:var(--blue);flex-shrink:0">${x.item_number||'—'}</span>
          <span style="font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--t2)">${esc(x.description)}</span>
          <span style="font-size:13px;color:var(--t3);flex-shrink:0;font-family:var(--mono)">${x.quantity} ${x.unit}</span>
        </div>`).join('')}
    </div>`).join('') : emptyRow('Keine aktive Produktion');

  // ── PLM Status-Verteilung ──
  const total = s.assemblies + s.parts || 1;
  const statusHtml = `
    <div style="display:flex;flex-direction:column;gap:6px">
      ${s.by_status.map(st => `
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status st-${st.status}" style="width:34px;justify-content:center">${st.status}</span>
          <div style="flex:1;height:3px;background:var(--line);border-radius:2px;overflow:hidden">
            <div style="width:${Math.round(st.count/total*100)}%;height:100%;background:${stColors[st.status]||'var(--t3)'};border-radius:2px"></div>
          </div>
          <span style="font-family:var(--mono);font-size:13px;color:var(--t2);width:22px;text-align:right">${st.count}</span>
        </div>`).join('')}
      <div style="font-size:13px;color:var(--t3);margin-top:4px;text-align:right">${s.assemblies} Baugruppen · ${s.parts} Parts · ${s.projects} Projekte</div>
    </div>`;

  // ── Lager-Warnungen ──
  const invLowHtml = invLow.length ? invLow.map(i => {
    const isCritical = i.stock_qty < i.min_qty;
    const col = isCritical ? 'var(--red)' : 'var(--amber)';
    return `<div onclick="gotoView('inventory');openInventoryDetail(${i.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <div style="width:6px;height:6px;border-radius:50%;background:${col};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name)}${i.color?` <span style="color:var(--t3);font-weight:400;font-size:13px">${esc(i.color)}</span>`:''}${i.material?` <span style="color:var(--t3);font-weight:400;font-size:13px">${esc(i.material)}</span>`:''}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:1px">${esc(i.category)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-family:var(--mono);font-size:13px;color:${col};font-weight:600">${fmtN(i.stock_qty,1)} <span style="font-size:13px;font-weight:400">${i.unit}</span></div>
        <div style="font-size:13px;color:var(--t4);margin-top:1px">Min ${fmtN(i.min_qty,1)}</div>
      </div>
    </div>`;
  }).join('') : `<div style="display:flex;align-items:center;gap:8px;padding:10px;color:var(--green);font-size:13px">
    <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
    Alle Artikel über Mindestbestand
  </div>`;

  setLeftBody(`<div style="max-width:1100px;padding-bottom:24px">

    ${kpiHtml}

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">

      <!-- Spalte 1 -->
      <div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Offene Aufträge')}</div>
          <div style="padding:0 4px 8px">${ordersHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('Offene Angebote')}</div>
          <div style="padding:0 4px 8px">${quotesHtml}</div>
        </div>
      </div>

      <!-- Spalte 2 -->
      <div>
        <div style="background:var(--bg1);border:1px solid ${dueSoon.length ? 'var(--amber-line)' : 'var(--line)'};border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Fällige Produktionsaufträge'+(dueSoon.length?` <span style="color:var(--amber)">${dueSoon.length}</span>`:''))}</div>
          <div style="padding:0 4px 8px">${dueSoonHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid ${quotesExpiring.length ? 'var(--red-line)' : 'var(--line)'};border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Ablaufende Angebote'+(quotesExpiring.length?` <span style="color:var(--red)">${quotesExpiring.length}</span>`:''))}</div>
          <div style="padding:0 4px 8px">${quotesExpHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('Lager — Warnungen')}</div>
          <div style="padding:0 4px 8px">${invLowHtml}</div>
        </div>
      </div>

      <!-- Spalte 3 -->
      <div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Aktive Produktion')}</div>
          <div style="padding:8px 10px">${prodHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;margin-bottom:14px">
          <div style="padding:12px 14px 8px">${sh('Freigabe-Pipeline')}</div>
          <div style="padding:0 4px 8px">${reviewHtml}</div>
        </div>
        <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
          <div style="padding:12px 14px 8px">${sh('PLM Status')}</div>
          <div style="padding:8px 14px 14px">${statusHtml}</div>
        </div>
      </div>

    </div>
  </div>`);
}

// ── CHANGELOG ─────────────────────────────────────────────────
let _changelogRows = [];
function exportChangelog() {
  if (!_changelogRows.length) { toast('Keine Daten zum Exportieren','warn'); return; }
  const header = ['Datum','Zeit','Typ','Referenz','Bezeichnung','Aktion','Details'];
  const csvRows = _changelogRows.map(r => {
    const dt = r.created_at ? r.created_at.replace('T',' ').slice(0,19) : '';
    const date = fmtD(dt.slice(0,10), ''); const time = dt.slice(11,16);
    return [date, time, r.entity_type||'', r.ref||'', r.label||'', r.action||'', r.details||''];
  });
  const csv = [header, ...csvRows].map(row => row.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'changelog-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
}
async function renderChangelog() {
  setLeftHeader('Changelog', `
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
    if (a.includes('Added') || a.includes('angelegt') || a.includes('Created')) return '✚';
    if (a.includes('Deleted') || a.includes('gelöscht') || a.includes('Entfernt')) return '✕';
    if (a.includes('Status')) return '⇄';
    if (a.includes('ECO')) return '⚡';
    if (a.includes('BOM')) return '📋';
    if (a.includes('Druckparameter')) return '🖨';
    if (a.includes('Updated') || a.includes('gespeichert')) return '✏';
    return '·';
  };
  const typeColor = t => ({item:'var(--blue)',revision:'var(--teal)',project:'var(--amber)'}[t]||'var(--t3)');
  const itemTypeIcon = t => _itemChip(t, 16);

  // Group by date
  const byDate = {};
  rows.forEach(r => {
    const d = r.created_at ? r.created_at.split('T')[0].split(' ')[0] : '?';
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
              <span style="font-size:13px;font-weight:500">${esc(r.action)}</span>
              ${r.ref ? `<span style="font-family:var(--mono);font-size:13px;color:var(--blue);cursor:pointer" onclick="${r.project_id?'openProject('+r.project_id+')':''}">${itemTypeIcon(r.item_type)} ${esc(r.ref)}</span>` : ''}
            </div>
            ${r.details ? `<div style="font-size:13px;color:var(--t3);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px">${esc(r.details)}</div>` : ''}
            ${r.label ? `<div style="font-size:13px;color:var(--t2);margin-top:1px">${esc(r.label)}</div>` : ''}
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:var(--t3);flex-shrink:0;white-space:nowrap;margin-top:2px">${r.created_at ? new Date(r.created_at).toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
        </div>`).join('')}
    </div>`).join('');

  setLeftBody(`<div style="padding-bottom:20px">${html}</div>`);
}
