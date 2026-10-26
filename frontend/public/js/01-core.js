// 01-core.js — Grundzustand, Status-Helfer, Navigation, Init, Shortcuts, Browser-History
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
const API = '';
// Das Angebot ist die erste Phase eines Auftrags, kein eigener Datensatz mehr.
// DRAFT bleibt der Einstieg fuer Auftraege ohne vorheriges Angebot.
const ORDER_ST_MAP   = {QUOTE:'st-DFT',DRAFT:'st-DFT',CONFIRMED:'st-REV',DELIVERED:'st-REL',INVOICED:'st-ECO',DECLINED:'st-OBS',CANCELLED:'st-OBS'};
const ORDER_ST_LABEL = {QUOTE:'Angebot',DRAFT:'Entwurf',CONFIRMED:'Bestätigt',DELIVERED:'Geliefert',INVOICED:'Fakturiert',DECLINED:'Abgelehnt',CANCELLED:'Storniert'};
const QUOTE_ST_MAP   = {DRAFT:'st-DFT',SENT:'st-REV',ACCEPTED:'st-REL',DECLINED:'st-OBS'};
const QUOTE_ST_LABEL = {DRAFT:'Entwurf',SENT:'Versendet',ACCEPTED:'Akzeptiert',DECLINED:'Abgelehnt'};
const DELIVERY_ST_MAP   = {DRAFT:'st-DFT',READY:'st-REV',DELIVERED:'st-REL'};
const DELIVERY_ST_LABEL = {DRAFT:'Entwurf',READY:'Bereit',DELIVERED:'Geliefert'};
// PLM-Status: das Kürzel steht im Badge, die Bezeichnung im Tooltip und im Detail
const PLM_ST_LABEL = {DFT:'Entwurf',REV:'In Review',REL:'Freigegeben',ECO:'Änderung (ECO)',OBS:'Veraltet'};
// Hinweise am Teil: [Feld, Bezeichnung, wo er erscheint, Platzhalter].
// Konstruktion und Fertigung sind intern — nur der Kundenhinweis steht auf
// dem Lieferschein. Darstellung überall gleich: _hintHtml unten.
const HINT_KINDS = [
  ['hint_design',     'Konstruktionshinweis', 'intern, nicht im Produktionsauftrag',
    'z.B. Nicht für tragende Anwendungen'],
  ['hint_production', 'Fertigungshinweis',    'intern, im Produktionsauftrag',
    'z.B. Nur mit PETG drucken, Stützstrukturen innen entfernen'],
  ['hint_customer',   'Kundenhinweis',        'im Produktionsauftrag und auf dem Lieferschein',
    'z.B. Max. 60 °C — nicht in der Spülmaschine reinigen'],
];
const itemHints = item => HINT_KINDS.filter(([k]) => item?.[k])
  .map(([k, label, where]) => ({ key: k, label, where, text: item[k] }));
// Ein Hinweis als Bezeichnung (rot) + Ort (grau) + Text — im Kasten am Teil
// und im Produktionsauftrag identisch
const _hintHtml = h => `<div>
    <div class="important-note-title">${h.label} <span class="important-note-sub">· ${h.where}</span></div>
    <div class="important-note-text">${esc(h.text)}</div>
  </div>`;
// Statusbadge aus den zentralen Tabellen oben — damit überall dieselben Wörter stehen
function stBadge(type, status, style = '') {
  const m = type === 'order' ? ORDER_ST_MAP : type === 'quote' ? QUOTE_ST_MAP : DELIVERY_ST_MAP;
  const l = type === 'order' ? ORDER_ST_LABEL : type === 'quote' ? QUOTE_ST_LABEL : DELIVERY_ST_LABEL;
  return `<span class="status ${m[status] || 'st-DFT'}"${style ? ` style="${style}"` : ''}>${l[status] || status}</span>`;
}

