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
Desktop-Verknüpfung mit Logo: einmal **`VERKNUEPFUNG-ERSTELLEN.bat`** ausführen

→ Browser öffnet sich von selbst, auf `http://localhost:3000` oder, wenn der Port belegt
ist, auf dem nächsten freien (wird in `plm.config` als `port=` gemerkt)  
Beim ersten Start werden alle Node-Pakete automatisch installiert.  
`plm.config` wird automatisch erstellt wenn sie fehlt.

### Windows-Sicherheitswarnung vermeiden

Windows markiert alles, was aus dem Internet heruntergeladen wurde, und fragt beim Starten
einer `.bat`-Datei nach („Der Herausgeber konnte nicht verifiziert werden“). Die Dateiendung
spielt keine Rolle — `.cmd` oder `.exe` warnen genauso. Abhilfe: die ZIP-Datei **vor dem
Entpacken** freigeben, dann trägt keine der entpackten Dateien die Markierung.

1. Heruntergeladene ZIP-Datei mit der rechten Maustaste anklicken → **Eigenschaften**
2. Im Reiter **Allgemein** ganz unten bei *Sicherheit: Die Datei stammt von einem anderen
   Computer …* das Häkchen **Zulassen** setzen
3. **OK** klicken, erst dann die ZIP-Datei entpacken

Wurde schon entpackt, ohne freizugeben: Die Warnung einmal mit **Ausführen** bestätigen.
`START-PLM.bat` entfernt die Markierung danach bei sich selbst, sie warnt nicht mehr.
Ohne Warnung von Anfang an geht es auch mit `git clone` statt ZIP-Download — Git markiert
keine Dateien.

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
Produktionsauftrag:   LS-2026-0001
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
| ECO | Änderung (Engineering Change Order) – Revision bleibt gültig und gesperrt, geändert wird in einer neuen DFT |
| OBS | Veraltet (Obsolete) – abgelöst, archiviert |

Bei ECO: Dateien, Stückliste und Druckparameter der freigegebenen Revision werden in
die neue DFT-Revision übernommen — genau wie bei „＋ Neue Revision“.  
Wird die DFT-Revision gelöscht, kehrt das ECO automatisch auf REL zurück.  
Wird die neue Revision freigegeben, geht die bisherige (REL oder ECO) auf OBS.

**Prüfung vor der Freigabe** (Einstellungen → PLM): wählbare Pflichtpunkte — CAD-Datei,
Zeichnung (PDF), Beschreibung, Klassifizierung, Gewicht — plus die als Pflicht markierten
Eigenschaften der Klassifizierung. Fehlt etwas, nennt PLM es und sperrt „Freigeben“.

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
- **Projektfarben** – jedem Projekt eine Farbe geben; sie erscheint als Streifen in der
  Liste, färbt die Nummernkachel und markiert das offene Projekt im Brotkrumenpfad
- Revisionsverwaltung rev1, rev2, … (alle alten Revisionen bleiben erhalten)
- Freigabe-Workflow: DFT → REV → REL → ECO → neue Revision
- Stückliste (BOM) pro Revision – mehrere Positionen gleichzeitig hinzufügen (Warenkorb)
- Normteile in BOM einsetzbar
- Dateien pro Revision: CAD, GCODE, PDF, Bilder, Dokumente …
- Automatische Dateityp-Erkennung (STL/3MF/STEP → CAD, .gcode → GCODE …)
- Gewicht pro Part (direkt inline editierbar), Entwicklungszeiten erfassbar
- **Klassifizierung** – farbige Chips, konfigurierbar unter Einstellungen → PLM
- **Eigenschaften je Klassifizierung** – z. B. Werkstoff, Oberfläche, Hersteller; im Datenblatt,
  auf der PDF und in der Suche, optional Pflicht für die Freigabe
- **Vorschaubilder** – in Projektbaum, Stückliste und Suche beim Überfahren einer Zeile mit der
  Maus: die STL der neusten Revision isometrisch gezeichnet (sonst das Bild aus der 3MF oder ein
  hochgeladenes Bild), einmal berechnet und unter `thumbs/` im Datenordner zwischengespeichert
- **Datenblatt-Tab** – Beschreibung, Quelle, Kennzahlen, Druckparameter, Stücklisten-Kurzfassung,
  Lagerbestand, freie Notizen, QR-Code der Item-Nummer und letzte Änderung auf einen Blick
