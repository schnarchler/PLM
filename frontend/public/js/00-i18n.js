// 00-i18n.js — Sprache der Oberfläche
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html. Lädt nach lang/en.js und vor allen anderen.
//
// Schlüssel ist der deutsche Text: _t('Speichern') gibt auf Deutsch den Text
// selbst zurück, auf Englisch die Übersetzung aus lang/en.js. Fehlt sie, bleibt
// der deutsche Text stehen — so lässt sich Datei für Datei umstellen.
// Platzhalter in geschweiften Klammern: _t('{n} neue Commits', { n: 3 }).
// Kontext für mehrdeutige Wörter: _t('@tab:Artikel') (siehe _t unten).
// Begriffe: Glossar im README (Abschnitt Terminology).
//
// Die Sprache steht auf dem Server (Einstellung ui_lang), wie das Design. Die
// Kopie im Browser (plm.lang) gilt schon beim Laden der Scripts, denn Tabellen
// wie ORDER_ST_LABEL werden beim Laden übersetzt. Ist nichts gewählt, gilt die
// Sprache des Browsers.
const LANGS = { de: 'Deutsch', en: 'English' };
const I18N = { en: typeof I18N_EN !== 'undefined' ? I18N_EN : {} };
// Datumsformat je Sprache (Zahlen bleiben Schweizer Schreibweise 1'234.50)
const LOCALES = { de: 'de-CH', en: 'en-GB' };

function _detectLang() {
  if (typeof document === 'undefined') return 'de';   // Tests ohne Browser
  let l = null;
  try { l = localStorage.getItem('plm.lang'); } catch {}
  if (!l) l = /^de\b/i.test(navigator.language || '') ? 'de' : 'en';
  return LANGS[l] ? l : 'de';
}
let LANG = _detectLang();
const LOCALE = LOCALES[LANG];

// Gleicher deutscher Text, verschiedene Bedeutung: ein Kontext davor trennt die
// Übersetzungen — _t('@lock:Übernehmen') zeigt auf Deutsch „Übernehmen“.
function _tIn(lang, s, vars) {
  let r = (lang !== 'de' && I18N[lang]?.[s]) || s;
  if (r === s && s[0] === '@') r = s.slice(s.indexOf(':') + 1);
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}
function _t(s, vars) { return _tIn(LANG, s, vars); }
// Nur als Schlüssel markieren, übersetzt wird erst beim Verwenden — für Tabellen,
// die Oberfläche (_t) und Belege (_d) teilen (wie N_() bei gettext).
const _k = s => s;

// Belege (Rechnung, Angebot, Lieferschein, Bestellung, Datenblatt …) haben ihre
// eigene Sprache: Einstellungen → Firma (doc_lang). Ohne Einstellung gilt die der
// Oberfläche. _d() statt _t() für alles, was gedruckt oder als PDF erzeugt wird.
function _docLang() {
  let l;
  try { l = state.settings?.doc_lang; } catch {}
  return LANGS[l] ? l : LANG;
}
function _d(s, vars) { return _tIn(_docLang(), s, vars); }
const _docLocale = () => LOCALES[_docLang()];

// Einheit für die Anzeige. In der Datenbank steht ein Code (pcs, set, flat), der
// Server macht auch aus „Stk“ oder „Stück“ pcs. Physikalische Einheiten (g, m, h …)
// und eigener Freitext („Rolle“) werden angezeigt, wie sie sind.
const UNIT_LABEL = { pcs: 'Stk', set: 'Set', flat: 'Pauschal' };
function _unit(u) { return u && !UNIT_LABEL[u] ? u : _t(UNIT_LABEL[u || 'pcs']); }
function _dunit(u) { return u && !UNIT_LABEL[u] ? u : _d(UNIT_LABEL[u || 'pcs']); }

// Statisches HTML aus index.html einmal beim Laden übersetzen: Textknoten und
// title/placeholder, die genau einem Eintrag entsprechen. Nur beim Start —
// danach stehen auch Benutzerdaten im DOM, die nicht übersetzt werden dürfen.
// <option> ohne value: der deutsche Text ist der gespeicherte Wert (z. B. die
// Einheit „Stk“), darum wird er vorher als value festgehalten.
function translateDom(root) {
  const dict = I18N[LANG];
  if (!dict || !root) return;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const s = n.nodeValue.trim();
    if (!s || !dict[s] || n.parentNode.closest('script,style,[data-no-i18n]')) continue;
    const opt = n.parentNode.closest('option');
    if (opt && !opt.hasAttribute('value')) opt.setAttribute('value', opt.value);
    n.nodeValue = n.nodeValue.replace(s, dict[s]);
  }
  root.querySelectorAll('[title],[placeholder]').forEach(el => {
    for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute(a);
      if (v && dict[v]) el.setAttribute(a, dict[v]);
    }
  });
}

// Sprache wählen (Einstellungen → Darstellung): Server und Browser merken sie,
// dann lädt die Seite neu, damit auch die beim Laden übersetzten Tabellen stimmen.
async function setLang(l) {
  if (!LANGS[l]) return;
  try { localStorage.setItem('plm.lang', l); } catch {}
  await api('/api/settings', 'PUT', { ui_lang: l }).catch(() => {});
  location.reload();
}
// Nach dem Laden der Einstellungen: Hat der Server eine andere Sprache (anderer
// Port, anderer Browser), sie übernehmen und neu laden. Nur wenn der Browser sie
// sich auch merken kann — sonst würde die Seite endlos neu laden.
function _syncLang() {
  const l = state.settings?.ui_lang;
  if (!LANGS[l] || l === LANG) return;
  try { localStorage.setItem('plm.lang', l); if (localStorage.getItem('plm.lang') === l) location.reload(); } catch {}
}

if (typeof document !== 'undefined') {
  document.documentElement.lang = LANG;
  translateDom(document.body);
}
