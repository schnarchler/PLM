// Speichern der Datenbank, wenn Windows die plm.db sperrt (Sync-Programm,
// Virenscanner): erst neu versuchen, dann direkt hineinkopieren. Unter Linux
// lässt sich die Sperre nicht echt erzeugen — darum mit nachgebautem fs.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const from = src.indexOf('// ── DATEI ERSETZEN');
const to = src.indexOf('// ── ENDE DATEI ERSETZEN');
assert.ok(from > 0 && to > from, 'Abschnitt DATEI ERSETZEN in server.js');
const load = fakeFs => new Function('fs', src.slice(from, to) + '; return _replaceFile;')(fakeFs);

// fs, dessen renameSync die ersten `locked` Male mit `code` scheitert
function fakeFs(locked, code = 'EPERM') {
  const calls = { rename: 0, copy: 0, unlink: 0 };
  return {
    calls,
    renameSync() { calls.rename++; if (calls.rename <= locked) throw Object.assign(new Error(code), { code }); },
    copyFileSync() { calls.copy++; },
    unlinkSync() { calls.unlink++; },
  };
}

test('Speichern: kurze Sperre — warten und neu versuchen, dann umbenennen', () => {
  const f = fakeFs(3);
  const waits = [];
  assert.strictEqual(load(f)('a.tmp', 'a.db', { sleep: ms => waits.push(ms) }), 'renamed');
  assert.strictEqual(f.calls.rename, 4);
  assert.deepStrictEqual(waits, [40, 80, 120]);
  assert.strictEqual(f.calls.copy, 0);
});

test('Speichern: Sperre hält an — Inhalt direkt hineinkopieren', () => {
  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    const f = fakeFs(Infinity, code);
    assert.strictEqual(load(f)('a.tmp', 'a.db', { sleep: () => {} }), 'copied', code);
    assert.strictEqual(f.calls.rename, 9, '8 Wiederholungen nach dem ersten Versuch');
    assert.deepStrictEqual([f.calls.copy, f.calls.unlink], [1, 1]);
  }
});

test('Speichern: andere Fehler werden nicht verschluckt', () => {
  const f = fakeFs(Infinity, 'ENOSPC');
  assert.throws(() => load(f)('a.tmp', 'a.db', { sleep: () => {} }), /ENOSPC/);
  assert.strictEqual(f.calls.copy, 0);
});

test('Speichern: ohne Sperre wird nicht gewartet', () => {
  const f = fakeFs(0);
  let waited = false;
  assert.strictEqual(load(f)('a.tmp', 'a.db', { sleep: () => { waited = true; } }), 'renamed');
  assert.strictEqual(waited, false);
});
