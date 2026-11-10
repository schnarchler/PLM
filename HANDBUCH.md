# PLM & ERP — Handbuch

> Nur das Wichtigste auf einer Seite: **[Schnellstart](SCHNELLSTART.md)**

Dieses Handbuch erklärt die Bedienung von PLM & ERP. **Kapitel 3 „Erste Schritte“** führt einmal
durch den ganzen Ablauf, vom ersten Projekt bis zur Rechnung. Die übrigen Kapitel beschreiben die
einzelnen Bereiche zum Nachschlagen. Was sich nicht findet, steht meist unter
**[24. Häufige Fragen](#24-häufige-fragen)** oder in den **[Begriffen](#25-begriffe)**.

Knöpfe und Felder sind **fett** geschrieben, so wie sie in der Oberfläche heissen.
`A → B` bedeutet: zuerst A anklicken, dann B.

---

## Inhaltsverzeichnis

1. [Überblick](#1-überblick)
2. [Programmstart](#2-programmstart)
3. [Erste Schritte](#3-erste-schritte)
4. [Oberfläche](#4-oberfläche)
5. [Dashboard](#5-dashboard)
6. [PLM — Projekte & Items](#6-plm--projekte--items)
7. [Normteile](#7-normteile)
8. [Freigabe-Workflow](#8-freigabe-workflow)
9. [Checkout / Check-in](#9-checkout--check-in)
10. [Angebote & Kostenkalkulation](#10-angebote--kostenkalkulation)
11. [Aufträge](#11-aufträge)
12. [Produktion](#12-produktion)
13. [Rohmaterial](#13-rohmaterial)
14. [Kunden](#14-kunden)
15. [Lager](#15-lager)
16. [Einkauf / Bestellwesen](#16-einkauf--bestellwesen)
17. [Kalkulation](#17-kalkulation)
18. [Suche](#18-suche)
19. [Historie & Verlauf](#19-historie--verlauf)
20. [Einstellungen](#20-einstellungen)
21. [Datensicherung](#21-datensicherung)
22. [Update einspielen](#22-update-einspielen)
23. [Tastaturkürzel](#23-tastaturkürzel)
24. [Häufige Fragen](#24-häufige-fragen)
25. [Begriffe](#25-begriffe)
26. [Nummernkreise](#26-nummernkreise)

---

## 1. Überblick

PLM & ERP ist ein lokales System zur Verwaltung von Konstruktionsprojekten und Geschäftsvorgängen. Es läuft vollständig im eigenen Netzwerk — ohne Internet oder Cloud-Abhängigkeit.

**PLM** verwaltet: Projekte und Items (Baugruppen, Parts, Dokumente), Revisionen, Stücklisten, Dateien, Zeiten, Normteile, Varianten, Änderungsanträge.

**ERP** verwaltet: Kunden, Angebote mit Kalkulation, Aufträge, Produktion, Lager, Rohmaterial, Einkauf/Bestellwesen.

### So hängt alles zusammen

```
PLM                                   ERP
───                                   ───
Projekt                               Kunde
 └─ Item (Part / Baugruppe)            └─ Auftrag
     └─ Revision (rev1, rev2 …)            Phase Angebot ──► Bestätigt ──► Geliefert ──► Fakturiert
         ├─ Dateien (CAD, PDF …)               │
         ├─ Stückliste                         └─ Produktionsauftrag (LS-…)
         └─ Freigabe (DFT → REL)                   ├─ verbraucht Rohmaterial (Lot)
                                                   └─ hält fest, welche Revision geliefert wurde
```

Ein Item wird im PLM konstruiert und freigegeben. Im ERP wird es in Angebote und Aufträge
übernommen, in der Produktion gefertigt und geliefert. PLM merkt sich dabei, welcher Kunde
welche Revision bekommen hat.

---

## 2. Programmstart

**Windows:** Doppelklick auf `START-PLM.bat`.

**Linux:**
```bash
cd PLM && bash start-plm.sh
```

**Desktop-Icon:** Unter Windows einmal `VERKNUEPFUNG-ERSTELLEN.bat` ausführen — danach liegt auf dem Desktop die Verknüpfung **PLM & ERP** mit dem Logo. Nach dem Verschieben des PLM-Ordners nochmals ausführen. Unter Linux: Doppelklick auf `PLM-ERP`.

Beim ersten Start installiert PLM die nötigen Pakete selbst; das dauert einmalig etwas länger.
Fragt Windows „Der Herausgeber konnte nicht verifiziert werden“, siehe [24. Häufige Fragen](#24-häufige-fragen).

### Startbildschirm

Nach dem Start öffnet sich im Browser der Startbildschirm mit **Server läuft**, der Version
und dem Datenordner. **PLM & ERP öffnen** (oder **Enter**) öffnet die Anwendung. Steht dort
eine Zeile **Update**, gibt es eine neuere Version (siehe 22).

### Von anderen PCs zugreifen

PLM läuft auf einem PC und ist im ganzen lokalen Netz erreichbar. Auf einem anderen PC im
Browser eingeben:

```
http://<Name-oder-IP-des-PLM-PCs>:3000
```

`3000` ist der Standard. War der Port beim Start belegt, nimmt PLM den nächsten freien und merkt
ihn sich — die Adresse steht dann in der Adresszeile des Browsers auf dem PLM-PC.

> Einige Dinge gehen nur am PLM-PC selbst: Checkout-Verzeichnis ändern, Update installieren,
> CAD-Programm und Slicer starten. Die Dateien eines Checkouts liegen ebenfalls dort.

**Server beenden:** Oben rechts → **■ Beenden**. Bei aktiven Checkouts wird gefragt ob zuerst eingecheckt werden soll. Danach ist PLM für alle im Netz geschlossen.

### Daten auf einem Netzlaufwerk (mehrere PCs)

Statt von anderen PCs per Browser zuzugreifen, können die Daten auch auf einem Netzlaufwerk
liegen (NAS, Freigabe, unterwegs über VPN) und PLM auf jedem PC selbst laufen. Dann checkt
jeder PC in seinen eigenen, lokalen Ordner aus — das CAD arbeitet mit lokalen Dateien.

1. Auf jedem PC in `plm.config` den Datenordner eintragen, so wie er auf diesem PC heisst,
   z. B. `data_dir=Z:\PLM-Daten` oder `data_dir=/mnt/nas/plm-daten`.
2. Auf jedem PC einmal das **Checkout-Verzeichnis** setzen (siehe 9). Es gilt nur für diesen PC.

Mit den Daten arbeitet immer nur **ein** PLM zur Zeit — jedes hält die Datenbank im Speicher und
schreibt sie als Ganzes zurück, ein zweites würde Änderungen überschreiben. Welches PLM die Daten
gerade hat, steht in `plm.lock` im Datenordner:

- **Start, während PLM auf einem anderen PC noch läuft:** Im Browser erscheint **Die Daten sind in
  Benutzung** mit dem Namen des PCs. **Übernehmen**, wenn dort niemand mehr arbeitet — oder
  **PLM hier beenden**.
- **Am anderen PC** erscheint bei der nächsten Aktion **PLM arbeitet jetzt woanders**; dort wird
  nichts mehr gespeichert. **Hier weiterarbeiten** lädt den aktuellen Stand und holt die Daten
  zurück — PLM muss dafür nicht neu gestartet werden.
- **PC ausgeschaltet oder im Ruhezustand, ohne PLM zu beenden:** Nach 10 Minuten ohne Lebenszeichen
  gilt die Sperre als verwaist; ein Start auf einem anderen PC übernimmt dann ohne Rückfrage.
- **Ausgecheckte Dateien** liegen auf dem PC, auf dem ausgecheckt wurde. Vor dem Wechsel einchecken,
  sonst arbeitet der andere PC mit dem alten Stand. Damit das nicht vergessen geht, sehen alle PCs,
  was wo ausgecheckt ist (siehe 9); der Dialog beim Übernehmen nennt es ebenfalls.

Ändert etwas `plm.db` an PLM vorbei (z. B. ein Sync-Programm), überschreibt PLM die Datei nicht:
Es meldet **Daten von aussen geändert** und speichert nichts mehr. Was noch nicht gespeichert war,
liegt als Sicherung „nicht gespeichert“ vor (siehe 21).

**Netzlaufwerk nicht verbunden:** Fehlt der eingetragene Datenordner oder liegt darin keine
Datenbank, legt PLM nicht still eine neue, leere an. Im Browser erscheint **Datenordner nicht
gefunden** (bzw. **Keine Datenbank im Datenordner**): Laufwerk verbinden (NAS, VPN) und **Erneut
versuchen**. **Neue Datenbank anlegen** nur, wenn wirklich neu begonnen werden soll. Ein leerer
Ordner gilt als neu eingerichtet — dort legt PLM die Datenbank wie gewohnt selbst an.

**Unterschiedliche PLM-Versionen:** Jeder PC aktualisiert PLM für sich (siehe 22). Die Datenbank
merkt sich, mit welchem Stand sie zuletzt geöffnet wurde. Startet ein älterer, erscheint **Daten
von einem neueren PLM**: zuerst **Aktualisieren…**, nur im Notfall **Trotzdem öffnen** — ein
älterer Stand kennt die Umstellungen des neueren nicht.

> **Netzlaufwerk statt Sync-Ordner.** Proton Drive, OneDrive & Co. gleichen mit Verzögerung ab —
> die Sperre kommt dann womöglich zu spät an. Wer trotzdem einen Sync-Ordner nutzt: PLM am alten
> PC beenden und mit dem Start am anderen warten, bis alles abgeglichen ist.

---

## 3. Erste Schritte

Dieses Kapitel führt einmal durch den ganzen Ablauf. Wer es durcharbeitet, kennt die wichtigsten
Funktionen. Details stehen jeweils im verlinkten Kapitel.

### 3.1 Einmalig einrichten

1. **Firma eintragen:** Einstellungen → **Firma** → Name, Adresse, UID, Bankverbindung, optional
   **Logo hochladen…** → **💾 Speichern**. Diese Angaben stehen auf Angeboten, Rechnungen,
   Lieferscheinen und Bestellungen.
2. **Kalkulation:** Einstellungen → **Kalkulation** → Stundenansatz (CHF/h), MwSt.,
   Zahlungsbedingungen, Angebotsgültigkeit.
3. **3D-Druck** (falls genutzt): Einstellungen → **3D-Druck** → **+ Drucker hinzufügen**
   (mit CHF/h), **+ Düse hinzufügen**.
4. **Personen:** Einstellungen → **Benutzer** → eigenen Namen eintragen. Arbeiten mehrere Personen
   mit PLM, jede Person anlegen und eine Rolle geben (siehe 20, Benutzer).
5. **Checkout-Verzeichnis** (falls mit CAD gearbeitet wird): Einstellungen → **Daten** →
   **Checkout-Verzeichnis** → **Pfad speichern** (siehe 9). Gilt nur für diesen PC.
6. **Freigabe-Workflow wählen:** Einstellungen → **PLM** → **Mit Freigabe** (Standard) oder
   **Ohne Freigabe** (siehe 8).

### 3.2 Erstes Projekt und erstes Part

1. Navigation → **Projekte** → **+ Projekt**
2. **Bezeichnung** eingeben, optional Kunde, Farbe und Beschreibung → speichern.
   Das Projekt bekommt automatisch eine Nummer, z. B. `0001`.
3. Projekt anklicken → **+ Part**
4. **Bezeichnung** eingeben (Pflicht), optional Beschreibung, Quelle / Download-Link und
   Verkaufspreis → speichern.
5. Das Part öffnet sich rechts. Es hat die Nummer `0001-prt-001`, die erste Revision **rev1** im
   Status **DFT** (Entwurf) und einen **Kurzcode** (z. B. `XHJ`).

### 3.3 Dateien und Gewicht

1. Im Part → Tab **Revisionen** → **+ Datei**
2. Dateien ins Feld ziehen oder auswählen (mehrere gleichzeitig möglich). PLM benennt sie
   einheitlich um, z. B. `0001-prt-001_rev1_001.stl`, und erkennt den Dateityp selbst
   (STL/3MF/STEP → CAD, `.gcode` → GCODE, PDF, Bild …).
3. Eine hochgeladene **3MF** liefert automatisch die Druckparameter (Schichthöhe, Füllung,
   Temperaturen …).
4. **Gewicht** in Gramm eintragen: Tab **Datenblatt** → **Allgemein** → **✏** neben Gewicht. Es wird für die Preiskalkulation gebraucht.
   Gewicht und Preis gelten für die gewählte Revision (siehe 6.9).

### 3.4 Freigeben

1. Im Tab **Revisionen** unten im Bereich **Freigabe-Workflow** → **✓ Freigeben**
2. Ist der Knopf gesperrt, steht darüber „Für die Freigabe fehlt noch: …“ — z. B. eine Datei
   oder das Gewicht. Das ergänzen, dann freigeben.
3. Die Revision ist jetzt **REL** (freigegeben) und gesperrt. Änderungen gehen ab hier über
   **⚡ ECO starten** in eine neue Revision (siehe 8).

### 3.5 Kunde und Angebot

1. Navigation → **Kunden** → **+ Kunde** → Name / Firma, Adresse → speichern
2. Navigation → **Aufträge** → **+ Angebot**
3. Bezeichnung und Kunde eingeben → speichern
4. **+ Position** → **PLM-Item verknüpfen** (Item-Nummer oder Name suchen), Menge eingeben.
   Mit Rohmaterial, Arbeitszeit und Druckzeit rechnet PLM einen Preis vor →
   **Als Preis übernehmen** (siehe 10).
5. **📄 Angebot PDF** → im Browser drucken oder als PDF speichern und dem Kunden senden.

### 3.6 Auftrag, Produktion, Lieferung, Rechnung

1. Kunde sagt zu → im Auftrag **✓ Angebot angenommen**. Nummer und Positionen bleiben, die Phase
   wechselt auf **Bestätigt**.
2. **🔧 Produktionsauftrag anlegen** → der Produktionsauftrag (`LS-…`) erscheint im Tab
   **Produktion** des Auftrags. Dort Rohmaterial und Drucker je Position eintragen.
3. Gefertigt → Status des Produktionsauftrags auf **Geliefert**. PLM schlägt vor, das verbrauchte
   Rohmaterial abzubuchen (**Abbuchen** oder **Nicht abbuchen**) und hält die gelieferte
   Revision fest. **📄 Lieferschein** druckt den Lieferschein.
4. Sind alle Produktionsaufträge geliefert, steht der Auftrag auf **Geliefert**.
5. **📄 Rechnung PDF** → danach fragt PLM, ob der Auftrag **als fakturiert markiert** werden soll.

Damit ist der Ablauf einmal komplett durchlaufen.

---

## 4. Oberfläche

```
┌──────────────────────────────────────────────────────────────────┐
│  Logo  │  Suchfeld (Ctrl+K)  │ 💬 │ Name │ CAD │ ⬆ │ Beenden │  ← Topbar
├────────┼─────────────────────────────────────────────────────────┤
│        │  Listenbereich                       │ Detail            │
│  Nav   │  (links)                             │ (rechts)          │
└────────┴─────────────────────────────────────────────────────────┘
```

- **Navigation links:** Klick wechselt den Bereich. Die Zahlen neben den Einträgen zeigen die Anzahl.
- **Listenbereich:** Alle Einträge des aktiven Bereichs. Manche Bereiche haben oben Tabs:
  **Historie** (PLM / ERP), **Lager** (Artikel / Rohmaterial), **Aufträge** (Aufträge / Kalkulation)
- **Detailbereich:** Tabs mit Informationen des gewählten Eintrags — mit **Escape** schliessen
- **Zuletzt geöffnet:** Zuletzt geöffnete Items und Belege unten in der Navigation. Ein Klick auf
  die Überschrift klappt die Liste ein oder aus.
- **Version:** ganz unten in der Navigation; ein blauer Punkt heisst „Update verfügbar“ (siehe 22)

**Topbar rechts:**

| Knopf | Funktion |
|---|---|
| 💬 | Fehler melden oder Idee einreichen (ab zwei Personen, siehe 20) |
| Name | Wer gerade arbeitet; Klick wechselt die Person (ab zwei Personen) |
| **🖥 CAD** | Startet das CAD-Programm (siehe 20, Daten) |
| **⬆ Checkouts** | Übersicht aller ausgecheckten Items (siehe 9) |
| **■ Beenden** | Server beenden |

**Hilfe in der Oberfläche:** Ein **?** neben einem Feld zeigt beim Überfahren eine kurze Erklärung.

---

## 5. Dashboard

Das Dashboard zeigt nur, was offen ist. Ganz oben steht der **Umsatz** des laufenden Monats und
gesamt. Darunter folgen die Bereiche — ein Bereich ohne offene Einträge wird nicht angezeigt:

| Bereich | Inhalt |
|--------|-----------|
| **Rückmeldungen** | Offene Fehlermeldungen und Ideen (nur Admins, siehe 20) |
| **Produktion** | Offene Produktionsaufträge mit Lieferdatum |
| **Aufträge** | Aufträge im Entwurf oder bestätigt |
| **Angebote** | Aufträge in der Phase Angebot, mit „Gültig bis“ |
| **Zur Freigabe** | Revisionen in Review (REV) |
| **Änderungen** | Offene Änderungsanträge |
| **Lager nachbestellen** | Lagerartikel am oder unter dem Mindestbestand |

- Ein Klick auf eine Zeile öffnet den Eintrag, **Liste →** (bzw. **alle … →** bei mehr als acht) den ganzen Bereich.
- Fristen stehen direkt in der Zeile: „fällig in 5 T.“, „läuft in 3 T. ab“. **Rot** = überfällig bzw. abgelaufen, **gelb** = in den nächsten drei Tagen.
- Ganz unten: Kennzahlen zur **Datenbank** (Anzahl Projekte, Teile, Aufträge …, letzte Sicherung, PLM-Version).
- **↺** oben lädt das Dashboard neu.

---

## 6. PLM — Projekte & Items

### 6.1 Projekte

Projekte sind die oberste Organisationsebene mit automatischer Nummer (z.B. `0028`).

**Anlegen:** Navigation → **Projekte** → **+ Projekt** → Bezeichnung (Pflicht), Kunde, Farbe,
Beschreibung. **Ändern:** Projekt öffnen → **Bearbeiten**.

**Projektliste:**
- **Nr.** / **A–Z** sortiert nach Nummer oder Name
- **☰** zeigt die Projekte als Liste, **▦** als Kacheln
- **📌** heftet ein Projekt oben an; nochmals klicken löst es
- **Projektfarbe:** erscheint als Streifen in der Liste, färbt die Nummernkachel und markiert das offene Projekt im Pfad oben

**Projektdetails:**
- **Info** — Name, Kunde, Beschreibung
- **Struktur** — Baumansicht aller Items
- **Dokumente** — Projektdokumente
- **Log** — Historie des Projekts

**Löschen:** Ein leeres Projekt über **Löschen**. Projekte mit Inhalt nur unter **Einstellungen → Admin**.

**Alle Teile:** Navigation → **Teile** listet alle Parts, Baugruppen und Dokumente aus allen
Projekten, nach Nummer sortiert, mit Kurzcode, Projekt und Status. Das Feld oben filtert nach
Nummer, Name, Kurzcode, Projekt oder Klassifizierung; die Knöpfe daneben nach Typ. **Nr.** / **A–Z**
oben sortiert nach Nummer oder Name. Ein Klick öffnet das Teil rechts.

### 6.2 Items anlegen

| Was | Wo |
|---|---|
| Baugruppe, Part, Dokument im Projekt | Projekt öffnen → **+ Baugruppe** / **+ Part** / **+ Dokument** |
| Aus der Liste aller Teile | **Teile** → **+ Teil** → **Projekt** wählen (Pflicht, die Nummer hängt am Projekt). Vorgeschlagen wird das Projekt des offenen Teils, sonst das zuletzt gewählte |
| Unterbaugruppe oder Part in einer Baugruppe | Baugruppe öffnen → Tab **Revisionen** → **+ Unterbaugruppe**; im Dialog lässt sich der **Typ** auf Part umstellen |

Pflicht ist nur die **Bezeichnung**. Jedes neue Item bekommt eine Nummer (siehe 6.3), die erste
Revision im Status DFT und einen Kurzcode (siehe 6.8).

> Ein Teil, das in einer Baugruppe angelegt wird, steht damit noch **nicht** in deren Stückliste.
> In die Stückliste kommt es über **+ Position hinzufügen** (siehe 6.10).

**Ändern:** Item öffnen → **✏ Bearbeiten** (Name, Beschreibung, Quelle, Klassifizierung, Eigenschaften).
Die **Beschreibung** gehört zur Revision: Sie gilt für die gewählte Revision, die anderen behalten ihren Text. Eine neue Revision übernimmt den Text der vorherigen. Mit **✏** neben der Beschreibung im Datenblatt lässt sie sich in jeder Revision ändern, auch wenn diese freigegeben ist. Die Änderung steht in der Historie.
**Verschieben:** **↪** im Titel → **Zielprojekt** wählen → **Verschieben**. Die Nummer passt sich dem neuen Projekt an.
**Löschen:** Tab **Revisionen** → **🗑 Item löschen**. Freigegebene oder gelieferte Items nur unter **Einstellungen → Admin**.

### 6.3 Nummernschema

```
Projekt:           0028
Baugruppe:         0028-asm-001
Part in BG:        0028-asm-001-prt-001
Part im Projekt:   0028-prt-001
Dokument:          0028-doc-001
```

Die Nummern der ERP-Belege stehen unter [26. Nummernkreise](#26-nummernkreise).

### 6.4 Item-Typen

| Symbol | Typ | Beschreibung |
|--------|-----|-------------|
| 📦 | **ASM** | Baugruppe — enthält andere ASM und PRT |
| 🔩 | **PRT** | Part / Einzelteil |
| 📄 | **DOC** | Dokument (Zeichnung, Spezifikation) |

### 6.5 Item-Detailansicht

| Tab | Inhalt |
|---|---|
| **Datenblatt** | Alles Wichtige auf einen Blick (siehe 6.6) |
| **Revisionen** | Revisionen, Dateien, Stückliste, Freigabe |
| **Historie** | Alle Änderungen an diesem Item |
| **Zeiten** | Erfasste Arbeitszeit (siehe 6.14) |
| **Verwendung** | In welchen Baugruppen das Item steckt (siehe 6.12) |
| **Aufträge** | Produktionsaufträge und gelieferte Stände (siehe 12.3) |
| **Varianten** | Verknüpfte Ausführungen (siehe 6.15) |

**Revisionen-Tab:**
- Verkaufspreis (VP) und Gewicht der gewählten Revision direkt inline editierbar
- Revisionen als Reiter — 🚚 kennzeichnet gelieferte Revisionen (siehe 12.3)
- **⇄ Revisionen vergleichen** — zwei Revisionen gegenüberstellen (siehe 6.18)
- Stückliste (BOM) mit PLM-Items und Normteilen
- Dateien: CAD, PDF, Bilder, GCode — **+ Datei** lädt hoch, **✏️** ändert die Beschreibung, **✕** löscht
- Freigabe-Workflow (siehe 8)
- **Revision löschen** — nur für eine Revision im Entwurf, die nicht geliefert ist

**Schaltflächen im Titel** (rechts):
- **✏** — Name, Beschreibung, Quelle, Klassifizierung und Eigenschaften bearbeiten (solange keine Revision freigegeben ist)
- **↪** — Item in ein anderes Projekt verschieben
- **⇄** — Dieses Item mit einem anderen Item vergleichen

**Revisionen im Projektbaum:** Hat ein Item mehr als eine Revision, lässt es sich im Baum links mit **▶** aufklappen — wie eine Baugruppe. Jede Revision steht mit Status, Gewicht und Preis darunter; ein Klick öffnet das Item in genau dieser Revision. Bei Baugruppen stehen die Revisionen über der Stückliste.

**Vorschaubilder:** In Projektbaum, Stückliste und Suche erscheint ein Vorschaubild, wenn man kurz mit der Maus auf der Zeile verweilt. PLM zeichnet dafür die STL oder STEP der neusten Revision isometrisch, wie die 3D-Vorschau. Bei Parts geht die STL vor, bei Baugruppen die STEP — sie zeigt die Baugruppe zusammengebaut, eine 3MF meist nur die Teile verteilt auf dem Druckbett. Ohne STL und STEP dient das Bild aus einer Slicer-3MF oder ein hochgeladenes Bild (PNG, JPG) als Vorschau.

**3D-Vorschau:** Im Datenblatt und in der Revision lassen sich STL- und STEP-Dateien (`.stp`, `.step`) drehen und zoomen. Eine STEP wandelt PLM beim ersten Öffnen einmal in ein Dreiecksnetz um — bei grossen Baugruppen dauert das ein paar Sekunden, danach geht es sofort. Für eine Baugruppe genügt der STEP-Export aus Solid Edge, eine zusätzliche STL ist nicht nötig.

### 6.6 Datenblatt

Der Tab **Datenblatt** zeigt Beschreibung, Quelle, Kennzahlen (Gewicht, Preis), Druckparameter,
eine Kurzfassung der Stückliste, den Lagerbestand und die letzte Änderung.

- **QR-Code** der Item-Nummer oben rechts — ein Klick zeigt ihn gross
- **Kurzcode** mit Revision, z. B. `XHJ-1` — **⧉** kopiert ihn (siehe 6.8). Daneben die gewählte
  Revision mit Status (z. B. `rev1 · DFT`) und, falls ausgecheckt, der Checkout-Ordner.
  Revisionstext, ECO-Grund und Freigabe stehen im Tab **Revisionen**.
- **Im Slicer öffnen** — öffnet das Modell der Revision im Slicer (siehe 20, 3D-Druck)
- **Notizen** — freies Textfeld für alles, was nicht in die Beschreibung gehört (Bezugsquellen,
  Erfahrungen, offene Punkte). Wird beim Verlassen des Feldes gespeichert.

### 6.7 Hinweise

**⚠ Hinweis hinzufügen** (unter den Notizen im Datenblatt) — wichtige Hinweise, die rot über den
Tabs des Teils stehen, auf dem Datenblatt und auf dem Prüfprotokoll:

| Hinweis | Erscheint |
|---|---|
| **Konstruktionshinweis** | nur intern, nicht im Produktionsauftrag — z. B. „Nicht für tragende Anwendungen“ |
| **Fertigungshinweis** | intern und im Produktionsauftrag — z. B. „Nur mit PETG drucken“ |
| **Kundenhinweis** | im Produktionsauftrag und auf dem Lieferschein — z. B. „Max. 60 °C“ |

Ein leeres Feld entfernt den Hinweis.

### 6.8 Kurzcode

Jedes Part und jede Baugruppe bekommt automatisch einen kurzen Code aus drei bis vier Zeichen,
z. B. `XHJ`. Er ist zum **Aufdrucken auf das Teil** gedacht: im Slicer mit dem Textwerkzeug,
am besten vertieft auf der Unterseite, mindestens 3 mm hoch.

Hinter dem Strich steht die Revision: `XHJ-1` = rev1. Bei einer neuen Revision nur die Zahl anpassen.

Wer den Kurzcode in die Suche eingibt (auch per Barcode-Scanner), landet direkt beim Teil in
dieser Revision (siehe 18). Dokumente haben keinen Kurzcode.

### 6.9 Gewicht

Das Gewicht eines Parts wird im Tab **Datenblatt** unter **Allgemein** mit **✏** eingetragen (in Gramm), ebenso der Verkaufspreis. Bei einer Baugruppe steht neben dem Preis **BOM … übernehmen**, um die Summe der Stückliste als Preis zu setzen. Es wird für die automatische Materialkostenkalkulation in Angeboten verwendet.

Gewicht und Verkaufspreis gehören zur **Revision**. Eine neue Revision (auch über ECO oder Check-in) übernimmt beide Werte der bisherigen; danach lassen sie sich in der neuen Revision ändern, ohne dass die alte ihren Wert verliert — z. B. wenn ein optimiertes Teil leichter wird. Das **Gewicht** ist nur in der aktuell offenen Revision änderbar: der neusten, solange sie nicht in Review, freigegeben, veraltet oder geliefert ist. Ältere und gesperrte Revisionen zeigen ihr Gewicht mit 🔒 — ein neues Gewicht kommt dort über eine neue Revision. Der **Verkaufspreis** ist kaufmännisch und bleibt in jeder Revision änderbar. Jede Änderung steht in der Historie mit Revision, alt → neu. Angebote, Aufträge, Listen und Kalkulation verwenden die Werte der aktiven Revision (die freigegebene, sonst die neuste). Der **Revisionsvergleich** zeigt Gewicht und Preis mit.

Bei einer Baugruppe ohne eigenes Gewicht zählt PLM die Stückliste zusammen: Teile und Normteile mit Gewicht, jeweils mal Menge. Positionen ohne Gewicht zählen nicht mit; das Datenblatt sagt, wie viele das sind. Jede Stücklistenzeile zeigt ihr Stückgewicht. Ein eigenes Gewicht an der Baugruppe geht der Summe vor. Das Gewicht eines Normteils steht im Normteil unter **Gewicht pro Stück**.

### 6.10 Stückliste (BOM)

In der aktiven Revision einer Baugruppe:
- **+ Position hinzufügen** → PLM-Item aus dem Projekt suchen. Mehrere Items lassen sich nacheinander
  auswählen und gemeinsam übernehmen.
- **⚙ Normteil** → Normteil aus dem Katalog hinzufügen
- **📐 BOM aus STEP** → Stückliste aus Solid Edge STEP-Export importieren (siehe 6.11)
- **🖨 Drucken** → Stückliste ausdrucken

**Revisionsstand einer Position:** Eine Position verweist auf das Teil, nicht auf eine feste
Revision — sie folgt automatisch der aktuellen. Klick auf das Revisions-Kennzeichen in der Zeile:

| Auswahl | Verhalten |
|---|---|
| **Automatisch** (Standard) | folgt immer der aktiven Revision |
| **Fest auf revN** | bleibt auf diesem Stand, auch wenn neuere Revisionen entstehen — 🔒 |

Gibt es zu einer fixierten Position eine neuere Revision, steht `↑rev2` in Amber daneben.
Typischer Fall: ausgelieferte Geräte, die noch nicht umgerüstet sind. Für Lieferungen an Kunden
fixiert PLM die Revision selbst (siehe 12.3).

### 6.11 BOM aus STEP importieren

1. Baugruppe in Solid Edge → **Datei → Exportieren → STEP AP214**
2. PLM → Baugruppe → BOM → **📐 BOM aus STEP**
3. STEP-Datei hochladen → **📤 Analysieren**
4. Teile werden automatisch per Namensabgleich zugeordnet (✓ = gefunden, ? = manuell zuordnen)
5. **✓ BOM übernehmen**

### 6.12 Verwendung

Tab **Verwendung** in der Item-Detailansicht zeigt alle Baugruppen, in denen dieses Item verbaut ist.

Die Ansicht gruppiert nach Baugruppe: Pro Baugruppe werden alle Revisionen aufgelistet, in denen das Item vorkommt, mit farbigem Status-Chip (DFT / REV / REL / ECO / OBS). Klick auf einen Revisions-Chip öffnet direkt diese Revision in der Detailansicht.

### 6.13 Mindmap

**⌗ Mindmap** im Datenblatt zeigt die Abhängigkeiten als Graph:

```
Baugruppen, die es verwenden  ──►  [ Item ]  ──►  Teile, aus denen es besteht
```

- **Ziehen** verschiebt, **Mausrad** zoomt
- **Klick** stellt die Mindmap auf das angeklickte Teil um, **Doppelklick** öffnet das Item
- Tiefe für beide Richtungen getrennt einstellbar (0–6 Ebenen)
- Normteile erscheinen als Endpunkte, Mengen stehen an den Verbindungen
- Fest fixierte Positionen zeigen ihre Revision in Amber

### 6.14 Zeiten

Tab **Zeiten** → **+ Eintrag**: Stunden direkt eingeben oder **Von** und **Bis** — dann rechnet PLM
die Stunden selbst aus (auch über Mitternacht). Gleich funktioniert der Tab **Zeiten** eines Auftrags.

### 6.15 Variantenverwaltung

Items, die in mehreren Ausführungen existieren (z.B. `Halterung M3`, `Halterung M4`, `Halterung M5`) können als Varianten verknüpft werden.

**Varianten verknüpfen:**
1. Item öffnen → Tab **Datenblatt** → ganz unten **Varianten**
2. **+ Verknüpfen** → anderes Item suchen → verknüpfen
3. Alle verknüpften Items werden als Chips angezeigt

**Zwischen Varianten navigieren:** Klick auf einen Varianten-Chip öffnet direkt dieses Item.

**Variante entfernen:** **Aus Gruppe entfernen** — entfernt nur dieses Item aus der Gruppe, andere bleiben verknüpft.

> Werden zwei bereits bestehende Gruppen verknüpft, werden alle Mitglieder in eine gemeinsame Gruppe zusammengeführt.

### 6.16 Dokumentvorlagen

**📄 Als PDF…** im Datenblatt öffnet das Vorlagen-Modal:

| Vorlage | Inhalt |
|---------|--------|
| **Datenblatt** | Item-Metadaten, Vorschaubild, aktive Revision, Klassifizierung mit Eigenschaften, Gewicht, Verkaufspreis, Hinweise |
| **Stückliste** | BOM der aktiven Revision mit Menge und Einheit |
| **Prüfprotokoll** | Formular mit Prüfpunkten, Unterschriftsfeldern und Datum — Prüfpunkte unter Einstellungen → PLM → Prüfprotokoll |

Klick auf eine Vorlage öffnet ein Druckfenster im Browser → **Drucken** oder **Als PDF speichern**.

### 6.17 Itemvergleich

**⇄** (Vergleich-Symbol im Titel) öffnet die Vergleichsansicht.

1. Erstes Item ist bereits vorgewählt
2. Zweites Item suchen → **Vergleichen**
3. Beide Items werden nebeneinander dargestellt:
   - Kopfdaten (Nummer, Name, Typ, Klassifizierung, Gewicht, Preis)
   - BOM-Vergleich: Positionen, die nur in A, nur in B oder in beiden vorkommen
   - Dateien beider Items

### 6.18 Revisionen vergleichen

Revisionen-Tab → **⇄ Revisionen vergleichen** (erscheint ab zwei Revisionen).

1. Vorgewählt ist die angezeigte Revision gegen die nächstältere; beide Seiten sind wählbar, **⇄** tauscht sie.
2. Pro Bereich steht die Zahl der Änderungen: **Kopfdaten**, **Druckparameter**, **Stückliste**, **Normteile**, **Dateien**.
3. Farben: grün = neu, rot = entfernt, gelb = geändert. **Nur Änderungen** blendet Gleiches aus.
4. Dateien werden über den Namen ohne `_revN` zugeordnet. Bei gleicher Grösse vergleicht PLM den Inhalt — eine unverändert übernommene Datei gilt als gleich.

### 6.19 Klassifizierung

Farbige Chips im Projektbaum und in der Detailansicht, z. B. Eigenteil, Kaufteil. Gesetzt unter
**✏ Bearbeiten** am Item. Neue Items werden anhand der Quelle automatisch als Eigen- oder Kaufteil
eingestuft (Vorgabe unter Einstellungen → PLM). Je Klassifizierung lassen sich **Eigenschaften**
festlegen (Werkstoff, Oberfläche …), die dann am Item ausgefüllt werden. Konfiguration siehe 20,
Filter in der Suche siehe 18.

---

## 7. Normteile

Navigation → **Normteile** — Katalog für genormte Bauteile (DIN, ISO, EN, ASME, …).

### Neues Normteil

**+ Normteil** → Felder ausfüllen → Bezeichnung wird automatisch generiert (z.B. `DIN 912 Zylinderschraube M4x12 A2-70`), manuell überschreibbar.

| Feld | Beispiel |
|------|---------|
| Norm | DIN |
| Norm-Nr. | 912 |
| Grösse / Mass | M4x12 |
| Kurzbezeichnung | Zylinderschraube |
| Material / Güte | A2-70 |
| Stückpreis | 0.15 CHF |
| Gewicht pro Stück | 1.2 g |

**⧉ Duplizieren** legt eine Kopie an — praktisch für dieselbe Schraube in anderer Länge.
**↓ Export** exportiert den Katalog.

### Dateien

Tab **Dateien** pro Normteil: STEP-Dateien, PDFs, Zeichnungen hochladen (Mehrfachauswahl).

### In BOM verwenden

Im BOM-Dialog einer Baugruppe → Tab **⚙ Normteil** → Normteil aus der Liste wählen.

### Bestellen

Normteile lassen sich im Einkauf bestellen. Beim ersten Wareneingang legt PLM dafür automatisch
einen Lagerartikel an (siehe 16.6).

### Normteile auschecken

**⬇ Auschecken** im Normteile-Header kopiert alle Normteil-Dateien in `<checkout-verzeichnis>/normteile/`. Ordnername ist immer gleich → einmalig in Solid Edge als Suchpfad konfigurieren.

---

## 8. Freigabe-Workflow

Unter **Einstellungen → PLM → Freigabe-Workflow** gibt es zwei Betriebsarten:

| Betriebsart | Für wen | Ablauf |
|---|---|---|
| **Mit Freigabe** (Standard) | Wer freigegebene Stände sperren will | DFT → REL → ECO, optional mit Prüfung REV |
| **Ohne Freigabe** | Arbeit allein, ohne Prüfschritt | Alle Revisionen bleiben Entwurf (DFT) und bearbeitbar. Eine neue Revision legt man direkt an — Dateien, Druckparameter und Stückliste werden übernommen. |

Der Rest dieses Kapitels gilt für **Mit Freigabe**.

```
DFT ──────────► REL ──► ECO ──► (neue Revision in DFT)
 │               ▲        └──► OBS (veraltet)
 └──► REV ───────┘   (nur mit Vier-Augen-Prinzip)
       └──► DFT (zurück)
```

| Status | Farbe | Bedeutung |
|--------|-------|-----------|
| **DFT** | Blau | Entwurf — frei bearbeitbar |
| **REV** | Amber | In Prüfung — gesperrt |
| **REL** | Grün | Freigegeben — gesperrt |
| **ECO** | Lila | Änderung (Engineering Change Order) — die Revision bleibt gültig und gesperrt, in einer neuen DFT wird geändert |
| **OBS** | Grau | Veraltet (Obsolete) — abgelöst, wird nicht mehr gefertigt, bleibt zur Nachverfolgung erhalten |

Die Knöpfe stehen im Tab **Revisionen** unten im Bereich **Freigabe-Workflow** und heissen **✓ Freigeben**, **⚡ ECO starten** und **Als veraltet markieren (OBS)**. Allein oder ohne Vier-Augen-Prinzip gibt man direkt aus dem Entwurf frei.

### Ein freigegebenes Teil ändern

1. Tab **Revisionen** → **⚡ ECO starten** → **ECO-Grund** eingeben (Pflicht)
2. PLM legt eine neue Revision im Entwurf an und übernimmt Dateien, Stückliste und Druckparameter.
3. In der neuen Revision ändern (Dateien ersetzen, Stückliste anpassen …)
4. **✓ Freigeben** — die bisherige Revision wird automatisch **OBS**. Gültig ist immer genau eine Revision.

Wird die neue DFT-Revision stattdessen gelöscht, kehrt das ECO automatisch auf REL zurück.

### Vier-Augen-Prinzip

Einstellungen → PLM → **Vier-Augen-Prinzip: Freigabe durch eine zweite Person** (wirkt ab zwei Personen): Eine Revision geht zuerst mit **→ In Review** auf REV. Freigeben darf dann nur eine andere Person mit Freigaberecht (Superuser/Admin) als die, die sie in Review gesetzt hat; wer das war, steht in den Revisionsdetails. **Admins** sind ausgenommen: sie geben auch eigene Revisionen frei, direkt aus dem Entwurf oder nach dem Review.

**In Review ist gesperrt:** Dateien, Stückliste und Druckparameter lassen sich nicht ändern — geprüft wird, was eingereicht wurde. Für Änderungen **← Zurück zu Entwurf**. Werden geänderte Dateien eingecheckt oder aus dem Checkout angehängt, geht die Revision automatisch zurück auf Entwurf (steht in der Historie).

### Prüfung vor der Freigabe

Unter **Einstellungen → PLM → Prüfung vor der Freigabe** wählbar, was eine Revision mitbringen muss: mindestens eine Datei (bei Baugruppen genügen stattdessen Positionen in der Stückliste), CAD-Datei, Zeichnung als PDF, Beschreibung, Klassifizierung, Gewicht (Parts). Standard: eine Datei und das Gewicht. Dazu kommen die als Pflicht markierten Eigenschaften der Klassifizierung. Fehlt etwas, steht im Datenblatt und in der Revision „Für die Freigabe fehlt noch: …“, und **✓ Freigeben** ist gesperrt.

Freigegebene oder gelieferte Items löschen nur über **Einstellungen → Admin**.

### Änderungsanträge (ECR)

Ein Änderungsantrag hält fest, **warum** etwas geändert werden soll, bevor jemand konstruiert.
Navigation → **Änderungen** → **+ Änderungsantrag**.

- **Titel, Begründung** (warum) und **Was wird geändert**, dazu ein oder mehrere betroffene Teile mit eigener Notiz
- **Auswirkung** je Teil: in welchen Baugruppen es verbaut ist (alle Ebenen), offene Aufträge und Angebote, offene Produktion, Lagerbestand
- **Ablauf:** Offen → **Genehmigen** oder **Ablehnen** (wie Freigeben: nur Superuser und Admins) → **⚙ Umsetzen — Revisionen anlegen** legt je Teil die Revision an, in der geändert wird (freigegebene Teile per ECO, ein offener Entwurf wird weiterverwendet) → **✓ Abschliessen**
- Solange ein Antrag offen ist, zeigt das Datenblatt des Teils „In Änderung“; offene Anträge stehen auch im Dashboard

---

## 9. Checkout / Check-in

Mit Checkout werden die Dateien eines Items in einen Ordner kopiert, damit man sie im CAD
bearbeiten kann. Check-in holt die Änderungen zurück ins PLM.

### Einmalig einrichten

1. **Einstellungen → Daten → Checkout-Verzeichnis** → Ordner eintragen → **Pfad speichern**
   (nur am PLM-PC möglich). Der Pfad steht in `plm.config` (`checkout_dir=…`) und gilt nur für
   diesen PC — liegen die Daten auf einem Netzlaufwerk, hat jeder PC seinen eigenen lokalen
   Ordner (siehe 2). Leer heisst `[Datenverzeichnis]/checkout`.
2. In Solid Edge: **Tools → Options → File Locations** → Parts, Assemblies, Drafts → denselben Ordner eintragen.

### Ablauf

**Auschecken:** Item → **⬇ Auschecken** → Dateitypen wählen → **⬇ Auschecken**. Die Dateien landen in `<checkout-pfad>/<item-nummer>/` (ohne Zeitstempel, Pfad bleibt bei jedem Checkout identisch). **📂 Ordner öffnen** öffnet ihn im Dateimanager.

**Arbeiten im CAD:** Dateien bearbeiten oder neue erstellen.

**Einchecken:** **⬆ Einchecken** am Item oder in der Übersicht **⬆ Checkouts** (dort auch **⬆ Alle einchecken**) → übernommen werden nur **geänderte** Dateien, danach wird der Ordner gelöscht (Eintrag in der Historie). Unveränderte Dateien (gleiches Änderungsdatum oder gleicher Inhalt) bleiben in PLM unangetastet — so kann nichts versehentlich überschrieben werden. Dateien eines Unterteils (Checkout einer Baugruppe) landen in der Revision dieses Unterteils.

Entscheidend ist der **heutige** Stand in PLM, nicht der beim Auschecken:

| Stand des Teils | Geänderte Dateien |
|---|---|
| Entwurf (DFT) | direkt übernommen, gleichnamige ersetzt |
| Freigegeben (REL) | Rückfrage — hochladen: die Freigabe bleibt, die Änderung kommt per ECO in eine neue Revision |
| In Review (REV) | Rückfrage — hochladen: die Revision geht zurück auf Entwurf |
| Veraltet (OBS) oder geliefert | Rückfrage — hochladen: neue Revision mit dem bisherigen Inhalt |

Bei der Rückfrage: **Als neue Revision hochladen**, **Änderungen verwerfen** (löscht sie mit dem Ordner) oder **Abbrechen** (der Ordner bleibt, in PLM ändert sich nichts).

**Neue Dateien:** PLM erkennt sie automatisch beim Öffnen der Checkout-Übersicht (**⬆ Checkouts**):
- Im Unterordner eines Items → **⬇ Zum Item hinzufügen**
- Im Hauptordner → **+ Als neues Item anlegen (mit Datei)** oder **+ An Item anhängen**

**Mehrere PCs:** Jeder Checkout ist zusätzlich mit dem Namen des PCs in der Datenbank vermerkt.
Am Item steht dann z. B. **ausgecheckt auf LAPTOP** (auch für die Unterteile einer ausgecheckten
Baugruppe), die Checkout-Übersicht listet sie unter **Auf anderen PCs ausgecheckt**. Wer ein solches
Item hier auscheckt, wird zuerst gefragt — was dort bearbeitet wird, ist hier nicht dabei.
Eingecheckt wird an dem PC, auf dem ausgecheckt wurde. Gibt es den PC oder den Ordner dort nicht
mehr, entfernt **Vermerk entfernen** den Eintrag; Dateien werden dabei keine gelöscht. Ordner, die
auf diesem PC von Hand gelöscht wurden, trägt PLM beim nächsten Öffnen der Übersicht selbst aus.

**Aufräumen:** Dateien im Hauptordner, die schon in PLM sind (als Item angelegt oder angehängt), bleiben zunächst liegen — falls eine Baugruppe im CAD noch auf sie verweist. Die Checkout-Übersicht listet sie unter „… sind schon in PLM“; **🧹 Aufräumen** löscht sie. Gelöscht wird nur, was inhaltlich gleich in PLM liegt (Prüfsumme). Geänderte oder unbekannte Dateien und die Ordner der Checkouts bleiben.

---

## 10. Angebote & Kostenkalkulation

### Angebot anlegen

Ein Angebot ist die erste **Phase eines Auftrags** — kein eigener Datensatz. Navigation → Aufträge → **+ Angebot** (oder **+ Auftrag** mit Status **Angebot**).

Felder: Bezeichnung (Pflicht), Kunde, Angebotsdatum, **Gültig bis**, Gesamtrabatt (%), Zahlungsbedingungen, MwSt. (%), geschätzte Stunden, Notizen. Vorgaben kommen aus Einstellungen → Kalkulation — bei einem neuen Angebot auch das Datum „Gültig bis“ (heute + „Angebot gültig (Tage)“).

Phasen: `Angebot → Bestätigt → Geliefert → Fakturiert` (oder `Angebot → Abgelehnt`)

- **📄 Angebot PDF** — druckt das Angebot
- **✓ Angebot angenommen** — gleiche Nummer, gleiche Positionen, die Phase wechselt auf Bestätigt
- **Abgelehnt** — schliesst das Angebot ab

### Position hinzufügen mit Kalkulation

**+ Position** öffnet das Positions-Modal:

1. **PLM-Item verknüpfen** — suche nach Item-Nummer oder Name
2. **Rohmaterial wählen** — bei mehreren aktiven Lots erscheint ein Picker zur Lot-Auswahl
3. **Arbeitszeit (h)** — geschätzte Stunden
4. **Drucker + Druckzeit (h)** — für Druckkosten
5. System zeigt **Kostenaufstellung** live:
   - Material: `Bauteilgewicht × (Rohmaterialpreis / Rohmaterialgewicht)`
   - Arbeitszeit: `Stunden × Stundenansatz`
   - Druckzeit: `Stunden × Drucker CHF/h`
6. **Als Preis übernehmen** — kalkulierten Preis als Einzelpreis setzen
7. Beschreibung, Menge, Einheit, Rabatt (%) prüfen → speichern

Ohne Kalkulation: nur Beschreibung, Menge und Einzelpreis ausfüllen.

> Item und Rohmaterial müssen beide ein Gewicht hinterlegt haben, sonst erscheint eine Warnmeldung.

### BOM kalkulieren (Baugruppen)

**📦 Aus BOM kalkulieren** (im Auftrag, Tab Positionen — auch in der Angebotsphase) — wähle eine Baugruppe, alle BOM-Teile werden als einzelne Positionen mit automatischen Kosten übernommen (**✓ Alle als Positionen übernehmen**).

---

## 11. Aufträge

Navigation → Aufträge → **+ Auftrag**

Status: `Angebot → Bestätigt → Geliefert → Fakturiert`, ohne vorheriges Angebot ab `Entwurf`; dazu `Abgelehnt` und `Storniert`

**Tabs im Auftrag:** **Positionen**, **Produktion**, **Zeiten**, **Details**, **Verlauf**.

| Knopf | Funktion |
|---|---|
| **✏️ Bearbeiten** | Kopfdaten ändern (Kunde, Daten, Rabatt, MwSt. …) |
| **+ Position** | Position hinzufügen (siehe 10) |
| **📄 Rechnung PDF** | Rechnung drucken; danach bietet PLM **Als fakturiert markieren** an |
| **🔧 Produktionsauftrag anlegen** | Produktionsauftrag zum Auftrag anlegen; bearbeitet wird er im Tab **Produktion** (mehrere für Teillieferungen möglich) |
| **📦** an einer Position | Bestand im Lager abbuchen (nur wenn genügend Bestand) |
| **⧉ Duplizieren** | Kopie des Auftrags mit allen Positionen anlegen |
| **🗑 Löschen** | nur im Status Entwurf; andere nur über **Einstellungen → Admin** |

**Der Status läuft mit:**
- Produktionsauftrag anlegen → der Auftrag wird **Bestätigt**
- letzter Produktionsauftrag geliefert → der Auftrag wird **Geliefert**
- Rechnung gedruckt → PLM bietet **Fakturiert** an

**Zeit erfassen** — Tab **Zeiten** → **+ Eintrag** (wie 6.14). Die Arbeitszeit kann als Position auf die Rechnung.

---

## 12. Produktion

Navigation → **Produktion** — Liste der Produktionsaufträge (`LS-…`). **Eigenständig** zeigt nur die ohne Auftrag (Standard), **Alle** auch die zu Aufträgen. Produktionsaufträge zu einem Auftrag bearbeitest du im Auftrag unter **Produktion**; ein Klick in der Liste springt dorthin.

**Neuer Produktionsauftrag (ohne Auftrag):** **+ Produktionsauftrag** → Bezeichnung, Kunde, Lieferdatum, Herstellungsdatum, Status.

Status: `Entwurf → Bereit → Geliefert`

Tabs: **Positionen**, **Details**, **Rückverfolgung**, **Verlauf**.

### 12.1 Position hinzufügen

**+ Position**:
- **PLM-Item** verknüpfen
- **Rohmaterial** zuweisen → übernimmt automatisch Düsentemperatur und Betttemperatur
- **3MF-Import** oder manuelle Druckparameter (Schichthöhe, Füllung, Stützen, Düse, Temperaturen, Filamentgewicht, Druckdauer)
- **Drucker** und **Düse** separat wählen

Fertigungs- und Kundenhinweise des Items (siehe 6.7) stehen an der Position.

### 12.2 Drucken

| Knopf | Ergebnis |
|---|---|
| **📄 Lieferschein** | alle Positionen mit Revision, Druckparametern, Rohmaterial, Kundenhinweisen und Unterschriftsfeldern |
| **🏷 Etiketten** | ein Etikett pro Position mit Kurzcode und QR-Code, für Beutel oder Kiste. 24 Etiketten pro Bogen; **Erstes freies Etikett auf dem Bogen** erlaubt, einen angebrauchten Bogen weiterzuverwenden |
| **🖶** / **🖶≡** an einer Position | Kurzbeleg / Vollbeleg mit Druckparametern auf dem Thermodrucker |
| **🖶 Alle kurz** / **🖶 Alle mit Parametern** | Belege für alle Positionen auf dem Thermodrucker |

### 12.3 Gelieferter Stand

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
- Item → Tab **Aufträge** listet alle Produktionsaufträge mit ihrem Stand, auch Lieferungen als Teil einer Baugruppe. So lässt sich beantworten, welcher Kunde welchen Stand hat.

### 12.4 Materialabzug beim Abschliessen

Wird ein Produktionsauftrag auf **Geliefert** gesetzt, rechnet PLM das verbrauchte Rohmaterial vor
und zeigt eine Aufstellung. Das Gewicht pro Stück kommt aus dem Filamentgewicht der Position,
sonst aus den Druckparametern des Items, sonst aus dem Teilgewicht.

- Mengen und Lot sind im Dialog korrigierbar; das älteste Lot wird zuerst vorgeschlagen.
- **Abbuchen** bucht vom Lot ab, **Nicht abbuchen** lässt alles unverändert.
- Positionen ohne Gewicht werden getrennt aufgeführt und nicht gebucht.
- Pro Produktionsauftrag wird nur einmal abgebucht.

### 12.5 Thermodrucker (Pipsta)

Pro Position: **🖶** Kurzbeleg oder **🖶≡** Vollbeleg mit Druckparametern. Einstellungen unter
Einstellungen → **Kassabon**. Einrichtung unter Windows: siehe `README.md`, Abschnitt
„Pipsta Classic – Einrichtung“. Probleme: siehe [24. Häufige Fragen](#24-häufige-fragen).

### 12.6 Rückverfolgung

Produktionsauftrag → Tab **Rückverfolgung**: je Position die Revision, die verbrauchte Material-Charge (aus dem Materialabzug) und die Prüfung. Die Prüfung wird dort mit **✓ In Ordnung** oder **✗ Nicht in Ordnung** und einer Bemerkung erfasst — mit Name und Datum. **Zurücksetzen** löscht die Prüfung.

Umgekehrt: Rohmaterial → Tab **Verwendet in** zeigt je Charge, in welchen Produktionsaufträgen, bei welchen Kunden und in welchen Teilen sie steckt — für einen Rückruf.

---

## 13. Rohmaterial

Navigation → **Lager** → Tab **Rohmaterial** — Filament, Platten, Stangen usw. Sortierbar nach **Material**, **Farbe** oder **Bestand**.

### Material erfassen

**+ Material**:

| Feld | Beschreibung |
|------|-------------|
| Materialtyp | PLA, PETG, ABS, Aluminium, … |
| Farbe | z.B. Schwarz, Galaxy Black |
| Marke | z.B. Prusament |
| Abmessungen | z.B. 2×20×200mm, Ø12mm, 1000g |
| Gewicht / Stück | Gesamtgewicht der Einheit in Gramm, z. B. 1000 für eine 1-kg-Spule (für Preiskalkulation und Materialabzug) |
| Düsentemperatur (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Betttemperatur (°C) | Wird bei Zuweisung in Produktion automatisch übernommen |
| Mindestbestand | Warnschwelle |

Name wird automatisch aus Typ + Farbe + Abmessungen + Marke generiert (editierbar).

Der Bestand wird in Stück (Spulen) geführt, der Verbrauch in Gramm: 1840 g bei einer 1000-g-Spule sind 1.84 Stk.

### Lot-Tracking

Jede **Einbuchung** (**+ Einbuchen**) kann eine Lot-Nr. und einen Einkaufspreis erhalten. Mehrere Lots desselben Materials werden untereinander aufgelistet:

```
LOT-2025-001    500 g    CHF 24.90/g    ● aktiv
LOT-2024-011    200 g    CHF 23.50/g    ● aktiv
LOT-2024-003      0 g    CHF 25.00/g    ● leer
```

Aktive Lots erscheinen zuerst, leere danach (ausgegraut). In der Übersicht links werden leere Lots ausgeblendet.

**Pro Lot:**
- **+ Nr.** vergibt eine Artikelnummer (auch über die Suche auffindbar)
- **🖶** druckt ein Etikett für die Spule auf dem Thermodrucker — mit QR-Code, wenn unter
  Einstellungen → Kassabon → Rohmaterial-Etikett eingeschaltet

### Ausbuchen

**− Ausbuchen** öffnet ein Modal mit Lot-Auswahl. Leere Lots sind deaktiviert.

### Buchungshistorie

Tab **Buchungen** zeigt alle Ein- und Ausgänge mit laufendem Saldo.

### Verwendung in Angeboten

Im Positions-Modal eines Angebots → Rohmaterial wählen → bei mehreren aktiven Lots erscheint ein Picker. Der Lot-Preis wird für die Materialkalkulation verwendet.

---

## 14. Kunden

Navigation → **Kunden** → **+ Kunde** — jeder Kunde erhält eine automatische Nummer (`KD-0001`).

**Felder:** Name / Firma (Pflicht), Kontaktperson, E-Mail, Telefon, Adresse, Notizen.

**Tabs im Kunden:** **Übersicht**, **Aufträge**, **Produktion**, **Verlauf** — alles zu diesem Kunden an einem Ort.

Bei Aufträgen und Angeboten kann der Kunde per Suchfeld gefunden oder als Freitext eingegeben werden.

**Kunde löschen** (**🗑 Löschen**) behält die Belege: Der Name wandert in den Auftrag als Freitext, Rechnungen bleiben vollständig nachdruckbar.

---

## 15. Lager

Navigation → **Lager** — fertige Teile und Zukaufteile mit Bestand. Spalten sind per Klick sortierbar.

**+ Artikel**: Name (Pflicht), Kategorie, SKU / Artikelnr., Farbe, Material, Einheit, Mindestbestand, Preis / Einheit, Anfangsbestand, Notizen, optional **Verknüpftes PLM-Teil**.

**Buchen:** **+ Zugang** / **− Abgang** → **Typ** wählen, Menge eingeben, optional eine **Referenz** (Freitext oder Auftrag) und eine Notiz → **Buchen**.

| Typ | Wirkung |
|---|---|
| **Zugang (+)** | erhöht den Bestand um die Menge |
| **Abgang (−)** | verringert den Bestand um die Menge |
| **Korrektur (=)** | setzt den Bestand auf den eingegebenen **Neuen Bestand**, z. B. nach einer Inventur (auch 0). Gebucht wird die Differenz, sie erscheint in den Bewegungen als „Korrektur“ |

- PLM-Item verknüpfen → Bestand wird beim Abbuchen aus Aufträgen reduziert (**📦** an der Auftragsposition)
- **Geplante Menge** = Bestand der in offenen Aufträgen vorgemerkt ist
- Warnung wenn Bestand ≤ Mindestbestand, auch als Kachel im Dashboard
- Der Lagerbestand eines verknüpften Items steht in dessen Datenblatt

---

## 16. Einkauf / Bestellwesen

Navigation → **Einkauf** — verwaltet Lieferanten und Bestellungen bei externen Lieferanten.

### 16.1 Lieferanten

Navigation → Einkauf → Tab **Lieferanten** → **+ Lieferant** — jeder Lieferant erhält eine automatische Nummer (`LF-0001`).

**Felder:** Name, Kontaktperson, E-Mail, Telefon, Adresse, Notizen.

In der Detailansicht des Lieferanten sind alle verknüpften Bestellungen und Lagerartikel aufgelistet.

### 16.2 Bestellungen

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

### 16.3 Bestellung anlegen

1. Einkauf → **+ Bestellung**
2. Lieferant wählen (aus Lieferantenliste) oder als Freitext eingeben
3. Bestelldatum und erwartetes Lieferdatum eintragen
4. Positionen hinzufügen (siehe 16.4)
5. **Bestellen →** setzt den Status auf **Bestellt**

### 16.4 Positionen

**+ Position** — öffnet das Positions-Modal:

| Feld | Beschreibung |
|------|-------------|
| Bezeichnung | Artikelbezeichnung (Pflichtfeld) |
| Menge | Bestellmenge |
| Einheit | Stk, kg, m, … |
| Preis / Einheit | CHF pro Einheit |
| Verknüpfung | Optional: Lagerartikel, Rohmaterial oder Normteil |
| Notizen | Interne Bemerkung |

**Verknüpfung:** Eine Position kann mit einem **Lagerartikel**, einem **Rohmaterial** oder einem **Normteil** verknüpft werden. Die Verknüpfung wird in der Bestellübersicht angezeigt (Artikelname und aktueller Bestand).

Positionen können solange bearbeitet oder gelöscht werden, wie die Bestellung noch nicht den Status **Erhalten** hat. Klick auf **✏ Bearbeiten** öffnet das Bearbeitungs-Modal für eine einzelne Position.

### 16.5 Bestellungs-PDF

**📄 PDF** — generiert ein druckbares Bestelldokument mit:
- Firmenadresse und Logo (aus Einstellungen)
- Lieferantenadresse
- Bestellnummer, Datum
- Positionstabelle mit Menge, Einheit, Beschreibung, Einzelpreis, Gesamtpreis
- Gesamtsumme

### 16.6 Wareneingang

Wenn die Bestellung ankommt → **✓ Als erhalten markieren**.

**Lagerartikel:** Bestand wird automatisch um die bestellte Menge erhöht.

**Normteil:** Beim ersten Wareneingang legt PLM automatisch einen Lagerartikel an und verknüpft ihn fest — danach wie Lagerartikel.

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

## 17. Kalkulation

Navigation → **Aufträge** → Tab **Kalkulation** — Übersicht aller Parts und Baugruppen mit Kostenvergleich. Klick auf einen Spaltenkopf sortiert.

| Spalte | Bedeutung |
|--------|-----------|
| **Verkaufspreis** | Verkaufspreis (VP) aus dem PLM |
| **Stk. verkauft** | Gesamtmenge aus allen Aufträgen |
| **Umsatz** | Gesamtumsatz dieses Items |
| **Gewinn total** | Umsatz − (Kosten × verkaufte Stück) |

**CSV-Export** — oben links → **↓ CSV** (z. B. für Excel)

---

## 18. Suche

**Öffnen:** Suchfeld oben — oder `Ctrl+K`. Ein Klick ins leere Suchfeld öffnet die Suche mit den Filtern nach Klassifizierung.

Durchsucht gleichzeitig: Projekte, PLM-Items, Aufträge und Angebote, Produktionsaufträge, Kunden, Rohmaterial, Dateien.

- **Mehrere Wörter** müssen alle vorkommen, egal in welchem Feld: „Halter PETG“ findet einen Halter mit „PETG“ in der Beschreibung.
- Gross-/Kleinschreibung spielt keine Rolle, auch nicht bei Umlauten („öse“ findet „Öse“).
- Eine exakt eingegebene Item-Nummer steht oben.
- **Kurzcode** (z. B. `XHJ-1`, auch per Barcode-Scanner): oben erscheint der Kurzcode-Treffer; **Teil öffnen ↵** (Klick oder Enter) öffnet das Teil in dieser Revision.
- **Aufträge, Angebote und Produktionsaufträge** werden auch über ihre Positionen gefunden — Teilenummer, Kurzcode, Teilename oder Positionstext. Unter dem Titel steht, welche Position passt („enthält 001-prt-001 Kabelhalter × 12“).
- Auch die Werte der **Eigenschaften** einer Klassifizierung (z. B. Werkstoff) sind durchsuchbar.

**Filter nach Klassifizierung:** Die Chips über den Ergebnissen zeigen pro Klassifizierung die Zahl der Treffer.

- Klick auf einen Chip zeigt nur Items dieser Klassifizierung — auch ohne Suchwort als ganze Liste. Zweiter Klick (oder **✕ Filter aufheben**) hebt ihn auf.
- **ohne** zeigt Items ohne Klassifizierung.
- Gestrichelte Chips: Werte, die an Items stehen, aber nicht in der Liste unter Einstellungen → PLM.

---

## 19. Historie & Verlauf

### Historie (PLM)

Navigation → **Historie** (Tab **PLM**) — vollständiges Protokoll aller Änderungen im PLM, nach Tag gruppiert. Klick auf die Nummer öffnet das betroffene Item, Projekt, den Auftrag oder Produktionsauftrag. **↺ Aktualisieren** lädt neu.

Sind Personen angelegt (Einstellungen → **Benutzer**), steht neben jedem Eintrag, wer ihn gemacht hat — auch in der Historie eines Items oder Projekts und unter „Letzte Änderung“ im Datenblatt. Ältere Einträge haben keinen Namen.

**⬇ CSV** exportiert die Einträge, mit der Person als eigener Spalte.

### ERP-Verlauf (nur Admins)

Navigation → **Historie** → Tab **ERP** — dasselbe für Kunden, Aufträge, Produktionsaufträge, Lieferanten und
Bestellungen. Nur für Admins sichtbar. Den Verlauf eines einzelnen Auftrags, Kunden oder Produktionsauftrags sieht jede
Person im Tab **Verlauf** dort.

---

## 20. Einstellungen

Navigation → Einstellungen (Zahnrad-Symbol). Änderungen mit **💾 Speichern** bzw. dem Speichern-Knopf des Abschnitts übernehmen.

> Arbeiten mehrere Personen mit PLM, sehen **User** und **Superuser** hier nur ihre persönlichen
> Einstellungen: Darstellung, Person wechseln und eigene PIN. Alle übrigen Tabs verwaltet ein Admin.

### Firma
Name, Adresse, UID, Bankverbindung — erscheinen auf Rechnungen, Angeboten, Lieferscheinen und Bestellungs-PDFs.
**Logo hochladen…** (PNG, JPG, WebP, SVG) setzt das Logo auf diese Belege; ohne Logo steht der Firmenname.

### Kalkulation
- Stundenansatz (CHF/h) — für Arbeitszeitkalkulation in Angeboten
- Maschinenkosten — Standardwerte
- Steuersatz, Zahlungskonditionen, Angebotsgültigkeit

### Kassabon
Einstellungen für den Pipsta-Thermodrucker (Zeilenbreite) und das **Rohmaterial-Etikett**
(z. B. **QR-Code auf Etikett drucken**).

### 3D-Druck
Slicer, Drucker (mit CHF/h), Düsen und Materialprofile (**+ Drucker hinzufügen**, **+ Düse hinzufügen**, **+ Vorlage hinzufügen**).

**Slicer** — PrusaSlicer, Bambu Studio oder Creality Print für „Im Slicer öffnen“ (Datenblatt und Dateien einer Revision). Das Programm wird an den üblichen Orten gesucht (**↻ Neu suchen**); ist keiner installiert, bleibt der Knopf grau. Liegt es woanders: in `plm.config` `prusaslicer=…`, `bambustudio=…` bzw. `crealityprint=…` eintragen. Die Arbeitskopie landet als `<Kurzcode>_<Name>.stl` im Unterordner `Slicer` des Checkout-Verzeichnisses; eine im Slicer gespeicherte Kopie wird nicht überschrieben.

> Druckparameter einer Revision kommen aus der hochgeladenen 3MF-Datei (PrusaSlicer, SuperSlicer, OrcaSlicer, BambuStudio); in der Produktion lassen sie sich pro Position erfassen. Materialtemperaturen werden direkt im Rohmaterial hinterlegt.

### PLM
Klassifizierungsliste — Namen und Farben bearbeiten, per Drag&Drop sortieren, **+ Hinzufügen**.

- Neben jedem Eintrag steht, wie viele Items ihn tragen.
- **Umbenennen** überträgt den neuen Namen beim Speichern auf alle Items (und auf die Standard-Klassifizierung).
- **Entfernen** eines benutzten Eintrags fragt, ob die Items ihn behalten oder verlieren.
- Werte, die an Items stehen, aber in der Liste fehlen, erscheinen darunter — **＋ übernehmen** holt sie zurück.
- **Eigenschaften** je Klassifizierung — Felder wie Werkstoff, Oberfläche oder Hersteller (**+ Feld**), optional als **Pflicht** für die Freigabe. Die Werte trägt man unter **✏ Bearbeiten** am Item ein; sie stehen im Datenblatt (auch als PDF) und sind durchsuchbar. Ein entferntes Feld löscht beim Speichern auch seine Werte an den Items.

Dazu:
- **Standard-Klassifizierung** für neue Items, getrennt für Items mit und ohne Quelle (Eigen- / Kaufteil)
- **Freigabe-Workflow** und **Vier-Augen-Prinzip** (siehe 8)
- **Prüfung vor der Freigabe** (siehe 8)
- **Prüfprotokoll** — Prüfpunkte der Vorlage mit Soll-Wert, Reihenfolge; **Vorschau** zeigt das Ergebnis, **Standard einsetzen** stellt die Vorgabe wieder her

### Daten
- **Darstellung** — Schriftgrösse (Klein bis Sehr gross) und Farbdesign (**Standard** oder **Helleres Design**); wird serverseitig gespeichert
- **Design zurücksetzen** — setzt die Farben der Klassifizierungen auf die aktuelle Palette; Namen und Reihenfolge bleiben
- **Datenpfad** — Datenbank und Dateispeicher. Ändert nur, wo PLM sucht — vorhandene Daten bleiben am alten Ort
- **Daten verschieben** — zieht das komplette Datenverzeichnis (Datenbank, alle Dateien, Sicherungen, Papierkorb) an einen neuen Ort um: kopieren → prüfen → sofort umschalten (kein Neustart nötig) → alten Ordner löschen. Das Ziel muss ein leerer oder neuer Ordner sein; optional lassen sich die Daten am alten Ort behalten (kopieren statt verschieben). Während des Vorgangs sind Schreibzugriffe gesperrt; schlägt die Prüfung fehl, bleibt alles am alten Ort
- **CAD-Programm** — zeigt, ob das Programm für den 🖥 CAD-Button gefunden wird (**↻ Neu prüfen**). Der Pfad steht in `plm.config` (`cad_path=…`), nicht in der Oberfläche: Die Einstellungen sind ohne Anmeldung im ganzen Netz erreichbar
- **Checkout-Verzeichnis** — Zielordner für Checkouts; gilt nur für diesen PC (steht in `plm.config`) und ist nur dort änderbar. War früher ein Ordner eingetragen, den es auf diesem PC nicht gibt, steht er darunter als Hinweis
- **Datensicherung** — Sicherungen anlegen, wiederherstellen und löschen (siehe 21)
- **Export** — ZIP-Export aller Daten
- **Datei-Index** — Zuordnung angezeigter Name ↔ Dateiname auf Festplatte, auch **Als CSV**

### Benutzer
Wer was gemacht hat — für die Nachvollziehbarkeit, nicht als Schutz. Ohne Passwort.

- **Allein:** Namen eintragen („Dein Name“). PLM fragt nie, wer dran ist; der Name steht in der Historie und bei Freigaben.
- **Team (ab zwei Personen):** Beim Öffnen erscheint **Wer ist dran?** — ein Klick auf die eigene Kachel. Der Name steht oben rechts, ein Klick darauf wechselt die Person. Nach einer Pause (einstellbar, Standard 30 Minuten, 0 = nie) fragt PLM bei der nächsten Änderung einmal **Weiter als …?**; danach wird die Änderung ausgeführt.
- **Rollen:**

  | Rolle | Darf |
  |---|---|
  | **User** | ändern, aber nicht freigeben |
  | **Superuser** | zusätzlich freigeben (REL), als veraltet markieren (OBS), Änderungsanträge genehmigen |
  | **Admin** | alles: Einstellungen, Personen, Stammdaten löschen, Sicherungen zurückspielen, ERP-Verlauf |

- **PIN:** Jede Person kann unter Einstellungen eine eigene PIN setzen, ändern oder entfernen (mit der bisherigen PIN). Sie wird beim Wechsel zu dieser Person abgefragt, nicht beim Weitermachen nach einer Pause. Admins können PINs aller Personen setzen oder entfernen, z. B. wenn jemand seine vergessen hat.
- **Farbe:** Jede Person bekommt automatisch eine eigene Farbe. Sie erscheint auf der Kachel bei **Wer ist dran?** (Streifen oben, Kreis mit den Initialen) und oben beim Namen — so findet man sich schneller. Ändern: unter Einstellungen → Benutzer auf den farbigen Kreis klicken (nur Admins).
- **Deaktivieren** statt löschen: Die Person bleibt in der Historie, steht aber nicht mehr zur Auswahl. Es braucht immer mindestens einen aktiven Admin.
- **Rückmeldung (ab zwei Personen):** Das Sprechblasen-Symbol oben rechts meldet einen **Fehler** oder reicht eine **Idee** ein. Mitgeschickt werden Name, aktuelle Ansicht, geöffnetes Item, Version, Browser und die letzten Fehlermeldungen. Admins sehen offene Rückmeldungen oben auf dem **Dashboard**; ein Klick zeigt die Details, dort **✓ Erledigt** oder **Löschen**. **Liste →** zeigt alle, auch die erledigten — sind alle erledigt, steht dafür eine Zeile „Rückmeldungen: alle … erledigt · Liste →“ auf dem Dashboard.

> Die Benutzerverwaltung schützt nicht vor Absicht: Wer im Netz Zugriff auf PLM hat, kann ohne
> PIN jede Kachel wählen. Sie dient der Nachvollziehbarkeit.

### Admin
**Vorsicht — Änderungen können Daten dauerhaft beschädigen.**

- Löschen in den Tabs **Projekte**, **Items**, **Aufträge**, **Produktion**: freigegebene oder gelieferte Items, Projekte mit Inhalt, abgeschlossene Aufträge, Produktionsaufträge
- Nummerierungsstruktur: Präfixe, Stellen, Revisionsformat (auch für Einkauf EK und Lieferanten LF) → **⚠ Admin-Einstellungen speichern**

---

## 21. Datensicherung

**Einstellungen → Daten → Datensicherung**

- PLM sichert die Datenbank bei jedem Start einmal pro Tag (die letzten 14 bleiben).
- **💾 Jetzt sichern** legt eine zusätzliche Sicherung an — z. B. vor grösseren Änderungen.
- **Wiederherstellen** bei einer Sicherung: der Dialog zeigt, was sich ändert (Projekte, Items, Aufträge … jetzt gegen Sicherung). Vorher sichert PLM den jetzigen Stand als „vor Wiederherstellung“ — du kannst also zurück. Danach lädt die Oberfläche neu.
- **⬆ Aus Datei wiederherstellen…** nimmt eine Sicherung (`.db`) oder einen Gesamtexport (`.zip`).
- Gelöschte Dateien bleiben 30 Tage im **Papierkorb**; eine wiederhergestellte Sicherung holt sie von dort zurück. Fehlt eine Datei, nennt der Abschlussdialog sie.
- **nicht gespeichert:** Hat ein anderes PLM die Daten übernommen oder wurde `plm.db` von aussen geändert, bevor alles gespeichert war, legt PLM den Stand von hier als Sicherung ab, statt die Datei zu überschreiben (siehe 2, Daten auf einem Netzlaufwerk). Sie enthält die Änderungen von hier, aber nicht die des anderen — zum Nachschauen, nicht zum blinden Wiederherstellen.

**Gesamtexport:** Einstellungen → Daten → Export → ZIP mit `plm.db` + `files/`, lässt sich über „Aus Datei wiederherstellen“ komplett zurückspielen.

> Die Sicherungen liegen im Datenordner, also auf demselben Datenträger wie die Daten. Gegen einen
> Festplattenschaden hilft nur eine Kopie auf einem anderen Datenträger — dafür regelmässig den
> Gesamtexport ablegen.

---

## 22. Update einspielen

Welche Version läuft, steht unten in der Navigation und auf dem Startbildschirm. Der Punkt an der Version:

| Punkt | Bedeutung |
|---|---|
| blau | Update verfügbar |
| grün | aktuell |
| grau | Stand unbekannt (offline oder GitHub nicht erreichbar — der Grund steht im Tooltip) |

**Installieren:** Klick auf die Version → die neuen Änderungen werden aufgelistet → **Jetzt installieren**.
PLM holt den neuen Stand, startet neu und lädt die Seite selbst neu. Das geht nur am PLM-PC.
Schlägt etwas fehl, läuft die bisherige Version weiter. Daten und `plm.config` bleiben erhalten;
vor jeder Änderung an der Datenbank legt PLM eine Sicherung an.

Steht bei der Version „geändert“, wurde PLM mit eigenen Änderungen am Programm gestartet — dann
geht „Jetzt installieren“ nicht. Weitere Wege (von Hand, ZIP ohne Git): siehe `README.md`,
Abschnitt „Update einspielen“.

Nach einem Update, das die Farbpalette betrifft: einmal **Einstellungen → Daten → Design zurücksetzen**.

---

## 23. Tastaturkürzel

| Kürzel | Aktion |
|--------|--------|
| `Ctrl+K` | Suche öffnen |
| `Enter` im Suchfeld | Kurzcode-Treffer öffnen |
| `Escape` | Modal / Detail schliessen |
| `Enter` auf dem Startbildschirm | PLM & ERP öffnen |
| Browser-Zurück | Zur vorherigen Ansicht |

---

## 24. Häufige Fragen

**„✓ Freigeben“ ist gesperrt.**
Darüber steht „Für die Freigabe fehlt noch: …“ — das Fehlende ergänzen (oft Datei oder Gewicht).
Steht kein solcher Hinweis da: Die Rolle **User** darf nicht freigeben, oder beim Vier-Augen-Prinzip
hat man die Revision selbst in Review gesetzt — dann gibt eine andere Person frei (siehe 8).

**Ich kann keine Datei hochladen, kein „+ Datei“ zu sehen.**
Die Revision ist gesperrt (freigegeben, in Review oder geliefert). Freigegeben → **⚡ ECO starten**;
in Review → **← Zurück zu Entwurf**; geliefert → **＋ Neue Revision**.

**Ein Item, Projekt oder Auftrag lässt sich nicht löschen.**
Freigegebene oder gelieferte Items, Projekte mit Inhalt und abgeschlossene Aufträge löscht nur ein
Admin unter **Einstellungen → Admin**. Das schützt vor versehentlichem Datenverlust.

**Die Preiskalkulation zeigt eine Warnung.**
Item und Rohmaterial brauchen beide ein Gewicht: am Item im **Datenblatt** unter **Allgemein**, am
Rohmaterial **Gewicht / Stück**.

**Kein Vorschaubild / keine 3D-Vorschau.**
Die neuste Revision hat weder STL noch STEP noch eine 3MF mit Bild noch ein Bild. Eine solche Datei hochladen.

**„Im Slicer öffnen“ oder „🖥 CAD“ ist grau.**
Das Programm wurde nicht gefunden. Pfad in `plm.config` eintragen (siehe 20, 3D-Druck bzw. Daten).
Beides funktioniert nur am PLM-PC.

**Beim Einchecken kommt eine Rückfrage.**
Das Teil ist inzwischen nicht mehr im Entwurf. Die Tabelle in Kapitel 9 sagt, was „Als neue
Revision hochladen“ jeweils bewirkt.

**Etwas falsch gemacht — wie zurück?**
Einzelne Änderungen stehen in der Historie, werden dort aber nicht rückgängig gemacht. Grössere
Fehler: **Einstellungen → Daten → Datensicherung → Wiederherstellen** mit einer Sicherung von vorher
(siehe 21). Der jetzige Stand wird vorher gesichert.

**Der Browser öffnet sich nach dem Start nicht.**
Auf dem Startbildschirm **PLM & ERP öffnen** klicken, oder `http://localhost:3000` von Hand eingeben.

**Beim Start erscheint „Die Daten sind in Benutzung“.**
Auf einem anderen PC läuft PLM noch mit denselben Daten — oder wurde dort nicht beendet, etwa weil
der PC im Ruhezustand ist. Dort beenden, oder hier **Übernehmen**: Das andere PLM speichert danach
nichts mehr (siehe 2, Daten auf einem Netzlaufwerk).

**„PLM arbeitet jetzt woanders“ oder „Daten von aussen geändert“.**
Ein anderes PLM hat die Daten übernommen, oder `plm.db` wurde an PLM vorbei geändert. Hier wird
nichts mehr gespeichert, damit nichts verloren geht. **Hier weiterarbeiten** lädt den aktuellen
Stand. Was noch nicht gespeichert war, liegt als Sicherung „nicht gespeichert“ vor (siehe 21).

**Beim Start erscheint „Datenordner nicht gefunden“.**
Der Ordner aus `plm.config` (`data_dir=`) ist nicht erreichbar — meist ist das Netzlaufwerk nicht
verbunden oder der Sync-Ordner noch nicht abgeglichen. Verbinden, dann **Erneut versuchen**. Stimmt
der Pfad nicht, in `plm.config` korrigieren und PLM neu starten.

**Beim Start erscheint „Daten von einem neueren PLM“.**
Auf einem anderen PC läuft eine neuere Version und hat die Daten schon geöffnet. Hier zuerst
aktualisieren (**Aktualisieren…** im Dialog), danach startet PLM normal.

**Windows warnt „Der Herausgeber konnte nicht verifiziert werden“.**
Die heruntergeladene ZIP vor dem Entpacken freigeben: rechte Maustaste → **Eigenschaften** →
**Zulassen** anhaken → OK, dann entpacken. Schon entpackt: einmal **Ausführen** bestätigen,
danach warnt `START-PLM.bat` nicht mehr.

**„Wer ist dran?“ erscheint jedes Mal.**
Das ist so gewollt, sobald zwei oder mehr Personen angelegt sind. Allein arbeiten: die übrigen
Personen unter Einstellungen → Benutzer deaktivieren.

**Die Farben der Klassifizierungen passen nach einem Update nicht.**
**Einstellungen → Daten → Design zurücksetzen.**

**Thermodrucker (Pipsta) druckt nicht.**

| Fehlermeldung | Lösung |
|---|---|
| LED blinkt rot/grün | Netzteil verwenden |
| `Kein WinUSB-Gerät gefunden` | Zadig-Treiber neu installieren |
| `pyusb nicht installiert` | `pip install pyusb` |
| Zeichen `@B` am Anfang | Drucker aus- und einschalten |

---

## 25. Begriffe

| Begriff | Bedeutung |
|---|---|
| **Item** | Oberbegriff für Baugruppe, Part und Dokument im PLM |
| **Baugruppe** (ASM) | Item mit Stückliste |
| **Part** (PRT) | einzelnes Teil, auch „Bauteil“ |
| **Dokument** (DOC) | Item, das nicht gefertigt wird, z. B. Zeichnung |
| **Item-Nummer** | z. B. `0028-asm-001-prt-001` |
| **Kurzcode** | kurzer Code zum Aufdrucken aufs Teil, z. B. `XHJ-1` (mit Revision) |
| **Revision** | Stand eines Items: `rev1`, `rev2` … Alte Revisionen bleiben erhalten |
| **BOM** / Stückliste | Positionen einer Baugruppenrevision |
| **Datei** | Datei an einer Revision (CAD, PDF, …) |
| **Klassifizierung** | Einordnung eines Items, z. B. Eigenteil, Kaufteil |
| **Verwendung** | in welchen Baugruppen ein Item steckt |
| **Historie** | Protokoll aller Änderungen |
| **Status** DFT / REV / REL / ECO / OBS | Entwurf / In Review / Freigegeben / Änderung / Veraltet |
| **ECO** | Änderung eines freigegebenen Items über eine neue Revision |
| **ECR** / Änderungsantrag | Antrag, etwas zu ändern — mit Begründung und Auswirkung |
| **fixiert** | fest auf eine Revision gesetzt (Stückliste, gelieferter Stand) |
| **Gelieferter Stand** | die beim Liefern fixierten Revisionen eines Produktionsauftrags |
| **Checkout** / Check-in | Dateien zum Bearbeiten in einen Ordner kopieren / zurückholen |
| **Auftrag** | Vorgang mit Phasen Angebot → Bestätigt → Geliefert → Fakturiert |
| **Angebot** | erste Phase eines Auftrags |
| **Produktionsauftrag** | Fertigung mit Nummer `LS-…`, eigenständig oder im Auftrag |
| **Lieferschein** | Ausdruck eines Produktionsauftrags |
| **Lagerartikel** | Artikel im Lager |
| **Rohmaterial** | Ausgangsmaterial wie Filament, in Lots geführt |
| **Lot-Nr.** | Charge eines Rohmaterials |
| **Normteil** | genormtes Bauteil aus dem Katalog (DIN, ISO …) |
| **Verkaufspreis** (VP) | Preis eines Items |
| **Sicherung** | Kopie der Datenbank |

---

## 26. Nummernkreise

```
Projekte:      0001 – 9999
Baugruppen:    0028-asm-001, 0028-asm-002, …
Parts:         0028-prt-001 / 0028-asm-001-prt-001
Dokumente:     0028-doc-001
Aufträge:      AUF-2026-0001   (auch Angebote — sie sind eine Phase des Auftrags)
Produktionsauftrag: LS-2026-0001
Einkauf:       EK-2026-0001
Kunden:        KD-0001
Lieferanten:   LF-0001
```

Präfixe, Stellen und Revisionsformat sind unter **Einstellungen → Admin** konfigurierbar.

---

*Technische Details (Installation, Update von Hand, Tests): siehe `README.md`*
