# PLM & ERP – Produktionsverwaltung

Teamcenter-inspiriertes PLM- und ERP-System.  
Läuft lokal auf Linux/Windows – kein Internet, kein Cloud-Zwang.

---

## Schnellstart

**Linux:**
```bash
cd backend && npm install && node server.js
```

**Windows:**  
Doppelklick auf **`START-PLM.bat`**

→ Browser öffnet sich auf `http://localhost:3000`  
Beim ersten Start werden alle Node-Pakete automatisch installiert.  
`plm.config` wird automatisch erstellt wenn sie fehlt.

---

## Nummernschema

```
Projekt:              0028
Baugruppe:            0028-asm-001
Unter-Baugruppe:      0028-asm-002
Part in Baugruppe:    0028-asm-001-prt-001
Part im Projekt:      0028-prt-001
Dokument:             0028-doc-001

Aufträge:             AUF-2026-0001
Angebote:             ANG-2026-0001
Produktion:           LS-2026-0001
Einkauf:              EK-2026-0001
Kunden:               KD-0001
Lieferanten:          LF-0001
```

Präfixe, Stellen und Revisionsformat sind unter **Einstellungen → Admin** konfigurierbar.

---

## Freigabe-Workflow

```
DFT ──► REV ──► REL ──► ECO ──► (neue Revision in DFT)
         │                └──► OBS (veraltet)
         └──► DFT (zurück)
```

| Status | Bedeutung |
|--------|-----------|
| DFT | Entwurf – in Bearbeitung |
| REV | In Prüfung |
| REL | Freigegeben – produktiv |
| ECO | Engineering Change – ECO-Revision gesperrt, neue DFT wird erstellt |
| OBS | Obsolete – abgelöst, archiviert |

Bei ECO: Dateien der freigegebenen Revision werden in die neue DFT-Revision kopiert.  
Wird die DFT-Revision gelöscht, kehrt das ECO automatisch auf REL zurück.

---

## Features

### PLM
- Projekte mit konfigurierbarer Nummer (Standard 4-stellig)
- Baugruppen (ASM), Parts (PRT) und Dokumente (DOC) mit sprechenden Nummern
- Beliebige Hierarchietiefe (ASM in ASM)
- Revisionsverwaltung rev1, rev2, … (alle alten Revisionen bleiben erhalten)
- Freigabe-Workflow: DFT → REV → REL → ECO → neue Rev
- Stückliste (BOM) pro Revision – mehrere Positionen gleichzeitig hinzufügen (Warenkorb)
- Normteile in BOM einsetzbar
- Dateien (Datasets) pro Revision: CAD, GCODE, PDF, Bilder, Dokumente …
- Automatische Dateityp-Erkennung (STL/3MF/STEP → CAD, .gcode → GCODE …)
- Gewicht pro Part (direkt inline editierbar), Entwicklungszeiten erfassbar
- **Klassifizierung** – farbige Chips, konfigurierbar unter Einstellungen → PLM
- **Where-Used** – zeigt alle Revisionen der Baugruppen in denen ein Teil verbaut ist
- **Variantenverwaltung** – Items als Varianten verknüpfen; Navigation zwischen Varianten direkt im Detail
- **Dokumentvorlagen** – PDF-Vorlagen aus dem Item-Detail: Datenblatt, Stückliste, Prüfprotokoll
- **Itemvergleich** – zwei Items nebeneinander vergleichen (Metadaten, BOM-Diff, Dateien)
- **BOM-Import aus STEP** – Stückliste automatisch aus Solid Edge STEP-Export einlesen
- **Normteilverwaltung** – eigene Datenbank für Normteile (DIN/ISO/EN) mit Dateien
- Checkout/Check-in Funktion für CAD-Dateien
- Vollständige Änderungshistorie / Audit-Trail

### ERP
- Kundenverwaltung (KD-0001)
- Kunde als Freitext eingeben möglich
- Angebote mit PDF-Export und automatischer Kostenkalkulation
- Aufträge mit Rechnungs-PDF inkl. Arbeitszeit als Position
- Angebot → Auftrag umwandeln
- PLM-Items in Positionen verknüpfen
- Lagerbestandsprüfung beim Abbuchen

