# Konzept: Benutzerverwaltung

Stand: 16.10.2026. Ziel: Festhalten, wer was getan hat, und heikle Aktionen
(Löschen, Wiederherstellen, Einstellungen) auf die richtigen Personen beschränken.
Begriffe wie in der README unter **Begriffe**.

---

## 1. Ausgangslage

Es gibt keine Anmeldung. Wer die Oberfläche erreicht, darf alles: ansehen,
ändern, löschen, Sicherungen zurückspielen, den Server beenden.

**Wer die Oberfläche erreicht:** alle am PC. Andere Geräte im Netz nur, wenn die
Firewall Port 3000 durchlässt. Auf dem Linux-PC blockt `ufw` das im Moment, unter
Windows entscheidet die Firewall-Abfrage beim ersten Start.

**Schon abgesichert, ohne Anmeldung (Phase 0):**

| Bereich | Umsetzung |
|---|---|
| Fremde Webseiten | Anfragen mit fremder Herkunft (Origin) oder fremdem Host werden abgewiesen, keine CORS-Freigabe |
| Programme | CAD, Slicer und „Ordner öffnen“ starten ohne Shell und nur für Anfragen vom PC selbst |
| Programmpfade | stehen in `plm.config`, nicht in der Oberfläche |
| Dateisystem | Check-in löscht und Import liest nur im Checkout-Verzeichnis; dieses ist nur am PC änderbar |
| Pakete | keine bekannten Lücken in den Laufzeitpaketen (`npm audit`) |

**Wo das Tool heute „wer“ festhält: nirgends.**

- Freigabe: `released_by` wird immer mit „User“ gefüllt.
- Historie (`changelog`): was und wann, nicht wer.
- Zeiterfassung (`time_entries`): Stunden ohne Person.
- Checkouts: ohne Person.

---

## 2. Was eine Benutzerverwaltung bringt und was nicht

**Bringt:**
- **Nachvollziehbarkeit:** echte Namen in Historie, Freigabe und Datenblatt-PDF („Freigegeben von Anna“).
- **Rechte:** Nicht jeder darf löschen, freigeben, Einstellungen ändern oder Sicherungen zurückspielen.
- **Schutz im Netz:** Wird das Tool einmal vom Tablet in der Werkstatt genutzt, ist es nicht mehr offen.
- **Grundlage für später:** Zeiterfassung pro Person, Vier-Augen-Freigabe, „ausgecheckt von“.

**Bringt nicht:**
- **Schutz der Dateien auf der Festplatte.** Die Datenbank ist unverschlüsselt. Wer am
  Benutzerkonto des PCs sitzt, kann sie direkt öffnen. Dagegen helfen ein eigenes
  Betriebssystem-Konto und Festplattenverschlüsselung.
- **Schutz vor dem Admin des PCs.** Wer `plm.config` und den Server kontrolliert, kann
  das Admin-Passwort zurücksetzen. Das ist gewollt (siehe 4.2).

---

## 3. Drei Ausbaustufen

| Stufe | Inhalt | Aufwand* | Passt, wenn … |
|---|---|---|---|
| **A** Zugangsschutz | ein gemeinsames Passwort, Login-Seite, Sitzung | 0.5–1 Tag | nur eine Person arbeitet und das Tool ins Netz soll |
| **B** Benutzer mit Rollen | eigene Konten, drei Rollen, Namen in Historie und Freigabe, Benutzer-Tab | 3–5 Tage | mehrere Personen am selben PC oder im Netz |
| **C** Feinrechte | Rechte pro Projekt/Kunde, Vier-Augen-Freigabe, Passwort per E-Mail, Zwei-Faktor | 2 Wochen und mehr | grösseres Team, Kundenvorgaben |

\* Entwicklertage inklusive Tests und Anleitung.

**Empfehlung: Stufe B.** Wenn mehrere Personen am PC arbeiten, liegt der Gewinn
in der Nachvollziehbarkeit und darin, dass nicht jeder löschen kann. Mit Geheimhaltung
hat das wenig zu tun. Stufe A bringt dafür fast nichts, weil alle dasselbe Passwort kennen.
Stufe C lohnt sich für ein kleines Team nicht. Die Schritte von B (Kapitel 6) lassen
sich später zu C ausbauen.

---

## 4. Stufe B im Detail

### 4.1 Rollen