- **Mindmap** – Abhängigkeiten als Graph: links die Baugruppen, die das Item verwenden,
  rechts die Teile, aus denen es besteht (siehe unten)
- **Revisionsstand in der Stückliste** – folgt standardmässig automatisch der aktuellen
  Revision, pro Position optional fest fixierbar (siehe unten)
- **Gelieferter Stand** – beim Liefern wird die Revision jeder Position fixiert, bei
  Baugruppen die ganze Struktur; gelieferte Revisionen sind gesperrt (siehe unten)
- **Revisionen vergleichen** – zwei Revisionen eines Items gegenüberstellen: Kopfdaten,
  Druckparameter, Stückliste, Normteile und Dateien (siehe unten)
- **Freigabe-Workflow abschaltbar** – unter Einstellungen → PLM wählbar zwischen
  Freigabelauf (DFT → REV → REL → ECO) und einfachem Betrieb ohne Freigabe
- **Druckparameter aus 3MF** – beim Hochladen einer `.3mf` an eine Revision werden
  Schichthöhe, Füllung, Füllmuster, Temperaturen, Material und Drucker automatisch übernommen
- **Klassifizierung automatisch** – neue Items werden anhand der Quelle als Eigen-
  oder Kaufteil eingestuft (Vorgaben unter Einstellungen → PLM)
- **Freie Notizen** pro Item – für alles was nicht in die Beschreibung gehört
- **Verwendung** – zeigt alle Revisionen der Baugruppen, in denen ein Item verbaut ist,
  inklusive des Standes, auf den die jeweilige Verwendung fixiert ist
- **Variantenverwaltung** – Items als Varianten verknüpfen; Navigation zwischen Varianten direkt im Detail
- **Dokumentvorlagen** – PDF-Vorlagen aus dem Item-Detail: Datenblatt, Stückliste, Prüfprotokoll
- **Itemvergleich** – zwei Items nebeneinander vergleichen (Kopfdaten, BOM-Diff, Dateien)
- **BOM-Import aus STEP** – Stückliste automatisch aus Solid Edge STEP-Export einlesen
- **Normteilverwaltung** – eigene Datenbank für Normteile (DIN/ISO/EN) mit Dateien
- Checkout/Check-in Funktion für CAD-Dateien
- Vollständige **Historie** aller Änderungen (Navigation → Historie, als CSV exportierbar)

### ERP
- Kundenverwaltung (KD-0001)
- Kunde als Freitext eingeben möglich
- **Angebot als Auftragsphase** – ein Vorgang statt zwei Datensätze (siehe unten)
- Aufträge mit Rechnungs-PDF inkl. Arbeitszeit als Position
- Angebot annehmen heisst Phasenwechsel — gleiche Nummer, gleiche Positionen
- **Kunde löschen behält die Belege**: der Name wandert ins Freitextfeld, Rechnungen
  bleiben vollständig nachdruckbar
- PLM-Items in Positionen verknüpfen
- Lagerbestandsprüfung beim Abbuchen
- **Produktion im Auftrag**: Tab „Produktion" im Auftragsdetail — Positionen, Rohmaterial,
  Druckparameter, Lieferschein und Status ohne Wechsel in die Produktionsliste
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
- **Aus BOM** – Button „📦 Aus BOM kalkulieren" expandiert eine Baugruppe in Einzelpositionen

### Rohmaterial
- Eigene Verwaltung mit Materialtyp, Farbe, Abmessungen, Gewicht, Druckparametern
- Lot-Tracking: jede Einbuchung mit Lot-Nr. und Einkaufspreis
- Remaining-Qty pro Lot, aufgebrauchte Lots durchgestrichen/ausgeblendet
- Bei Auswahl in Produktion: Drucktemperatur und Betttemperatur automatisch übernommen

### Normteile
- Katalog für genormte Bauteile (DIN, ISO, EN, …)
- Auto-Bezeichnung aus Norm + Nummer + Grösse + Material
- Dateien (STEP, PDF, …) pro Normteil hinterlegbar
- Als BOM-Positionen in Baugruppen einsetzbar
- **⬇ Auschecken** – alle Normteil-Dateien in festen `normteile/`-Ordner kopieren

