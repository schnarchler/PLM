// 19-rueckmeldung.js — Fehler melden und Ideen einreichen
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html.
// Der Knopf oben erscheint nur, wenn mehrere Personen hinterlegt sind — allein
// ist man selbst der Admin. Mitgeschickt wird, wo man gerade ist (Ansicht,
// Item) und die letzten Fehler im Browser; die Admins sehen offene
// Rückmeldungen auf dem Dashboard.

const FEEDBACK_KIND = {
  BUG:  { label: _t('Fehler'), icon: '🐞', color: 'var(--red)' },
  IDEA: { label: _t('Idee'),   icon: '💡', color: 'var(--amber)' },
};

// Die letzten Fehler im Browser — Skriptfehler und abgelehnte Anfragen
const _recentErrors = [];
function _noteError(msg) {
  _recentErrors.push(`${new Date().toLocaleTimeString(LOCALE)} ${String(msg).slice(0, 500)}`);
  if (_recentErrors.length > 5) _recentErrors.shift();
}
window.addEventListener('error', e => _noteError(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', e => _noteError(e.reason?.message || e.reason));

function _renderFeedbackButton() {
  const btn = document.getElementById('tb-feedback');
  if (btn) btn.style.display = state.session?.mode === 'team' ? '' : 'none';
}

function _feedbackContext() {
  const it = document.getElementById('it-sheet') && state.item;
  const view = document.getElementById('ni-' + state.view)?.textContent.trim() || state.view;
  return {
    view,
    item: it ? `${it.item_number} – ${it.name}` : undefined,
    screen: `${innerWidth}×${innerHeight}`,
    errors: _recentErrors.length ? [..._recentErrors] : undefined,
  };
}

function openFeedbackModal(kind = 'BUG') {
  const ctx = _feedbackContext();   // vor dem Öffnen: dort, wo man gerade war
  const kindBtn = k => `<button type="button" class="btn btn-sm ${k === kind ? 'btn-primary' : 'btn-ghost'}" data-kind="${k}"
      onclick="_feedbackKind('${k}')">${FEEDBACK_KIND[k].icon} ${FEEDBACK_KIND[k].label}</button>`;
  _showDynModal(`<div class="modal" style="max-width:480px">
    <div class="modal-head">
      <div class="modal-title">${_t('Rückmeldung an den Admin')}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;gap:6px">${kindBtn('BUG')}${kindBtn('IDEA')}</div>
      <input type="hidden" id="fb-kind" value="${kind}">
      <div class="fg"><label class="fl" id="fb-label">${_feedbackPrompt(kind)}</label>
        <textarea class="ft" id="fb-text" rows="6" maxlength="5000"
          onkeydown="if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();_sendFeedback()}"></textarea>
      </div>
      <div style="font-size:12px;color:var(--t3);line-height:1.5">
        ${_t(ctx.item ? 'Wird mitgeschickt: dein Name, Ansicht {view}, Item {item}, Version und Browser' : 'Wird mitgeschickt: dein Name, Ansicht {view}, Version und Browser',
          { view: `<strong style="color:var(--t2)">${esc(ctx.view)}</strong>`, item: `<strong style="color:var(--t2)">${esc(ctx.item || '')}</strong>` })}${ctx.errors ? ', ' + _t('die letzten {n} Fehlermeldungen', { n: ctx.errors.length }) : ''}.
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" onclick="_hideDynModal()">${_t('Abbrechen')}</button>
      <button class="btn btn-primary" id="fb-send" onclick="_sendFeedback()">${_t('Senden')}</button>
    </div>
  </div>`);
  window._fbContext = ctx;
  document.getElementById('fb-text').focus();
}

const _feedbackPrompt = k => k === 'BUG' ? _t('Was ist passiert? Was hättest du erwartet?') : _t('Was wäre hilfreich?');
function _feedbackKind(k) {
  document.getElementById('fb-kind').value = k;
  document.querySelectorAll('#dynModal [data-kind]').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.kind === k);
    b.classList.toggle('btn-ghost', b.dataset.kind !== k);
  });
  document.getElementById('fb-label').textContent = _feedbackPrompt(k);
  document.getElementById('fb-text').focus();
}

