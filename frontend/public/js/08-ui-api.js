// 08-ui-api.js — Detail-Panel, UI-Helfer, API-Client, Utilities, Shutdown
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// ── DETAIL PANEL ──────────────────────────────────────────────
// Der grosse Item-Name über den Tabs gehört nur zur Item-Ansicht: Setzt eine
// andere Ansicht (Auftrag, Kunde …) den Titel, verschwindet er.
document.addEventListener('DOMContentLoaded', () => {
  const title = document.getElementById('dp-title'), sub = document.getElementById('dp-subtitle');
  if (!title || !sub) return;
  new MutationObserver(() => { if (!title.querySelector('[data-item-title]')) sub.hidden = true; })
    .observe(title, { childList: true });
});
function showDetail() { document.getElementById('detail-panel').classList.remove('hidden'); }
function closeDetail() { document.getElementById('detail-panel').classList.add('hidden'); }
// Breite des Detail-Panels am linken Rand ziehen; bleibt pro Browser gespeichert.
(function initDetailResize() {
  const panel = document.getElementById('detail-panel');
  const grip = document.getElementById('dp-resize');
  if (!panel || !grip) return;
  const MIN = 380;
  const clamp = w => Math.round(Math.max(MIN, Math.min(w, window.innerWidth - 280)));
  const apply = w => panel.style.setProperty('--detail-w', w + 'px');
  try { const w = +localStorage.getItem('plm.detailWidth'); if (w) apply(clamp(w)); } catch {}
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    const startX = e.clientX, startW = panel.offsetWidth;
    panel.classList.add('resizing');
    document.body.classList.add('col-resizing');
    const move = ev => apply(clamp(startW + startX - ev.clientX));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      panel.classList.remove('resizing');
      document.body.classList.remove('col-resizing');
      try { localStorage.setItem('plm.detailWidth', panel.offsetWidth); } catch {}
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => {
    panel.style.removeProperty('--detail-w');
    try { localStorage.removeItem('plm.detailWidth'); } catch {}
  });
})();
// ── VORSCHAUBILD BEIM ÜBERFAHREN ──────────────────────────────
// Zeilen in Projektbaum, Stückliste und Suche tragen data-thumb (_thumbAttr).
// Nach kurzem Verweilen erscheint das Bild neben der Maus; fehlt es doch,
// bleibt die Vorschau einfach weg.
let _thumbRow = null, _thumbTimer = null, _thumbImg = null, _thumbXY = [0, 0];
// Die Schriftgrösse zoomt die ganze Seite (zoom am <html>): Mausposition und
// Fenstergrösse kommen ungezoomt, left/top wirken gezoomt. Der Massstab steckt
// im Verhältnis von sichtbarer zu eigener Breite des Bildes.
function _thumbPlace() {
  if (!_thumbImg || _thumbImg.hidden) return;
  const [x, y] = _thumbXY, r = _thumbImg.getBoundingClientRect();
  const k = r.width / (_thumbImg.offsetWidth || r.width) || 1;
  const left = x + 18 + r.width > innerWidth ? x - 18 - r.width : x + 18;
  const top = Math.max(8, Math.min(y + 18, innerHeight - r.height - 8));
  _thumbImg.style.left = left / k + 'px';
  _thumbImg.style.top = top / k + 'px';
}
function _thumbHide() {
  clearTimeout(_thumbTimer);
  _thumbRow = null;
  if (_thumbImg) { _thumbImg.hidden = true; _thumbImg.removeAttribute('src'); }
}
document.addEventListener('mouseover', e => {
  const row = e.target.closest?.('[data-thumb]');
  if (row === _thumbRow) return;
  _thumbHide();
  if (!row) return;
  _thumbRow = row;
  _thumbTimer = setTimeout(() => {
    if (!_thumbImg) {
      _thumbImg = Object.assign(document.createElement('img'), { className: 'thumb-pop', alt: '', hidden: true });
      _thumbImg.onload = () => { if (_thumbRow) { _thumbImg.hidden = false; _thumbPlace(); } };
      document.body.appendChild(_thumbImg);
    }
    _thumbImg.src = `${API}/api/datasets/${row.dataset.thumb}/thumb`;
  }, 700);
});
document.addEventListener('mousemove', e => { _thumbXY = [e.clientX, e.clientY]; _thumbPlace(); });
document.addEventListener('mousedown', _thumbHide);
document.addEventListener('scroll', _thumbHide, true);

