# Konzept: Benutzerverwaltung

Stand: 16.10.2026, umgesetzt. Ziel: **Nachvollziehbarkeit** — festhalten, wer was
getan hat — und heikle Aktionen auf die richtigen Personen lenken. Ausdrücklich
**nicht** das Ziel: Schutz vor Personen, die am PC sitzen. Begriffe wie in der
README unter **Begriffe**.

---

## 1. Entscheidung

| Frage | Entscheidung | Warum |
|---|---|---|
| Anmeldung | **Auswahl statt Passwort**: „Wer ist dran?“ mit Kacheln, ein Klick | Wird die Anmeldung lästig, wird sie umgangen, und die Historie stimmt nicht mehr |
| Einzelpersonen | **Keine Auswahl, solange höchstens eine Person angelegt ist** | Wer allein arbeitet, soll von der Benutzerverwaltung nichts merken |
| Vergessenes Wechseln | **Nachfragen statt Abmelden**: nach einer Pause bei der nächsten *Änderung* | Ansehen läuft ohne Unterbrechung, Änderungen landen unter dem richtigen Namen |
| Rollen | **User, Superuser, Admin** | User ändert, Superuser gibt zusätzlich frei, Admin darf alles |
| Admin | **PIN optional**, pro Admin | Schützt vor versehentlichem Wechsel in den Admin, nicht vor Absicht |

Die Schutzmassnahmen gegen andere Geräte und fremde Webseiten bleiben, wie sie sind
(README → **Sicherheit**). Die Benutzerverwaltung ändert daran nichts, weder zum
Guten noch zum Schlechten.

---

## 2. Verhalten

**Ohne Personen** — wie vor der Benutzerverwaltung. Historie ohne Namen.

**Allein (eine Person)** — keine Auswahl, kein Abmelden. Die Person ist Admin, ihr
Name steht in jedem Historien-Eintrag und bei Freigaben. Anlegen unter
Einstellungen → Benutzer („Dein Name“).

**Team (ab zwei Personen)**

- Beim Öffnen: „Wer ist dran?“. Die Wahl gilt, bis der Browser geschlossen oder
  PLM beendet wird.
- Der Name steht oben rechts; ein Klick darauf wechselt die Person.
- Nach einer einstellbaren Pause (Standard 30 Minuten, 0 = nie) fragt PLM bei der
  nächsten Änderung einmal „Weiter als Anna?“. Wer weitermacht, braucht keine PIN.
  Danach wird die Änderung ausgeführt — sie geht nicht verloren.
- Lesen ist ohne Auswahl möglich, Ändern nicht.
- Legt eine Einzelperson die zweite Person an, bleibt sie an ihrem Gerät gewählt.

---

## 3. Rollen

| Aktion | User | Superuser | Admin |
|---|:-:|:-:|:-:|
| Ansehen, suchen, drucken, Schriftgrösse | ✓ | ✓ | ✓ |
| Items, Revisionen, Dateien, Stücklisten, Aufträge, Produktion, Einkauf, Lager | ✓ | ✓ | ✓ |
| Einreichen (REV), zurückziehen, ECO starten | ✓ | ✓ | ✓ |
| Positionen und Belege löschen | ✓ | ✓ | ✓ |
| Sicherung anlegen, Server beenden, CAD/Slicer starten | ✓ | ✓ | ✓ |
| **Freigeben (REL), als veraltet markieren (OBS)** | | ✓ | ✓ |
| Stammdaten löschen (Projekte, Items, Kunden, Lieferanten) | | | ✓ |
| Einstellungen, Nummernkreise, Klassifizierungen, Drucker/Düsen/Materialien | | | ✓ |
| Sicherung zurückspielen oder löschen, Daten verschieben | | | ✓ |
| Personen verwalten | | | ✓ |

Allein und ohne Personen darf man alles. Es braucht immer mindestens einen aktiven Admin.
Personen werden deaktiviert, nie gelöscht — sonst verliert die Historie ihre Namen.

---

## 4. Technik

- **Tabelle `users`**: Name, Rolle, optionaler PIN-Hash (`scrypt`), aktiv, zuletzt gewählt.
  `changelog` bekommt `user_id` und `user_name` (Kopie, damit die Historie lesbar bleibt).
- **Sitzungen nur im Speicher**: zufälliger Schlüssel im Cookie `plm_user_<Port>`
  (`HttpOnly`, `SameSite=Strict`). Cookies kennen keinen Port — ohne ihn kämen sich
  zwei PLM auf verschiedenen Ports in die Quere.
- **Eine Middleware** vor allen `/api`-Routen bestimmt die Person und die nötige Rolle:
  - lesen und Anfragen, die nichts ändern (Auswerten, Drucken, Programme starten): niemand nötig
  - ändern: User
  - Status REL/OBS: Superuser
  - eine Liste von Admin-Routen
  - Im Team: ohne Auswahl 401 (`need_user`), nach der Pause 428 (`confirm_user`),
    zu wenig Rechte 403.
- **Die Oberfläche** fängt 401 und 428 in `api()` bzw. `apiForm()` ab, zeigt die
  Auswahl und wiederholt die Anfrage.
- **„Wer“ ohne 45 Änderungen**: `AsyncLocalStorage` hält die Person der Anfrage,
  `log()` schreibt sie in jeden Eintrag. Für Uploads stellt `_keepUser()` sie nach
  `multer` wieder her. `released_by` setzt der Server, der Browser hat dabei nichts zu sagen.
- **Tests**: `benutzer.test.js` (Ablauf, Rollen, PIN, Pause, Upload), Frontend-Tests
  für Kacheln, Rechte und Historie.

---

## 5. Grenzen

- **Kein Schutz**: Wer am PC sitzt, kann jede Person wählen — ausser Admins mit PIN.
  Wer die Daten schützen muss, braucht Passwörter (Abschnitt 6) und eine
  Festplattenverschlüsselung.
- **Ehrlichkeit vorausgesetzt**: Die Historie zeigt, wer gewählt war, nicht wer
  wirklich am PC sass. Das Nachfragen nach einer Pause verkleinert die Lücke.
- **Sicherungen**: Die Personen liegen in der Datenbank. Wer eine alte Sicherung
  zurückspielt, bekommt die damaligen Personen zurück.
- **Ältere Einträge** bleiben ohne Namen.
- **Die Oberfläche** graut bisher nur die Freigabe-Knöpfe aus und zeigt in den
  Einstellungen einen Hinweis. Alles andere meldet der Server beim Versuch.

---

## 6. Mögliche Ausbauten

1. **Zeiterfassung pro Person** — `time_entries.user_id`, Auswertung nach Person.
2. **Vier-Augen-Freigabe** — freigeben nur, wer die Revision nicht zuletzt geändert hat.
3. **„Ausgecheckt von“** — Person am Checkout.
4. **Weitere Knöpfe nach Rolle ausgrauen** — Löschen, Einstellungen.
5. **Passwörter statt Auswahl** — falls das Tool einmal übers Netz genutzt wird.
   Die Rollen und die Middleware bleiben; dazu kämen Passwort-Hash, Sperre nach
   Fehlversuchen und ein Admin-Reset am PC.