| Aktion | Leser | Bearbeiter | Admin |
|---|:-:|:-:|:-:|
| Ansehen, suchen, Dateien herunterladen, drucken | ✓ | ✓ | ✓ |
| Items, Revisionen, Dateien, Stücklisten bearbeiten | | ✓ | ✓ |
| Aufträge, Produktion, Einkauf, Lager buchen | | ✓ | ✓ |
| Revision freigeben | | ✓ ¹ | ✓ |
| Positionen und Entwürfe löschen | | ✓ | ✓ |
| Stammdaten löschen (Projekte, Items, Kunden, Lieferanten) | | | ✓ |
| CAD/Slicer starten, Ordner öffnen (weiterhin nur am PC) | | ✓ | ✓ |
| Sicherung anlegen, Server beenden | | ✓ | ✓ |
| Sicherung zurückspielen, Daten verschieben, Tab „Admin“ | | | ✓ |
| Einstellungen, Nummernkreise, Klassifizierungen | | | ✓ |
| Benutzer verwalten | | | ✓ |

¹ Einstellbar: Bearbeiter, nur Admin oder Vier-Augen (Freigabe durch eine andere
Person als die letzte Änderung). Vier-Augen gehört eigentlich zu Stufe C, ist aber
mit den Namen aus B wenig Mehraufwand.

### 4.2 Anmeldung und Sitzung

- **Login-Seite** im Stil des Startbildschirms: Name und Passwort.
- **Passwörter** mit `scrypt` aus `node:crypto` und einem Salt pro Benutzer. Dafür
  braucht es kein neues Paket. Mindestens 8 Zeichen.
- **Sitzung:** ein zufälliger Schlüssel (32 Byte) im Cookie `plm_session` mit
  `HttpOnly` und `SameSite=Strict`. In der Datenbank steht nur sein SHA-256-Hash.
  Die bestehende Herkunftsprüfung bleibt und schützt gegen untergeschobene Anfragen.
- **Abmelden:** Knopf oben rechts, daneben der Name. Automatische Abmeldung nach
  einstellbarer Inaktivität (Vorschlag: 8 Stunden, an einem geteilten PC 30 Minuten).
- **Fehlversuche:** Nach 5 falschen Passwörtern ist das Konto 5 Minuten gesperrt.
- **Erster Start:** Gibt es noch keinen Benutzer, bietet die Login-Seite „Ersten
  Admin anlegen“ an, und zwar nur am PC selbst, damit niemand im Netz zuvorkommt.
- **Admin-Passwort vergessen:** `node backend/tools/admin-reset.js` am PC setzt ein
  neues. Das braucht Zugriff auf die Dateien und ist deshalb für Fremde nicht erreichbar.

**Variante für einen geteilten Werkstatt-PC:** Ein schneller Benutzerwechsel mit
4- bis 6-stelliger PIN statt Passwort plus kurze automatische Abmeldung. Das ist
bequem, aber nur am PC selbst vertretbar. Für Zugriffe übers Netz gilt weiter das
Passwort.

**Im Netz ohne HTTPS** reisen Passwörter unverschlüsselt durchs WLAN. Für den
Betrieb am PC spielt das keine Rolle. Für Tablet-Zugriff entweder nur im eigenen,
vertrauenswürdigen Netz oder mit HTTPS (selbst signiertes Zertifikat, etwas Einrichtung).

### 4.3 Server: wo die Prüfung sitzt

- **Eine Middleware vor allen `/api`-Routen** liest das Cookie und kennt damit den
  Benutzer, sonst antwortet sie mit 401. Ausnahmen: Anmelden, Abmelden, `/api/version`
  (für den Startbildschirm), die Login-Seite selbst.
- **Rechte über eine Regeltabelle**, nicht 192 Routen einzeln:
  - Lesen (GET) braucht mindestens Leser.
  - Schreiben braucht mindestens Bearbeiter.
  - Eine Liste nennt die Admin-Routen: Stammdaten löschen, `PUT /api/settings`,
    Sicherung zurückspielen, `/api/data-path`, Benutzerverwaltung.
  - Ein Test geht alle registrierten Routen durch und prüft, dass jede eine Regel hat.
    Eine neue Route ohne Regel fällt so sofort auf.
- **„Wer“ ohne 45 Änderungen:** `AsyncLocalStorage` (Node) hält pro Anfrage den Benutzer.
  `log()` liest ihn von dort und schreibt ihn in jeden Historien-Eintrag. Die Aufrufe
  bleiben, wie sie sind.
