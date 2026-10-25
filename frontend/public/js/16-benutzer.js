// ── BENUTZER ──────────────────────────────────────────────────
// „Wer ist dran?" — für die Nachvollziehbarkeit, nicht als Schutz
// (KONZEPT-BENUTZERVERWALTUNG.md). Allein (0–1 Personen) gibt es keine
// Auswahl. Ab zwei Personen fragt PLM beim Öffnen und, nach einer Pause, bei
// der nächsten Änderung: api() bekommt dann 401 bzw. 428 und fragt hier nach.

const ROLE_LABEL = { user: 'User', superuser: 'Superuser', admin: 'Admin' };
const ROLE_HINT = {
  user: 'ändert, gibt nicht frei',
  superuser: 'ändert und gibt frei',
  admin: 'darf alles: Einstellungen, Personen, Stammdaten löschen, Sicherungen zurückspielen',
};

async function loadSession() {
  try { state.session = await api('/api/session'); } catch { state.session = null; }
  _renderUserChip();
  return state.session;
}

// Allein oder ohne Personen darf man alles — wie vor der Benutzerverwaltung
function currentRole() {
  const s = state.session;
  return !s || s.mode !== 'team' ? 'admin' : (s.user?.role || null);
}
function canRelease() { return ['superuser', 'admin'].includes(currentRole()); }
function isAdmin() { return currentRole() === 'admin'; }

function _renderUserChip() {
  // ERP-Verlauf nur für Admins
  const erpLog = document.getElementById('ni-erplog');
  if (erpLog) erpLog.style.display = isAdmin() ? '' : 'none';
  const el = document.getElementById('tb-user');
  if (!el) return;
  const s = state.session;
  if (!s || s.mode === 'none') { el.style.display = 'none'; return; }
  const u = s.user;
  el.style.display = '';
  el.innerHTML = u
    ? `${_avatar(u.name, 22)}<span class="tb-user-name">${esc(u.name)}</span>`
      + (s.mode === 'team' ? `<span class="tb-user-role">${esc(ROLE_LABEL[u.role] || u.role)}</span>` : '')
    : '<span class="tb-user-name">Wer ist dran?</span>';
  el.title = s.mode === 'team' ? 'Person wechseln' : 'Personen verwalten';
}

async function onUserChip() {
  if (state.session?.mode === 'team') return askWhoIsThere('switch');
  await gotoView('settings');
  document.querySelector('.st-tab-btn[data-tab="benutzer"]')?.click();
}

// Nach einem Wechsel ändern sich die Rechte — was davon abhängt, neu zeichnen
function _afterUserChange() {
  // Kein Admin mehr: ERP-Verlauf schliessen (Ansicht und Tab im Detail)
  if (!isAdmin() && state.view === 'erplog') return gotoView('dashboard');
  if (!isAdmin() && document.querySelector('#od-log, #dd-log, #cd-log, #sd-log, #po-log')) closeDetail();
  if (state.view === 'erplog') renderChangelog('erp');
  else if (state.view === 'settings') renderSettings();
  else if (state.item && document.getElementById('it-sheet')) renderItemDetail(state.item, state.activeRevId);
}

// Kacheln in der Reihenfolge vom Server (zuletzt aktiv zuerst); beim
// Nachfragen steht die bisherige Person ganz vorne
function _whoTiles(users, currentId) {
  const list = currentId
    ? [...users.filter(u => u.id === currentId), ...users.filter(u => u.id !== currentId)]
    : users;
  return list.map(u => `<button type="button" class="who-tile${u.id === currentId ? ' current' : ''}" data-id="${u.id}">
      ${_avatar(u.name, 44)}
      <span class="who-name">${esc(u.name)}</span>
      <span class="who-role">${esc(ROLE_LABEL[u.role] || u.role)}${u.has_pin ? ' · PIN' : ''}</span>
    </button>`).join('');
}

