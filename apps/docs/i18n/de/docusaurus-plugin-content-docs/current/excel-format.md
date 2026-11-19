---
sidebar_position: 5
title: Excel-Importformat
---

# Excel-Importformat

Eine Produktfamilie wird aus einer Excel-Datei (`.xlsx`) importiert. Blattnamen und Spaltenüberschriften
müssen **exakt** übereinstimmen (Leerzeichen um Überschriften werden ignoriert).
[Die Beispieldatei](pathname:///samples/previo-sample-family.xlsx) herunterladen, um ein funktionierendes Beispiel zu sehen.

Diese Seite beschreibt **Version 2** der Vorlage. Dateien aus Version 1 lassen sich weiterhin
importieren: Die Version wird an den Überschriften erkannt, die von Version 2 ergänzten Spalten bleiben leer.

| Blatt | Pflicht | Inhalt |
|---|---|---|
| `Product Family` | ja | Name und Daten der Familie |
| `Product lines` | ja | Die verkaufbaren Artikel |
| `Caracteristics` | ja | Optionen (Glas, Farbe, …) und ihre Preise |
| `Relations` | nein | Welche Optionen zu welcher Linie gehören |
| *beliebiger anderer Name* | — | Preistabellen (Breite × Höhe), auf die die obigen Blätter verweisen |

Achtung auf die Schreibweise **`Caracteristics`** — der Import sucht genau diesen Namen.

## `Product Family`

Zwei Spalten, `Label` und `Value`, eine Zeile pro Feld:

| Label | Pflicht | Beispiel |
|---|---|---|
| `Nome_famiglia` | ja | Demo Window W70 |
| `Nome_tecnico_famiglia` | nein | W70-DEMO |
| `Categoria prodotti` | nein | Finestre |
| `Brand` | nein | PREVIO Demo (Version 1: `Brand/Fornitore`) |
| `Distributore` | nein | Über wen die Familie bezogen wird |
| `Note` | nein | Freitext, z. B. ein Link zur technischen Dokumentation |
| `Descrizione_1`, `Descrizione_2` | nein | Freitext |

Bilder auf diesem Blatt werden als Bilder der Familie importiert.

## `Product lines`

Eine Zeile pro Linie. Zeilen ohne Name, Einheitenname oder Einheitensymbol werden übersprungen. Ein
leerer Preis ist 0 — eine Familie kann ihre Preise ganz über die Optionen haben.

| Spalte | Bedeutung | Beispiel |
|---|---|---|
| `Nome_linea_prodotto` | Name der Linie | Finestra 2 ante |
| `Descrizione_opzionale` | Beschreibung (optional) | |
| `Tipo_Listino` | Preistyp — siehe [Preistypen](#preistypen) | `Superficie x [€/m2]` |
| `Listino_acquisto` | Der Preiswert **oder der Name eines Preistabellen-Blatts** | `280` oder `Matrice_1anta` |
| `MinValue` | Mindesteinkaufspreis pro Stück (optional) — siehe [Mindestpreis](./pricing.md#mindestpreis) | `120` |
| `Nome_UM` / `Simbolo_UM` | Name / Symbol der Einheit | Metro quadro / m² |
| `Sconto %` | Rabatt als Excel-Prozentwert (`0.1` = 10 %) | `0.1` |
| `MarkUp %` | Aufschlagsfaktor (`1.3` = 130 %; `1` = kein Aufschlag) | `1.3` |
| `Ore di posa x UM` | Montagestunden pro Einheit | `2` |

:::caution Prozentwerte
`Sconto %` und `MarkUp %` werden als Excel-Prozentwerte gelesen — eine Zelle mit der Anzeige *10 %* enthält `0.1`.
`10` einzutippen bedeutet 1000 %.
:::

Eine leere Zelle `Sconto %`, `MarkUp %` oder `Ore di posa x UM` bedeutet keiner (0 %, ×1, 0 Stunden). Lassen Sie sie
in einer neuen Version leer, um beim erneuten Teilen zu behalten, was jedes Unternehmen in der früheren Version hatte;
ein eingetragener Wert wird stattdessen verwendet. Siehe [Familien teilen](./features/sharing.md).

## `Caracteristics`

Ein Raster, sieben Spalten pro Merkmal:

- **Zeile 2**: die Merkmalsnamen, jeweils am Anfang eines Blocks aus sieben Spalten (B, I, P, …).
- **Eine Kopfzeile** mit `Nome valore` in jedem Block.
- **Jede Zeile darunter**: eine Option pro Block — `[Nome valore, Tipo_Listino, Listino_acquisto,
  MinValue, Sconto %, MarkUp %, Ore di posa x UM]`.

|   | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| 2 | **Vetro** | | | | | | |
| 4 | Nome valore | Tipo_Listino | Listino_acquisto | MinValue | Sconto % | MarkUp % | Ore di posa x UM |
| 5 | Doppio vetro | Superficie x [€/m2] | 0 | | 0 | 1 | 0 |
| 6 | Vetro acustico | Superficie x [€/m2] | 60 | 30 | 0.05 | 1.2 | 0.5 |

- `MinValue`, `Sconto %` und `MarkUp %` wirken wie bei einer Linie, für **den Preis dieser Option** —
  siehe [Wie Preise berechnet werden](./pricing.md#2-jede-gewählte-option).
- `Ore di posa x UM` ist die Montagezeit, die die Option zu der der Linie **hinzufügt** (z. B. ein
  schwereres Glas). Eine Option `Ore di posa x [€/h]` wird auf die Summe berechnet.
- Bei `% sul valore base del prodotto` ist der Wert ebenfalls ein Excel-Prozentwert (`0.08` = 8 %).
- Bei `Tabella BxH [€/Pz]` ist der Wert der Name eines Preistabellen-Blatts — der Import bricht ab,
  wenn die Datei kein solches Blatt hat.

Eine Datei der Version 1 hat drei Spalten pro Merkmal (`[Optionsname, Preistyp, Wert]`); ihre Optionen
verwenden Rabatt und Aufschlag der Position und fügen keine Montagezeit hinzu.

## `Relations` (optional)

Die erste Spalte `Product line / Caracteristics` enthält die Liniennamen; eine Spalte pro Merkmal.
`SI` bedeutet „dieses Merkmal gilt für diese Linie“; `NO` oder eine leere Zelle bedeutet, dass es nicht gilt.

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | SI | SI | SI |
| Zanzariera | NO | SI | NO |

## Preistabellen-Blätter

Breiten in der ersten Zeile, Höhen in der ersten Spalte, Preise in den Zellen (mm und €):

| H \ B | 600 | 800 | 1000 |
|---|---|---|---|
| 800 | 210 | 240 | 270 |
| 1200 | 260 | 295 | 330 |

Breiten und Höhen müssen aufsteigend sortiert sein. Nicht numerische Kopfzellen werden ignoriert.

## Preistypen

`Tipo_Listino` muss exakt einer dieser Bezeichnungen entsprechen, sonst wird der Import abgelehnt:

| Tipo_Listino | Preis = |
|---|---|
| `Valore_Fisso [€/Pz]` | Wert (fest pro Stück) |
| `Perimetro x [€/m]` | Umfang in m × Wert |
| `Base x [€/m]` | Breite in m × Wert |
| `Altezza x [€/m]` | Höhe in m × Wert |
| `Superficie x [€/m2]` | Fläche in m² × Wert |
| `2xAltezza x [€/m]` | 2 × Höhe in m × Wert |
| `Base+2xAltezza x [€/m]` | (Breite + 2 × Höhe) in m × Wert |
| `Ore di posa x [€/h]` | Montagestunden (der Linie plus die der Optionen) × Wert |
| `% sul valore base del prodotto` | Wert % des Linienpreises (nur Optionen) |
| `Tabella BxH [€/Pz]` | aus einem Preistabellen-Blatt nachgeschlagen |

Die genauen Formeln stehen unter [Wie Preise berechnet werden](./pricing.md).

## Häufige Importfehler

| Meldung | Lösung |
|---|---|
| The workbook does not have a sheet named "…" | Blatt hinzufügen / umbenennen — Namen sind groß-/kleinschreibungs- und schreibweisenempfindlich |
| The "Product Family" sheet must have a "Nome_famiglia" row | Eine Zeile `Nome_famiglia` mit Wert hinzufügen |
| Unknown Tipo_Listino "…" | Exakt eine der obigen Bezeichnungen verwenden (inkl. Leerzeichen und Klammern) |
| … uses the price table "…", but the workbook has no sheet with that name | Das Preistabellen-Blatt hinzufügen oder den Namen in `Listino_acquisto` korrigieren |
| … has the price "…", which is neither a number nor a sheet of the workbook | Eine Zahl oder den Namen eines Preistabellen-Blatts eintragen |
| Failed to read the uploaded file as an Excel workbook | Als `.xlsx` speichern |
