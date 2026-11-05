# PLM & ERP — Schnellstart

Das Wichtigste auf einer Seite. Ausführlich steht alles im **[Handbuch](HANDBUCH.md)**.

---

## 1. Starten

| | |
|---|---|
| **Windows** | Doppelklick auf `START-PLM.bat` (Desktop-Icon: einmal `VERKNUEPFUNG-ERSTELLEN.bat`) |
| **Linux** | `bash start-plm.sh` oder Doppelklick auf `PLM-ERP` |
| **Adresse** | `http://localhost:3000`, von anderen PCs im Netz `http://<PC-Name>:3000` |
| **Beenden** | oben rechts **■ Beenden** |

Der Browser öffnet sich von selbst. Beim ersten Start installiert PLM die nötigen Pakete, das
dauert einmalig etwas länger.

**Datenordner:** steht in `plm.config` (Zeile `data_dir=`), ohne Eintrag `backend/data/`.
Dort liegen Datenbank, Dateien und Sicherungen. `plm.config` und der Datenordner kommen nie
ins Git.

## 2. Einmal einrichten

Alles unter **Einstellungen**:

1. **Firma** — Name, Adresse, Bankverbindung, Logo (für Angebote, Rechnungen, Lieferscheine)
2. **Kalkulation** — Stundenansatz, MwSt., Zahlungsbedingungen
3. **3D-Druck** — Drucker (mit CHF/h) und Düsen
4. **Benutzer** — Personen mit Rolle, wenn mehrere mit PLM arbeiten
5. **Daten → Checkout-Verzeichnis** — wenn mit CAD gearbeitet wird
6. **PLM → Freigabe-Workflow** — **Mit Freigabe** (Standard) oder **Ohne Freigabe**

## 3. Der Ablauf in acht Schritten

| | Schritt | So geht's |
|---|---|---|
| 1 | Projekt anlegen | **Projekte → + Projekt** → Bezeichnung |
| 2 | Part anlegen | Projekt öffnen → **+ Part** → Bezeichnung (oder **Teile → + Teil** mit Projekt wählen) |
| 3 | Dateien und Gewicht | Tab **Revisionen** → **+ Datei** (3MF liefert die Druckparameter); Gewicht im **Datenblatt** → **✏** |
| 4 | Freigeben | Tab **Revisionen** → **✓ Freigeben** |
| 5 | Kunde | **Kunden → + Kunde** |
| 6 | Angebot | **Aufträge → + Angebot** → **+ Position** mit PLM-Item → **📄 Angebot PDF** |
| 7 | Auftrag und Produktion | **✓ Angebot angenommen** → **🔧 Produktionsauftrag anlegen** → Status **Geliefert** |
| 8 | Rechnung | **📄 Rechnung PDF** → als fakturiert markieren |

Ein freigegebenes Teil ändern: Tab **Revisionen** → **⚡ ECO starten** → Grund eingeben. PLM
legt eine neue Revision an und übernimmt Dateien, Stückliste und Druckparameter.

## 4. Die wichtigsten Daten

**Nummern** (Präfixe unter Einstellungen → Admin änderbar)

| Was | Beispiel | | Was | Beispiel |
|---|---|---|---|---|
| Projekt | `0001` | | Auftrag / Angebot | `AUF-2026-0001` |
| Baugruppe | `0001-asm-001` | | Produktionsauftrag | `LS-2026-0001` |
| Part | `0001-prt-001` | | Einkauf | `EK-2026-0001` |
| Dokument | `0001-doc-001` | | Kunde / Lieferant | `KD-0001` / `LF-0001` |
| Kurzcode zum Aufdrucken | `XHJ-1` (= rev1) | | | |

**Status einer Revision**

| Status | Bedeutung |
|---|---|
| **DFT** | Entwurf, frei bearbeitbar |
| **REV** | in Prüfung (nur mit Vier-Augen-Prinzip) |
| **REL** | freigegeben, gesperrt |
| **ECO** | wird geändert, die neue Revision ist im Entwurf |
| **OBS** | veraltet, bleibt zur Nachverfolgung |

**Pro Revision** gelten Dateien, Stückliste, Druckparameter, Gewicht, Verkaufspreis und
Beschreibung. Eine neue Revision übernimmt sie von der vorherigen.

**Im Datenordner**

| Ordner / Datei | Inhalt |
|---|---|
| `plm.db` | Datenbank |
| `files/` | alle hochgeladenen Dateien |
| `backups/` | Sicherung beim Start, eine pro Tag (die letzten 14), dazu manuelle |
| `papierkorb/` | gelöschte Dateien, 30 Tage lang |
| `checkout/` | ausgecheckte Dateien (wenn kein eigenes Verzeichnis eingestellt ist) |

## 5. Täglich gebraucht

- **Suche** oben: findet Items, Aufträge, Kunden. Ein Kurzcode wie `XHJ-1` (auch per
  Barcode-Scanner) öffnet das Teil direkt in dieser Revision.
- **Auschecken / Einchecken** am Item: Dateien zum Bearbeiten im CAD. Beim Einchecken werden nur
  geänderte Dateien übernommen.
- **Historie** am Item: wer wann was geändert hat, mit altem und neuem Wert.
- **Sichern:** Einstellungen → **Daten → 💾 Jetzt sichern**, oder **Gesamtexport** als ZIP.

---

Weiter im **[Handbuch](HANDBUCH.md)**: [Erste Schritte ausführlich](HANDBUCH.md#3-erste-schritte) ·
[Freigabe-Workflow](HANDBUCH.md#8-freigabe-workflow) · [Checkout / Check-in](HANDBUCH.md#9-checkout--check-in) ·
[Häufige Fragen](HANDBUCH.md#24-häufige-fragen)