// kind: 'select' beim Öffnen (ohne Abbrechen), 'confirm' nach einer Pause,
// 'switch' über den Namen oben. Liefert true, sobald jemand gewählt ist.
// Mehrere Anfragen, die gleichzeitig nachfragen, teilen sich ein Fenster.
let _whoPromise = null;
function askWhoIsThere(kind = 'select') {
  if (_whoPromise) return _whoPromise;
  _whoPromise = (async () => {
    const s = await loadSession();
    if (!s || s.mode !== 'team') return true;   // allein: nichts zu wählen
    return new Promise(resolve => _showWhoOverlay(kind, s, resolve));
  })().finally(() => { _whoPromise = null; });
  return _whoPromise;
}

function _showWhoOverlay(kind, s, done) {
  const cur = kind === 'select' ? null : (s.user?.id || null);
  const cancellable = kind !== 'select';
  const title = kind === 'confirm' && s.user ? `Weiter als ${esc(s.user.name)}?` : 'Wer ist dran?';
  const sub = kind === 'confirm'
    ? 'Nach einer Pause kurz nachgefragt, damit die Änderung unter dem richtigen Namen steht.'
    : 'Änderungen erscheinen in der Historie unter diesem Namen.';
  const ov = document.createElement('div');
  ov.className = 'who-overlay';
  ov.innerHTML = `<div class="who-card" role="dialog" aria-modal="true" aria-labelledby="who-title">
      <div class="who-title" id="who-title">${title}</div>
      <div class="who-sub">${sub}</div>
      <div class="who-grid">${_whoTiles(s.users, cur)}</div>
      <form class="who-pin" hidden>
        <label class="fl" for="who-pin-input"></label>
        <div style="display:flex;gap:8px">
          <input class="fi" id="who-pin-input" type="password" inputmode="numeric" autocomplete="off" maxlength="12">
          <button class="btn btn-primary btn-sm" type="submit">OK</button>
        </div>
        <div class="who-err"></div>
      </form>
      ${cancellable ? '<div class="who-foot"><button type="button" class="btn btn-ghost btn-sm" data-cancel>Abbrechen</button></div>' : ''}
    </div>`;
  document.body.appendChild(ov);

  const onKey = e => { if (e.key === 'Escape' && cancellable) { e.preventDefault(); finish(false); } };
  const finish = ok => { ov.remove(); document.removeEventListener('keydown', onKey, true); done(ok); };
  document.addEventListener('keydown', onKey, true);
  ov.querySelector('[data-cancel]')?.addEventListener('click', () => finish(false));

  const pinForm = ov.querySelector('.who-pin');
  let picked = null;
  const showPin = (user, err) => {
    picked = user;
    pinForm.hidden = false;
    pinForm.querySelector('label').textContent = `PIN für ${user.name}`;
    pinForm.querySelector('.who-err').textContent = err || '';
    const inp = pinForm.querySelector('input');
    inp.value = '';
    inp.focus();
  };
  // Direkt mit fetch: Ein falscher PIN soll hier stehen, nicht als Meldung unten
  const choose = async (user, pin) => {
    const r = await fetch(API + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, pin }) });
    const body = await r.json().catch(() => ({}));
    if (r.ok) { state.session = body; _renderUserChip(); finish(true); _afterUserChange(); return; }
    if (body.pin_required) return showPin(user, pin ? body.error : '');
    toast(body.error || 'Auswahl fehlgeschlagen', 'err');
  };
  ov.querySelectorAll('.who-tile').forEach(t => t.addEventListener('click', () => {
    const u = s.users.find(x => x.id === Number(t.dataset.id));
    ov.querySelectorAll('.who-tile').forEach(x => x.classList.toggle('picked', x === t));
    // Wer nach einer Pause nur weitermacht, braucht keine PIN — der Server entscheidet
    if (u.has_pin && u.id !== cur) showPin(u);
    else { pinForm.hidden = true; choose(u); }
  }));
  pinForm.addEventListener('submit', e => { e.preventDefault(); if (picked) choose(picked, pinForm.querySelector('input').value); });
  (ov.querySelector('.who-tile.current') || ov.querySelector('.who-tile'))?.focus();
}

