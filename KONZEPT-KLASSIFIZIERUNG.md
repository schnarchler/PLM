# Konzept: Klassifizierung und Suche

Stand: 16.10.2026. Ziel: Items schneller finden und sauberer einordnen, ohne die
bestehenden Daten zu verlieren. Begriffe wie in der README unter **Begriffe**.

---

## 1. Was jetzt schon umgesetzt ist (Phase 0)

| Bereich | Umsetzung |
|---|---|
| Suche | mehrere Wörter, alle müssen vorkommen (in Nummer, Name, Beschreibung, Notizen, Klassifizierung) |
| Suche | Umlaute unabhängig von Gross-/Kleinschreibung („öse“ findet „Öse“) |
| Suche | Relevanz: exakte bzw. beginnende Item-Nummer zuerst, dann Name, dann der Rest |
| Filter | Klassifizierungs-Chips filtern exakt, auch ohne Suchwort; Trefferzahl pro Chip; Chip „ohne“ |
| Filter | Werte an Items, die nicht in der Liste stehen, erscheinen als gestrichelte Chips |
| Pflege | Umbenennen in Einstellungen → PLM überträgt den Namen auf alle Items und die Voreinstellungen |
| Pflege | Entfernen fragt, ob die Items den Wert behalten; verwaiste Werte lassen sich übernehmen |
| Pflege | Schreibweisen („ kaufteil “) werden beim Speichern auf den Listeneintrag gezogen, Altbestand einmalig per Migration |
| Bearbeiten | ein Wert, der nicht in der Liste steht, geht im Bearbeiten-Dialog nicht mehr verloren |

---

## 2. Was am heutigen Modell grundsätzlich hakt

1. **Zwei Fragen in einem Feld.** Die Standardliste mischt die *Beschaffungsart*
   (Eigenteil, Kaufteil, Normteil) mit der *Materialform* (Halbzeug, Rohmaterial). Ein
   zugekaufter Stecker ist aber gleichzeitig „Kaufteil“ und „Elektronik“. Mit einem
   einzigen Wert geht eine der beiden Informationen verloren.
2. **Keine Hierarchie.** „Befestigung › Clips › Kabelclips“ lässt sich nicht abbilden.
   Die Liste wird flach und lang, und die Suche nach „Befestigung“ findet die Clips nicht.
3. **Der Name ist der Schlüssel.** Am Item steht nur der Text. Umbenennen braucht darum
   eine Massenänderung (jetzt automatisiert). Zusammenführen zweier Klassen und
   Auswertungen über die Zeit bleiben trotzdem schwierig.
4. **Keine Merkmale.** Gewinde, Länge, Material oder Farbe stehen bei Items höchstens
   frei in der Beschreibung. Normteile haben Felder für Grösse und Material, Items nicht.
   „Alle Halter aus PETG unter 50 g“ lässt sich so nicht suchen.
5. **„Normteil“ doppelt.** Normteile sind eigene Datensätze (Navigation → Normteile).
   „Normteil“ ist aber auch eine Klassifizierung für Items. Damit gibt es zwei Arten von
   Normteilen.
6. **Zwei Systeme.** Lagerartikel haben eine fest eingebaute Kategorienliste
   (`INV_CATS` in `12-lager.js`). Sie ist unabhängig von der PLM-Klassifizierung.
7. **Suchtechnik.** `LIKE` ohne Index: keine Präfix-Suche mit Wortgrenzen, keine Facetten
   ausser der Klassifizierung, keine gespeicherten Suchen. FTS5 fehlt in der eingesetzten
   sql.js-Version, **FTS4 ist vorhanden** (geprüft).

---

## 3. Zielbild: drei getrennte Ebenen

| Ebene | Frage | Werte | Anzahl pro Item |
|---|---|---|---|
| **Beschaffungsart** | Wie kommt das Teil ins Haus? | fest: Eigenfertigung, Zukauf, Normteil | genau 1, automatisch vorbelegt |
| **Klasse** | Was ist es? | frei definierbar, **hierarchisch** (Baum) | 0 oder 1 |
| **Schlagworte** | Was sonst noch? | frei, z. B. „UV-beständig“, „Kunde A“, „Outdoor“ | beliebig viele |

Dazu pro Klasse optional eine **Merkmalleiste**, angelehnt an DIN 4000/ECLASS, aber
bewusst klein: „Schrauben“ definiert Gewinde (Text), Länge (Zahl, mm) und Kopfform
(Liste). Jedes Item dieser Klasse bekommt die Felder im Datenblatt. Unterklassen
erben die Merkmale.

**Warum so:** Die Beschaffungsart steuert Logik (Kalkulation: Zukauf mit
Einkaufspreis, Eigenfertigung mit Druckkosten; Ableitung aus der Quelle gibt es schon).
Die Klasse dient dem Finden, die Schlagworte allem, was quer liegt. Jede Ebene bleibt
dadurch einfach.

---

## 4. Datenmodell (Skizze)

```sql
-- Klassen als Baum mit stabiler ID
CREATE TABLE classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT,
  parent_id INTEGER REFERENCES classes(id),
  position INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0          -- ausblenden statt löschen
);

-- Merkmalleiste je Klasse (vererbt an Unterklassen)
CREATE TABLE class_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  key TEXT NOT NULL,                  -- z. B. 'gewinde'
  label TEXT NOT NULL,                -- „Gewinde"
  type TEXT NOT NULL,                 -- text | number | list | bool
  unit TEXT,                          -- mm, g, …
  options_json TEXT,                  -- für type = list
  position INTEGER DEFAULT 0
);

ALTER TABLE items ADD COLUMN class_id INTEGER REFERENCES classes(id);
ALTER TABLE items ADD COLUMN procurement TEXT;   -- make | buy | standard

CREATE TABLE item_tags (item_id INTEGER NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (item_id, tag));

CREATE TABLE item_attribute_values (
  item_id INTEGER NOT NULL, attribute_id INTEGER NOT NULL,
  value_text TEXT, value_num REAL,
  PRIMARY KEY (item_id, attribute_id)
);

-- Suchtext je Item (klein, ä→ae, ß→ss), gepflegt beim Speichern
CREATE VIRTUAL TABLE item_search USING fts4(item_id, text);
```

