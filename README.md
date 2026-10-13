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

**Ohne Freigabe arbeiten:** Unter **Einstellungen → PLM → Freigabe-Workflow** lässt sich
auf den einfachen Modus umstellen. Dann bleiben alle Revisionen im Status DFT und
bearbeitbar; statt „In Review“ steht dort **„＋ Neue Revision“**, die Dateien,
Druckparameter und Stückliste der bisherigen Revision übernimmt. Für die Arbeit allein,
ohne Prüfschritt. Bestehende freigegebene Revisionen bleiben unangetastet, und der
ECO-Weg steht dort weiterhin zur Verfügung.

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
- **Datenblatt-Tab** – Beschreibung, Quelle, Kennzahlen, Druckparameter, Stücklisten-Kurzfassung,
  Lagerbestand, freie Notizen, QR-Code der Teilenummer und letzte Änderung auf einen Blick
- **Mindmap** – Abhängigkeiten als Graph: links die Baugruppen die das Teil verwenden,
  rechts die Teile aus denen es besteht (siehe unten)
- **Revisionsstand in der Stückliste** – folgt standardmäßig automatisch der aktuellen
  Revision, pro Position optional fest fixierbar (siehe unten)
- **Freigabe-Workflow abschaltbar** – unter Einstellungen → PLM wählbar zwischen
  Freigabelauf (DFT → REV → REL → ECO) und einfachem Betrieb ohne Freigabe
- **Druckparameter aus 3MF** – beim Hochladen einer `.3mf` an eine Revision werden
  Schichthöhe, Füllung, Temperaturen, Material und Drucker automatisch übernommen
- **Klassifizierung automatisch** – neue Teile werden anhand der Quelle als Eigen-
  oder Kaufteil eingestuft (Vorgaben unter Einstellungen → PLM)
- **Freie Notizen** pro Item – für alles was nicht in die Beschreibung gehört
- **Where-Used** – zeigt alle Revisionen der Baugruppen in denen ein Teil verbaut ist,
  inklusive des Standes auf den die jeweilige Verwendung fixiert ist
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
- **Status läuft mit**: Produktionsauftrag erzeugen bestätigt den Auftrag, der letzte
  gelieferte Produktionsauftrag setzt ihn auf „Geliefert", nach dem Rechnungsdruck
  wird „Fakturiert" angeboten
- **Materialabzug beim Abschliessen** – verbrauchtes Rohmaterial wird beim Setzen auf
  „Geliefert" vorgerechnet und nach Bestätigung vom Lot abgebucht (siehe unten)

### Einkauf / Bestellwesen
- **Lieferantenverwaltung** (LF-0001) mit Kontakt, Adresse, verknüpften Lagerartikeln
- **Einkaufsbestellungen** (EK-2026-001): ENTWURF → BESTELLT → ERHALTEN / STORNIERT
- Positionen mit Menge, Einheit, Einzelpreis — verknüpfbar mit Lagerartikel, Rohmaterial oder **Normteil**
- Normteile: beim ersten Wareneingang wird automatisch ein Lagerartikel angelegt und
  fest verknüpft — keine doppelte Pflege
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
- **Daten** – Schriftgrösse, **Design zurücksetzen**, Checkout-Ordner, CAD-Programm, Backup
- **Admin** – Nummerierungsstruktur, Datensätze löschen

---

## Revisionsstand in der Stückliste

Eine Stücklistenposition verweist auf das **Teil**, nicht auf eine feste Revision.
Standardmäßig zeigt sie deshalb immer den aktuellen Stand: wird das Teil auf rev2
gehoben, ziehen alle Baugruppen automatisch mit. Das ist für die meisten
Baugruppen richtig und bleibt unverändert.

Für Fälle, in denen ein realer, abweichender Zustand dokumentiert werden muss,
lässt sich eine Position **fest auf eine Revision setzen**. Klick auf das
Revisions-Kennzeichen in der Stücklistenzeile öffnet die Auswahl:

| Auswahl | Verhalten |
|---|---|
| **Automatisch** (Standard) | folgt immer der aktiven Revision |
| **Fest auf revN** | bleibt auf diesem Stand, auch wenn neuere Revisionen entstehen |

Fixierte Positionen sind mit einem Schloss markiert. Existiert inzwischen eine
neuere Revision, erscheint zusätzlich ein Hinweis (`↑rev2`) in Amber — der Stand
ist dann bewusst alt, nicht vergessen.