function _markActiveRow(id) {
  document.querySelectorAll('#left-body .row-active').forEach(r => r.classList.remove('row-active'));
  if (id != null) {
    const el = document.querySelector(`#left-body tr[data-id="${id}"], #left-body .card[data-id="${id}"]`);
    if (el) el.classList.add('row-active');
  }
}
function switchTab(btn, targetId) {
  btn.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  // data-keep="1" markiert Bloecke, die zu jedem Tab gehoeren
  // und beim Wechsel nicht mitversteckt werden duerfen.
  document.querySelectorAll('#dp-body > div').forEach(d => {
    if (d.dataset.keep !== '1') d.style.display = 'none';
  });
  const el=document.getElementById(targetId);
  if(el) el.style.display='';
}

// ── UI HELPERS ────────────────────────────────────────────────
// „?" mit Hilfetext, der beim Überfahren erscheint (oder per Tab-Taste fokussiert)
function helpTip(text) {
  return `<span class="help-q" tabindex="0" aria-label="${_t('Hilfe')}">?<span class="help-pop" role="tooltip">${esc(text)}</span></span>`;
}

// Wer hat den Historien-Eintrag gemacht? Ältere Einträge haben keinen Namen.
function _clUser(entry) {
  return entry?.user_name ? ` <span class="cl-user">${esc(entry.user_name)}</span>` : '';
}
// Rechte Spalte eines Historie-Eintrags: Datum/Uhrzeit, darunter wer es war
function _clTime(entry) {
  return `<div class="cl-time">${fmtDate(entry.created_at)}${entry?.user_name ? `<div><span class="cl-user">${esc(entry.user_name)}</span></div>` : ''}</div>`;
}
// Verlauf-Tab: Datenblatt, Auftrag, Produktionsauftrag, Kunde, Lieferant, Bestellung
function renderChangelogList(entries) {
  return (entries || []).map(cl => `
    <div class="cl-row"><div class="cl-dot"></div>
    <div><div class="cl-action">${cl.rev != null ? `<span class="chip" style="margin-right:6px">rev${esc(cl.rev)}</span>` : ''}${esc(_histAction(cl.action))}</div><div class="cl-detail">${esc(cl.details||'')}</div></div>
    ${_clTime(cl)}</div>`).join('') || '<div style="color:var(--t3);font-size:13px">' + _t('Leer') + '</div>';
}
function setLeftHeader(title, actionsHtml) {
  if (typeof title === 'string' && !title.includes('<')) {
    document.getElementById('left-title').innerHTML = `<strong>${title}</strong>`;
  } else {
    document.getElementById('left-title').innerHTML = title;
  }
  document.getElementById('left-actions').innerHTML = actionsHtml||'';
  // Tabs gehören zur Ansicht, die sie setzt — neue Ansicht: erst einmal keine
  const tabs = document.getElementById('left-tabs');
  if (tabs) { tabs.hidden = true; tabs.innerHTML = ''; }
}
// Mehrere Ansichten unter einem Menüpunkt: Tabs unter der Kopfzeile.
// tabs: [[view, Bezeichnung], …]; ein Klick wechselt über gotoView.
const LEFT_TAB_GROUPS = {
  changelog: [['changelog', 'PLM'], ['erplog', 'ERP']],
  inventory: [['inventory', _t('@tab:Artikel')], ['rawmaterials', _t('Rohmaterial')]],
  orders:    [['orders', _t('Aufträge')], ['profit', _t('Kalkulation')]],
};
// Welcher Menüpunkt zu einer Ansicht gehört, die als Tab unter einem anderen steht
const NAV_OF_VIEW = { erplog: 'changelog', rawmaterials: 'inventory', profit: 'orders' };
function setLeftTabs(group, current) {
  const el = document.getElementById('left-tabs');
  if (!el) return;
  const tabs = LEFT_TAB_GROUPS[group].filter(([v]) => v !== 'erplog' || isAdmin());   // ERP-Verlauf nur für Admins
  el.innerHTML = tabs.map(([v, label]) =>
    `<button class="tab${v === current ? ' active' : ''}" onclick="gotoView('${v}')">${label}</button>`).join('');
  el.hidden = tabs.length < 2;
}
// Neuer Inhalt links: die Fusszeile gehört zur vorigen Ansicht (z. B. die
// Legende der Projektliste) — wer sie braucht, setzt sie danach mit setLeftFooter
function setLeftBody(html) { document.getElementById('left-body').innerHTML = html; setLeftFooter(''); }
function setLeftFooter(html) {
  const el = document.getElementById('left-footer');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
}