function _stSel(type, id, current) {
  const maps   = {order:ORDER_ST_MAP,   quote:QUOTE_ST_MAP,   delivery:DELIVERY_ST_MAP  };
  const labels = {order:ORDER_ST_LABEL, quote:QUOTE_ST_LABEL, delivery:DELIVERY_ST_LABEL};
  const m = maps[type]||{}; const l = labels[type]||{};
  const opts = Object.keys(m).map(s=>`<option value="${s}"${s===current?' selected':''}>${l[s]||s}</option>`).join('');
  return `<select class="status-sel ${m[current]||''}" title="Status ändern"
    onclick="event.stopPropagation()"
    onchange="setDocStatus('${type}',${id},this.value,this)">${opts}</select>`;
}
async function setDocStatus(type, id, status, el) {
  const prevValue = el.value;
  const prevClass = el.className;
  try {
    const endpoint = type === 'delivery' ? 'deliveries' : type + 's';
    const r = await api(`/api/${endpoint}/${id}/status`, 'PUT', { status });
    const m = type==='order' ? ORDER_ST_MAP : type==='quote' ? QUOTE_ST_MAP : DELIVERY_ST_MAP;
    el.className = 'status-sel ' + (m[status]||'');

    const arr = type==='order' ? state.orders : type==='quote' ? state.quotes : state.deliveries;
    const rec = arr.find(x => x.id === id);
    if (rec) rec.status = status;

    if (type === 'order' && r.delivery_date) {
      if (rec) rec.delivery_date = r.delivery_date;
      const ddEl = document.getElementById('od-delivery-date');
      if (ddEl) ddEl.textContent = fmtD(r.delivery_date);
    }
    if (type === 'delivery') {
      if (r.delivery_date && rec) rec.delivery_date = r.delivery_date;
      // Detail neu laden (Lieferdatum, fixierte Revisionen) — im Auftrag
      // bleibt man im Tab „Produktion", statt in die Produktionsliste zu springen
      if (!refreshOrderProductionIfOpen()) openDeliveryDetail(id);
      // If all deliveries for an order are now delivered, reload orders list
      if (status === 'DELIVERED') { await renderOrders(); }
    }
    toast('Status gespeichert', 'ok');
    // Beim Abschliessen das verbrauchte Rohmaterial anbieten — mit Dialog,
    // damit Mengen und Lot vorher geprueft werden koennen.
    if (type === 'delivery' && status === 'DELIVERED') offerMaterialConsumption(id);
    loadStats();
  } catch(e) {
    // Revert dropdown on failure
    el.value = prevValue;
    el.className = prevClass;
    toast('Status konnte nicht gespeichert werden', 'err');
  }
}
let state = { view: 'projects', projects: [], project: null, item: null, activeRevId: null, customers: [], orders: [], quotes: [], deliveries: [], searchResults: null, settings: {}, printers: [], nozzles: [], materialPresets: [], _psConfigLoaded: false, checkouts: [], slicer: null, cad: null };

// Laufende Version unten in der Navigation. Den Zustand zeigt allein der Punkt
// (_markUpdate); nicht committete Änderungen stehen nur im Tooltip.
// ZIP-Download: die Nummer kennt erst GitHub — bis dahin zeigt der Commit den Stand
async function loadVersion() {
  const el = document.getElementById('nav-ver');
  try {
    const v = state.version = await api('/api/version');
    const ohneNummer = v.source === 'zip' && v.version.split('.').length < 3;
    el.textContent = 'v' + v.version + (ohneNummer ? ' · ' + v.commit : '');
    el.dataset.title = [v.date ? 'Stand ' + new Date(v.date).toLocaleDateString('de-CH') : '', v.commit,
      v.source === 'zip' ? 'ZIP-Download ohne Git' : '',
      v.dirty ? 'mit Änderungen, die noch nicht committet sind' : ''].filter(Boolean).join(' · ');
    _markUpdate();
  } catch {}
}

