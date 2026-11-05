// Alles, was ins Git kommt, muss anonym sein: keine echten Mailadressen,
// Benutzerpfade, IBAN oder Telefonnummern, keine lokale Konfiguration und
// keine Daten. Geprüft werden alle Dateien, die Git verfolgt oder die zum
// Commit vorgemerkt sind.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function trackedFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '-z'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\0').filter(Boolean);
  } catch { return null; }   // ZIP-Download ohne Git
}

// Platzhalter, die bewusst in Code, Tests und Doku stehen
const ALLOWED_MAIL = /^(user@plm\.local|noreply@.*|.*@(example|beispiel|firma|muster)\.[a-z]+|[a-z]@[a-z]+\.ch)$/i;
const ALLOWED_PHONE = ['+41440000000', '0441234567'];   // ohne Leerzeichen verglichen
const RULES = [
  { name: 'Mailadresse', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, ok: m => ALLOWED_MAIL.test(m) || /^@/.test(m) },
  { name: 'Benutzerpfad Linux', re: /\/home\/[A-Za-z0-9._-]+/g, ok: m => /^\/home\/(user|<[^>]*|benutzer)$/i.test(m) },
  { name: 'Benutzerpfad Windows', re: /[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+/gi, ok: m => /\\(user|name|benutzer)$/i.test(m) },
  { name: 'Benutzerpfad macOS', re: /\/Users\/[A-Za-z0-9._-]+/g, ok: m => /\/(user|name|benutzer)$/i.test(m) },
  { name: 'IBAN', re: /\b[A-Z]{2}\d{2}(?: ?\d{4}){4}(?: ?\d{1,4})?\b/g, ok: m => /^[A-Z]{2}0{2}[ 0]*$/.test(m) },
  { name: 'Telefonnummer', re: /(?:\+41 ?\d{2}|\b0\d{2}) ?\d{3} ?\d{2} ?\d{2}\b/g, ok: m => ALLOWED_PHONE.includes(m.replace(/\s/g, '')) },
];
const SKIP = /(^|\/)package-lock\.json$|\.(png|jpe?g|ico|gif|zip|db|stl|3mf|step|stp)$/i;

test('Git: keine lokale Konfiguration und keine Daten im Repo', t => {
  const files = trackedFiles();
  if (!files) return t.skip('kein Git-Checkout');
  const bad = files.filter(f => /(^|\/)plm\.config$|^backend\/data\/|(^|\/)screenshots\/|\.db$|(^|\/)\.claude\//.test(f));
  assert.deepStrictEqual(bad, [], 'gehört nicht ins Git: ' + bad.join(', '));
});

test('Git: alle Dateien anonym (keine echten Mailadressen, Pfade, IBAN, Telefonnummern)', t => {
  const files = trackedFiles();
  if (!files) return t.skip('kein Git-Checkout');
  const hits = [];
  for (const f of files) {
    if (SKIP.test(f)) continue;
    let text;
    try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;   // Binärdatei
    if (f === 'backend/test/anonym.test.js') continue;   // die Regeln selbst
    text.split('\n').forEach((line, i) => {
      for (const r of RULES) {
        for (const m of line.match(r.re) || []) if (!r.ok(m)) hits.push(`${f}:${i + 1} ${r.name}: ${m}`);
      }
    });
  }
  assert.deepStrictEqual(hits, [], 'Persönliche Daten gefunden — durch Platzhalter ersetzen:\n' + hits.join('\n'));
});