- **`released_by`** setzt der Server aus der Sitzung. Was der Browser schickt, zählt nicht mehr.

### 4.4 Datenmodell

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('reader','editor','admin')),
  password_hash TEXT NOT NULL,          -- scrypt$N$r$p$salt$hash
  active        INTEGER DEFAULT 1,      -- deaktivieren statt löschen
  failed_logins INTEGER DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT,
  expires_at   TEXT NOT NULL
);
ALTER TABLE changelog    ADD COLUMN user_id   INTEGER;
ALTER TABLE changelog    ADD COLUMN user_name TEXT;    -- Kopie: Historie bleibt lesbar
ALTER TABLE time_entries ADD COLUMN user_id   INTEGER;
-- revisions.released_by bleibt Text und bekommt den Anzeigenamen
```

Benutzer werden deaktiviert, nicht gelöscht, sonst verliert die Historie ihre Namen.
Bestehende Einträge bleiben ohne Namen („vor Einführung der Benutzer“).

**Folgen, die man kennen sollte:**
- Die Benutzer liegen in der Datenbank. Ein geteiltes Datenverzeichnis teilt also
  auch die Benutzer zwischen den PCs.
- Wer eine alte Sicherung zurückspielt, bekommt die damaligen Benutzer und Passwörter zurück.

### 4.5 Oberfläche

- **Topbar:** Name des Benutzers neben der Version, Menü mit „Passwort ändern“ und „Abmelden“.
- **Einstellungen → Benutzer** (nur Admin): Liste, anlegen, Rolle ändern,
  deaktivieren, Passwort zurücksetzen.
- **Knöpfe nach Rolle:** Was die Rolle nicht darf, ist ausgegraut, mit Hinweis im
  Tooltip wie beim Slicer-Knopf. Geprüft wird trotzdem im Server.
- **Historie und Datenblatt** zeigen „von Anna“.
- **Abgelaufene Sitzung:** `api()` fängt 401 ab, zeigt die Anmeldung und kehrt danach
  in die gleiche Ansicht zurück. Ein offener Dialog geht dabei nicht verloren.

---

## 5. Aufwand Stufe B

| Paket | Inhalt | Tage |
|---|---|---|
| Konten und Sitzung | Tabellen, `scrypt`, Cookie, Anmelden/Abmelden, Sperre, Erststart | 0.5 |
| Rechte | Middleware, Regeltabelle, Test über alle Routen | 1 |
| Wer hat's getan | `log()` mit Benutzer, `released_by`, Zeiterfassung | 0.5 |
| Oberfläche | Login-Seite, Topbar, Benutzer-Tab, Knöpfe nach Rolle, 401-Behandlung | 1–1.5 |
| Betrieb | Admin-Reset, README und Anleitung | 0.5 |
| Tests | die bestehenden 81 Tests melden sich als Admin an, neue Tests für Rollen und Sperre | 0.5 |
| **Summe** | | **4–4.5** |

Das Risiko liegt weniger im Programmieren als in den Übergängen: Niemand darf sich
beim Umstieg aussperren, und keine Route darf ungeschützt bleiben. Dafür sind der
Erststart, das Admin-Reset und der Test über alle Routen da.

---

## 6. Schritte

Jeder Schritt ist für sich nutzbar.

1. **Anmeldung:** Konten, Sitzung, Login-Seite. Alle Benutzer sind vorerst Admin.
   Ab hier stehen Namen in Historie und Freigabe.
2. **Rollen:** Regeltabelle im Server, Benutzer-Tab, Routen-Test.
3. **Oberfläche nach Rolle:** Knöpfe ausgrauen, Hinweise.
4. **Optional:** Vier-Augen-Freigabe, Zeiterfassung pro Person, „ausgecheckt von“,
   PIN-Schnellwechsel.

---

## 7. Offene Fragen

1. Wie viele Personen arbeiten mit dem Tool, und reichen zwei Rollen (Bearbeiter, Admin)?
2. Nur am PC oder auch vom Tablet/Handy? Davon hängen HTTPS und PIN ab.
3. Passwort oder PIN-Schnellwechsel? Nach wie vielen Minuten automatisch abmelden?
4. Wer darf freigeben: Bearbeiter, nur Admin oder Vier-Augen?
5. Soll die Zeiterfassung pro Person laufen?