// Punkt an der Version: blau = Update verfügbar (Klick öffnet den Dialog),
// grün = aktuell, grau = Stand unbekannt (offline, Remote nicht erreichbar,
// Prüfung nicht möglich — der Grund steht im Tooltip). Grün nur, wenn das
// Remote wirklich erreicht wurde. Vor der ersten Prüfung kein Punkt.
function _markUpdate() {
  const el = document.getElementById('nav-ver'), u = state.update;
  if (!el) return;
  const on = !!u?.available, current = !on && !!u?.fetched, unknown = !!u && !on && !current;
  el.classList.toggle('has-update', on);
  el.classList.toggle('up-to-date', current);
  el.classList.toggle('update-unknown', unknown);
  el.title = [on ? `Update: Version ${u.version} verfügbar (${u.behind} neue${u.behind === 1 ? 'r Commit' : ' Commits'})`
    : current ? `Aktuelle Version — nichts Neueres auf ${u.upstream}`
    : u?.error ? `Update-Prüfung nicht möglich: ${u.error}` : '',
    el.dataset.title || '', 'Klicken: jetzt nach Updates suchen'].filter(Boolean).join('\n');
}

// Neuere Commits auf dem Git-Remote: kein Dialog beim Öffnen, nur der Punkt
// an der Version (und die Zeile im Launcher). Im Betrieb wird regelmässig
// nachgeprüft. Weiterarbeiten mit der laufenden Version geht immer.
const UPDATE_CHECK_MS = 30 * 60 * 1000;
async function checkUpdate(fresh = false) {
  try { state.update = await api('/api/update' + (fresh ? '?fresh=1' : '')); } catch { return false; }
  // ZIP-Download: erst die Prüfung bei GitHub kennt die Versionsnummer
  if (state.update.download) await loadVersion();
  else _markUpdate();
  return true;
}

// Klick auf die Version: jedes Mal frisch beim Remote nachfragen. Mit Update
// öffnet sich der Dialog, sonst sagt eine Meldung, wie es steht.
let _updateChecking = false;
async function checkUpdateNow() {
  const el = document.getElementById('nav-ver');
  if (_updateChecking) return;
  _updateChecking = true;
  el?.classList.add('update-checking');
  let ok;
  try { ok = await checkUpdate(true); }
  finally { _updateChecking = false; el?.classList.remove('update-checking'); }
  const u = state.update;
  if (!ok || !u) return toast('Update-Prüfung fehlgeschlagen — PLM nicht erreichbar', 'err');
  if (u.available) return showUpdateDialog();
  if (u.fetched) return toast(`Aktuell — v${state.version?.version || ''} ist die neuste Version`, 'ok');
  toast('Update-Prüfung nicht möglich' + (u.error ? ': ' + u.error : ''), 'warn');
}