**Migration aus dem heutigen Stand** (einmalig, über `migrateOnce`):

| heutige Klassifizierung | wird zu |
|---|---|
| Eigenteil | `procurement = make` |
| Kaufteil | `procurement = buy` |
| Normteil | `procurement = standard` |
| alle anderen Werte | je eine Zeile in `classes`, `items.class_id` gesetzt |

Die Spalte `items.classification` bleibt während des Übergangs als Lesespiegel
stehen, damit Exporte, CSV und ältere Sicherungen weiter funktionieren. Weil
Sicherungen beim Wiederherstellen durch `applySchema()` laufen, bekommen auch alte
Stände die Migration.

Wichtig für sql.js: `db.export()` entfernt registrierte SQL-Funktionen. Eigene
Funktionen wie `fold()` in SQL taugen deshalb nicht. Den Suchtext beim Schreiben in
JavaScript normalisieren und als Spalte ablegen.

---

## 5. Suche

- **Facetten** links oder als Chip-Zeilen, jeweils mit Zahl: Typ (ASM/PRT/DOC),
  Beschaffungsart, Klasse (Baum, Zahl inklusive Unterklassen), Status (DFT…OBS), Projekt,
  Schlagworte. Dazu Zustände, die heute schon in den Daten stecken: „geliefert“,
  „in keiner Stückliste verwendet“, „ohne Dateien“, „ohne Preis“.
- **Filter im Suchfeld** für Tastaturnutzer:
  `klasse:clips status:rel projekt:0028 m5` — wird in Filter zerlegt, die Chips zeigen
  sie an und lassen sich einzeln wegklicken.
- **Präfix-Suche über FTS4**: „wand*“ findet „Wandhalter“, Treffer an Wortanfängen
  zählen mehr. Der normalisierte Suchtext deckt Umlaute vollständig ab, auch „oese“ → „Öse“.
- **Merkmal-Filter**, sobald Merkmalleisten existieren: „Länge 15–25 mm“, „Material = PETG“.
- **Gespeicherte Suchen** („Meine Filter“) in der Suchansicht, z. B. „Kaufteile ohne Preis“.
- **Vorschlag beim Anlegen**: aus vorhandenen Items mit ähnlichem Namen die häufigste
  Klasse vorschlagen („…halter“ → „Halterungen“). Einfache Heuristik, keine KI nötig.

---

## 6. Oberfläche

| Ort | Änderung |
|---|---|
| Einstellungen → PLM | Klassen als Baum (Ziehen = umhängen), Zähler pro Klasse inkl. Unterklassen, **Zusammenführen** zweier Klassen, Merkmalleiste pro Klasse |
| Item bearbeiten | Klassenwahl mit Suche über den Pfad („Befestigung › Clips“), Beschaffungsart als Umschalter, Schlagworte als Eingabe mit Vorschlägen |
| Datenblatt | Block „Merkmale“ mit den Feldern der Klasse |
| Projektbaum | Filter nach Klasse und Beschaffungsart; Farbe der Klasse als Streifen |
| Lager | Kategorie aus denselben Klassen statt fester Liste |
| Normteile | kein „Normteil“-Wert mehr an Items; Normteile behalten ihren eigenen Katalog |

---

## 7. Schritte

| Phase | Inhalt | Aufwand | Nutzen |
|---|---|---|---|
| 0 | siehe Abschnitt 1 — **erledigt** | — | sofort bessere Treffer, sauberere Daten |
| 1 | Beschaffungsart als eigenes Feld (aus Quelle abgeleitet), Migration der drei Werte; Lager-Kategorien aus der PLM-Liste | klein–mittel | Klassifizierung wird frei für das „Was ist es?“ |
| 2 | Klassen mit ID und Baum, Baum-Editor, Facetten mit Unterklassen, Filter im Suchfeld | mittel | Ordnung bei wachsender Liste, schnelles Eingrenzen |
| 3 | Merkmalleisten, Merkmale im Datenblatt, Merkmal-Filter | gross | Suche nach Eigenschaften statt nach Namen |
| 4 | FTS4-Suchindex, Präfix-Suche, gespeicherte Suchen, Klassenvorschlag | mittel | schnell auch bei vielen Items |

Jede Phase ist für sich nutzbar. Phase 1 lohnt sich zuerst: Sie löst Problem 1 und 6
mit wenig Aufwand und bereitet alles Weitere vor.

---

## 8. Offene Fragen

1. Soll „Normteil“ als Klassifizierung an Items verschwinden, weil Normteile ein eigener
   Katalog sind? Oder gibt es Items, die bewusst als Normteil geführt werden?
2. Reicht **eine** Klasse plus Schlagworte, oder braucht ein Item mehrere Klassen?
3. Sollen Lagerartikel dieselben Klassen verwenden wie Items?
4. Nach welchen drei bis fünf Merkmalen suchst du am häufigsten (Material, Farbe,
   Gewinde, Länge, Drucker …)? Davon hängt ab, ob sich Phase 3 lohnt.
5. Wie viele Items sind es heute ungefähr, und wie viele in einem Jahr? Unter einigen
   tausend reicht `LIKE`; Phase 4 wird erst darüber wichtig.