// Beim Start sofort, danach gesammelt: mehrere Änderungen kurz
// hintereinander ergeben nur eine Abfrage
let _loadStatsTimer, _statsShown = false;
async function loadStats() {
  clearTimeout(_loadStatsTimer);
  _loadStatsTimer = setTimeout(async () => {
    _statsShown = true;
    const s = await api('/api/stats');
    document.getElementById('badge-projects').textContent = s.projects||0;
    const bpt = document.getElementById('badge-parts');
    if (bpt) bpt.textContent = s.items || '—';
    document.getElementById('badge-customers').textContent = s.customers||0;
    document.getElementById('badge-orders').textContent = s.orders||0;
    const el2 = document.getElementById('badge-deliveries');
    if (el2) el2.textContent = s.deliveries||0;
    const el3 = document.getElementById('badge-inventory');
    if (el3) el3.textContent = s.inventory||0;
    const bn = document.getElementById('badge-normteile');
    if (bn) bn.textContent = s.standard_parts ?? '—';
    const bp = document.getElementById('badge-purchasing');
    if (bp) bp.textContent = s.open_pos ?? '—';
    const be = document.getElementById('badge-ecr');
    if (be) be.textContent = s.ecr_open || '—';
  }, _statsShown ? 800 : 0);
}

// ── API ───────────────────────────────────────────────────────
async function api(url, method='GET', body=null, _again=true) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type']='application/json'; opts.body=JSON.stringify(body); }
  const r = await fetch(API+url, opts);
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: 'HTTP '+r.status }));
    if (e.lock) { showLockDialog(e.lock); throw new Error(e.error); }
    if (_again && await _askOnUserError(e)) return api(url, method, body, false);
    globalThis._noteError?.(`${method} ${url} → ${r.status} ${e.error || ''}`);   // für Rückmeldungen
    if (r.status !== 404) toast(e.error||_t('Serverfehler'), 'err');
    throw new Error(e.error||'HTTP '+r.status);
  }
  return r.json();
}

// Datei-Uploads: wie api(), mit FormData
async function apiForm(url, fd, _again = true) {
  const r = await fetch(API + url, { method: 'POST', body: fd });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
    if (e.lock) { showLockDialog(e.lock); throw new Error(e.error); }
    if (_again && await _askOnUserError(e)) return apiForm(url, fd, false);
    toast(e.error || _t('Hochladen fehlgeschlagen'), 'err');
    throw new Error(e.error || 'HTTP ' + r.status);
  }
  return r.json().catch(() => ({}));
}

// „Wer ist dran?" — der Server verlangt eine Auswahl (401) oder fragt nach
// einer Pause nach (428). Wählt jemand, wird die Anfrage wiederholt.
async function _askOnUserError(e) {
  if (!(e.need_user || e.confirm_user) || typeof askWhoIsThere !== 'function') return false;
  return askWhoIsThere(e.confirm_user ? 'confirm' : 'select');
}

