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
| ECO | Engineering Change – Änderung läuft |
| OBS | Obsolete – abgelöst, archiviert |

Alte REL-Revisionen werden bei neuer Freigabe automatisch auf OBS gesetzt,
bleiben aber vollständig abrufbar (inkl. aller Dateien).

---

## Features

### PLM
- Projekte mit konfigurierbarer Nummer (Standard 4-stellig)
- Baugruppen (ASM), Parts (PRT) und Dokumente (DOC) mit sprechenden Nummern
- Beliebige Hierarchietiefe (ASM in ASM)
- Revisionsverwaltung rev1, rev2, … (alle alten Revisionen bleiben erhalten)
- Freigabe-Workflow: DFT → REV → REL → ECO → neue Rev
- Stückliste (BOM) pro Revision mit Mengen und Einheiten
- Dateien (Datasets) pro Revision: CAD, GCODE, PDF, Bilder, Dokumente …
- Automatische Dateityp-Erkennung (STL/3MF/STEP → CAD, .gcode → GCODE …)
- Konstruktions-/Entwicklungszeiten pro Bauteil und Revision erfassbar
- **Klassifizierung** – farbige Chips (z.B. Normteil, Kaufteil, Eigenentwicklung), konfigurierbar unter Einstellungen → PLM
- **Where-Used** – zeigt in welchen Baugruppen ein Bauteil verbaut ist
- **Kalkulation** – Gesamtumsatz und Gewinn pro Bauteil aus verknüpften Aufträgen
- **BOM-Import aus STEP** – Stückliste automatisch aus Solid Edge STEP-Export einlesen (Einzel-Teile werden per Namensabgleich zugeordnet)
- Checkout/Check-in Funktion für CAD-Dateien (siehe unten)
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
- Lagerbestandsprüfung beim Abbuchen – blockiert wenn Bestand zu klein
- Geplante Menge (aus offenen Aufträgen) im Lager sichtbar

### Lieferscheine / Produktionsblätter
- Eigenständig oder mit Auftrag verknüpft
- Druckparameter direkt aus 3MF-Datei auslesen (PrusaSlicer ab 2.x inkl. 2.9+, SuperSlicer, OrcaSlicer, BambuStudio)
- Preis pro Position (wird automatisch aus PLM-Listenpreis vorausgefüllt)
- Druckansicht als Produktionsblatt mit Unterschriftsfeldern
- Belegdruck auf **Pipsta Classic Thermodrucker** (siehe unten)

### Dashboard & Suche
- Dashboard mit offenen Aufträgen, Angeboten, fälligen Lieferscheinen und ablaufenden Angeboten
- Globale Suche (Ctrl+K) über Projekte, PLM-Items, Aufträge, Angebote, Lieferscheine, Kunden
- Suche nach Klassifizierung über Schnellfilter-Chips

### Navigation
- **Ctrl+K** – Suche öffnen
- **Escape** – modales Fenster oder Detail schliessen
- **Browser-Zurück-Button** – navigiert innerhalb der App
- **Zuletzt geöffnet** – letzte Bauteile in der Seitenleiste

### Einstellungen / Admin
- **Firma** – Name, Adresse, Bankverbindung, Logo
- **PLM** – Klassifizierungsliste (Name + Farbe, per Drag&Drop sortierbar)
- **Daten** – Schriftgrösse (serverseitig gespeichert), Checkout-Ordner, CAD-Programm-Pfad, Backup/Export
- **Admin** – Nummerierungsstruktur (Präfixe, Stellen, Revisionsformat), Datensätze löschen

### Datei-Index
- Übersicht aller gespeicherten Dateien unter **Navigation → Datei-Index**
- Zeigt angezeigten Namen (PLM) ↔ tatsächlichen Dateinamen auf der Festplatte
- Als CSV exportierbar (Notfall-Referenz)
- Speicherort der Dateien: `data/files/`

---

## Checkout / Check-in (CAD-Workflow mit Solid Edge)