### Produktion
- Eigenständig oder mit Auftrag verknüpft
- Rohmaterial pro Position zuweisbar (übernimmt Druckparameter)
- Druckparameter direkt aus 3MF-Datei auslesen (PrusaSlicer, SuperSlicer, OrcaSlicer, BambuStudio)
- **Lieferschein-PDF** mit Positionen, Revision, Druckparametern, Unterschriftsfeldern
- **Gelieferter Stand** – jede Position zeigt ihre Revision; beim Liefern wird sie fixiert
- Belegdruck auf **Pipsta Classic Thermodrucker**

### Dashboard & Suche
- Dashboard mit offenen Aufträgen, Angeboten, fälligen Produktionsaufträgen, ablaufenden Angeboten
- Globale Suche (`Ctrl+K`) über Projekte, PLM-Items, Aufträge und Angebote, Produktionsaufträge,
  Kunden, Rohmaterial und Dateien — mehrere Wörter müssen alle vorkommen
- **Filter nach Klassifizierung**: Chips mit Trefferzahl, auch ohne Suchwort (siehe unten)
- PLM-Items (PRT/ASM) erscheinen in der Suche zuerst, sortiert nach Relevanz

### Navigation
- **Ctrl+K** – Suche öffnen
- **Escape** – Modal / Detail schliessen
- **Browser-Zurück-Button** – navigiert innerhalb der App
- **Zuletzt geöffnet** – zuletzt geöffnete Items und Belege in der Seitenleiste

### Einstellungen / Admin
- **Firma** – Name, Adresse, Bankverbindung, Logo
- **Kalkulation** – Stundenansatz, Maschinenkosten, Standardwerte
- **3D-Druck** – Slicer (PrusaSlicer / Bambu Studio), Drucker, Düsen, Materialprofile
- **PLM** – Klassifizierungsliste (Name + Farbe, Drag&Drop, Umbenennen überträgt sich auf die Items)
- **Daten** – Schriftgrösse, **Design zurücksetzen**, Checkout-Ordner, CAD-Programm,
  **Sicherungen anlegen und wiederherstellen**, Export
- **Benutzer** – wer mit PLM arbeitet (User, Superuser, Admin); Namen in Historie und Freigabe
- **Admin** – Nummerierungsstruktur, Datensätze löschen

---

## Revisionsstand in der Stückliste

Eine Stücklistenposition verweist auf das **Teil**, nicht auf eine feste Revision.
Standardmässig zeigt sie deshalb immer den aktuellen Stand: wird das Teil auf rev2
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
Einheiten, die noch nicht umgerüstet sind, auf ihrem Stand. Der Tab „Verwendung“
des Bauteils zeigt dann direkt, welche Einheit auf welchem Stand ist.

Für Lieferungen an Kunden muss man das nicht mehr von Hand machen — siehe
**Gelieferter Stand**.

Wird eine fixierte Revision gelöscht, fällt die Position automatisch auf
„Automatisch" zurück — es entstehen keine toten Verweise.

---

## Gelieferter Stand

Eine Produktionsposition, die mit einem Item verknüpft ist, folgt bis zur Lieferung
der aktiven Revision (blasses Kennzeichen `rev2`). Sobald der Produktionsauftrag auf
**„Geliefert“** gesetzt wird, hält PLM fest, was tatsächlich beim Kunden ist:

| Was | Wie |
|---|---|
| Part | die Revision der Position wird fixiert (`🔒 rev2`) |
| Baugruppe | zusätzlich die **komplette Struktur** — jedes Unterteil mit seiner damaligen Revision |
| Gelieferte Revision | gesperrt: keine Datei-, Stücklisten- oder Druckparameter-Änderung, kein Löschen |
| Item mit gelieferter Revision | nur noch unter **Einstellungen → Admin** löschbar |

Weiterarbeiten geht in einer **neuen Revision** — im Revisionen-Tab erscheint dafür
„＋ Neue Revision“, auch im Workflow mit Freigabe. Ein Check-in in eine gelieferte
Revision legt automatisch eine neue an.

- **Vor der Lieferung** lässt sich eine Position über das Kennzeichen von Hand auf eine
  Revision setzen (z. B. wenn bewusst noch rev1 gedruckt wird).
- **Nach der Lieferung** zeigt ein Klick auf das Kennzeichen den gelieferten Stand mit
  der Struktur. Wurde die falsche Revision erfasst, lässt sie sich dort korrigieren.
