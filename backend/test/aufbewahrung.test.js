// Aufbewahrung der täglichen Sicherungen: jede der letzten 7 Tage, danach die
// erste jedes Monats für 6 Monate und die erste jedes Jahres für immer. Die Funktion wird aus server.js gelesen,
// damit kein Server starten muss.
//
// Ausführen:  npm test   (im backend/-Ordner)

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const from = src.indexOf('const BACKUP_KEEP_DAYS');
const to = src.indexOf('function autoBackupDb');
assert.ok(from > 0 && to > from, 'Aufbewahrung in server.js');
const fns = new Function(src.slice(from, to) + '; return { expired: expiredAutoBackups, roles: autoBackupRoles };')();
const { expired, roles } = fns;

// Jeden Tag eine Sicherung von `start` bis `end` (JJJJ-MM-TT)
function everyDay(start, end) {
  const out = [];
  for (const d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1))
    out.push(`plm-${d.toISOString().slice(0, 10)}.db`);
  return out;
}
const kept = (names, today) => { const gone = new Set(expired(names, today)); return names.filter(n => !gone.has(n)); };

test('Aufbewahrung: 7 Tage täglich, dann der Monatserste für 6 Monate, der Jahreserste immer', () => {
  const names = everyDay('2024-03-10', '2026-11-11');
  assert.deepStrictEqual(kept(names, '2026-11-11'), [
    'plm-2024-03-10.db', 'plm-2025-01-01.db', 'plm-2026-01-01.db',
    'plm-2026-06-01.db', 'plm-2026-07-01.db', 'plm-2026-08-01.db', 'plm-2026-09-01.db', 'plm-2026-10-01.db',
    'plm-2026-11-01.db',
    ...everyDay('2026-11-05', '2026-11-11'),
  ]);
});

test('Aufbewahrung: Monatssicherung ist die erste vorhandene, auch wenn nicht am 1.', () => {
  // Server lief im August erst ab dem 12., im September gar nicht
  const names = ['plm-2026-08-12.db', 'plm-2026-08-20.db', 'plm-2026-10-03.db', 'plm-2026-10-04.db', ...everyDay('2026-11-01', '2026-11-11')];
  assert.deepStrictEqual(kept(names, '2026-11-11'), [
    'plm-2026-08-12.db', 'plm-2026-10-03.db', 'plm-2026-11-01.db', ...everyDay('2026-11-05', '2026-11-11'),
  ]);
});

test('Aufbewahrung: andere Sicherungen bleiben unberührt', () => {
  const names = ['plm-2020-01-01_120000-manuell.db', 'plm-2020-01-02_120000-vor-wiederherstellung.db', 'notiz.txt',
    'plm-2020-01-01.db', 'plm-2020-01-02.db'];
  assert.deepStrictEqual(expired(names, '2026-11-11'), ['plm-2020-01-02.db']);
});

test('Aufbewahrung: Rolle für die Anzeige', () => {
  const names = ['plm-2025-06-03.db', 'plm-2025-07-01.db', 'plm-2026-01-01.db', 'plm-2026-10-01.db', 'plm-2026-11-10.db'];
  assert.deepStrictEqual(Object.fromEntries(roles(names, '2026-11-11')), {
    'plm-2025-06-03.db': 'jaehrlich', 'plm-2025-07-01.db': null, 'plm-2026-01-01.db': 'jaehrlich',
    'plm-2026-10-01.db': 'monatlich', 'plm-2026-11-10.db': 'auto',
  });
});