async function _sendFeedback() {
  const text = V('fb-text').trim();
  if (!text) { toast(_t('Bitte kurz beschreiben'), 'err'); return; }
  const btn = document.getElementById('fb-send');
  btn.disabled = true;
  try {
    await api('/api/feedback', 'POST', { kind: V('fb-kind'), text, context: window._fbContext });
    _hideDynModal();
    toast(_t('Danke! Die Rückmeldung ist beim Admin.'), 'ok');
  } catch { btn.disabled = false; }
}

// ── Für Admins: ansehen, erledigen, löschen ──────────────────

// Erste Zeile als Titel, gekürzt
const _feedbackTitle = t => String(t || '').split('\n')[0].slice(0, 120);

async function showFeedbackList() {
  const list = await api('/api/feedback');
  const row = f => {
    const k = FEEDBACK_KIND[f.kind];
    return `<div onclick="openFeedbackDetail(${f.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:var(--r-sm);cursor:pointer;${f.status === 'DONE' ? 'opacity:.5' : ''}"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
      <span title="${k.label}">${k.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(_feedbackTitle(f.text))}</div>
        <div style="font-size:12px;color:var(--t3)">${esc(f.user_name || '—')} · ${fmtDate(f.created_at)}</div>
      </div>
      ${f.status === 'DONE' ? '<span style="font-size:12px;color:var(--green)">' + _t('✓ erledigt') + '</span>' : ''}
    </div>`;
  };
  _showDynModal(`<div class="modal" style="max-width:620px">
    <div class="modal-head">
      <div class="modal-title">${_t('Rückmeldungen')}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body">
      ${list.length ? list.map(row).join('') : '<div class="empty" style="padding:30px"><div class="empty-text">' + _t('Noch keine Rückmeldungen') + '</div></div>'}
    </div>
  </div>`);
}

async function openFeedbackDetail(id) {
  const f = (await api('/api/feedback')).find(x => x.id === id);
  if (!f) { toast(_t('Rückmeldung nicht mehr vorhanden'), 'err'); return; }
  const k = FEEDBACK_KIND[f.kind], c = f.context || {};
  const line = (label, val) => val ? `<div style="display:flex;gap:10px;font-size:12px;padding:2px 0">
      <span style="color:var(--t3);width:80px;flex-shrink:0">${label}</span>
      <span style="color:var(--t2);font-family:var(--mono);word-break:break-word">${esc(val)}</span></div>` : '';
  _showDynModal(`<div class="modal" style="max-width:620px">
    <div class="modal-head">
      <div class="modal-title"><span style="color:${k.color}">${k.icon} ${k.label}</span> ${_t('von {name}', { name: esc(f.user_name || '—') })}</div>
      <button class="btn btn-icon btn-ghost" onclick="_hideDynModal()">✕</button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
      <div style="font-size:12px;color:var(--t3)">${fmtDate(f.created_at)}${f.status === 'DONE'
        ? ` · <span style="color:var(--green)">${f.done_by ? _t('erledigt von {name}', { name: esc(f.done_by) }) : _t('erledigt')} ${fmtDate(f.done_at)}</span>` : ''}</div>
      <div style="font-size:14px;white-space:pre-wrap;line-height:1.5">${esc(f.text)}</div>
      <div style="background:var(--bg1);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 12px">
        ${line(_t('Ansicht'), c.view)}${line('Item', c.item)}${line('Version', c.version)}
        ${line(_t('Fenster'), c.screen)}${line('Browser', c.browser)}
        ${(c.errors || []).map((e, i) => line(i ? '' : _t('Fehlermeldungen'), e) || '').join('')}
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" style="margin-right:auto;color:var(--red)" onclick="_deleteFeedback(${f.id})">${_t('Löschen')}</button>
      <button class="btn btn-ghost" onclick="showFeedbackList()">${_t('Alle Rückmeldungen')}</button>
      <button class="btn btn-primary" onclick="_setFeedbackDone(${f.id}, ${f.status !== 'DONE'})">${f.status === 'DONE' ? _t('Wieder öffnen') : _t('✓ Erledigt')}</button>
    </div>
  </div>`);
}

async function _setFeedbackDone(id, done) {
  await api('/api/feedback/' + id, 'PUT', { done });
  _hideDynModal();
  toast(done ? _t('Als erledigt markiert') : _t('Wieder offen'), 'ok');
  if (state.view === 'dashboard') renderDashboard();
}

async function _deleteFeedback(id) {
  if (!confirm(_t('Rückmeldung endgültig löschen?'))) return;
  await api('/api/feedback/' + id, 'DELETE');
  _hideDynModal();
  if (state.view === 'dashboard') renderDashboard();
}