- **Status zurück** (z. B. auf „Bereit“): automatisch fixierte Revisionen folgen wieder
  der aktiven, von Hand gewählte bleiben.
- Gibt es inzwischen eine neuere Revision, steht `↑rev3` daneben.
- Item → Tab **Aufträge** zeigt pro Produktionsauftrag den gelieferten Stand, auch für
  Teile, die als Teil einer Baugruppe geliefert wurden (Abschnitt „Geliefert als Teil
  einer Baugruppe“). So beantwortet PLM die Frage, welcher Kunde welchen Stand hat.
- Der Lieferschein druckt die Revision zu jeder Position.

**Bestehende Lieferungen:** Beim ersten Start wird für bereits gelieferte
Produktionsaufträge die Revision ermittelt, die am Lieferdatum aktiv war. Diese
Positionen tragen den Hinweis „ermittelt“.

---

## Revisionen vergleichen

Im Revisionen-Tab eines Items mit mehreren Revisionen öffnet
**„⇄ Revisionen vergleichen“** die Gegenüberstellung. Standard ist die gewählte Revision
gegen die nächstältere; beide Seiten sind wählbar und tauschbar.

| Bereich | Verglichen wird |
|---|---|
| Kopfdaten | Status, Beschreibung, ECO-Grund, Freigabe |
| Druckparameter | jeder Wert, mit denselben Bezeichnungen wie im Datenblatt |
| Stückliste | neu, entfernt, Menge geändert, Revisionsfixierung geändert |
| Normteile | neu, entfernt, Menge geändert |
| Dateien | über den Namen ohne `_revN` zugeordnet; bei gleicher Grösse entscheidet eine Prüfsumme |

Eine bei ECO oder „Neue Revision“ kopierte Datei gilt so als unverändert.
„Nur Änderungen“ blendet Gleiches aus. Der Knopf ⇄ in der Titelzeile vergleicht
weiterhin zwei **verschiedene** Items.

---

## Mindmap – Abhängigkeiten

Der ⌗-Knopf in der Titelzeile eines Items (oder im Datenblatt-Tab) öffnet den
Abhängigkeitsgraphen:

```
Baugruppen, die es verwenden  ──►  [ Item ]  ──►  Teile, aus denen es besteht
          (Verwendung)                                (Stückliste)
```

- **Ziehen** verschiebt, **Mausrad** zoomt
- **Klick** stellt die Mindmap auf das angeklickte Teil um — so navigiert man durch die
  Struktur; **Doppelklick** öffnet das Item
- Tiefe für beide Richtungen getrennt einstellbar (0–6 Ebenen)
- Normteile erscheinen als Blätter, Mengen stehen an den Kanten
- Fest fixierte Positionen zeigen die Revision in Amber; der Graph klappt dann
  die Unterstückliste **dieser** Revision auf, nicht die der aktuellsten
- Verwendungen, die nur in älteren Revisionen stehen, werden gezählt und
  in der Fusszeile gemeldet

---

## Suche und Klassifizierung

Die Suche (`Ctrl+K` oder Navigation → Suche) findet Items, deren Nummer, Name,
Beschreibung, Notizen oder Klassifizierung **alle** eingegebenen Wörter enthalten:
„Halter PETG“ findet einen Halter, der in der Beschreibung „PETG“ stehen hat.
Gross-/Kleinschreibung spielt keine Rolle, auch nicht bei Umlauten.
Eine exakt eingegebene Item-Nummer steht immer oben.

Die **Chips** über den Ergebnissen sind ein echter Filter:

- Klick auf eine Klassifizierung zeigt nur Items dieser Klassifizierung — auch ganz
  ohne Suchwort als Liste der Klasse. Zweiter Klick hebt den Filter auf.
- Die Zahl am Chip gilt für das aktuelle Suchwort; Chips ohne Treffer sind blass.
- **ohne** zeigt Items, denen noch keine Klassifizierung zugeordnet ist.
- Gestrichelte Chips sind Werte, die an Items stehen, aber nicht (mehr) in der Liste.

