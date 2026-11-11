// 00-i18n.js — Sprache der Oberfläche
// Teil der aufgeteilten app.js; klassische Scripts mit gemeinsamem globalem Scope,
// Ladereihenfolge siehe index.html. Lädt nach lang/en.js und vor allen anderen.
//
// Schlüssel ist der deutsche Text: t('Speichern') gibt auf Deutsch den Text
// selbst zurück, auf Englisch die Übersetzung aus lang/en.js. Fehlt sie, bleibt
// der deutsche Text stehen — so lässt sich Datei für Datei umstellen.
// Platzhalter in geschweiften Klammern: t('{n} neue Commits', { n: 3 }).
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

function t(s, vars) {
  let r = (LANG !== 'de' && I18N[LANG]?.[s]) || s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return r;
}

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