function showUpdateDialog() {
  const u = state.update;
  if (!u?.available) return;
  const more = u.behind - u.commits.length;
  _showDynModal(`<div class="modal" style="max-width:580px;width:95vw">
    <div class="modal-head"><div class="modal-title" style="color:var(--blue)">Neue Version verfügbar: v${esc(u.version)}</div></div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--t2)">
      <div>Auf <span style="font-family:var(--mono)">${esc(u.upstream)}</span> gibt es
        ${u.behind === 1 ? 'einen neuen Commit' : u.behind + ' neue Commits'} seit dem laufenden Stand:</div>
      <div style="display:flex;flex-direction:column;gap:5px;max-height:240px;overflow-y:auto">
        ${u.commits.map(c => `<div style="display:flex;gap:10px;align-items:baseline">
          <span style="font-family:var(--mono);font-size:12px;color:var(--blue);flex-shrink:0">${esc(c.commit)}</span>
          <span style="flex:1;min-width:0">${esc(c.subject)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--t4);flex-shrink:0">${c.date ? new Date(c.date).toLocaleDateString('de-CH') : ''}</span>
        </div>`).join('')}
        ${more > 0 ? `<div style="color:var(--t4)">… und ${more} weitere</div>` : ''}
      </div>
      <div style="color:var(--t3);line-height:1.6">${u.installable
        ? `„Jetzt installieren" lädt den neuen Stand herunter und startet PLM neu — das dauert meist nur ein paar Sekunden.
          Daten und <code style="font-family:var(--mono)">plm.config</code> bleiben dabei erhalten.`
        : u.download
        ? `Zum Aktualisieren PLM beenden, die <a href="${esc(u.download)}" target="_blank" rel="noopener noreferrer">neue Version als ZIP</a>
          herunterladen, den Inhalt des entpackten Ordners über den bisherigen PLM-Ordner kopieren (Dateien ersetzen)
          und neu starten. Daten und <code style="font-family:var(--mono)">plm.config</code> bleiben dabei erhalten.`
        : `Zum Aktualisieren PLM beenden, im PLM-Ordner
          <code style="font-family:var(--mono)">git pull</code> ausführen und neu starten.`}
        Bis dahin läuft die bisherige Version ganz normal weiter.</div>
      ${!u.installable && !u.local ? '<div style="color:var(--t4)">Installieren geht nur auf dem PC, auf dem das PLM läuft.</div>' : ''}
      ${u.fetched ? '' : '<div style="color:var(--t4)">Das Remote war gerade nicht erreichbar — Stand vom letzten Abruf.</div>'}
      <div id="upd-msg" style="display:none;line-height:1.6"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal();shutdownServer()">PLM beenden</button>
      <button class="btn ${u.installable ? 'btn-ghost' : 'btn-primary'}" onclick="_hideDynModal()">Mit dieser Version weiterfahren</button>
      ${u.installable ? '<button class="btn btn-primary" id="upd-install" onclick="installUpdate()">Jetzt installieren</button>' : ''}
    </div>
  </div>`);
}

// Update installieren: Der Server holt den neuen Stand und startet neu. Die
// Seite wartet, bis der neue Stand antwortet, und lädt sich dann neu.
async function installUpdate() {
  const msg = document.getElementById('upd-msg');
  const show = (text, color) => { msg.style.display = ''; msg.style.color = color; msg.textContent = text; };
  document.querySelectorAll('.modal-foot .btn').forEach(b => { b.disabled = true; });
  show('Update wird heruntergeladen und installiert …', 'var(--blue)');
  const old = state.version?.commit;
  try {
    await api('/api/update/install', 'POST', {});
  } catch (e) {
    show('Update fehlgeschlagen: ' + e.message + ' — die bisherige Version läuft weiter.', 'var(--red)');
    document.querySelectorAll('.modal-foot .btn').forEach(b => { b.disabled = false; });
    return;
  }
  show('Installiert — PLM startet neu …', 'var(--blue)');
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const v = await (await fetch(API + '/api/version', { cache: 'no-store' })).json();
      if (v.commit && v.commit !== old) return location.reload();
    } catch {}   // während des Neustarts antwortet niemand
  }
  show('PLM hat nicht neu gestartet. Bitte beenden und von Hand starten — der neue Stand ist bereits installiert.', 'var(--amber)');
  document.querySelectorAll('.modal-foot .btn').forEach(b => { b.disabled = false; });
}

// CAD-Knopf oben: sichtbar, sobald in plm.config ein Programm eingetragen ist
async function loadCadStatus() {
  try { state.cad = await api('/api/cad'); } catch { state.cad = null; }
  const btn = document.getElementById('tb-cad-btn');
  if (!btn) return;
  const c = state.cad;
  const why = !c?.configured ? '' : !c.local ? 'Nur auf dem PC möglich, auf dem das PLM läuft'
    : !c.found ? 'CAD-Programm nicht gefunden: ' + c.where : '';
  btn.style.display = c?.configured ? '' : 'none';
  btn.disabled = !!why;
  btn.title = why || 'CAD-Programm starten';
}