// ── EINSTELLUNGEN → BENUTZER ──────────────────────────────────
let _usersCache = [];
async function _renderUsersSettings() {
  const box = document.getElementById('st-users-box');
  if (!box) return;
  const [users, s] = await Promise.all([api('/api/users').catch(() => []), loadSession()]);
  _usersCache = users;
  box.innerHTML = _usersPanel(users, s, isAdmin());
}

// Nur Admins verwalten Personen; alle anderen sehen die Liste ohne Knöpfe.
// Der letzte aktive Admin lässt sich weder deaktivieren noch herabstufen.
function _usersPanel(users, s, admin) {
  const mode = s?.mode || 'none';
  const active = users.filter(u => u.active);
  const inactive = users.filter(u => !u.active);
  const lastAdmin = u => u.role === 'admin' && active.filter(x => x.role === 'admin').length <= 1;
  const ONLY_ADMIN = 'Es braucht immer mindestens einen aktiven Admin';
  const roleChip = u => `<span class="chip">${esc(ROLE_LABEL[u.role] || u.role)}</span>`;
  const roleSelect = u => lastAdmin(u)
    ? `<span title="${ONLY_ADMIN}" style="display:inline-flex"><select class="fs" style="width:auto" disabled><option>Admin</option></select></span>`
    : `<select class="fs" style="width:auto" onchange="_saveUser(${u.id}, { role: this.value })">
        ${['user', 'superuser', 'admin'].map(r => `<option value="${r}"${u.role === r ? ' selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}
      </select>`;
  const intro = {
    none: 'Noch keine Personen. Trägst du deinen Namen ein, steht er in der Historie und bei Freigaben — sonst ändert sich nichts.',
    single: 'Allein: PLM fragt nicht, wer dran ist, alles läuft unter diesem Namen. Ab der zweiten Person fragt PLM beim Öffnen „Wer ist dran?“.',
    team: 'Team: PLM fragt beim Öffnen „Wer ist dran?“ und nach einer Pause bei der nächsten Änderung noch einmal kurz nach. Ein Klick auf den Namen oben wechselt die Person.',
  }[mode];

  const editRow = u => `<div class="user-row">
      ${_avatar(u.name, 30)}
      <input class="fi" style="flex:1;min-width:120px" value="${esc(u.name)}" onchange="_saveUser(${u.id}, { name: this.value })" aria-label="Name">
      ${mode === 'team' ? roleSelect(u) : roleChip(u)}
      ${u.role === 'admin' && mode === 'team' ? (u.has_pin
        ? `<button class="btn btn-ghost btn-sm" onclick="_setUserPin(${u.id})">PIN ändern</button>
           <button class="btn btn-ghost btn-sm" onclick="_saveUser(${u.id}, { pin: null })">PIN entfernen</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="_setUserPin(${u.id})">PIN setzen</button>`) : ''}
      ${mode !== 'team' ? '' : lastAdmin(u)
        ? `<span class="chip" title="${ONLY_ADMIN}">einziger Admin</span>`
        : `<button class="btn btn-ghost btn-sm" onclick="_saveUser(${u.id}, { active: false })" title="Bleibt in der Historie, steht aber nicht mehr zur Auswahl">Deaktivieren</button>`}
    </div>`;
  const readRow = u => `<div class="user-row">${_avatar(u.name, 30)}<span style="flex:1">${esc(u.name)}</span>${roleChip(u)}</div>`;
  const rows = active.map(admin ? editRow : readRow).join('');
  const noPin = mode === 'team' && admin && active.some(u => u.role === 'admin' && !u.has_pin);

  return `
    <div style="font-size:13px;color:var(--t3);margin-bottom:12px;line-height:1.55">${intro}</div>
    ${!admin ? '<div class="st-notice">Personen verwalten dürfen nur Admins.</div>' : ''}
    ${noPin ? `<div class="st-notice">Ohne PIN kann jede Person die Admin-Kachel wählen — und damit auch Personen verwalten.
      Wer das verhindern will, setzt beim Admin eine PIN.</div>` : ''}
    ${rows ? `<div style="display:flex;flex-direction:column;gap:6px">${rows}</div>` : ''}
    ${admin ? `<div class="user-row" style="margin-top:${rows ? '12px' : '0'}">
      <input class="fi" id="st-user-new" style="flex:1;min-width:120px" placeholder="${mode === 'none' ? 'Dein Name' : 'Name der neuen Person'}"
        onkeydown="if(event.key==='Enter')_addUser()">
      ${mode !== 'none' ? `<select class="fs" id="st-user-new-role" style="width:auto">
        ${['user', 'superuser', 'admin'].map(r => `<option value="${r}">${ROLE_LABEL[r]}</option>`).join('')}</select>` : ''}
      <button class="btn btn-primary btn-sm" onclick="_addUser()">${mode === 'none' ? 'Speichern' : '+ Person'}</button>
    </div>` : ''}
    ${inactive.length ? `<div class="sep-label" style="margin-top:20px">Deaktiviert</div>
      <div style="display:flex;flex-direction:column;gap:6px">${inactive.map(u => `<div class="user-row" style="opacity:.7">
        ${_avatar(u.name, 30)}<span style="flex:1">${esc(u.name)}</span>
        ${admin ? `<button class="btn btn-ghost btn-sm" onclick="_saveUser(${u.id}, { active: true })">Aktivieren</button>` : ''}</div>`).join('')}</div>` : ''}
    ${mode === 'team' ? `<div class="sep-label" style="margin-top:20px">Nachfragen nach einer Pause</div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--t2)">
        ${admin ? `Nach <input class="fi" type="number" min="0" step="5" style="width:80px" value="${s.idle_minutes || 0}"
          onchange="_saveIdleMinutes(this.value)"> Minuten ohne Aktivität bei der nächsten Änderung nachfragen (0 = nie)`
          : (s.idle_minutes ? `Nach ${s.idle_minutes} Minuten ohne Aktivität fragt PLM bei der nächsten Änderung nach.` : 'PLM fragt nach einer Pause nicht nach.')}
      </div>` : ''}
    <div class="sep-label" style="margin-top:20px">Rollen</div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px">
      ${['user', 'superuser', 'admin'].map(r => `<b style="color:var(--t1)">${ROLE_LABEL[r]}</b><span style="color:var(--t3)">${ROLE_HINT[r]}</span>`).join('')}
    </div>`;
}

async function _saveUser(id, patch) {
  try { await api(`/api/users/${id}`, 'PUT', patch); toast('Gespeichert', 'ok'); } catch {}
  await _renderUsersSettings();
}
async function _setUserPin(id) {
  const name = _usersCache.find(u => u.id === id)?.name || '';
  const pin = prompt(`PIN für ${name} (4 bis 12 Zeichen):`);
  if (pin === null) return;
  await _saveUser(id, { pin });
}
async function _addUser() {
  const name = V('st-user-new').trim();
  if (!name) return;
  try {
    await api('/api/users', 'POST', { name, role: V('st-user-new-role') || 'user' });
    toast(`${name} angelegt`, 'ok');
  } catch { return; }
  await _renderUsersSettings();
}
async function _saveIdleMinutes(v) {
  try { await api('/api/settings', 'PUT', { user_idle_minutes: String(Math.max(0, parseFloat(v) || 0)) }); toast('Gespeichert', 'ok'); } catch {}
  await loadSession();
}
