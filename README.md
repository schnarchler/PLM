# 🖨 3D-PLM v2 – Teamcenter-inspiriertes PLM für deinen 3D-Drucker

## Nummernschema

```
Projekt:           0028
Baugruppe:         0028-ASM-001
Unter-Baugruppe:   0028-ASM-002          (eigenständig, in BOM von ASM-001)
Part in Baugruppe: 0028-ASM-001-PRT-001
Part im Projekt:   0028-PRT-001

Mit Revision + Status:
                   0028-ASM-001  / Rev B / REL
                   0028-ASM-001-PRT-007 / Rev A / DFT
```

## Freigabe-Workflow (wie Teamcenter)

```
DFT ──► REV ──► REL ──► ECO ──► (neue Rev in DFT)
         │                └──► OBS (veraltet)
         └──► DFT (zurück)
```

| Status | Bedeutung |
|--------|-----------|
| DFT    | Entwurf – in Bearbeitung |
| REV    | In Prüfung |
| REL    | Freigegeben – produktiv |
| ECO    | Engineering Change – Änderung läuft |
| OBS    | Obsolete – abgelöst, archiviert |

**Wichtig:** Alte REL-Revisionen werden bei neuer Freigabe automatisch auf OBS gesetzt, bleiben aber vollständig abrufbar (inkl. aller Dateien).

## Schnellstart

```bash
scp -r plm3d-v2/ pi@DEINE_PI_IP:~/
ssh pi@DEINE_PI_IP
cd plm3d-v2 && chmod +x setup.sh && ./setup.sh
cd backend && node server.js
```
→ Browser: http://DEINE_PI_IP:3000

## Autostart

```bash
sudo cp ~/plm3d-v2/3d-plm.service /etc/systemd/system/
sudo systemctl enable --now 3d-plm
```

## Features

### PLM
- Projekte mit 4-stelliger Nummer (0001–9999)
- Baugruppen (ASM) und Parts (PRT) mit sprechenden Nummern
- Beliebige Hierarchietiefe (ASM in ASM)
- Revisionsverwaltung A→B→C→… (alle alten Revs bleiben erhalten)
- Freigabe-Workflow: DFT→REV→REL→ECO→neue Rev
- Stückliste (BOM) pro Revision mit Mengen und Einheiten
- Dateien (Datasets) pro Revision: CAD, GCODE, PDF, Bilder, …
- Automatische Dateityp-Erkennung (STL/3MF/STEP → CAD, .gcode → GCODE, …)
- Druckparameter pro Revision (Material, Infill, Temp, Düse, …)
- Vollständige Änderungshistorie / Audit-Trail

### ERP (leichtgewichtig)
- Kundenverwaltung mit Nummern (KD-0001)
- Aufträge mit Nummern (AUF-2025-0001)
- Status: Entwurf → Bestätigt → Geliefert → Fakturiert

## Dateistruktur

```
plm3d-v2/
├── backend/
│   ├── server.js       ← REST-API (Express + SQLite)
│   ├── package.json
│   └── data/           ← automatisch angelegt
│       ├── plm.db      ← SQLite-Datenbank
│       └── files/      ← Dateien auf Disk
├── frontend/
│   └── public/
│       └── index.html  ← Single-Page-App
├── setup.sh
├── 3d-plm.service
└── README.md
```