// Für „Im Slicer öffnen": gewählter Slicer, ob installiert, ob dieser PC
async function loadSlicerStatus() {
  try { state.slicer = await api('/api/slicers'); } catch { state.slicer = null; }
}

async function loadCheckouts() {
  try {
    state.checkouts = await api('/api/checkout/list');
    await _scanCheckoutFolder();
    _updateCheckoutBadge();
  } catch {}
}

let _scanResult = { item_files: [], root_files: [] };

async function _scanCheckoutFolder() {
  try {
    _scanResult = await api('/api/checkout/scan');
  } catch { _scanResult = { item_files: [], root_files: [] }; }
}

function _scanNewCount() {
  return _scanResult.item_files.reduce((s, g) => s + g.new_files.length, 0) + _scanResult.root_files.length;
}

function _updateCheckoutBadge() {
  const total = state.checkouts.reduce((s, c) => s + (c.files?.length || 0), 0);
  const newCount = _scanNewCount();
  const btn = document.getElementById('tb-checkout-btn');
  if (!btn) return;
  let badges = '';
  if (total > 0) badges += `<span style="background:var(--teal);color:var(--bg0);border-radius:8px;font-family:var(--mono);font-size:11px;padding:1px 6px;margin-left:3px">${total}</span>`;
  if (newCount > 0) badges += `<span style="background:var(--amber);color:var(--bg0);border-radius:8px;font-family:var(--mono);font-size:11px;padding:1px 6px;margin-left:3px">+${newCount} neu</span>`;
  btn.innerHTML = `⬆ Checkouts${badges}`;
  btn.style.color = newCount > 0 ? 'var(--amber)' : total > 0 ? 'var(--teal)' : '';
  btn.style.borderColor = newCount > 0 ? 'var(--amber-line)' : total > 0 ? 'var(--teal-line)' : '';
}

