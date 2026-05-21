# PLM & ERP — Benutzeranleitung

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Programmstart](#2-programmstart)
3. [Oberfläche](#3-oberfläche)
4. [Dashboard](#4-dashboard)
5. [PLM — Projekte & Bauteile](#5-plm--projekte--bauteile)
6. [Freigabe-Workflow](#6-freigabe-workflow)
7. [Checkout / Check-in](#7-checkout--check-in)
8. [ERP — Aufträge & Angebote](#8-erp--aufträge--angebote)
9. [Lieferscheine](#9-lieferscheine)
10. [Kunden](#10-kunden)
11. [Lager](#11-lager)
12. [Kalkulation](#12-kalkulation)
13. [Suche](#13-suche)
14. [Changelog](#14-changelog)
15. [Einstellungen](#15-einstellungen)
16. [Tastaturkürzel](#16-tastaturkürzel)

---

## 1. Überblick

PLM & ERP ist ein lokales System zur Verwaltung von Konstruktionsprojekten (PLM) und Geschäftsvorgängen (ERP). Es läuft vollständig im eigenen Netzwerk — ohne Internet oder Cloud-Abhängigkeit.

**PLM (Product Lifecycle Management)** verwaltet:
- Projekte mit Baugruppen, Parts und Dokumenten
- Revisionen und Freigabe-Workflows
- Stücklisten (BOM), Dateien (Datasets), Zeiten

**ERP (Enterprise Resource Planning)** verwaltet:
- Kunden, Angebote, Aufträge
- Lieferscheine, Lager

---

## 2. Programmstart

**Linux:**
```bash
cd PLM && bash start-plm.sh
```
Der Browser öffnet sich automatisch auf `http://localhost:3000`.

**Über das Desktop-Icon:**
Doppelklick auf `PLM-ERP` im Anwendungsmenü oder Desktop.

**Server beenden:**
Oben rechts → **■ Beenden** → Bestätigen. Falls noch Checkouts aktiv sind, wird gefragt ob diese vorher eingecheckt werden sollen.

---

## 3. Oberfläche

```
┌─────────────────────────────────────────────────┐
│  Logo  │  Suchfeld            │ CAD │ ⬆ │ Beenden│  ← Topbar
├────────┼─────────────────────────────────────────┤
│        │  Listenbereich (links)  │ Detailbereich │
│  Nav   │                         │  (rechts)     │
│  links │                         │               │
└────────┴─────────────────────────────────────────┘
```

**Navigation (links):** Klick auf einen Bereich (Dashboard, Projekte, Aufträge usw.) lädt die entsprechende Liste.

**Listenbereich:** Zeigt alle Einträge des aktiven Bereichs. Klick auf einen Eintrag öffnet die Details rechts.

**Detailbereich:** Zeigt Tabs mit den Informationen des gewählten Eintrags. Mit **Escape** schliessen.

**Zuletzt geöffnet:** Unten in der Navigation — die letzten 8 besuchten Bauteile, Aufträge etc. für schnellen Rücksprung.

---

## 4. Dashboard

Das Dashboard gibt einen Überblick über den aktuellen Arbeitsstatus:

| Kachel | Bedeutung |
|--------|-----------|
| **Umsatz** | Diesen Monat und Gesamtumsatz aller bestätigten Aufträge |
| **Aufträge** | Offene Aufträge (Entwurf + Bestätigt) |
| **Angebote** | Offene Angebote (Entwurf + Versendet) |
| **Lieferungen** | Aktive, noch nicht gelieferte Lieferscheine |
| **Freigabe** | Bauteile die aktuell auf Prüfung warten (REV-Status) |
| **Lager** | Artikel unter Mindestbestand |

**Fällige Lieferscheine:** Zeigt alle Lieferscheine mit Lieferdatum in den nächsten 14 Tagen. Überfällige erscheinen rot.

**Ablaufende Angebote:** Angebote deren Gültigkeit in 14 Tagen abläuft.

**Freigabe-Pipeline:** Bauteile im REV-Status — direkt anklickbar um den Freigabe-Prozess fortzuführen.

---

## 5. PLM — Projekte & Bauteile

### 5.1 Projekte

Projekte sind die oberste Organisationsebene. Jedes Projekt erhält eine automatische vierstellige Nummer (z.B. `0028`).

**Neues Projekt:** Oben links → **+ Projekt**

**Projektdetails** haben vier Tabs:
- **Info** — Name, Kunde, Beschreibung, Erstellungsdatum
- **Struktur** — Baumansicht aller Bauteile
- **Dokumente** — Projektdokumente (PDF, Bilder usw.)
- **Log** — Änderungshistorie des Projekts

### 5.2 Nummernschema

```
Projekt:              0028
Baugruppe:            0028-asm-001
Unter-Baugruppe:      0028-asm-002
Part in Baugruppe:    0028-asm-001-prt-001
Part im Projekt:      0028-prt-001
Dokument:             0028-doc-001
```

### 5.3 Item-Typen

| Symbol | Typ | Beschreibung |
|--------|-----|-------------|
| 📦 | **ASM** | Baugruppe — kann andere ASM und PRT enthalten |
| 🔩 | **PRT** | Part / Einzelteil |
| 📄 | **DOC** | Dokument (Zeichnung, Spezifikation, etc.) |

### 5.4 Neues Bauteil erstellen

Im Projektbaum oder in der Detailansicht:
- **+ Baugruppe** — neue ASM
- **+ Part** — neues PRT
- **+ Dokument** — neues DOC

Parts die einer Baugruppe untergeordnet sind, erhalten automatisch die Nummernstruktur der Baugruppe.

### 5.5 Bauteil-Detailansicht

Tabs in der Bauteil-Detailansicht:

**Revisionen**
- Aktive Revision wird oben angezeigt
- Stückliste (BOM): Klick auf **+ Position** um Unterteile zu verknüpfen
- Dateien (Datasets): CAD-Dateien, PDFs, Bilder, GCode etc.
- Druckparameter: Material, Schichthöhe, Temperatur etc.
- Freigabe-Workflow (siehe Kapitel 6)

**Changelog**
Alle Änderungen an diesem Bauteil mit Zeitstempel.

**Zeiten**
Konstruktions- und Entwicklungszeiten pro Bauteil erfassen.

**Where-Used**
Zeigt in welchen Baugruppen dieses Bauteil verbaut ist.

### 5.6 Klassifizierung

Jedem Bauteil kann eine Klassifizierung zugewiesen werden:

| Klasse | Bedeutung |
|--------|-----------|
| **Eigenteil** | Selbst konstruiertes Bauteil |
| **Kaufteil** | Zugekauftes Bauteil |
| **Normteil** | Genormtes Bauteil (Schraube, Mutter, etc.) |
| **Halbzeug** | Rohmaterial mit Bearbeitung |
| **Rohmaterial** | Unbearbeitetes Material |

Klassifizierungen sind konfigurierbar unter **Einstellungen → PLM**.

Die Klasse wird als farbiger Chip im Projektbaum und in der Detailansicht angezeigt.

### 5.7 Varianten (z.B. M3, M4, M5)

Es gibt keine spezielle Varianten-Funktion — Varianten werden einfach als **separate Parts** erfasst.

**Vorgehen:** Im Projekt → **+ Part** → Name `Halterung M3` → speichern. Dann nochmals **+ Part** → `Halterung M4` usw.

Jede Variante bekommt automatisch eine eigene Nummer und hat unabhängige Revisionen, Dateien und Freigaben. In der Stückliste einer Baugruppe wählt man dann die gewünschte Variante aus.

### 5.8 Stückliste (BOM)

In der aktiven Revision eines ASM-Bauteils:
- **+ Position** → Bauteil aus dem Projekt suchen und Menge angeben
- Positionen können per Pfeilen umsortiert werden
- Freigegebene (REL) Revisionen sind gesperrt — keine BOM-Änderungen möglich

---

## 6. Freigabe-Workflow

Jede Revision durchläuft folgende Zustände:

```
DFT ──► REV ──► REL ──► ECO ──► (neue Revision in DFT)
         │                └──► OBS (veraltet)
         └──► DFT (zurück)
```

| Status | Farbe | Bedeutung |
|--------|-------|-----------|
| **DFT** | Blau | Entwurf — in Bearbeitung |
| **REV** | Amber | In Prüfung — wartet auf Freigabe |
| **REL** | Grün | Freigegeben — produktiv einsetzbar |
| **ECO** | Lila | Engineering Change — Änderung läuft |
| **OBS** | Grau | Obsolete — durch neuere Revision abgelöst |

**Aktionen:**
- `→ In Review` — Revision zur Prüfung einreichen
- `✓ Freigeben` — Revision freigeben (setzt vorherige auf OBS)
- `← Zurück zu Entwurf` — Prüfung zurückziehen
- `⚡ ECO starten` — Änderungsauftrag starten

**Freigegebene Bauteile löschen** ist nur über **Einstellungen → Admin** möglich.

---

## 7. Checkout / Check-in

Der Checkout-Mechanismus ermöglicht das Bearbeiten von CAD-Dateien ausserhalb des PLM.

### Workflow

**Auschecken:**
1. Bauteil öffnen → **⬇ Auschecken**
2. Dateitypen wählen (CAD, PDF, etc.) → **Auschecken**
3. Dateien werden in den Checkout-Ordner kopiert
4. Freigegebene Dateien (REL) sind schreibgeschützt

**Arbeiten im CAD:**
- Dateien im Checkout-Ordner bearbeiten
- Neue Dateien im selben Ordner erstellen
- Baugruppen funktionieren, da alle verlinkten Parts im selben Ordner liegen

**Einchecken:**
1. Im PLM → Bauteil → **⬆ Einchecken**
2. Checkout-Ordner wird gelöscht
3. Vorgang wird im Changelog aufgezeichnet

### Neue Dateien importieren

Wenn beim Bearbeiten neue Dateien entstehen, erkennt PLM diese automatisch beim Öffnen der Checkout-Übersicht (⬆ Checkouts oben rechts):

- **Datei im Unterordner eines Bauteils** → "Zu Bauteil hinzufügen"
- **Datei im Hauptordner** → "Als neues Bauteil erfassen"

### Solid Edge — Standardpfad setzen

Damit neue Dateien automatisch im Checkout-Ordner landen:

**Tools → Options → File Locations**

| Dateityp | Pfad setzen auf |
|----------|----------------|
| Parts (.par / .psm) | Checkout-Ordner |
| Assemblies (.asm) | gleicher Pfad |
| Drafts (.dft) | gleicher Pfad |

Checkout-Pfad konfigurieren unter: **Einstellungen → Daten → Checkout-Verzeichnis**

### CAD direkt starten

Oben rechts in der Topbar: **🖥 CAD** — startet das konfigurierte CAD-Programm direkt aus PLM.

Pfad konfigurieren unter: **Einstellungen → Daten → CAD-Programm**

---

## 8. ERP — Aufträge & Angebote

### 8.1 Angebote

**Neues Angebot:** Navigation → Angebote → **+ Angebot**

Angebote durchlaufen folgende Zustände:
```
Entwurf → Versendet → Akzeptiert
                    → Abgelehnt
```

**Positionen hinzufügen:** Im Angebot → **+ Position**
- Optionale Verknüpfung mit PLM-Item (Listenpreis wird übernommen)
- Menge, Preis, Rabatt, Notizen

**In Auftrag umwandeln:** Angebot → **➜ In Auftrag umwandeln**

**PDF erstellen:** Angebot → **📄 Angebot PDF**

### 8.2 Aufträge

**Neuer Auftrag:** Navigation → Aufträge → **+ Auftrag**

Auftrags-Zustände:
```
Entwurf → Bestätigt → Geliefert → Fakturiert
                    → Storniert
```

**Lieferschein erstellen:** Auftrag → **🚚 Lieferschein erstellen**

**Rechnung PDF:** Auftrag → **📄 Rechnung PDF**

**Lager abbuchen:** Bei jeder Auftragsposition mit verknüpftem PLM-Item → **📦** (Kisten-Symbol) — bucht die Menge aus dem Lager ab. Nur möglich wenn genügend Bestand vorhanden.

> Aufträge und Angebote im Status **Entwurf** können direkt gelöscht werden. Alle anderen Status können nur über **Einstellungen → Admin** gelöscht werden.

---

## 9. Lieferscheine

Lieferscheine können eigenständig oder aus einem Auftrag heraus erstellt werden.

**Neuer Lieferschein:** Navigation → Lieferscheine → **+ Lieferschein**

**Status:**
- **Entwurf** — in Bearbeitung
- **Bereit** — zur Auslieferung bereit
- **Geliefert** — ausgeliefert (setzt Lieferdatum automatisch)

Wenn alle Lieferscheine eines Auftrags auf **Geliefert** gesetzt werden, wechselt der Auftrag automatisch auf **Geliefert**.

**Druckparameter:** Jede Position kann 3MF-Druckparameter speichern (manuell oder per 3MF-Import).

**Thermodrucker (Pipsta):** Jede Position hat zwei Druckbuttons:
- **🖶** — Kurzbeleg
- **🖶≡** — Vollbeleg mit Druckparametern

---

## 10. Kunden

Kundenverwaltung unter Navigation → Kunden.

Jeder Kunde erhält eine automatische Nummer (`KD-0001`).

**Kundendetails** zeigen verknüpfte Angebote, Aufträge, Lieferscheine und zugeordnete Lagerartikel.

Bei Aufträgen und Angeboten kann der Kunde per **Suchfeld** gefunden werden, oder als Freitext eingegeben werden (für einmalige Kunden ohne Stammdaten).

---

## 11. Lager

Die Lagerverwaltung unter Navigation → Lager.

### Artikel verwalten

**Neuer Artikel:** **+ Artikel** oben rechts

Felder:
- **Name, Kategorie, Artikelnummer (SKU)**
- **Einheit** (Stk, m, g, kg, ...)
- **Mindestbestand** — Warnung wenn Bestand ≤ Minimum
- **Farbe / Material** — für Varianten des gleichen Artikels
- **PLM-Verknüpfung** — verknüpft mit einem PLM-Bauteil

### Bestandsführung

**Einbuchen / Ausbuchen:** **＋** / **－** Buttons in der Zeile

**Geplante Menge:** Zeigt wie viele Einheiten in offenen Aufträgen reserviert sind.

**Verfügbare Menge = Bestand − Geplant**

### Bestandswarnungen

| Farbe | Bedeutung |
|-------|-----------|
| 🟢 Grün | Bestand über Mindestmenge |
| 🟡 Amber | Bestand = Mindestmenge |
| 🔴 Rot | Bestand unter Mindestmenge |

Im Dashboard werden kritische Artikel unter **Lager — Warnungen** angezeigt.

---

## 12. Kalkulation

Navigation → Kalkulation — Übersicht aller Parts und Baugruppen mit Kostenvergleich.

| Spalte | Bedeutung |
|--------|-----------|
| **Herst.-kosten** | Filamentkosten + Maschinenkosten aus Druckparametern |
| **Verkaufspreis** | Listenpreis aus dem PLM |
| **Marge** | Verkaufspreis − Herstellungskosten |
| **%** | Marge in Prozent der Herstellungskosten |
| **Stk. verkauft** | Gesamtmenge aus allen Aufträgen |
| **Umsatz** | Gesamtumsatz dieses Bauteils |
| **Gewinn total** | Umsatz − (Herstellungskosten × verkaufte Stück) |

**CSV-Export:** Oben links → **↓ CSV**

**Filtern:** Nach Margen-Status (positiv/negativ/fehlend) und Bauteiltyp.

---

## 13. Suche

**Öffnen:** Suchfeld oben in der Topbar — oder `Ctrl+K`

Die Suche durchsucht gleichzeitig:
- Aufträge, Angebote, Lieferscheine
- Kunden
- Projekte, PLM-Items (inkl. Klassifizierung)
- Dateien (Datasets)

**Schnellfilter:** In der Suchansicht erscheinen oben farbige Klassifizierungs-Chips. Klick auf z.B. **Kaufteil** zeigt alle Kaufteile.

Klick auf ein Suchergebnis öffnet direkt den entsprechenden Eintrag.

---

## 14. Changelog

Navigation → Changelog — vollständige Änderungshistorie aller Aktionen im System.

**Filterbar** nach Zeitraum und Export als CSV.

Jede Aktion (Erstellen, Ändern, Freigeben, Auschecken etc.) wird automatisch aufgezeichnet.

---

## 15. Einstellungen

Navigation → Einstellungen (Zahnrad-Symbol)

### Firma
Firmenname, Adresse, UID, Bankverbindung, Kontaktdaten — erscheinen auf Rechnungen und Angeboten.

Texte für Fussnoten auf Rechnungen, Angeboten und Kassabons.

### Kalkulation
Stundenansatz und Maschinenkosten für die automatische Kostenberechnung.

Standardwerte für Steuersatz, Zahlungskonditionen und Angebotsgültigkeit.

### Kassabon
Einstellungen für den Pipsta-Thermodrucker.

### 3D-Druck
Drucker, Düsen und Materialprofile für die automatische Vorausfüllung der Druckparameter.

### PLM
**Klassifizierungen** — eigene Klassifizierungen für Bauteile definieren:
- Namen bearbeiten (direkt im Textfeld)
- Farbe per Color-Picker wählen
- Reihenfolge per Drag & Drop anpassen
- **Speichern** nicht vergessen

### Daten
- **Datenpfad** — wo Datenbank und Dateien gespeichert werden
- **CAD-Programm** — Pfad zum CAD-Programm (für den CAD-Button in der Topbar)
- **Checkout-Verzeichnis** — wo ausgecheckte CAD-Dateien abgelegt werden
- **Datensicherung** — ZIP-Export aller Daten
- **Datei-Index** — Übersicht aller Dateien mit echtem Dateinamen

### Admin
Zugang zu erweiterten Einstellungen — **Vorsicht, Änderungen können Daten beschädigen.**

**Löschen:**
- Freigegebene Bauteile (REL/OBS) löschen
- Projekte mit Inhalten löschen
- Aufträge und Angebote ausserhalb des Entwurf-Status löschen

**Nummerierung:**
- Präfixe für Aufträge (AUF), Angebote (ANG), Lieferscheine (LS), Kunden (KD)
- Anzahl Stellen (Padding) pro Typ
- Trennzeichen und Kürzel für Item-Nummern
- Revisionsformat: Numerisch (1, 2, 3) oder Buchstaben (A, B, C)

---

## 16. Tastaturkürzel

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+K` | Suchfeld fokussieren |
| `Escape` | Modal/Detailpanel schliessen |
| Browser-Zurück | Zur vorherigen Ansicht navigieren |

---

## Datensicherung

**Einstellungen → Daten → Gesamtexport herunterladen**

Erstellt ein ZIP mit:
- `plm.db` — komplette Datenbank
- `files/` — alle hochgeladenen Dateien

**Wiederherstellen:** ZIP entpacken, Inhalt in den `data/`-Ordner legen, Server neu starten.

---

## Nummernkreise im Überblick

```
Projekte:       0001 – 9999
Baugruppen:     0028-asm-001, 0028-asm-002, …
Parts:          0028-prt-001 / 0028-asm-001-prt-001
Dokumente:      0028-doc-001
Aufträge:       AUF-2026-0001
Angebote:       ANG-2026-0001
Lieferscheine:  LS-2026-0001
Kunden:         KD-0001
```

---

*Für technische Fragen zum Aufbau des Systems: siehe `README.md`*