### Einkauf / Bestellwesen
- **Lieferantenverwaltung** (LF-0001) mit Kontakt, Adresse, verknüpften Lagerartikeln
- **Einkaufsbestellungen** (EK-2026-001): ENTWURF → BESTELLT → ERHALTEN / STORNIERT
- Positionen mit Menge, Einheit, Einzelpreis — verknüpfbar mit Lagerartikel oder Rohmaterial
- **Bestellungs-PDF** direkt druckbar / an Lieferant sendbar
- **Wareneingang**: automatische Einbuchung von Lagerartikel und Rohmaterial
- Bei Rohmaterial: Lot-Nr.-Abfrage pro Material, wählbar ob gleiche oder individuelle Lot-Nr.
- Bei Menge > 1: Lot-Nr. pro Einheit einzeln erfassbar

### Angebots-Kalkulation
Beim Hinzufügen einer Position können folgende Kosten automatisch berechnet werden:
- **Material** – Bauteilgewicht × Rohmaterialpreis/Gewicht (Lot-spezifisch)
- **Arbeitszeit** – geschätzte Stunden × Stundenansatz
- **Druckzeit** – Druckstunden × Drucker CHF/h
- **Aus BOM** – Button „📦 Aus BOM kalkullieren" expandiert eine Baugruppe in Einzelpositionen

### Rohmaterial
- Eigene Verwaltung mit Materialtyp, Farbe, Abmessungen, Gewicht, Druckparametern
- Lot-Tracking: jede Einbuchung mit Lotnummer und Einkaufspreis
- Remaining-Qty pro Lot, aufgebrauchte Lots durchgestrichen/ausgeblendet
- Bei Auswahl in Produktion: Drucktemperatur und Betttemperatur automatisch übernommen

### Normteile
- Katalog für genormte Bauteile (DIN, ISO, EN, …)
- Auto-Bezeichnung aus Norm + Nummer + Größe + Material
- Dateien (STEP, PDF, …) pro Normteil hinterlegbar
- Als BOM-Positionen in Baugruppen einsetzbar
- **⬇ Auschecken** – alle Normteil-Dateien in festen `normteile/`-Ordner kopieren

### Produktion
- Eigenständig oder mit Auftrag verknüpft
- Rohmaterial pro Position zuweisbar (übernimmt Druckparameter)
- Druckparameter direkt aus 3MF-Datei auslesen (PrusaSlicer, SuperSlicer, OrcaSlicer, BambuStudio)
- **Lieferschein-PDF** mit Positionen, Druckparametern, Unterschriftsfeldern
- Belegdruck auf **Pipsta Classic Thermodrucker**

### Dashboard & Suche
- Dashboard mit offenen Aufträgen, Angeboten, fälligen Produktionsaufträgen, ablaufenden Angeboten
- Globale Suche (`Ctrl+K`) über Projekte, PLM-Items, Aufträge, Angebote, Produktion, Kunden
- Suche nach Klassifizierung über Schnellfilter-Chips
- PLM-Items (PRT/ASM) erscheinen in der Suche zuerst

### Navigation
- **Ctrl+K** – Suche öffnen
- **Escape** – Modal / Detail schliessen
- **Browser-Zurück-Button** – navigiert innerhalb der App
- **Zuletzt geöffnet** – letzte Bauteile in der Seitenleiste

### Einstellungen / Admin
- **Firma** – Name, Adresse, Bankverbindung, Logo
- **Kalkulation** – Stundenansatz, Maschinenkosten, Standardwerte
- **3D-Druck** – Drucker, Düsen, Materialprofile
- **PLM** – Klassifizierungsliste (Name + Farbe, Drag&Drop)
- **Daten** – Schriftgrösse, Checkout-Ordner, CAD-Programm, Backup
- **Admin** – Nummerierungsstruktur, Datensätze löschen

---

## Checkout / Check-in (CAD-Workflow mit Solid Edge)