// Nur http/https sind als Link sicher. Gespeicherte Werte wie
// "javascript:…" oder "data:…" wuerden sonst beim Klick ausgefuehrt.
// Gibt bei sicheren URLs den Hostnamen zurueck, sonst null.
function safeLinkHost(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

function fmtN(v, dec = 2) {
  const n = parseFloat(v) || 0;
  const [intPart, decPart] = n.toFixed(dec).split('.');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'") + (decPart !== undefined ? '.' + decPart : '');
}
function rnd5(v) { return Math.floor((parseFloat(v) || 0) * 20) / 20; }
function fmtCHF(v) { return 'CHF ' + fmtN(rnd5(v)); }

// Druckparameter einer Revision: eine Tabelle für Datenblatt und
// Revisionsvergleich, damit beide dieselben Wörter und Einheiten zeigen.
// Die ersten zwölf erscheinen im Datenblatt.
const PRINT_PARAMS = [
  ['nozzle',                'Düse',            v => v + ' mm'],
  ['layer_height',          'Schichthöhe',     v => fmtN(v, 2) + ' mm'],
  ['material',              'Material'],
  ['infill',                'Füllung',         v => v + ' %'],
  ['infill_pattern',        'Füllmuster',      v => fmtInfillPattern(v)],
  ['supports',              'Stützen',         v => Number(v) ? 'ja' : 'nein'],
  ['print_temp',            'Düsentemperatur', v => v + ' °C'],
  ['bed_temp',              'Betttemperatur',  v => v + ' °C'],
  ['printer',               'Drucker'],
  ['part_weight',           'Teilgewicht',     v => fmtN(v, 1) + ' g'],
  ['filament_weight_total', 'Filamentgewicht', v => fmtN(v, 1) + ' g'],
  ['print_duration',        'Druckdauer',      v => _fmtHours(v)],
  ['filament_price_kg',     'Filamentpreis',   v => fmtN(v, 2) + ' CHF/kg'],
  ['printer_cost_hr',       'Druckerkosten',   v => fmtN(v, 2) + ' CHF/h'],
  ['raw_material_id',       'Rohmaterial'],
  ['notes',                 'Notizen'],
];
function printParamLabel(key) { return PRINT_PARAMS.find(p => p[0] === key)?.[1] || key; }
// Aussenmasse einer STL, vom Server als [x, y, z] in mm → "42.0 × 42.0 × 6.5 mm"
function fmtDims(d) { return Array.isArray(d) ? d.map(v => fmtN(v, 1)).join(' × ') + ' mm' : null; }
// STL-Dateien einer Revision mit Aussenmassen, Reihenfolge wie die 3D-Vorschau
function revDims(rev) {
  return (rev?.datasets || []).filter(d => Array.isArray(d.dims))
    .map(d => ({ name: d.original_name, txt: fmtDims(d.dims) }));
}
function fmtPrintParam(key, v) {
  if (v === null || v === undefined || v === '') return null;
  const f = PRINT_PARAMS.find(p => p[0] === key)?.[2];
  return f ? f(v) : String(v);
}

// Füllmuster: Schlüssel aus PrusaSlicer, Orca und Bambu → Name wie im Slicer.
// Bambu und Orca nennen „Geradlinig“ intern zig-zag. Unbekannte bleiben, wie sie sind.
const INFILL_PATTERNS = {
  rectilinear: 'Geradlinig', 'zig-zag': 'Geradlinig', alignedrectilinear: 'Geradlinig ausgerichtet',
  grid: 'Gitter', triangles: 'Dreiecke', stars: 'Sterne', 'tri-hexagon': 'Tri-Hexagon',
  cubic: 'Kubisch', adaptivecubic: 'Adaptiv kubisch', supportcubic: 'Stützkubisch', quartercubic: 'Viertelkubisch',
  line: 'Linie', concentric: 'Konzentrisch', honeycomb: 'Bienenwabe', '3dhoneycomb': '3D-Bienenwabe',
  gyroid: 'Gyroid', hilbertcurve: 'Hilbertkurve', archimedeanchords: 'Archimedische Akkorde',
  octagramspiral: 'Oktagramm-Spirale', lightning: 'Blitz', crosshatch: 'Kreuzschraffur',
};
function fmtInfillPattern(v) {
  const s = String(v).trim();
  return INFILL_PATTERNS[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1);
}

// ── ITEM TYPE ICONS ───────────────────────────────────────────
const _SVG_ASM = '📦';
const _SVG_PRT = '🔩';
const _SVG_DOC = '📄';
function _itemSvg(t)   { return t==="asm" ? _SVG_ASM : t==="doc" ? _SVG_DOC : _SVG_PRT; }
// Zeilen mit Vorschaubild beim Überfahren (siehe 08-ui-api.js): thumb_id vom
// Server — Bild aus der 3MF oder hochgeladenes Bild der neusten Revision
const _thumbAttr = thumbId => thumbId ? ` data-thumb="${Number(thumbId)}"` : '';
function _itemChip(t, sz=20) { return `<span style="font-size:${Math.round(sz*0.75)}px;line-height:1;flex-shrink:0">${_itemSvg(t)}</span>`; }

function _classColor(cls) {
  const list = getClassifications();
  const entry = list.find(c => c.name === cls);
  const hex = entry?.color || '#9aa3b2';
  return [hex, hex + '20'];
}
function _classChip(cls, size) {
  if (!cls) return '';
  const [color, bg] = _classColor(cls);
  const fs = size || 11;
  return `<span style="font-family:var(--mono);font-size:${fs}px;padding:1px 5px;border-radius:3px;background:${bg};color:${color};flex-shrink:0">${esc(cls)}</span>`;
}

// ── INIT ──────────────────────────────────────────────────────
// ── RECENTLY VIEWED ───────────────────────────────────────────
const _MAX_RECENT = 8;
let _recentItems = JSON.parse(localStorage.getItem('plm_recent') || '[]');

function _trackRecent(type, id, label, sub, itemType) {
  _recentItems = _recentItems.filter(r => !(r.type === type && r.id === id));
  _recentItems.unshift({ type, id, label, sub, itemType, ts: Date.now() });
  if (_recentItems.length > _MAX_RECENT) _recentItems = _recentItems.slice(0, _MAX_RECENT);
  localStorage.setItem('plm_recent', JSON.stringify(_recentItems));
  _renderRecent();
}

function _renderRecent() {
  const el = document.getElementById('nav-recent');
  if (!el) return;
  if (!_recentItems.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  document.getElementById('nav-recent-list').innerHTML = _recentItems.map(r => {
    const icon = r.type === 'order' ? '📋' : r.type === 'quote' ? '📄' : r.type === 'delivery' ? '🚚' : r.type === 'customer' ? '👤' : r.type === 'project' ? '📁' : r.itemType ? _itemSvg(r.itemType) : '🔩';
    return `<button class="nav-item" style="font-size:13px;padding:4px 12px 4px 16px;gap:6px" onclick="_openRecent(${JSON.stringify(r).replace(/"/g,'&quot;')})">
      <span style="font-size:13px;flex-shrink:0">${icon}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${esc(r.label)}</span>
      ${r.sub ? `<span style="font-size:13px;color:var(--t4);flex-shrink:0;font-family:var(--mono)">${esc(r.sub)}</span>` : ''}
    </button>`;
  }).join('');
}

function _openRecent(r) {
  if (r.type === 'order') { gotoView('orders'); openOrderDetail(r.id); }
  else if (r.type === 'quote') { gotoView('quotes'); openQuoteDetail(r.id); }
  else if (r.type === 'delivery') { gotoView('deliveries'); openDeliveryDetail(r.id); }
  else if (r.type === 'customer') { gotoView('customers'); openCustomerDetail(r.id); }
  else if (r.type === 'project') { gotoView('projects'); openProject(r.id); }
  else if (r.type === 'item') { gotoPlmItem(r.id); }
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Ctrl+K / Cmd+K → focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const s = document.getElementById('globalSearch');
    if (s) { s.focus(); s.select(); }
    return;
  }
  // Escape → close modal or detail panel
  if (e.key === 'Escape') {
    const dyn = document.getElementById('dynModal');
    if (dyn) { _hideDynModal(); return; }
    const openModal = document.querySelector('.overlay.open');
    if (openModal) { openModal.classList.remove('open'); return; }
    const detail = document.getElementById('detail-panel');
    if (detail && !detail.classList.contains('hidden')) { closeDetail(); return; }
  }
});