Unter **Einstellungen → PLM** steht bei jeder Klassifizierung, wie viele Items sie
tragen. Umbenennen überträgt den neuen Namen beim Speichern auf alle Items und auf
die Standard-Klassifizierung. Beim Entfernen eines benutzten Eintrags fragt PLM, ob
die Items ihn behalten oder verlieren. Werte, die an Items stehen, aber in der Liste
fehlen, lassen sich mit „＋ übernehmen“ zurückholen. Schreibweisen wie „ kaufteil “
werden beim Speichern auf den Listeneintrag „Kaufteil“ gezogen.

Wie sich die Klassifizierung weiter ausbauen liesse, beschreibt
[KONZEPT-KLASSIFIZIERUNG.md](KONZEPT-KLASSIFIZIERUNG.md).

---

## Angebot als Auftragsphase

Angebot, Auftrag und Produktionsauftrag waren drei Datensätze in drei Listen für
denselben Vorgang. Das Angebot ist jetzt die erste **Phase** eines Auftrags:

```
Angebot ──► Bestätigt ──► Geliefert ──► Fakturiert
   │
   └──► Abgelehnt          Entwurf ──► Bestätigt   (Auftrag ohne vorheriges Angebot)
```

- Ein neuer Vorgang startet wahlweise als **Angebot** oder als **Entwurf**
- In der Phase Angebot druckt der Beleg-Knopf das **Angebots-PDF**, sonst die Rechnung
- „Angebot angenommen“ wechselt die Phase — **keine neue Nummer, kein neuer Datensatz,
  Positionen bleiben stehen**
- „Gültig bis“ erscheint nur in der Angebotsphase

**Migration:** Beim ersten Start wandern bestehende Angebote automatisch in die neue
Form. Sie behalten ihre ANG-Nummer, damit gedruckte Belege zuordenbar bleiben; die
ursprüngliche Nummer steht zusätzlich im Feld `origin_quote_number`. Angebote, die
bereits in einen Auftrag umgewandelt waren, werden übersprungen — ihr Auftrag existiert
ja schon. Die alte Angebotstabelle bleibt als Archiv unverändert liegen.

---

## Produktion im Auftrag

Ein Produktionsauftrag bleibt ein eigener Datensatz mit eigener Nummer — Lieferscheine
und Historie laufen unverändert weiter. Bearbeitet wird er aber im Auftrag:

| Wo | Was |
|---|---|
| Auftrag → Tab **Produktion** | Positionen, Rohmaterial, Druckparameter, Lieferschein, Status |
| Mehrere Produktionsaufträge | als Unterreiter im selben Tab (Teillieferungen bleiben möglich) |
| Navigation **Produktion** | zeigt standardmässig nur **eigenständige** Produktionsaufträge ohne Auftrag |

Der Auftrag gilt erst als geliefert, wenn alle seine Produktionsaufträge geliefert sind.
Produktionsaufträge mit Auftragsbezug tragen in der Produktionsliste die Auftragsnummer
und springen per Klick direkt in den Tab „Produktion“ des Auftrags.

---

## Materialabzug beim Abschliessen

Rohmaterial wird in **Spulen** geführt (`stock_qty`), der Verbrauch fällt in **Gramm**
an. Über `weight_g` (Gewicht einer vollen Spule) rechnet das System um:
1840 g bei einer 1000-g-Spule sind 1.84 Stk.

Wird ein Produktionsauftrag auf „Geliefert" gesetzt, erscheint eine Aufstellung der
Positionen mit zugewiesenem Rohmaterial. Das Gewicht pro Stück kommt in dieser
Reihenfolge:

1. Filamentgewicht, das an der Produktionsposition erfasst wurde
2. `filament_weight_total` aus den Druckparametern des verknüpften Items
3. hinterlegtes Teilgewicht

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
1. Item → "⬇ Auschecken"
   → Dateien in <checkout-pfad>/<item-nummer>/ (kein Zeitstempel → Pfad bleibt konstant)

2. In Solid Edge bearbeiten

3. → "⬆ Einchecken" → Ordner wird gelöscht, Eintrag in der Historie
   (ist die Revision schon geliefert, landen die Dateien in einer neuen Revision)

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

## Begriffe

Damit Oberfläche, Belege und diese Anleitung dieselbe Sprache sprechen. Schreibweise
Schweizer Hochdeutsch (ss statt ß).

