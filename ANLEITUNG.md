# PLM & ERP — Benutzeranleitung

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Programmstart](#2-programmstart)
3. [Oberfläche](#3-oberfläche)
4. [Dashboard](#4-dashboard)
5. [PLM — Projekte & Items](#5-plm--projekte--items)
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
18. [Historie](#18-historie)
19. [Einstellungen](#19-einstellungen)
20. [Tastaturkürzel](#20-tastaturkürzel)
21. [Datensicherung](#21-datensicherung)

---

## 1. Überblick

PLM & ERP ist ein lokales System zur Verwaltung von Konstruktionsprojekten und Geschäftsvorgängen. Es läuft vollständig im eigenen Netzwerk — ohne Internet oder Cloud-Abhängigkeit.

**PLM** verwaltet: Projekte und Items (Baugruppen, Parts, Dokumente), Revisionen, Stücklisten, Dateien, Zeiten, Normteile, Varianten.

Die verwendeten Begriffe sind in der `README.md` unter **Begriffe** erklärt.

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
- **Zuletzt geöffnet:** Zuletzt geöffnete Items und Belege unten in der Navigation

---

## 4. Dashboard

| Kachel | Bedeutung |
|--------|-----------|
| **Umsatz** | Diesen Monat und Gesamt aller bestätigten Aufträge |
| **Aufträge** | Offene Aufträge |
| **Angebote** | Offene Angebote |
| **Produktion** | Aktive Produktionsaufträge |
| **Freigabe** | Items in Prüfung (REV-Status) |
| **Lager** | Lagerartikel unter Mindestbestand |
| **Einkauf** | Offene Bestellungen (Entwurf + Bestellt) |

**Fällige Produktionsaufträge:** Produktionsaufträge mit Lieferdatum in den nächsten 14 Tagen. Überfällige erscheinen rot.

**Ablaufende Angebote:** Aufträge in der Phase Angebot, deren „Gültig bis“ in den nächsten 14 Tagen liegt.

---

## 5. PLM — Projekte & Items

### 5.1 Projekte

Projekte sind die oberste Organisationsebene mit automatischer Nummer (z.B. `0028`).

**Projektdetails:**
- **Info** — Name, Kunde, Beschreibung
- **Struktur** — Baumansicht aller Items
- **Dokumente** — Projektdokumente
- **Log** — Historie des Projekts

### 5.2 Nummernschema

```
Projekt:           0028
Baugruppe:         0028-asm-001
Part in BG:        0028-asm-001-prt-001
Part im Projekt:   0028-prt-001
Dokument:          0028-doc-001
Aufträge:          AUF-2026-0001
Angebote:          ANG-2026-0001
Produktionsauftrag: LS-2026-0001
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

### 5.4 Item-Detailansicht

**Revisionen-Tab:**
- Verkaufspreis (VP) und Gewicht direkt inline editierbar
- Revisionen als Reiter — 🚚 kennzeichnet gelieferte Revisionen (siehe 11.3)
- **⇄ Revisionen vergleichen** — zwei Revisionen gegenüberstellen (siehe 5.13)
- Stückliste (BOM) mit PLM-Items und Normteilen
- Dateien: CAD, PDF, Bilder, GCode
- Freigabe-Workflow

**Weitere Tabs:** Datenblatt, Historie, Zeiten, Verwendung, Aufträge, Varianten

**Schaltflächen im Titel:**
- **↪** — Item in ein anderes Projekt verschieben
- **📄** — Dokument erstellen (Datenblatt, Stückliste, Prüfprotokoll)
- **⇄** — Dieses Item mit einem anderen Item vergleichen

### 5.5 Gewicht

Das Gewicht ⚖ eines Parts wird direkt in der Detailansicht neben dem Verkaufspreis eingetragen (in Gramm). Es wird für die automatische Materialkostenkalkulation in Angeboten verwendet.

### 5.6 Klassifizierung

Farbige Chips im Projektbaum und in der Detailansicht. Konfigurierbar unter **Einstellungen → PLM** (siehe 19). In der Suche filtern die Chips nach Klassifizierung (siehe 17).

### 5.7 Stückliste (BOM)

In der aktiven Revision einer Baugruppe:
- **+ Position hinzufügen** → PLM-Item aus dem Projekt suchen
- **⚙ Normteil** → Normteil aus dem Katalog hinzufügen
- **📐 BOM aus STEP** → Stückliste aus Solid Edge STEP-Export importieren

### 5.8 BOM aus STEP importieren

1. Baugruppe in Solid Edge → **Datei → Exportieren → STEP AP214**
2. PLM → Baugruppe → BOM → **📐 BOM aus STEP**
3. STEP-Datei hochladen → Analysieren
4. Teile werden automatisch per Namensabgleich zugeordnet (✓ = gefunden, ? = manuell zuordnen)
5. **✓ BOM übernehmen**

### 5.9 Verwendung

Tab **Verwendung** in der Item-Detailansicht zeigt alle Baugruppen, in denen dieses Item verbaut ist.

Die Ansicht gruppiert nach Baugruppe: Pro Baugruppe werden alle Revisionen aufgelistet, in denen das Item vorkommt, mit farbigem Status-Chip (DFT / REV / REL / ECO / OBS). Klick auf einen Revisions-Chip öffnet direkt diese Revision in der Detailansicht.

### 5.10 Variantenverwaltung

Items, die in mehreren Ausführungen existieren (z.B. `Halterung M3`, `Halterung M4`, `Halterung M5`) können als Varianten verknüpft werden.

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
   - Kopfdaten (Nummer, Name, Typ, Klassifizierung, Gewicht, Preis)
   - BOM-Vergleich: Positionen, die nur in A, nur in B oder in beiden vorkommen
   - Dateien beider Items

### 5.13 Revisionen vergleichen

Revisionen-Tab → **⇄ Revisionen vergleichen** (erscheint ab zwei Revisionen).

1. Vorgewählt ist die angezeigte Revision gegen die nächstältere; beide Seiten sind wählbar, **⇄** tauscht sie.
2. Pro Bereich steht die Zahl der Änderungen: **Kopfdaten**, **Druckparameter**, **Stückliste**, **Normteile**, **Dateien**.
3. Farben: grün = neu, rot = entfernt, gelb = geändert. **Nur Änderungen** blendet Gleiches aus.
4. Dateien werden über den Namen ohne `_revN` zugeordnet. Bei gleicher Grösse vergleicht PLM den Inhalt — eine unverändert übernommene Datei gilt als gleich.

---

## 6. Normteile

Navigation → **Normteile** — Katalog für genormte Bauteile (DIN, ISO, EN, ASME, …).

### Neues Normteil

Felder ausfüllen → Bezeichnung wird automatisch generiert (z.B. `DIN 912 Zylinderschraube M4x12 A2-70`), manuell überschreibbar.

| Feld | Beispiel |
|------|---------|
| Norm | DIN |
| Norm-Nr. | 912 |
| Grösse / Mass | M4x12 |
| Kurzbezeichnung | Zylinderschraube |
| Material / Güte | A2-70 |
| Stückpreis | 0.15 CHF |

### Dateien

Tab **Dateien** pro Normteil: STEP-Dateien, PDFs, Zeichnungen hochladen (Mehrfachauswahl).

### In BOM verwenden

Im BOM-Dialog einer Baugruppe → Tab **⚙ Normteil** → Normteil aus der Liste wählen.

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
| **ECO** | Lila | Änderung (Engineering Change) — Revision gesperrt, neue DFT wird angelegt |
| **OBS** | Grau | Veraltet (abgelöst) |

Die Knöpfe heissen **→ In Review**, **✓ Freigeben**, **⚡ ECO starten** und **Als veraltet markieren (OBS)**.

Bei ECO: Dateien, Stückliste und Druckparameter der freigegebenen Revision werden in die neue DFT-Revision übernommen. Wird die DFT-Revision gelöscht, kehrt das ECO automatisch auf REL zurück.

Freigegebene oder gelieferte Items löschen nur über **Einstellungen → Admin**.

---

## 8. Checkout / Check-in

### Workflow

**Auschecken:** Item → **⬇ Auschecken** → Dateitypen wählen → Dateien landen in `<checkout-pfad>/<item-nummer>/` (ohne Zeitstempel, Pfad bleibt bei jedem Checkout identisch).

**Arbeiten im CAD:** Dateien bearbeiten oder neue erstellen.

**Einchecken:** **⬆ Einchecken** → Ordner wird gelöscht, Eintrag in der Historie. Ist die Revision bereits geliefert, landen die Dateien in einer neuen Revision.

**Neue Dateien:** PLM erkennt sie automatisch beim Öffnen der Checkout-Übersicht (⬆ Checkouts):
- Im Unterordner eines Items → „Zum Item hinzufügen"
- Im Hauptordner → „Als neues Item anlegen"

### Solid Edge Standardpfad

**Tools → Options → File Locations** → Parts, Assemblies, Drafts → Checkout-Ordner eintragen.

Checkout-Pfad: **Einstellungen → Daten → Checkout-Verzeichnis**

---

## 9. Angebote & Kostenkalkulation

### Angebot anlegen

Ein Angebot ist die erste **Phase eines Auftrags**: Navigation → Aufträge → **+ Auftrag** → Status **Angebot**.

Phasen: `Angebot → Bestätigt → Geliefert → Fakturiert` (oder `Angebot → Abgelehnt`)

**Angebot angenommen:** Auftrag → **✓ Angebot angenommen** — gleiche Nummer, gleiche Positionen, die Phase wechselt auf Bestätigt.

### Position hinzufügen mit Kalkulation

Beim Hinzufügen einer Position:

1. **PLM-Item verknüpfen** — suche nach Item-Nummer oder Name
2. **Rohmaterial wählen** — bei mehreren aktiven Lots erscheint ein Picker zur Lot-Auswahl
3. **Arbeitszeit (h)** — geschätzte Stunden
4. **Drucker + Druckzeit (h)** — für Druckkosten
5. System zeigt **Kostenaufstellung** live:
   - Material: `Bauteilgewicht × (Rohmaterialpreis / Rohmaterialgewicht)`
   - Arbeitszeit: `Stunden × Stundenansatz`
   - Druckzeit: `Stunden × Drucker CHF/h`
6. **„Als Preis übernehmen"** — kalkulierten Preis als Einzelpreis setzen

> Item und Rohmaterial müssen beide ein Gewicht hinterlegt haben, sonst erscheint eine Warnmeldung.

### BOM kalkulieren (Baugruppen)

**📦 Aus BOM kalkulieren** — wähle eine Baugruppe, alle BOM-Teile werden als einzelne Positionen mit automatischen Kosten übernommen.

---

## 10. Aufträge

Navigation → Aufträge → **+ Auftrag**

Status: `Angebot → Bestätigt → Geliefert → Fakturiert`, ohne vorheriges Angebot ab `Entwurf`; dazu `Abgelehnt` und `Storniert`

- **Rechnung PDF** — Auftrag → **📄 Rechnung PDF**
- **Produktionsauftrag anlegen** — Auftrag → **🔧 Produktionsauftrag anlegen**; bearbeitet wird er im Tab **Produktion** des Auftrags (mehrere Produktionsaufträge für Teillieferungen möglich)
- **Lager abbuchen** — Auftragsposition → **📦** (nur wenn genügend Bestand)

Aufträge im Status Entwurf können direkt gelöscht werden. Andere Status nur über **Einstellungen → Admin**.

---

## 11. Produktion

Navigation → **Produktion** — Liste der Produktionsaufträge (`LS-…`). Standardmässig nur die eigenständigen; Produktionsaufträge zu einem Auftrag bearbeitest du im Auftrag unter **Produktion**.

**Neuer Produktionsauftrag:** + Produktionsauftrag

Status: `Entwurf → Bereit → Geliefert`

### 11.1 Position hinzufügen

- **PLM-Item** verknüpfen
- **Rohmaterial** zuweisen → übernimmt automatisch Düsentemperatur und Betttemperatur
- **3MF-Import** oder manuelle Druckparameter
- **Drucker** und **Düse** separat wählen

### 11.2 Lieferschein drucken

**📄 Lieferschein** — zeigt alle Positionen mit Revision, Druckparametern, Rohmaterial und Unterschriftsfeldern.

### 11.3 Gelieferter Stand

Jede Position mit PLM-Item zeigt neben der Item-Nummer ihre Revision:

| Kennzeichen | Bedeutung |
|---|---|
| `rev2` (blass) | folgt automatisch der aktiven Revision |
| `🔒 rev1` | fest gewählt bzw. geliefert |
| `↑rev3` | inzwischen gibt es eine neuere Revision |
| `3 Teile` | gelieferte Baugruppe mit festgehaltener Struktur |

- **Vor der Lieferung:** Klick auf das Kennzeichen → „Automatisch“ oder „Fest auf Revision“ wählen.
- **Beim Status „Geliefert“** fixiert PLM die Revision jeder Position, bei Baugruppen zusätzlich die Revision jedes Unterteils.
- **Gelieferte Revisionen sind gesperrt** — keine Datei-, Stücklisten- oder Druckparameteränderung, kein Löschen. Im Item steht ein Hinweis „Geliefert — revN ist fixiert“; weiter geht es mit **＋ Neue Revision**.
- **Nach der Lieferung:** Klick auf das Kennzeichen zeigt den gelieferten Stand mit Struktur; eine falsch erfasste Revision lässt sich dort korrigieren.
- **Status zurück** (z. B. auf „Bereit“): automatisch fixierte Positionen folgen wieder der aktiven Revision, von Hand gewählte bleiben.
- Item → Tab **Aufträge** listet alle Produktionsaufträge mit ihrem Stand, auch Lieferungen als Teil einer Baugruppe.

### 11.4 Thermodrucker (Pipsta)

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
| Düsentemperatur (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Betttemperatur (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Mindestbestand | Warnschwelle |

Name wird automatisch aus Typ + Farbe + Abmessungen + Marke generiert (editierbar).

### Lot-Tracking

Jede **Einbuchung** kann eine Lot-Nr. und einen Einkaufspreis erhalten. Mehrere Lots desselben Materials werden untereinander aufgelistet:

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

- PLM-Item verknüpfen → Bestand wird beim Abbuchen aus Aufträgen reduziert
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

### 15.3 Bestellung anlegen

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
| **Gleiche Lot-Nr. für alle** | Eine Lot-Nr. gilt für alle Rohmaterial-Positionen |
| **Individuelle Lot-Nr.** | Jede Position erhält eine eigene Lot-Nr. |

#### Lot-Nr. pro Stück (bei Menge > 1)

Im Modus **Individuelle Lot-Nr.**: Wenn eine Position eine Menge > 1 hat, wird für jedes einzelne Stück ein separates Eingabefeld angezeigt (Nr. 1, Nr. 2, …).

Stücke mit identischer Lot-Nr. werden zu einer gemeinsamen Buchung zusammengefasst. Unterschiedliche Lot-Nr. erzeugen separate Bewegungen in der Buchungshistorie.

**Einbuchen:** Nach Bestätigung wird der Bestand des Rohmaterials aktualisiert und ein Eintrag in der Buchungshistorie erstellt (Typ: Wareneingang, mit Bestellnummer und Lot-Nr.).

---

## 16. Kalkulation

Navigation → **Kalkulation** — Übersicht aller Parts und Baugruppen mit Kostenvergleich.

| Spalte | Bedeutung |
|--------|-----------|
| **Verkaufspreis** | Verkaufspreis (VP) aus dem PLM |
| **Stk. verkauft** | Gesamtmenge aus allen Aufträgen |
| **Umsatz** | Gesamtumsatz dieses Items |
| **Gewinn total** | Umsatz − (Kosten × verkaufte Stück) |

**CSV-Export** — oben links → **↓ CSV**

---

## 17. Suche

**Öffnen:** Suchfeld oben — oder `Ctrl+K`

Durchsucht gleichzeitig: Projekte, PLM-Items, Aufträge und Angebote, Produktionsaufträge, Kunden, Rohmaterial, Dateien.

- **Mehrere Wörter** müssen alle vorkommen, egal in welchem Feld: „Halter PETG“ findet einen Halter mit „PETG“ in der Beschreibung.
- Gross-/Kleinschreibung spielt keine Rolle, auch nicht bei Umlauten („öse“ findet „Öse“).
- Eine exakt eingegebene Item-Nummer steht oben.

**Filter nach Klassifizierung:** Die Chips über den Ergebnissen zeigen pro Klassifizierung die Zahl der Treffer.

- Klick auf einen Chip zeigt nur Items dieser Klassifizierung — auch ohne Suchwort als ganze Liste. Zweiter Klick (oder **✕ Filter aufheben**) hebt ihn auf.
- **ohne** zeigt Items ohne Klassifizierung.
- Gestrichelte Chips: Werte, die an Items stehen, aber nicht in der Liste unter Einstellungen → PLM.

---

## 18. Historie

Navigation → **Historie** — vollständiges Protokoll aller Änderungen, nach Tag gruppiert. Klick auf die Nummer öffnet das betroffene Item, Projekt, den Auftrag oder Produktionsauftrag.

Sind Personen angelegt (Einstellungen → **Benutzer**), steht neben jedem Eintrag, wer ihn gemacht hat — auch in der Historie eines Items oder Projekts und unter „Letzte Änderung“ im Datenblatt. Ältere Einträge haben keinen Namen.

**⬇ CSV** exportiert die Einträge, mit der Person als eigener Spalte.

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
Slicer, Drucker (mit CHF/h), Düsen und Materialprofile.

**Slicer** — PrusaSlicer oder Bambu Studio für „Im Slicer öffnen“ (Datenblatt und Dateien einer Revision). Das Programm wird an den üblichen Orten gesucht; ist keiner installiert, bleibt der Knopf grau. Liegt es woanders: in `plm.config` `prusaslicer=…` bzw. `bambustudio=…` eintragen. Die Arbeitskopie landet als `<Kurzcode>_<Name>.stl` im Unterordner `Slicer` des Checkout-Verzeichnisses; eine im Slicer gespeicherte Kopie wird nicht überschrieben.

> Druckparameter einer Revision kommen aus der hochgeladenen 3MF-Datei; in der Produktion lassen sie sich pro Position erfassen. Materialtemperaturen werden direkt im Rohmaterial hinterlegt.

### PLM
Klassifizierungsliste — Namen und Farben bearbeiten, per Drag&Drop sortieren.

- Neben jedem Eintrag steht, wie viele Items ihn tragen.
- **Umbenennen** überträgt den neuen Namen beim Speichern auf alle Items (und auf die Standard-Klassifizierung).
- **Entfernen** eines benutzten Eintrags fragt, ob die Items ihn behalten oder verlieren.
- Werte, die an Items stehen, aber in der Liste fehlen, erscheinen darunter — **＋ übernehmen** holt sie zurück.

Dazu: Standard-Klassifizierung für neue Items (mit/ohne Quelle) und der Freigabe-Workflow.

### Daten
- **Darstellung** — Schriftgrösse (wird serverseitig gespeichert)
- **Datenpfad** — Datenbank und Dateispeicher. Ändert nur, wo PLM sucht — vorhandene Daten bleiben am alten Ort
- **Daten verschieben** — zieht das komplette Datenverzeichnis (Datenbank, alle Dateien, Sicherungen, Papierkorb) an einen neuen Ort um: kopieren → prüfen → sofort umschalten (kein Neustart nötig) → alten Ordner löschen. Das Ziel muss ein leerer oder neuer Ordner sein; optional lassen sich die Daten am alten Ort behalten (kopieren statt verschieben). Während des Vorgangs sind Schreibzugriffe gesperrt; schlägt die Prüfung fehl, bleibt alles am alten Ort
- **CAD-Programm** — zeigt, ob das Programm für den 🖥 CAD-Button gefunden wird. Der Pfad steht in `plm.config` (`cad_path=…`), nicht in der Oberfläche: Die Einstellungen sind ohne Anmeldung im ganzen Netz erreichbar
- **Checkout-Verzeichnis** — Zielordner für Checkouts; nur am PC änderbar, auf dem das PLM läuft
- **Datensicherung** — Sicherungen anlegen, wiederherstellen und löschen (siehe 21)
- **Export** — ZIP-Export aller Daten
- **Datei-Index** — Zuordnung angezeigter Name ↔ Dateiname auf Festplatte

### Benutzer
Wer was gemacht hat — für die Nachvollziehbarkeit, nicht als Schutz. Ohne Passwort.

- **Allein:** Namen eintragen („Dein Name“). PLM fragt nie, wer dran ist; der Name steht in der Historie und bei Freigaben.
- **Team (ab zwei Personen):** Beim Öffnen erscheint **Wer ist dran?** — ein Klick auf die eigene Kachel. Der Name steht oben rechts, ein Klick darauf wechselt die Person. Nach einer Pause (einstellbar, Standard 30 Minuten, 0 = nie) fragt PLM bei der nächsten Änderung einmal **Weiter als …?**; danach wird die Änderung ausgeführt.
- **Rollen:** **User** ändert, gibt aber nicht frei. **Superuser** gibt zusätzlich frei (REL) und markiert als veraltet (OBS). **Admin** darf alles: Einstellungen, Personen, Stammdaten löschen, Sicherungen zurückspielen.
- **PIN:** Admins können eine PIN setzen. Sie wird beim Wechsel zu diesem Admin abgefragt, nicht beim Weitermachen nach einer Pause.
- **Deaktivieren** statt löschen: Die Person bleibt in der Historie, steht aber nicht mehr zur Auswahl. Es braucht immer mindestens einen aktiven Admin.

Hintergrund und Grenzen: [KONZEPT-BENUTZERVERWALTUNG.md](KONZEPT-BENUTZERVERWALTUNG.md).

### Admin
**Vorsicht — Änderungen können Daten dauerhaft beschädigen.**

- Freigegebene oder gelieferte Items, Projekte mit Inhalt, abgeschlossene Aufträge, Produktionsaufträge löschen
- Nummerierungsstruktur: Präfixe, Stellen, Revisionsformat (auch für Einkauf EK und Lieferanten LF)

---

## 20. Tastaturkürzel

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+K` | Suche öffnen |
| `Escape` | Modal / Detail schliessen |
| Browser-Zurück | Zur vorherigen Ansicht |

---

## 21. Datensicherung

**Einstellungen → Daten → Datensicherung**

- PLM sichert die Datenbank bei jedem Start einmal pro Tag (die letzten 14 bleiben).
- **💾 Jetzt sichern** legt eine zusätzliche Sicherung an.
- **Wiederherstellen** bei einer Sicherung: der Dialog zeigt, was sich ändert (Projekte, Items, Aufträge … jetzt gegen Sicherung). Vorher sichert PLM den jetzigen Stand als „vor Wiederherstellung“ — du kannst also zurück. Danach lädt die Oberfläche neu.
- **⬆ Aus Datei wiederherstellen…** nimmt eine Sicherung (`.db`) oder einen Gesamtexport (`.zip`).
- Gelöschte Dateien bleiben 30 Tage im **Papierkorb**; eine wiederhergestellte Sicherung holt sie von dort zurück. Fehlt eine Datei, nennt der Abschlussdialog sie.

**Gesamtexport:** Einstellungen → Daten → Export → ZIP mit `plm.db` + `files/`, lässt sich über „Aus Datei wiederherstellen“ komplett zurückspielen.

---

## Nummernkreise

```
Projekte:      0001 – 9999
Baugruppen:    0028-asm-001, 0028-asm-002, …
Parts:         0028-prt-001 / 0028-asm-001-prt-001
Dokumente:     0028-doc-001
Aufträge:      AUF-2026-0001
Angebote:      ANG-2026-0001
Produktionsauftrag: LS-2026-0001
Einkauf:       EK-2026-0001
Kunden:        KD-0001
Lieferanten:   LF-0001
```

Präfixe, Stellen und Revisionsformat sind unter **Einstellungen → Admin** konfigurierbar.

---

*Technische Details: siehe `README.md`*