// ── BROWSER HISTORY ───────────────────────────────────────────
let _historyBlocked = false;

function _pushHistory(state) {
  if (_historyBlocked) return;
  history.pushState(state, '');
}

window.addEventListener('popstate', e => {
  if (!e.state) { gotoView('dashboard'); return; }
  _historyBlocked = true;
  const s = e.state;
  if (s.view) gotoView(s.view).then(() => {
    if (s.detailType === 'order') openOrderDetail(s.detailId);
    else if (s.detailType === 'quote') openQuoteDetail(s.detailId);
    else if (s.detailType === 'delivery') openDeliveryDetail(s.detailId);
    else if (s.detailType === 'customer') openCustomerDetail(s.detailId);
    else if (s.detailType === 'project') openProject(s.detailId);
    else if (s.detailType === 'item') gotoPlmItem(s.detailId);
  }).finally(() => { _historyBlocked = false; });
  else _historyBlocked = false;
});

function _applyFontScale(scale) {
  document.documentElement.style.zoom = scale || state.settings?.font_scale || '1';
}
async function setFontScale(scale) {
  _applyFontScale(scale);
  document.querySelectorAll('.fs-preset-btn').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.scale === String(scale));
    b.classList.toggle('btn-ghost',   b.dataset.scale !== String(scale));
  });
  await api('/api/settings', 'PUT', { font_scale: scale });
  state.settings = await api('/api/settings');
}

