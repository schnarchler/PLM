# PLM & ERP – 3D-Druck Produktionsverwaltung

Teamcenter-inspiriertes PLM- und ERP-System für 3D-Druck-Projekte.  
Läuft lokal auf Windows – kein Internet, kein Cloud-Zwang.

---

## Schnellstart (Windows)

Doppelklick auf **`START-PLM.bat`**  
→ Browser öffnet sich automatisch auf `http://localhost:3000`

Beim ersten Start werden alle Node-Pakete automatisch installiert (`npm install`).

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
Lieferscheine:        LS-2026-0001
Kunden:               KD-0001
```

---

## Freigabe-Workflow

```
DFT ──► REV ──► REL ──► ECO ──► (neue Revision in DFT)
         │                └──► OBS (veraltet)
         └──► DFT (zurück)
```

Revisionen: rev1, rev2, rev3, …

| Status | Bedeutung |
|--------|-----------|
| DFT | Entwurf – in Bearbeitung |
| REV | In Prüfung |
| REL | Freigegeben – produktiv |
| ECO | Engineering Change – Änderung läuft |
| OBS | Obsolete – abgelöst, archiviert |

Alte REL-Revisionen werden bei neuer Freigabe automatisch auf OBS gesetzt,
bleiben aber vollständig abrufbar (inkl. aller Dateien).

---

## Features

### PLM
- Projekte mit 4-stelliger Nummer (0001–9999)
- Baugruppen (ASM), Parts (PRT) und Dokumente (DOC) mit sprechenden Nummern
- Beliebige Hierarchietiefe (ASM in ASM)
- Revisionsverwaltung A → B → C → … (alle alten Revisionen bleiben erhalten)
- Freigabe-Workflow: DFT → REV → REL → ECO → neue Rev
- Stückliste (BOM) pro Revision mit Mengen und Einheiten
- Dateien (Datasets) pro Revision: CAD, GCODE, PDF, Bilder, Dokumente …
- Automatische Dateityp-Erkennung (STL/3MF/STEP → CAD, .gcode → GCODE …)
- Druckparameter pro Revision (Material, Infill, Temperatur, Düse …)
- Vollständige Änderungshistorie / Audit-Trail

### ERP
- Kundenverwaltung (KD-0001)
- Kunde als Freitext eingeben möglich (auch ohne hinterlegten Kunden)
- Angebote mit PDF-Export (ANG-2026-0001)
- Aufträge mit Rechnungs-PDF (AUF-2026-0001)
- Angebot → Auftrag umwandeln
- PLM-Items in Positionen verknüpfen
- Unterteile (BOM) in Rechnung/Angebot aufklappen
- Firmendaten, Bankverbindung und Texte unter Einstellungen

### Lieferscheine / Produktionsblätter
- Eigenständig oder mit Auftrag verknüpft
- Druckparameter direkt aus 3MF-Datei auslesen (PrusaSlicer ab 2.x inkl. 2.9+, SuperSlicer, OrcaSlicer, BambuStudio)
- Preis pro Position (wird automatisch aus PLM-Listenpreis vorausgefüllt)
- Druckansicht als Produktionsblatt mit Unterschriftsfeldern
- Belegdruck auf **Pipsta Classic Thermodrucker** (siehe unten)

### Datei-Index
- Übersicht aller gespeicherten Dateien unter **Navigation → Datei-Index**
- Zeigt angezeigten Namen (PLM) ↔ tatsächlichen Dateinamen auf der Festplatte
- Als CSV exportierbar (Notfall-Referenz)
- Speicherort der Dateien: `data/files/`

---

## Pipsta Classic – Einrichtung (einmalig)

### Voraussetzungen
- Pipsta Classic via USB am PC angeschlossen
- Python 3.x installiert (python.org – **"Add to PATH"** beim Setup ankreuzen)
- Stromversorgung: Pipsta benötigt ausreichend Strom – grüne LED muss leuchten

### 1. Python-Pakete installieren

CMD öffnen und eingeben:
```
pip install pyusb
```

### 2. WinUSB-Treiber mit Zadig installieren

1. **Zadig** herunterladen: [zadig.akeo.ie](https://zadig.akeo.ie)
2. Pipsta einschalten und per USB anschliessen
3. Zadig als **Administrator** starten
4. Menü: `Options → List All Devices` aktivieren
5. In der Dropdown-Liste **Pipsta** (oder `STM32` / `Unknown Device`) auswählen
6. Treiber rechts auf **WinUSB** stellen
7. **Replace Driver** klicken und warten bis „Driver installed successfully"

> Dieser Schritt muss nur einmal pro PC durchgeführt werden.  
> Nach einem Windows-Update ggf. wiederholen.

### 3. Server neu starten – fertig

### Belegdruck

In jedem Lieferschein hat jede Position zwei **🖶-Buttons**:

| Button | Inhalt |
|--------|--------|
| 🖶 | **Kurzbeleg** – Name, Nummer, Menge, Preis, Kunde |
| 🖶≡ | **Vollbeleg** – zusätzlich alle Druckparameter |

Bei mehreren Positionen erscheinen oben zwei Sammelbuttons:
- **🖶 Alle kurz** – alle Positionen auf einem Bon ohne Parameter
- **🖶 Alle mit Parametern** – alle Positionen mit Druckparametern + Gesamtpreis

**Bon-Beispiel (Vollbeleg):**
```
  Michael Stucki
  13.05.2026  14:23
  Kunde Name
