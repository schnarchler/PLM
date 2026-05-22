# PLM & ERP — Benutzeranleitung

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Programmstart](#2-programmstart)
3. [Oberfläche](#3-oberfläche)
4. [Dashboard](#4-dashboard)
5. [PLM — Projekte & Bauteile](#5-plm--projekte--bauteile)
6. [Normteile](#6-normteile)
7. [Freigabe-Workflow](#7-freigabe-workflow)
8. [Checkout / Check-in](#8-checkout--check-in)
9. [Angebote & Kostenkalkulation](#9-angebote--kostenkalkulation)
10. [Aufträge](#10-aufträge)
11. [Produktion](#11-produktion)
12. [Rohmaterial](#12-rohmaterial)
13. [Kunden](#13-kunden)
14. [Lager](#14-lager)
15. [Kalkulation](#15-kalkulation)
16. [Suche](#16-suche)
17. [Changelog](#17-changelog)
18. [Einstellungen](#18-einstellungen)
19. [Tastaturkürzel](#19-tastaturkürzel)

---

## 1. Überblick

PLM & ERP ist ein lokales System zur Verwaltung von Konstruktionsprojekten und Geschäftsvorgängen. Es läuft vollständig im eigenen Netzwerk — ohne Internet oder Cloud-Abhängigkeit.

**PLM** verwaltet: Projekte, Baugruppen, Parts, Dokumente, Revisionen, Stücklisten, Dateien, Zeiten, Normteile.

**ERP** verwaltet: Kunden, Angebote mit Kalkulation, Aufträge, Produktion, Lager, Rohmaterial.

---

## 2. Programmstart

**Linux:**
```bash
cd PLM && bash start-plm.sh
```

**Desktop-Icon:** Doppelklick auf `PLM-ERP`.

**Server beenden:** Oben rechts → **■ Beenden**. Bei aktiven Checkouts wird gefragt ob zuerst eingecheckt werden soll.

---

## 3. Oberfläche

```
┌──────────────────────────────────────────────────┐
│  Logo  │  Suchfeld (Ctrl+K)  │ CAD │ ⬆ │ Beenden │  ← Topbar
├────────┼──────────────────────────────────────────┤
│        │  Listenbereich                │ Detail   │
│  Nav   │  (links)                      │ (rechts) │
└────────┴──────────────────────────────────────────┘
```

- **Navigation links:** Klick wechselt den Bereich
- **Listenbereich:** Alle Einträge des aktiven Bereichs
- **Detailbereich:** Tabs mit Informationen des gewählten Eintrags — mit **Escape** schliessen
- **Zuletzt geöffnet:** Letzte Bauteile unten in der Navigation

---

## 4. Dashboard

| Kachel | Bedeutung |
|--------|-----------|
| **Umsatz** | Diesen Monat und Gesamt aller bestätigten Aufträge |
| **Aufträge** | Offene Aufträge |
| **Angebote** | Offene Angebote |
| **Produktion** | Aktive Produktionsaufträge |
| **Freigabe** | Bauteile in Prüfung (REV-Status) |
| **Lager** | Artikel unter Mindestbestand |

**Fällige Produktionsaufträge:** Aufträge mit Lieferdatum in den nächsten 14 Tagen. Überfällige erscheinen rot.

**Ablaufende Angebote:** Angebote die in 14 Tagen ablaufen.

---

## 5. PLM — Projekte & Bauteile

### 5.1 Projekte

Projekte sind die oberste Organisationsebene mit automatischer Nummer (z.B. `0028`).

**Projektdetails:**
- **Info** — Name, Kunde, Beschreibung
- **Struktur** — Baumansicht aller Bauteile
- **Dokumente** — Projektdokumente
- **Log** — Änderungshistorie

### 5.2 Nummernschema

```
Projekt:           0028
Baugruppe:         0028-asm-001
Part in BG:        0028-asm-001-prt-001
Part im Projekt:   0028-prt-001
Dokument:          0028-doc-001
```

### 5.3 Item-Typen

| Symbol | Typ | Beschreibung |
|--------|-----|-------------|
| 📦 | **ASM** | Baugruppe — enthält andere ASM und PRT |
| 🔩 | **PRT** | Part / Einzelteil |
| 📄 | **DOC** | Dokument (Zeichnung, Spezifikation) |

### 5.4 Bauteil-Detailansicht

**Revisionen-Tab:**
- Verkaufspreis (VP) und Gewicht direkt inline editierbar
- Stückliste (BOM) mit PLM-Items und Normteilen
- Dateien (Datasets): CAD, PDF, Bilder, GCode
- Freigabe-Workflow

**Weitere Tabs:** Changelog, Zeiten, Where-Used

### 5.5 Gewicht

Das Gewicht ⚖ eines Parts wird direkt in der Detailansicht neben dem Verkaufspreis eingetragen (in Gramm). Es wird für die automatische Materialkostenkalkulation in Angeboten verwendet.

### 5.6 Klassifizierung

Farbige Chips im Projektbaum und in der Detailansicht. Konfigurierbar unter **Einstellungen → PLM**.

### 5.7 Stückliste (BOM)

In der aktiven Revision einer ASM:
- **+ Position** → PLM-Item aus dem Projekt suchen
- **⚙ Normteil** → Normteil aus dem Katalog hinzufügen
- **📐 BOM aus STEP** → Stückliste aus Solid Edge STEP-Export importieren

### 5.8 BOM aus STEP importieren

1. Baugruppe in Solid Edge → **Datei → Exportieren → STEP AP214**
2. PLM → Baugruppe → BOM → **📐 BOM aus STEP**
3. STEP-Datei hochladen → Analysieren
4. Teile werden automatisch per Namensabgleich zugeordnet (✓ = gefunden, ? = manuell zuordnen)
5. **✓ BOM übernehmen**

### 5.9 Where-Used

Tab **Where-Used** in der Bauteil-Detailansicht zeigt alle Baugruppen in denen dieses Teil verbaut ist.

### 5.10 Varianten (z.B. M3, M4, M5)

Separate Parts mit eigenem Suffix anlegen: `Halterung M3`, `Halterung M4`. Jede Variante hat eigene Revisionen, Dateien und Freigaben.

---

## 6. Normteile

Navigation → **Normteile** — Katalog für genormte Bauteile (DIN, ISO, EN, ASME, …).

### Neues Normteil

Felder ausfüllen → Bezeichnung wird automatisch generiert (z.B. `DIN 912 Zylinderschraube M4x12 A2-70`), manuell überschreibbar.

| Feld | Beispiel |
|------|---------|
| Norm | DIN |
| Norm-Nr. | 912 |
| Größe / Maß | M4x12 |
| Kurzbezeichnung | Zylinderschraube |
| Material / Güte | A2-70 |
| Stückpreis | 0.15 CHF |

### Dateien

Tab **Dateien** pro Normteil: STEP-Dateien, PDFs, Zeichnungen hochladen (Mehrfachauswahl).

### In BOM verwenden

Im BOM-Modal einer Baugruppe → Tab **⚙ Normteil** → Normteil aus Dropdown wählen.

### Normteile auschecken

**⬇ Auschecken** im Normteile-Header kopiert alle Normteil-Dateien in `<checkout-verzeichnis>/normteile/`. Ordnername ist immer gleich → einmalig in Solid Edge als Suchpfad konfigurieren.

---

## 7. Freigabe-Workflow

```
DFT ──► REV ──► REL ──► ECO ──► (neue Revision in DFT)
         │                └──► OBS (veraltet)
         └──► DFT (zurück)
```

| Status | Farbe | Bedeutung |
|--------|-------|-----------|
| **DFT** | Blau | Entwurf |
| **REV** | Amber | In Prüfung |
| **REL** | Grün | Freigegeben |
| **ECO** | Lila | Engineering Change |
| **OBS** | Grau | Abgelöst |

Freigegebene Bauteile löschen nur über **Einstellungen → Admin**.

---

## 8. Checkout / Check-in

### Workflow

**Auschecken:** Bauteil → **⬇ Auschecken** → Dateitypen wählen → Dateien landen in `<checkout-pfad>/<item-nummer>/` (ohne Zeitstempel, Pfad bleibt bei jedem Checkout identisch).

**Arbeiten im CAD:** Dateien bearbeiten oder neue erstellen.

**Einchecken:** **⬆ Einchecken** → Ordner wird gelöscht, Changelog-Eintrag.

**Neue Dateien:** PLM erkennt sie automatisch beim Öffnen der Checkout-Übersicht (⬆ Checkouts):
- Im Unterordner eines Bauteils → „Zu Bauteil hinzufügen"
- Im Hauptordner → „Als neues Bauteil erfassen"

### Solid Edge Standardpfad

**Tools → Options → File Locations** → Parts, Assemblies, Drafts → Checkout-Ordner eintragen.

Checkout-Pfad: **Einstellungen → Daten → Checkout-Verzeichnis**

---

## 9. Angebote & Kostenkalkulation

### Angebot erstellen

Navigation → Angebote → **+ Angebot**

Status: `Entwurf → Versendet → Akzeptiert / Abgelehnt`

**In Auftrag umwandeln:** Angebot → **➜ In Auftrag umwandeln**

### Position hinzufügen mit Kalkulation

Beim Hinzufügen einer Position:

1. **PLM-Item verknüpfen** — suche nach Teilenummer oder Name
2. **Rohmaterial wählen** — bei mehreren aktiven Lots erscheint ein Picker zur Lot-Auswahl
3. **Arbeitszeit (h)** — geschätzte Stunden
4. **Drucker + Druckzeit (h)** — für Druckkosten
5. System zeigt **Kostenaufstellung** live:
   - Material: `Bauteilgewicht × (Rohmaterialpreis / Rohmaterialgewicht)`
   - Arbeitszeit: `Stunden × Stundenansatz`
   - Druckzeit: `Stunden × Drucker CHF/h`
6. **„Als Preis übernehmen"** — kalkulierten Preis als Einzelpreis setzen

> Bauteil und Rohmaterial müssen beide ein Gewicht hinterlegt haben, sonst erscheint eine Warnmeldung.

### BOM kalkullieren (Baugruppen)

**📦 Aus BOM kalkullieren** — wähle eine Baugruppe, alle BOM-Teile werden als einzelne Positionen mit automatischen Kosten übernommen.

---

## 10. Aufträge

Navigation → Aufträge → **+ Auftrag**

Status: `Entwurf → Bestätigt → Geliefert → Fakturiert / Storniert`

- **Rechnung PDF** — Auftrag → **📄 Rechnung PDF**
- **Produktionsauftrag erstellen** — Auftrag → **🔧 Produktionsauftrag erstellen**
- **Lager abbuchen** — Auftragsposition → **📦** (nur wenn genügend Bestand)

Aufträge im Status Entwurf können direkt gelöscht werden. Andere Status nur über **Einstellungen → Admin**.

---

## 11. Produktion

Navigation → **Produktion** — ersetzt den früheren „Lieferschein"-Begriff für interne Produktionsaufträge.

**Neuer Produktionsauftrag:** + Produktionsauftrag

Status: `Entwurf → Bereit → Geliefert`

### Position hinzufügen

- **PLM-Item** verknüpfen
- **Rohmaterial** zuweisen → übernimmt automatisch Drucktemperatur und Betttemperatur
- **3MF-Import** oder manuelle Druckparameter
- **Drucker** und **Düse** separat wählen

### Lieferschein drucken

Druckansicht öffnen → **📄 Lieferschein** — zeigt alle Positionen mit Druckparametern, Rohmaterial und Unterschriftsfeldern.

### Thermodrucker (Pipsta)

Pro Position: **🖶** Kurzbeleg oder **🖶≡** Vollbeleg mit Druckparametern.

---

## 12. Rohmaterial

Navigation → **Rohmaterial**

### Material erfassen

| Feld | Beschreibung |
|------|-------------|
| Materialtyp | PLA, PETG, ABS, Aluminium, … |
| Farbe | z.B. Schwarz, Galaxy Black |
| Marke | z.B. Prusament |
| Abmessungen | z.B. 2×20×200mm, Ø12mm, 1000g |
| Gewicht / Stück | Gesamtgewicht der Einheit in Gramm (für Preiskalkulation) |
| Drucktemp (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Bett (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Mindestbestand | Warnschwelle |

Name wird automatisch aus Typ + Farbe + Abmessungen + Marke generiert (editierbar).

### Lot-Tracking

Jede **Einbuchung** kann eine Lotnummer und einen Einkaufspreis erhalten. Mehrere Lots desselben Materials werden untereinander aufgelistet:

```
LOT-2025-001    500 g    CHF 24.90/g    ● aktiv
LOT-2024-011    200 g    CHF 23.50/g    ● aktiv
LOT-2024-003      0 g    CHF 25.00/g    ● leer
```

Aktive Lots erscheinen zuerst, leere danach (ausgegraut). In der Übersicht links werden leere Lots ausgeblendet.

### Ausbuchen

**− Ausbuchen** öffnet ein Modal mit Lot-Auswahl. Leere Lots sind deaktiviert.

### Buchungshistorie

Tab **Buchungen** zeigt alle Ein- und Ausgänge mit laufendem Saldo.

### Verwendung in Angeboten

Im Positions-Modal eines Angebots → Rohmaterial wählen → bei mehreren aktiven Lots erscheint ein Picker. Der Lot-Preis wird für die Materialkalkulation verwendet.

---

## 13. Kunden

Navigation → **Kunden** — jeder Kunde erhält eine automatische Nummer (`KD-0001`).

Bei Aufträgen und Angeboten kann der Kunde per Suchfeld gefunden oder als Freitext eingegeben werden.

---

## 14. Lager

Navigation → **Lager**

- PLM-Bauteil verknüpfen → Bestand wird beim Abbuchen aus Aufträgen reduziert
- **Geplante Menge** = Bestand der in offenen Aufträgen vorgemerkt ist
- Warnung wenn Bestand ≤ Mindestbestand

---

## 15. Kalkulation

Navigation → **Kalkulation** — Übersicht aller Parts mit Kostenvergleich.

| Spalte | Bedeutung |
|--------|-----------|
| **Verkaufspreis** | Listenpreis aus dem PLM |
| **Stk. verkauft** | Gesamtmenge aus allen Aufträgen |
| **Umsatz** | Gesamtumsatz dieses Bauteils |
| **Gewinn total** | Umsatz − (Kosten × verkaufte Stück) |

**CSV-Export** — oben links → **↓ CSV**

---

## 16. Suche

**Öffnen:** Suchfeld oben — oder `Ctrl+K`

Durchsucht gleichzeitig: Projekte, PLM-Items, Normteile, Aufträge, Angebote, Produktion, Kunden, Dateien.

**Schnellfilter:** Klassifizierungs-Chips in der Suchansicht für direkte Filterung.

---

## 17. Changelog

Navigation → **Changelog** — vollständige Änderungshistorie aller Aktionen.

Filterbar nach Zeitraum, exportierbar als CSV.

---

## 18. Einstellungen

Navigation → Einstellungen (Zahnrad-Symbol)

### Firma
Name, Adresse, UID, Bankverbindung — erscheinen auf Rechnungen und Angeboten.

### Kalkulation
- Stundenansatz (CHF/h) — für Arbeitszeitkalkulation in Angeboten
- Maschinenkosten — Standardwerte
- Steuersatz, Zahlungskonditionen, Angebotsgültigkeit

### Kassabon
Einstellungen für den Pipsta-Thermodrucker.

### 3D-Druck
Drucker (mit CHF/h), Düsen und Materialprofile.

> Druckparameter werden nicht mehr pro PLM-Bauteil gespeichert, sondern pro Produktionsauftrag. Materialtemperaturen werden direkt im Rohmaterial hinterlegt.

### PLM
Klassifizierungsliste — Namen und Farben bearbeiten, per Drag&Drop sortieren.

### Daten
- **Darstellung** — Schriftgrösse (wird serverseitig gespeichert)
- **Datenpfad** — Datenbank und Dateispeicher
- **CAD-Programm** — Pfad für den 🖥 CAD-Button in der Topbar
- **Checkout-Verzeichnis** — Zielordner für Checkouts
- **Datensicherung** — ZIP-Export aller Daten
- **Datei-Index** — Zuordnung angezeigter Name ↔ Dateiname auf Festplatte

### Admin
**Vorsicht — Änderungen können Daten dauerhaft beschädigen.**

- Freigegebene Bauteile, Projekte mit Inhalt, abgeschlossene Aufträge/Angebote löschen
- Nummerierungsstruktur: Präfixe, Stellen, Revisionsformat

---

## 19. Tastaturkürzel

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+K` | Suche öffnen |
| `Escape` | Modal / Detail schliessen |
| Browser-Zurück | Zur vorherigen Ansicht |

---

## Datensicherung

**Einstellungen → Daten → Gesamtexport herunterladen**

ZIP mit `plm.db` + `files/`. Wiederherstellen: ZIP entpacken → Inhalt in `data/`-Ordner → Server neu starten.

---

## Nummernkreise

```
Projekte:      0001 – 9999
Baugruppen:    0028-asm-001, 0028-asm-002, …
Parts:         0028-prt-001 / 0028-asm-001-prt-001
Dokumente:     0028-doc-001
Aufträge:      AUF-2026-0001
Angebote:      ANG-2026-0001
Produktion:    LS-2026-0001
Kunden:        KD-0001
```

---

*Technische Details: siehe `README.md`*