// ── SPERRE ────────────────────────────────────────────────────
// Die Daten gehören einem anderen PLM: beim Start schon belegt (waiting),
// inzwischen übernommen oder plm.db von aussen geändert (lost). Der Dialog
// lässt sich nicht wegklicken — hier geht erst wieder etwas, wenn dieses
// PLM übernimmt (lädt den aktuellen Stand) oder beendet wird.
function _agoTxt(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!(s >= 90)) return _t('gerade eben');   // auch: Uhr des anderen PCs geht vor
  if (s < 90 * 60) return _t('vor {n} Min.', { n: Math.round(s / 60) });
  if (s < 36 * 3600) return _t('vor {n} Std.', { n: Math.round(s / 3600) });
  return _t('vor {n} Tagen', { n: Math.round(s / 86400) });
}
function _lockDialogHtml(l) {
  const h = l.holder;
  const pc = h && !h.this_pc && _t('PLM auf {host}', { host: `<b style="color:var(--t1)">${esc(h.host)}</b>` });
  const who = pc || (h ? _t('ein anderes PLM auf diesem PC') : _t('ein anderes PLM'));          // wer arbeitet
  const byWho = pc || (h ? _t('einem anderen PLM auf diesem PC') : _t('einem anderen PLM'));   // von wem übernommen
  const code = t => `<code style="font-family:var(--mono);user-select:all">${esc(t)}</code>`;
  const pathCode = t => `<code style="font-family:var(--mono);user-select:all;word-break:break-all">${esc(t)}</code>`;
  const strong = t => `<b style="color:var(--t1)">${t}</b>`;
  const day = d => d ? new Date(d).toLocaleDateString(LOCALE) : '?';
  // Knöpfe: [Beschriftung, Aufruf, nur am PC selbst?]
  let title, text, buttons = [];
  if (l.mode === 'waiting' || l.mode === 'loading') {
    title = h ? _t('Die Daten sind in Benutzung') : _t('Die Daten sind wieder frei');
    text = h ? _t('Gerade arbeitet {who} damit (zuletzt aktiv {ago}). Damit nichts überschrieben wird, arbeitet immer nur ein PLM mit den Daten.', { who, ago: _agoTxt(h.beat) })
        + (l.checkouts?.length ? '<br><br>' + _t('Dort noch ausgecheckt: {list} — am besten dort zuerst einchecken, sonst fehlt hier, was dort bearbeitet wird.',
          { list: l.checkouts.map(c => `${code(c.item_number)} ${esc(c.item_name)}`).join(', ') }) : '')
        + '<br><br>' + _t('{button}, wenn dort niemand mehr arbeitet — das andere PLM speichert danach nichts mehr.', { button: strong(_t('@lock:Übernehmen')) })
      : _t('Das andere PLM wurde inzwischen beendet.');
    buttons.push([h ? _t('@lock:Übernehmen') : _t('Starten'), '_takeOverData(this)', true]);
  } else if (l.mode === 'missing') {
    title = l.reason === 'no-dir' ? _t('Datenordner nicht gefunden') : _t('Keine Datenbank im Datenordner');
    text = (l.reason === 'no-dir' ? _t('Den Datenordner {path} gibt es nicht.', { path: pathCode(l.data_dir) })
      : _t('Im Datenordner {path} liegt keine Datenbank ({file}).', { path: pathCode(l.data_dir), file: code('plm.db') }))
      + ' ' + _t('Ist das Netzlaufwerk verbunden (NAS, VPN)? Liegt der Ordner in einem Sync-Ordner, ist er vielleicht noch nicht fertig abgeglichen.')
      + '<br><br>' + _t('{retry}, sobald er erreichbar ist. {create} nur, wenn hier wirklich neu begonnen werden soll — der Pfad steht in {config} ({key}).',
        { retry: strong(_t('Erneut versuchen')), create: strong(_t('Neue Datenbank anlegen')), config: code('plm.config'), key: code('data_dir=') });
    buttons.push([_t('Neue Datenbank anlegen'), '_openData(this, { create: true })', true],
      [_t('Erneut versuchen'), '_openData(this, {})', false]);
  } else if (l.mode === 'version') {
    title = _t('Daten von einem neueren PLM');
    text = _t('Die Daten wurden zuletzt mit PLM {newer} vom {newerDate} geöffnet, hier läuft {stand} vom {standDate}. Ein älterer Stand kennt die Umstellungen des neueren nicht und könnte Daten im alten Format schreiben.',
        { newer: esc(l.newer?.version || '?'), newerDate: day(l.newer?.date), stand: esc(l.stand?.version || '?'), standDate: day(l.stand?.date) })
      + '<br><br>' + _t('Zuerst {update}. {open} nur, wenn es nicht anders geht.', { update: strong(_t('aktualisieren')), open: strong(_t('Trotzdem öffnen')) });
    buttons.push([_t('Trotzdem öffnen'), '_openData(this, { older_ok: true })', true],
      [_t('Aktualisieren…'), '_updateFromLock()', true]);
  } else {
    title = l.reason === 'takeover' ? _t('PLM arbeitet jetzt woanders') : _t('Daten von aussen geändert');
    // Wann der andere übernommen hat (seine Sperre), nicht wann es hier auffiel
    text = (l.reason === 'takeover' ? _t('Die Daten wurden {ago} von {who} übernommen.', { ago: _agoTxt(h?.since || l.at), who: byWho })
        : _t('plm.db wurde von einem anderen PC oder Programm geändert, z.B. von einem Sync-Programm.'))
      + ' ' + _t('Hier wird nichts mehr gespeichert, der angezeigte Stand ist nicht mehr aktuell.')
      + (l.saved_as ? '<br><br>' + _t('Was hier noch nicht gespeichert war, liegt als Sicherung {file} vor (Einstellungen → Daten → Datensicherung).', { file: code(l.saved_as) }) : '')
      + (l.local_checkouts ? '<br><br>' + _t(l.local_checkouts === 1 ? 'Auf diesem PC ist noch 1 Teil ausgecheckt. Zum Einchecken hier weiterarbeiten.'
          : 'Auf diesem PC sind noch {n} Teile ausgecheckt. Zum Einchecken hier weiterarbeiten.', { n: l.local_checkouts }) : '')
      + '<br><br>' + _t(l.reason === 'takeover' ? '{button} lädt den aktuellen Stand — das andere PLM speichert danach nichts mehr.' : '{button} lädt den aktuellen Stand.',
        { button: strong(_t('Hier weiterarbeiten')) });
    buttons.push([_t('Hier weiterarbeiten'), '_takeOverData(this)', true]);
  }
  const shown = buttons.filter(([, , localOnly]) => l.local || !localOnly);
  return `<div class="modal" style="max-width:560px">
    <div class="modal-head"><div class="modal-title" style="color:var(--amber)">${title}</div></div>
    <div class="modal-body" style="padding:14px 16px;font-size:13px;color:var(--t2);line-height:1.6">${text}
      ${shown.length < buttons.length ? '<div style="margin-top:10px;color:var(--t3)">' + _t('Entscheiden lässt sich das nur am PC, auf dem dieses PLM läuft.') + '</div>' : ''}
    </div>
    <div class="modal-foot" style="gap:6px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="_doShutdown(false)">${_t('PLM hier beenden')}</button>
      ${shown.map(([label, call], i) => `<button class="btn ${i === shown.length - 1 ? 'btn-primary' : 'btn-ghost'}"
        onclick="${call}"${l.mode === 'loading' ? ' disabled' : ''}>${label}</button>`).join('')}
    </div>
  </div>`;
}
let _lockShown = '';
function showLockDialog(l) {
  let ov = document.getElementById('lockModal');
  if (!l || l.mode === 'own') { ov?.remove(); _lockShown = ''; return; }
  const key = JSON.stringify([l.mode, l.reason, l.holder?.host, l.holder?.beat, l.saved_as, l.local, l.checkouts?.length, l.local_checkouts]);
  if (ov && key === _lockShown) return;
  _lockShown = key;
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'overlay open'; ov.id = 'lockModal'; ov.style.zIndex = '1000';
    document.body.appendChild(ov);
  }
  ov.innerHTML = _lockDialogHtml(l);
}
// Knopf im Dialog: Anfrage stellen; ist danach alles da, Seite neu laden,
// sonst zeigt der Dialog den neuen Zustand (z.B. jetzt in Benutzung)
async function _lockAction(btn, url, body, busy) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = busy;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  if (r?.ok && d?.mode === 'own') return location.reload();
  btn.disabled = false; btn.textContent = label;
  if (!r?.ok) return toast(d?.error || _t('Das hat nicht geklappt'), 'err');
  if (d?.mode === 'missing') toast(_t('Noch immer nicht gefunden'), 'err');
  showLockDialog(d);
}
function _takeOverData(btn) { return _lockAction(btn, '/api/lock/takeover', {}, _t('Übernimmt…')); }
function _openData(btn, body) { return _lockAction(btn, '/api/lock/open', body, body.create ? _t('Legt an…') : _t('Sucht…')); }
// Neuerer Datenstand: Update-Dialog über den Sperr-Dialog legen
async function _updateFromLock() {
  document.getElementById('lockModal')?.remove();
  _lockShown = '';
  await checkUpdate(true);
  showUpdateDialog();
}
// Zurück an diesem PC (Tab wieder sichtbar, Laptop aus dem Ruhezustand):
// gleich nachsehen, ob die Daten inzwischen ein anderes PLM hat
async function checkDataLock() {
  try { const r = await fetch('/api/lock'); if (r.ok) showLockDialog(await r.json()); } catch {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDataLock(); });