────────────────────
0028-ASM-001
Roboterarm Schultergelenk
────────────────────
Menge: 2 Stk
────────────────────
DRUCKPARAMETER
Profil: Quality 0.20mm
Schicht mm: 0.20
Infill: 20%
Muster: gyroid
Material: PETG
Duese °C: 215
Bett °C: 85
Support: Ja
────────────────────
   Total CHF 24.50
────────────────────
  Vielen Dank!
```

**Bon-Einstellungen** (unter Einstellungen → Firma / Briefkopf bzw. Thermodrucker):
- **Firmenname** → erscheint als Titel auf dem Bon
- **Fusszeile Kassabon** → Text ganz unten auf dem Bon (z.B. „Vielen Dank für Ihren Auftrag!")

### Fehlersuche Drucker

| Fehlermeldung | Lösung |
|---|---|
| LED blinkt rot/grün | Stromversorgung prüfen – Netzteil verwenden, nicht nur USB |
| `Kein WinUSB-Gerät gefunden` | USB-Kabel prüfen, Zadig-Treiber nochmals installieren |
| `pyusb nicht installiert` | `pip install pyusb` in CMD ausführen |
| Zeichen `@B` am Anfang | Drucker aus- und einschalten (Puffer leeren) |

---

## 3MF-Druckparameter auslesen

Beim Hinzufügen einer Position im Lieferschein kann eine `.3mf`-Datei hochgeladen werden. Das System liest die gespeicherten Slicereinstellungen automatisch aus.

**Unterstützte Slicer:**
| Slicer | Format | Unterstützt |
|--------|--------|-------------|
| PrusaSlicer 2.x (inkl. 2.9+) | INI als Kommentare | ✓ |
| SuperSlicer | INI | ✓ |
| OrcaSlicer | JSON | ✓ |
| BambuStudio | JSON | ✓ |

Die wichtigsten Parameter (Schichthöhe, Infill, Temperatur, Support, …) werden in gruppierten Kacheln angezeigt.

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
│       └── index.html     ← Single-Page-App (alles in einer Datei)
├── START-PLM.bat          ← Starter für Windows
└── README.md
```

---

## Datensicherung

Über **Einstellungen → Export** wird ein ZIP erstellt mit:
- `plm.db` – komplette Datenbank
- `files/` – alle hochgeladenen Dateien

Zum Wiederherstellen: ZIP entpacken, Inhalt in den `data/`-Ordner legen.

**Notfall-Referenz:** Unter **Datei-Index** (Navigation) ist eine vollständige Zuordnung von angezeigtem Namen zu tatsächlichem Dateinamen auf der Festplatte abrufbar und als CSV exportierbar.