Der Checkout-Mechanismus kopiert CAD-Dateien aus dem PLM in einen lokalen Arbeitsordner, damit diese im CAD-Programm bearbeitet werden können. Nach der Bearbeitung werden die Dateien wieder in PLM importiert.

### Solid Edge: Standardpfad setzen

Damit neue Solid Edge-Dateien automatisch im Checkout-Ordner landen:

**Tools → Options → File Locations**

| Dateityp | Pfad setzen auf |
|----------|----------------|
| Parts (.par / .psm) | Checkout-Ordner (z.B. `/home/user/PLM-Checkout`) |
| Assemblies (.asm) | gleicher Pfad |
| Drafts (.dft) | gleicher Pfad |

Den Checkout-Pfad festlegen unter: **Einstellungen → System → Checkout-Ordner**

### Checkout-Workflow

```
1. Bauteil im PLM auswählen → "Auschecken"
   → Dateien werden in <checkout-pfad>/<item-nummer>/ kopiert
   → Freigegebene Dateien (REL) sind schreibgeschützt

2. Solid Edge öffnet Dateien aus dem Checkout-Ordner
   → Verlinkungen in Baugruppen bleiben erhalten, da alle Teile
     im gleichen Ordner liegen und der Pfad bei jedem Checkout
     gleich bleibt (<item-nummer> ohne Zeitstempel)

3. Nach der Bearbeitung → PLM → "Einchecken"
   → Checkout-Ordner wird gelöscht
   → Vorgang wird im Changelog festgehalten

4. Neue Dateien werden automatisch erkannt
   → Beim Öffnen der Checkout-Übersicht erkennt PLM neue Dateien
     im Ordner, die noch nicht im System sind
```

### Neue Dateien aus Solid Edge importieren

Wenn beim Bearbeiten in Solid Edge neue Dateien entstehen (z.B. neue Parts einer Baugruppe), erkennt PLM diese automatisch beim nächsten Öffnen der Checkout-Übersicht:

**Datei im Checkout-Unterordner eines Bauteils** (z.B. `checkout/PRT-001/neues-teil.par`):
→ Button "Zu Bauteil hinzufügen" → wird in die neueste offene Revision importiert

**Datei direkt im Checkout-Hauptordner** (z.B. `checkout/neues-teil.par`):
→ Button "Als neues Bauteil erfassen" → Projekt, Typ und Name angeben → neues Bauteil wird erstellt

### Varianten (z.B. M3, M4, M5)

Jede Variante wird als **separates Bauteil** mit eigenem Suffix erfasst:

```
BRACKET-001-M3    (eigene Revisionen, eigene Dateien)
BRACKET-001-M4
BRACKET-001-M5
```

Dies ist der sauberste Ansatz, da jede Variante eine eigene CAD-Datei hat und unabhängig freigegeben werden kann.

### Baugruppen-Checkout (rekursiv)

Beim Auschecken einer Baugruppe werden **alle untergeordneten Parts rekursiv** in denselben Ordner kopiert. Solid Edge findet die verlinkten Dateien über seinen Fallback-Suchmechanismus, da alle Dateien im gleichen Verzeichnis liegen.

> **Hinweis:** Solid Edge verwendet standardmässig absolute Pfade. Da der Checkout-Ordner immer denselben Namen hat (keine Zeitstempel), bleibt der Pfad bei jedem Checkout identisch — Verknüpfungen müssen nicht neu gesetzt werden.

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

**Bon-Einstellungen** (unter Einstellungen → Firma / Briefkopf bzw. Thermodrucker):
- **Firmenname** → erscheint als Titel auf dem Bon
- **Fusszeile Kassabon** → Text ganz unten auf dem Bon

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
│       ├── index.html     ← HTML-Grundstruktur
│       ├── app.js         ← Single-Page-App (Frontend-Logik)
│       └── styles.css     ← Design-System (Dark Theme)
├── ANLEITUNG.md           ← Ausführliche Bedienungsanleitung (Deutsch)
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
