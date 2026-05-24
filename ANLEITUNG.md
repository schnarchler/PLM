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
15. [Einkauf / Bestellwesen](#15-einkauf--bestellwesen)
16. [Kalkulation](#16-kalkulation)
17. [Suche](#17-suche)
18. [Changelog](#18-changelog)
19. [Einstellungen](#19-einstellungen)
20. [Tastaturkürzel](#20-tastaturkürzel)

---

## 1. Überblick

PLM & ERP ist ein lokales System zur Verwaltung von Konstruktionsprojekten und Geschäftsvorgängen. Es läuft vollständig im eigenen Netzwerk — ohne Internet oder Cloud-Abhängigkeit.

**PLM** verwaltet: Projekte, Baugruppen, Parts, Dokumente, Revisionen, Stücklisten, Dateien, Zeiten, Normteile, Varianten.

**ERP** verwaltet: Kunden, Angebote mit Kalkulation, Aufträge, Produktion, Lager, Rohmaterial, Einkauf/Bestellwesen.

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
| **Einkauf** | Offene Bestellungen (Entwurf + Bestellt) |

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
Aufträge:          AUF-2026-0001
Angebote:          ANG-2026-0001
Produktion:        LS-2026-0001
Einkauf:           EK-2026-0001
Kunden:            KD-0001
Lieferanten:       LF-0001
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

**Weitere Tabs:** Changelog, Zeiten, Where-Used, Varianten

**Schaltflächen im Titel:**
- **↪** — Item in anderen Projektbereich verschieben
- **📄** — Dokumentvorlage generieren (Datenblatt, Stückliste, Prüfprotokoll)
- **⇄** — Dieses Item mit einem anderen vergleichen

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

Die Ansicht gruppiert nach Baugruppe: Pro ASM werden alle Revisionen aufgelistet in denen das Teil vorkommt, mit farbigem Status-Chip (DFT / REV / REL / ECO / OBS). Klick auf einen Revisions-Chip öffnet direkt diese Revision in der Detailansicht.

### 5.10 Variantenverwaltung

Teile die in mehreren Ausführungen existieren (z.B. `Halterung M3`, `Halterung M4`, `Halterung M5`) können als Varianten verknüpft werden.

**Varianten verknüpfen:**
1. Item öffnen → Tab **Varianten**
2. **+ Variante verknüpfen** → anderes Item suchen → **Verknüpfen**
3. Alle verknüpften Items werden als Chips angezeigt

**Zwischen Varianten navigieren:** Klick auf einen Varianten-Chip öffnet direkt dieses Item.

**Variante entfernen:** Chip → **✕** — entfernt nur dieses Item aus der Gruppe, andere bleiben verknüpft.

> Varianten teilen eine interne Gruppen-ID. Werden zwei bereits existierende Gruppen verknüpft, werden alle Mitglieder in eine gemeinsame Gruppe zusammengeführt.

### 5.11 Dokumentvorlagen

**📄** (Dokument-Symbol im Titel) öffnet das Vorlagen-Modal:

| Vorlage | Inhalt |
|---------|--------|
| **Datenblatt** | Item-Metadaten, aktive Revision, Klassifizierung, Gewicht, Verkaufspreis |
| **Stückliste** | BOM der aktiven Revision mit Menge und Einheit |
| **Prüfprotokoll** | Formular mit Prüfpunkten, Unterschriftsfeldern und Datum |

Klick auf eine Vorlage öffnet ein Druckfenster im Browser → **Drucken** oder **Als PDF speichern**.

### 5.12 Itemvergleich

**⇄** (Vergleich-Symbol im Titel) öffnet die Vergleichsansicht.

1. Erstes Item ist bereits vorgewählt
2. Zweites Item suchen → **Vergleichen**
3. Beide Items werden nebeneinander dargestellt:
   - Metadaten (Nummer, Name, Typ, Klassifizierung, Gewicht, Preis)
   - BOM-Vergleich: Positionen die nur in A, nur in B oder in beiden vorkommen
   - Dateien beider Items

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
| **ECO** | Lila | Engineering Change — ECO-Revision gesperrt, neue DFT wird erstellt |
| **OBS** | Grau | Abgelöst |

Bei ECO: Dateien der freigegebenen Revision werden in die neue DFT-Revision kopiert. Wird die DFT-Revision gelöscht, kehrt das ECO automatisch auf REL zurück.

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

## 15. Einkauf / Bestellwesen

Navigation → **Einkauf** — verwaltet Lieferanten und Bestellungen bei externen Lieferanten.

### 15.1 Lieferanten

Navigation → Einkauf → Tab **Lieferanten** — jeder Lieferant erhält eine automatische Nummer (`LF-0001`).

**Felder:** Name, Kontaktperson, E-Mail, Telefon, Adresse, Notizen.

In der Detailansicht des Lieferanten sind alle verknüpften Bestellungen aufgelistet.

### 15.2 Bestellungen

Navigation → Einkauf → Tab **Bestellungen** — Bestellnummer nach Schema `EK-2026-0001`.

**Status-Workflow:**

```
ENTWURF ──► BESTELLT ──► ERHALTEN
                └──► STORNIERT
```

| Status | Bedeutung |
|--------|-----------|
| **Entwurf** | In Vorbereitung, noch nicht versendet |
| **Bestellt** | An Lieferant übermittelt |
| **Erhalten** | Wareneingang gebucht |
| **Storniert** | Abgebrochen |

### 15.3 Bestellung erstellen

1. Einkauf → **+ Bestellung**
2. Lieferant wählen (aus Lieferantenliste) oder als Freitext eingeben
3. Bestelldatum und erwartetes Lieferdatum eintragen
4. Positionen hinzufügen (siehe 15.4)
5. Status auf **Bestellt** setzen wenn versendet

### 15.4 Positionen

**+ Position** — öffnet das Positions-Modal:

| Feld | Beschreibung |
|------|-------------|
| Beschreibung | Artikelbezeichnung (Pflichtfeld) |
| Menge | Bestellmenge |
| Einheit | Stk, kg, m, … |
| Einzelpreis | CHF pro Einheit |
| Verknüpfung | Optional: Lagerartikel oder Rohmaterial |
| Notizen | Interne Bemerkung |

**Verknüpfung:** Eine Position kann mit einem **Lagerartikel** oder einem **Rohmaterial** verknüpft werden. Die Verknüpfung wird in der Bestellübersicht angezeigt (Artikelname und aktueller Bestand).

Positionen können solange bearbeitet oder gelöscht werden, wie die Bestellung noch nicht den Status **Erhalten** hat. Klick auf **✏ Bearbeiten** öffnet das Bearbeitungs-Modal für eine einzelne Position.

### 15.5 Bestellungs-PDF

**📄 Bestellung PDF** — generiert ein druckbares Bestelldokument mit:
- Firmenadresse (aus Einstellungen)
- Lieferantenadresse
- Bestellnummer, Datum
- Positionstabelle mit Menge, Einheit, Beschreibung, Einzelpreis, Gesamtpreis
- Gesamtsumme

### 15.6 Wareneingang

Wenn die Bestellung ankommt → **✓ Als erhalten markieren**.

**Lagerartikel:** Bestand wird automatisch um die bestellte Menge erhöht.

**Rohmaterial:** Vor dem Einbuchen erscheint ein Modal zur Lot-Nummer-Erfassung.

#### Lot-Modus wählen

Sind mehrere Rohmaterial-Positionen in der Bestellung, kann gewählt werden:

| Modus | Beschreibung |
|-------|-------------|
| **Gleiche Lot-Nr. für alle** | Eine Lotnummer gilt für alle Rohmaterial-Positionen |
| **Individuelle Lot-Nr.** | Jede Position erhält eine eigene Lotnummer |

#### Lot-Nr. pro Stück (bei Menge > 1)

Im Modus **Individuelle Lot-Nr.**: Wenn eine Position eine Menge > 1 hat, wird für jedes einzelne Stück ein separates Eingabefeld angezeigt (Nr. 1, Nr. 2, …).

Stücke mit identischer Lotnummer werden zu einer gemeinsamen Buchung zusammengefasst. Unterschiedliche Lotnummern erzeugen separate Bewegungen in der Buchungshistorie.

**Einbuchen:** Nach Bestätigung wird der Bestand des Rohmaterials aktualisiert und ein Eintrag in der Buchungshistorie erstellt (Typ: Wareneingang, mit Bestellnummer und Lotnummer).

---

## 16. Kalkulation

Navigation → **Kalkulation** — Übersicht aller Parts mit Kostenvergleich.

| Spalte | Bedeutung |
|--------|-----------|
| **Verkaufspreis** | Listenpreis aus dem PLM |
| **Stk. verkauft** | Gesamtmenge aus allen Aufträgen |
| **Umsatz** | Gesamtumsatz dieses Bauteils |
| **Gewinn total** | Umsatz − (Kosten × verkaufte Stück) |

**CSV-Export** — oben links → **↓ CSV**

---

## 17. Suche

**Öffnen:** Suchfeld oben — oder `Ctrl+K`

Durchsucht gleichzeitig: Projekte, PLM-Items, Normteile, Aufträge, Angebote, Produktion, Kunden, Dateien.

**Schnellfilter:** Klassifizierungs-Chips in der Suchansicht für direkte Filterung.

---

## 18. Changelog

Navigation → **Changelog** — vollständige Änderungshistorie aller Aktionen.

Filterbar nach Zeitraum, exportierbar als CSV.

---

## 19. Einstellungen

Navigation → Einstellungen (Zahnrad-Symbol)

### Firma
Name, Adresse, UID, Bankverbindung — erscheinen auf Rechnungen, Angeboten und Bestellungs-PDFs.

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
- Nummerierungsstruktur: Präfixe, Stellen, Revisionsformat (auch für Einkauf EK und Lieferanten LF)

---

## 20. Tastaturkürzel

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
Einkauf:       EK-2026-0001
Kunden:        KD-0001
Lieferanten:   LF-0001
```

Präfixe, Stellen und Revisionsformat sind unter **Einstellungen → Admin** konfigurierbar.

---

*Technische Details: siehe `README.md`*