// Ansichts-Einstellungen (Liste/Kacheln, Sortierung, Reiter …) liegen auf dem Server
// wie die Schriftgrösse: Der Browser vergisst sie, sobald das PLM nach einem
// Neustart einen anderen Port bekommt.
const _pref = (key, def) => state.settings?.[key] || def;
function _setPref(key, v) {
  if (_pref(key) === v) return;
  state.settings = { ...state.settings, [key]: v };
  api('/api/settings', 'PUT', { [key]: v }).catch(() => {});
}

// Design: '' = Standard, sonst Name eines :root[data-theme=…]-Blocks in styles.css.
// Massgebend ist der Server; die Kopie im Browser liest index.html schon vor dem
// ersten Zeichnen, damit nicht kurz das Standard-Design aufblitzt.
function _applyTheme(theme) {
  const t = theme ?? state.settings?.theme ?? '';
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('plm.theme', t); } catch {}
}
async function setTheme(theme) {
  _applyTheme(theme);
  document.querySelectorAll('.theme-preset-btn').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.theme === theme);
    b.classList.toggle('btn-ghost',   b.dataset.theme !== theme);
  });
  await api('/api/settings', 'PUT', { theme });
  state.settings = await api('/api/settings');
}

window.addEventListener('DOMContentLoaded', async () => {
  state.settings = await api('/api/settings').catch(() => ({}));
  _applyFontScale();
  _applyTheme();
  loadVersion();
  // Aus dem Launcher über „Update installieren“ geöffnet (/?update)
  const updateFromLauncher = new URLSearchParams(location.search).has('update');
  const updateChecked = checkUpdate();
  setInterval(checkUpdate, UPDATE_CHECK_MS);
  loadCadStatus();
  history.replaceState({ view: 'dashboard' }, '', location.pathname);
  gotoView('dashboard');
  loadStats();
  loadCheckouts();
  loadSlicerStatus();
  // Ab zwei Personen: beim Öffnen fragen, wer dran ist
  // Den Update-Dialog erst danach, sonst läge er unter der Auswahl
  loadSession().then(async s => {
    if (s?.mode === 'team' && !s.user) await askWhoIsThere('select');
    if (updateFromLauncher && await updateChecked) showUpdateDialog();
  });
  _renderRecent();
  setupUploadDrag();
  api('/api/data-path').then(d => { if (!d.configured) _showFirstRunModal('', d.config_file); }).catch(() => {});
  document.addEventListener('click', e => {
    const res = document.getElementById('li-plm-results');
    if (res && !e.target.closest('#li-plm-results') && e.target.id !== 'li-plm-search') res.style.display = 'none';
    const res2 = document.getElementById('dim-plm-results');
    if (res2 && !e.target.closest('#dim-plm-results') && e.target.id !== 'dim-plm-search') res2.style.display = 'none';
  });
});

// ── VIEWS ─────────────────────────────────────────────────────
async function gotoView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const ni = document.getElementById('ni-' + v);
  if (ni) ni.classList.add('active');
  closeDetail();
  _pushHistory({ view: v });

  if (v === 'projects') await renderProjectsList();
  else if (v === 'dashboard') await renderDashboard();
  else if (v === 'customers') await renderCustomers();
  else if (v === 'quotes') await renderQuotes();
  else if (v === 'orders') await renderOrders();
  else if (v === 'deliveries') await renderDeliveries();
  else if (v === 'changelog') await renderChangelog();
  else if (v === 'erplog') await renderChangelog('erp');
  else if (v === 'settings') await renderSettings();
  else if (v === 'fileindex') await renderFileIndex();
  else if (v === 'search') renderSearchView();
  else if (v === 'profit') await renderProfitOverview();
  else if (v === 'inventory') await renderInventory();
  else if (v === 'rawmaterials') await renderRawMaterials();
  else if (v === 'normteile') await renderNormteile();
  else if (v === 'ecr') await renderEcrList();
  else if (v === 'purchasing') await renderPurchasing();
}