### Solid Edge: Standardpfad setzen

**Tools → Options → File Locations**

| Dateityp | Pfad |
|----------|------|
| Parts (.par / .psm) | Checkout-Ordner |
| Assemblies (.asm) | gleicher Pfad |
| Drafts (.dft) | gleicher Pfad |

Checkout-Pfad: **Einstellungen → Daten → Checkout-Verzeichnis**

### Workflow

```
1. Bauteil → "⬇ Auschecken"
   → Dateien in <checkout-pfad>/<item-nummer>/ (kein Zeitstempel → Pfad bleibt konstant)

2. In Solid Edge bearbeiten

3. → "⬆ Einchecken" → Ordner wird gelöscht, Changelog-Eintrag

4. Neue Dateien → PLM erkennt sie automatisch beim Öffnen der Checkout-Übersicht
```

### Normteile auschecken

Navigation → Normteile → **⬇ Auschecken** — kopiert alle Normteil-STEP-Dateien in `<checkout-pfad>/normteile/`. Ordnername ist immer gleich → einmalig in Solid Edge als Suchpfad konfigurieren.

---

## Pipsta Classic – Einrichtung (Windows, einmalig)

```
pip install pyusb
```

Zadig-Treiber installieren: [zadig.akeo.ie](https://zadig.akeo.ie) → Pipsta → WinUSB

| Fehlermeldung | Lösung |
|---|---|
| LED blinkt rot/grün | Netzteil verwenden |
| `Kein WinUSB-Gerät gefunden` | Zadig-Treiber neu installieren |
| `pyusb nicht installiert` | `pip install pyusb` |
| Zeichen `@B` am Anfang | Drucker aus- und einschalten |

---

## 3MF-Druckparameter

Beim Hinzufügen einer Produktionsposition kann eine `.3mf`-Datei hochgeladen werden.

| Slicer | Unterstützt |
|--------|-------------|
| PrusaSlicer 2.x (inkl. 2.9+) | ✓ |
| SuperSlicer | ✓ |
| OrcaSlicer | ✓ |
| BambuStudio | ✓ |

---

## Dateistruktur

```
PLM/
├── backend/
│   ├── server.js          ← REST-API (Express + sql.js/SQLite)
│   ├── package.json
│   ├── print_receipt.py   ← Pipsta-Druckskript (Python, ESC/POS)
│   └── data/              ← automatisch angelegt (nicht ins Git)
│       ├── plm.db         ← SQLite-Datenbank
│       └── files/         ← hochgeladene Dateien (UUID-Namen)
├── frontend/
│   └── public/
│       ├── index.html     ← HTML-Grundstruktur
│       ├── js/            ← Single-Page-App, aufgeteilt nach Domänen
│       │   ├── 01-core.js …  13-normteile-einkauf.js
│       │   └── (Ladereihenfolge in index.html, gemeinsamer globaler Scope)
│       └── styles.css     ← Design-System (Dark Theme)
├── plm.config             ← Datenpfad-Konfiguration (wird auto-erstellt)
├── ANLEITUNG.md           ← Bedienungsanleitung (Deutsch)
├── START-PLM.bat          ← Starter für Windows
└── README.md
```

---

## Datensicherung

**Einstellungen → Daten → Gesamtexport herunterladen** – ZIP mit `plm.db` + `files/`.

Wiederherstellen: ZIP entpacken → Inhalt in `data/`-Ordner → Server neu starten.

**Automatisch:** Bei jedem Serverstart wird eine Tageskopie der Datenbank in
`data/backups/plm-JJJJ-MM-TT.db` abgelegt (die letzten 14 werden behalten).
Wiederherstellen: gewünschte Backup-Datei als `plm.db` in den `data/`-Ordner
kopieren → Server neu starten.

---

## Tests

```bash
cd backend
npm test
```

Startet den Server mit einer leeren Wegwerf-Datenbank und prüft die wichtigsten
Abläufe (Aufträge, Preis-Sync Auftrag ↔ Produktion, Lagerbuchungen, Backups).