// ── UTILS ─────────────────────────────────────────────────────
const V = id => document.getElementById(id)?.value||'';
const set = (id,v) => { const el=document.getElementById(id); if(el) el.value=v??''; };
const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
// SQLite schreibt Zeitpunkte mit datetime('now') in UTC und ohne Zonenangabe
// ("2026-10-16 07:34:12"). Der Browser läse das als Ortszeit — darum hier als
// UTC kennzeichnen, sonst steht jede Uhrzeit um den UTC-Versatz zu früh da.
const parseDbDate = d => {
  const s = String(d || '');
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s) ? s.replace(' ', 'T') + 'Z' : s);
};
const fmtDate = d => d ? parseDbDate(d).toLocaleDateString(LOCALE,{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
// Nur Datum, TT.MM.JJJJ — string-basiert, damit ISO-Datumswerte nicht durch Zeitzonen verschoben werden
const fmtD = (d, empty='—') => {
  const m = String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (d ? String(d) : empty);
};
// Datum + Uhrzeit, TT.MM.JJJJ HH:MM (für ISO-Timestamps aus der DB)
const fmtDT = (d, empty='—') => {
  if (!d) return empty;
  const time = String(d).replace('T',' ').slice(11,16);
  return fmtD(d) + (time ? ' ' + time : '');
};
const fmtSize = b => { if(!b) return '—'; if(b<1024) return b+'B'; if(b<1048576) return (b/1024).toFixed(1)+'KB'; if(b<1073741824) return (b/1048576).toFixed(1)+'MB'; return (b/1073741824).toFixed(2)+'GB'; };
const fmtChf = v => fmtCHF(parseFloat(v)||0);

async function copyText(text, okMsg = _t('Kopiert')) {
  try { await navigator.clipboard.writeText(text); toast(okMsg, 'ok'); }
  catch { toast(_t('Kopieren nicht möglich'), 'err'); }
}

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
        <div class="modal-title" style="color:var(--amber)">${_t('⚠ Aktive Checkouts')}</div>
      </div>
      <div class="modal-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:var(--t2)">${_t('{n} Checkout(s) aktiv · {files} Dateien', { n: checkouts.length, files: totalFiles })}</div>
        <div style="display:flex;flex-direction:column;gap:4px">
          ${checkouts.map(c => `<div style="font-size:13px;font-family:var(--mono);color:var(--t3)">
            ${_itemChip(c.item_type,14)} <span style="color:var(--blue)">${esc(c.item_number)}</span> – ${esc(c.item_name)}
          </div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3);padding-top:4px">${_t('Vor dem Beenden einchecken (Checkout-Ordner werden gelöscht)?')}</div>
      </div>
      <div class="modal-foot" style="gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">${_t('Beenden ohne Einchecken')}</button>
        <button class="btn btn-primary" onclick="_doShutdown(true)">${_t('Einchecken & Beenden')}</button>
      </div>
    </div>`);
  } else if (newCount > 0) {
    const allFiles = [
      ...newItemFiles.flatMap(g => g.new_files.map(f => `<span style="color:var(--blue);font-family:var(--mono)">${esc(g.item_number)}/</span>${esc(f.name)}`)),
      ...newRootFiles.map(f => `<span style="color:var(--t3)">root/</span>${esc(f.name)}`)
    ];
    _showDynModal(`<div class="modal" style="max-width:460px">
      <div class="modal-head">
        <div class="modal-title" style="color:var(--amber)">${_t('⚠ Nicht erfasste Dateien')}</div>
      </div>
      <div class="modal-body" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:var(--t2)">${_t('{n} Datei(en) im Checkout-Ordner noch nicht im PLM erfasst:', { n: newCount })}</div>
        <div style="display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto">
          ${allFiles.map(f => `<div style="font-size:13px;color:var(--t3)">${f}</div>`).join('')}
        </div>
        <div style="font-size:13px;color:var(--t3)">${_t('Jetzt erfassen oder später?')}</div>
      </div>
      <div class="modal-foot" style="gap:6px">
        <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">${_t('Trotzdem beenden')}</button>
        <button class="btn btn-primary" onclick="_hideDynModal();showCheckoutList()">${_t('Jetzt erfassen')}</button>
      </div>
    </div>`);
  } else {
    _showDynModal(`<div class="modal" style="max-width:360px">
      <div class="modal-head">
        <div class="modal-title">${_t('Server beenden')}</div>
      </div>
      <div class="modal-body" style="padding:14px 16px">
        <div style="font-size:13px;color:var(--t2)">${_t('PLM-Server wirklich beenden?')}</div>
        <div style="font-size:13px;color:var(--t3);margin-top:6px">${_t('Die Weboberfläche ist danach nicht mehr erreichbar.')}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
        <button class="btn btn-red" onclick="_doShutdown(false)">${_t('Beenden')}</button>
      </div>
    </div>`);
  }
}

async function _doShutdown(checkinFirst) {
  if (checkinFirst) {
    for (const c of [...state.checkouts]) {
      try { await _checkin(c.folder); } catch {}
    }
  }
  _hideDynModal();
  try { fetch('/api/shutdown', { method: 'POST', keepalive: true }); } catch {}
  // Seite sofort ersetzen — Server braucht ~500ms bis process.exit
  // Farben aus den Tokens — das Stylesheet bleibt geladen, nur body wird ersetzt
  document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:var(--bg0);color:var(--t1);font-family:var(--sans);gap:16px;text-align:center;padding:20px">
    <div style="font-size:36px;color:var(--t4)">■</div>
    <div style="font-size:17px;font-weight:600">${_t('PLM & ERP wurde beendet')}</div>
    <div style="font-size:13px;color:var(--t3)">${_t('Der Server wurde gestoppt.')}</div>
    <button id="plm-close-btn" style="background:var(--bg2);border:1px solid var(--line2);color:var(--t1);padding:8px 20px;border-radius:var(--r-sm);cursor:pointer;font-size:13px;font-family:var(--sans)">${_t('✕ Tab schliessen')}</button>
    <div id="plm-close-hint" style="display:none;font-size:13px;color:var(--t3);line-height:1.6;max-width:34em">
      ${_t('Dieser Tab lässt sich nicht per Knopf schliessen — das erlaubt der Browser nur für Tabs, die PLM selbst geöffnet hat (über den Starter).')}<br>
      ${_t('Bitte mit {keys} schliessen (Mac: {mac}).', { keys: `<strong style="color:var(--t1);font-family:var(--mono)">${_t('Strg + W')}</strong>`, mac: '<strong style="color:var(--t1);font-family:var(--mono)">⌘ W</strong>' })}
    </div>
  </div>`;

  // window.close() wirkt nur bei Fenstern, die per Skript geoeffnet wurden.
  // Gelingt es nicht, bleiben wir auf der Seite — dann sagen wir, warum,
  // statt einen Knopf stehen zu lassen, der nichts tut.
  const tryClose = () => {
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        const hint = document.getElementById('plm-close-hint');
        const btn  = document.getElementById('plm-close-btn');
        if (hint) hint.style.display = '';
        if (btn)  { btn.disabled = true; btn.style.opacity = '.4'; btn.style.cursor = 'default'; }
      }
    }, 500);
  };
  document.getElementById('plm-close-btn')?.addEventListener('click', tryClose);
  setTimeout(tryClose, 600);
}