**Typischer Anwendungsfall:** Fahrzeuge oder ausgelieferte Geräte, die als
Baugruppe (ASM) angelegt sind. Wird ein Bauteil überarbeitet, bleiben die
Einheiten, die noch nicht umgerüstet sind, auf ihrem Stand. Der Where-Used-Tab
des Bauteils zeigt dann direkt, welche Einheit auf welchem Stand ist.

Wird eine fixierte Revision gelöscht, fällt die Position automatisch auf
„Automatisch" zurück — es entstehen keine toten Verweise.

---

## Mindmap – Abhängigkeiten

Der ⌗-Knopf in der Titelzeile eines Items (oder im Datenblatt-Tab) öffnet den
Abhängigkeitsgraphen:

```
Baugruppen die es verwenden  ──►  [ Teil ]  ──►  Teile aus denen es besteht
          (Where-Used)                              (Stückliste)
```

- **Ziehen** verschiebt, **Mausrad** zoomt, **Klick** öffnet das Teil
- Tiefe für beide Richtungen getrennt einstellbar (0–6 Ebenen)
- Normteile erscheinen als Blätter, Mengen stehen an den Kanten
- Fest fixierte Positionen zeigen die Revision in Amber; der Graph klappt dann
  die Unterstückliste **dieser** Revision auf, nicht die der aktuellsten
- Verwendungen, die nur in älteren Revisionen stehen, werden gezählt und
  in der Fußzeile gemeldet

---

## Materialabzug beim Abschliessen

Rohmaterial wird in **Spulen** geführt (`stock_qty`), der Verbrauch fällt in **Gramm**
an. Über `weight_g` (Gewicht einer vollen Spule) rechnet das System um:
1840 g bei einer 1000-g-Spule sind 1.84 Stk.

Wird ein Produktionsauftrag auf „Geliefert" gesetzt, erscheint eine Aufstellung der
Positionen mit zugewiesenem Rohmaterial. Das Gewicht pro Stück kommt in dieser
Reihenfolge:

1. Filamentgewicht, das an der Produktionsposition erfasst wurde
2. `filament_weight_total` aus den Druckparametern des verknüpften Teils
3. hinterlegtes Teilegewicht

Mengen und Lot sind im Dialog korrigierbar; Lots werden nach FIFO vorgeschlagen.
Erst nach Bestätigung wird gebucht — „Nicht abbuchen" lässt alles unverändert.
Positionen ohne Gewicht oder ohne Spulengewicht werden getrennt aufgeführt und
bleiben unberührt. Pro Produktionsauftrag wird nur einmal abgebucht.

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
│       │   ├── 14-qr.js      ← QR-Encoder (eigenständig, keine externe Bibliothek)
│       │   ├── 15-mindmap.js ← Abhängigkeitsgraph (SVG, Pan/Zoom)
│       │   └── (Ladereihenfolge in index.html, gemeinsamer globaler Scope)
│       └── styles.css     ← Design-System (Dark Theme, kontraststarke Palette)
├── plm.config             ← Datenpfad-Konfiguration (wird auto-erstellt)
├── ANLEITUNG.md           ← Bedienungsanleitung (Deutsch)
├── START-PLM.bat          ← Starter für Windows
└── README.md
```

---

## Update einspielen

```bash
git pull
cd backend && npm install     # nur nötig wenn Pakete dazugekommen sind
node server.js
```

Datenbank und `plm.config` liegen außerhalb des Repositories und stehen in der
`.gitignore` — ein Pull fasst sie nicht an.

Schemaänderungen laufen beim Serverstart automatisch: `initDb()` legt **zuerst**
eine Tageskopie unter `data/backups/` an, ergänzt dann fehlende Tabellen und
Spalten und schreibt die Datei zurück. Der Vorgang ist idempotent, ein zweiter
Start ändert nichts mehr.

Neue Einstellungen (Freigabe-Workflow, Standard-Klassifizierung) starten auf den
bisherigen Werten — es ändert sich nichts, bis du sie umstellst.

Nach einem Update, das die Farbpalette betrifft, einmal
**Einstellungen → Daten → Design zurücksetzen** drücken: die Farben der
Klassifizierungen liegen in der Datenbank und ziehen sonst nicht mit. Namen und
Reihenfolge bleiben dabei erhalten.

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