| Begriff | Bedeutung | Nicht verwenden |
|---|---|---|
| **Item** | Oberbegriff für Baugruppe, Bauteil und Dokument im PLM | Artikel, Teil (als Oberbegriff) |
| **Baugruppe** (ASM) | Item mit BOM | Assembly |
| **Part** (PRT) | einzelnes Teil; im Fliesstext auch „Bauteil“ | — |
| **Dokument** (DOC) | Item, das nicht gefertigt wird, z. B. Zeichnung | Dok |
| **Item-Nummer** | `0028-asm-001-prt-001` | Teilenummer, Artikelnummer |
| **Revision** | Stand eines Items, geschrieben `rev1`, `rev2` | Rev 1, Version |
| **BOM** / Stückliste | Positionen einer Baugruppenrevision — „BOM“ in Knöpfen und kurzen Beschriftungen, „Stückliste“ als Abschnitts- und Dokumentname | — |
| **Datei** | Datei an einer Revision (CAD, PDF, …) | Dataset |
| **Klassifizierung** | Einordnung eines Items, z. B. Eigenteil, Kaufteil | Klasse, Klassifikation |
| **Verwendung** | in welchen Baugruppen ein Item steckt | Where-Used |
| **Historie** | Protokoll aller Änderungen | Changelog |
| **Status** DFT / REV / REL / ECO / OBS | Entwurf / In Review / Freigegeben / Änderung / Veraltet | Obsolete |
| **fixiert** | fest auf eine Revision gesetzt (Stückliste, gelieferter Stand) | gepinnt |
| **Gelieferter Stand** | die beim Liefern fixierten Revisionen eines Produktionsauftrags | — |
| **Auftrag** | Vorgang mit Phasen Angebot → Bestätigt → Geliefert → Fakturiert | — |
| **Angebot** | erste Phase eines Auftrags (Status „Angebot“) | eigener Angebotsdatensatz |
| **Produktionsauftrag** | Fertigung mit Nummer `LS-…`, eigenständig oder im Auftrag (Tab „Produktion“) | Los, Fertigungslos, Lieferung |
| **Lieferschein** | Ausdruck eines Produktionsauftrags | Druckansicht, Produktionsblatt |
| **Lagerartikel** | Artikel im Lager | Artikel (allein), Item |
| **Lot-Nr.** | Charge eines Rohmaterials | LOT, Lotnummer |
| **Verkaufspreis** (VP) | Preis eines Items | Listenpreis |
| **Sicherung** | Kopie der Datenbank in `data/backups/` | Backup (in der Oberfläche) |
| **anlegen** | einen Datensatz neu erfassen | erstellen (für Datensätze) |
| **erstellen** | ein Dokument oder eine Sicherung erzeugen | generieren |

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
│       ├── files/         ← hochgeladene Dateien (UUID-Namen)
│       ├── backups/       ← Sicherungen der Datenbank (siehe Datensicherung)
│       └── papierkorb/    ← gelöschte Dateien, 30 Tage aufbewahrt
├── frontend/
│   └── public/
│       ├── index.html     ← HTML-Grundstruktur
│       ├── js/            ← Single-Page-App, aufgeteilt nach Domänen
│       │   ├── 01-core.js …  13-normteile-einkauf.js
│       │   ├── 14-qr.js      ← QR-Encoder (eigenständig, keine externe Bibliothek)
│       │   ├── 15-mindmap.js ← Abhängigkeitsgraph (SVG, Pan/Zoom)
│       │   └── (Ladereihenfolge in index.html, gemeinsamer globaler Scope)
│       └── styles.css     ← Design-System (Dark Theme, kontraststarke Palette)
├── plm.config             ← Konfiguration dieses PCs: data_dir, port, cad_path, prusaslicer, bambustudio, crealityprint (wird auto-erstellt)
├── ANLEITUNG.md           ← Bedienungsanleitung (Deutsch)
├── START-PLM.bat          ← Starter für Windows
├── VERKNUEPFUNG-ERSTELLEN.bat ← legt die Desktop-Verknüpfung mit Logo an (Windows)
├── PLM-ERP.ico            ← Logo als Windows-Symbol für die Verknüpfung
└── README.md
```

---

## Sicherheit

PLM hat keine Anmeldung: Wer die Oberfläche erreicht, darf alles. Der Server lauscht auf
Port 3000 (oder dem gemerkten Ausweich-Port) aller Netzwerkschnittstellen. Ob andere
Geräte herankommen, entscheidet die Firewall des PCs.

- Anfragen fremder Webseiten (fremder Origin oder Host) werden abgewiesen, es gibt keine CORS-Freigabe.
- CAD, Slicer und „Ordner öffnen“ starten ohne Shell und nur für Anfragen vom PC selbst.
  Programmpfade stehen in `plm.config`, nicht in der Oberfläche.
- Check-in und Import arbeiten nur im Checkout-Verzeichnis, und dieses lässt sich nur am PC ändern.
- Paketlücken prüfen: `cd backend && npm audit --omit=dev`

Die Benutzer (Einstellungen → Benutzer) dienen der Nachvollziehbarkeit, nicht als Schutz:
gewählt wird ohne Passwort; jede Person kann ihre Kachel mit einer PIN schützen. Details und Grenzen in
[KONZEPT-BENUTZERVERWALTUNG.md](KONZEPT-BENUTZERVERWALTUNG.md).

---

## Update einspielen

Am einfachsten in PLM selbst: Klick auf die Version unten in der Navigation (blauer Punkt)
→ **Jetzt installieren**. PLM holt den neuen Stand (`git merge --ff-only` bzw. die ZIP von
GitHub), führt bei geänderten Paketen `npm install` aus und startet neu; die Seite lädt
sich danach selbst neu. Das geht nur am PC, auf dem PLM läuft, und im Git-Checkout nur ohne
eigene, nicht committete Änderungen. Schlägt etwas fehl, läuft die bisherige Version weiter.
Gestartet über `START-PLM.bat` oder `start-plm.sh`, startet das Skript PLM neu (Exit-Code 75);
sonst startet PLM sich selbst und löst den alten Prozess ab.

Von Hand:

```bash
git pull
cd backend && npm install     # nur nötig wenn Pakete dazugekommen sind
node server.js
```

Datenbank und `plm.config` liegen ausserhalb des Repositories und stehen in der
`.gitignore` — ein Pull fasst sie nicht an.

Welche Version läuft, steht unten in der Navigation unter den Einstellungen und auf dem Startbildschirm:
`2.0.282` = Major.Minor aus `backend/package.json`, dahinter die Anzahl Commits.
Der Punkt an der Version: blau = Update verfügbar, grün = aktuell, grau = Stand unbekannt
(offline oder GitHub nicht erreichbar — der Grund steht im Tooltip). „geändert“ (Startbildschirm, Dashboard, Tooltip der Version) heisst,
PLM wurde mit Änderungen gestartet, die noch nicht committet sind — dann geht „Jetzt installieren“ nicht.

**Kopie aus dem ZIP-Download (ohne Git):** GitHub trägt beim Download Commit und Datum in
`backend/version.json` ein (`export-subst` in `.gitattributes`). Damit fragt PLM bei GitHub nach,
ob es Neueres gibt, und holt von dort auch die Versionsnummer — ohne Internet steht statt der
Nummer der Commit da. Aktualisieren: „Jetzt installieren“ wie oben — oder von Hand PLM beenden, neue ZIP
herunterladen, ihren Inhalt über den PLM-Ordner kopieren und neu starten. Daten und `plm.config` bleiben dabei erhalten.

Beim Start prüft PLM, ob auf dem Git-Remote neuere Commits liegen (`git fetch` im
Hintergrund, ab dem laufenden Commit). Gibt es welche, zeigt der Startbildschirm eine
Zeile „Update“ mit der neuen Versionsnummer, und an der Version in der Navigation steht ein
blauer Punkt (Klick zeigt die neuen Commits und „Jetzt installieren“). Installiert wird
nur auf Klick — PLM läuft mit
dem bisherigen Stand ganz normal weiter; im Betrieb prüft die Oberfläche alle 30 Minuten
nach. Die Prüfung fragt nie nach Passwort oder Passphrase: bei SSH-Remotes braucht es
einen Schlüssel ohne Passphrase oder einen laufenden SSH-Agent. Ist das Remote nicht
erreichbar, zählt der Stand vom letzten Abruf; ohne Git oder ohne Upstream-Branch bleibt es still.

Schemaänderungen laufen beim Serverstart automatisch: `initDb()` legt **zuerst**
eine Tageskopie unter `data/backups/` an, `applySchema()` ergänzt dann fehlende Tabellen
und Spalten und schreibt die Datei zurück. Der Vorgang ist idempotent, ein zweiter
Start ändert nichts mehr. Dasselbe läuft nach dem Wiederherstellen einer Sicherung,
damit auch ein älterer Stand das aktuelle Schema bekommt.

Neue Einstellungen (Freigabe-Workflow, Standard-Klassifizierung) starten auf den
bisherigen Werten — es ändert sich nichts, bis du sie umstellst.

Nach einem Update, das die Farbpalette betrifft, einmal
**Einstellungen → Daten → Design zurücksetzen** drücken: die Farben der
Klassifizierungen liegen in der Datenbank und ziehen sonst nicht mit. Namen und
Reihenfolge bleiben dabei erhalten.

---

## Datensicherung

Alles unter **Einstellungen → Daten → Datensicherung**, im laufenden Betrieb — ein
Neustart ist nicht nötig.

| Art | Name in `data/backups/` | Aufbewahrung |
|---|---|---|
| täglich, beim Serverstart | `plm-JJJJ-MM-TT.db` | die letzten 14 |
| „💾 Jetzt sichern“ | `plm-JJJJ-MM-TT_HHMMSS-manuell.db` | bis du sie löschst |
| vor jedem Wiederherstellen | `plm-JJJJ-MM-TT_HHMMSS-vor-wiederherstellung.db` | bis du sie löschst |

**Wiederherstellen:**

1. In der Liste bei der gewünschten Sicherung „Wiederherstellen“ klicken. Der Dialog
   zeigt die Kennzahlen jetzt gegen die Sicherung (Projekte, Items, Aufträge, …).
2. PLM sichert zuerst den jetzigen Stand („vor Wiederherstellung“) — du kannst also zurück.
3. Die Datenbank wird getauscht und auf das aktuelle Schema gebracht.
4. Gelöschte Dateien, auf die die Sicherung noch verweist, holt PLM aus dem
   **Papierkorb** zurück. Fehlt eine Datei trotzdem, nennt der Abschlussdialog sie.

Über **„⬆ Aus Datei wiederherstellen…“** geht dasselbe mit einer `.db`-Sicherung oder
einem **Gesamtexport** (`.zip` mit `plm.db` und `files/`). Beim ZIP werden fehlende
Dateien gleich mit eingespielt; vorhandene Dateien bleiben unberührt.

**Papierkorb:** Gelöschte Dateien (Datei an einer Revision, Projektdokument,
Normteil-Datei, gelöschtes Item) landen in `data/papierkorb/` und werden nach 30 Tagen
beim Serverstart endgültig entfernt.

**Export:** **Einstellungen → Daten → Gesamtexport** lädt `plm.db` + `files/` als ZIP;
„Export mit Klarnamen“ legt die Dateien nach Projekt/Item/Revision ab (zum Lesen,
nicht zum Wiederherstellen der Dateien).

---

## Tests

```bash
cd backend
npm test
```

49 Tests in fünf Dateien:

| Datei | Inhalt |
|---|---|
| `test/smoke.test.js` | Aufträge, Preis-Sync Auftrag ↔ Produktion, Lagerbuchungen, Backups |
| `test/workflow.test.js` | Projektfarben, Klassifizierungs-Ableitung, 3MF-Druckparameter, Revisionsfixierung, einfacher Workflow, Normteil-Einkauf, Materialabzug, Angebotsphase, Kundenlöschung |
| `test/revisionen.test.js` | gelieferter Stand (Fixieren, Sperre, Lösen, Korrektur, Check-in), Revisionsvergleich, ECO-Übernahme, Suche mit Klassifizierung, Umbenennen von Klassifizierungen |
| `test/backup.test.js` | Sicherung anlegen, wiederherstellen (Liste, `.db`, ZIP), Papierkorb, Schema-Update älterer Sicherungen |
| `test/frontend.test.js` | QR-Encoder (gegen die ISO-Referenzwerte), URL-Absicherung, Datenblatt, Stücklisten-Revisionsanzeige, Mindmap-Layout, Workflow-Umschaltung, Revisionskennzeichen in der Produktion, Revisionsvergleich |

Die Server-Tests starten jeweils einen eigenen Server (eigener Port) mit einer leeren
Wegwerf-Datenbank; `frontend.test.js` prüft reine Funktionen des Frontends ohne Server
und ohne Browser.
