---
sidebar_position: 5
title: Excel-Importformat
---

# Excel-Importformat

Eine Produktfamilie wird aus einer Excel-Datei (`.xlsx`) importiert. Blattnamen und Spaltenüberschriften
müssen **exakt** übereinstimmen (Leerzeichen um Überschriften werden ignoriert).
[Die Beispieldatei](pathname:///samples/previo-sample-family.xlsx) herunterladen, um ein funktionierendes Beispiel zu sehen.

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
| `Brand/Fornitore` | nein | PREVIO Demo |
| `Descrizione_1`, `Descrizione_2` | nein | Freitext |

Bilder auf diesem Blatt werden als Bilder der Familie importiert.

## `Product lines`

Eine Zeile pro Linie. Zeilen ohne Name, Einheitenname, Einheitensymbol oder Preis werden übersprungen.

| Spalte | Bedeutung | Beispiel |
|---|---|---|
| `Nome_linea_prodotto` | Name der Linie | Finestra 2 ante |
| `Descrizione_opzionale` | Beschreibung (optional) | |
| `Tipo_Listino` | Preistyp — siehe [Preistypen](#preistypen) | `Superficie x [€/m2]` |
| `Listino_acquisto` | Der Preiswert **oder der Name eines Preistabellen-Blatts** | `280` oder `Matrice_1anta` |
| `Nome_UM` / `Simbolo_UM` | Name / Symbol der Einheit | Metro quadro / m² |
| `Sconto %` | Rabatt als Excel-Prozentwert (`0.1` = 10 %) | `0.1` |
| `MarkUp %` | Aufschlagsfaktor (`1.3` = 130 %; `1` = kein Aufschlag) | `1.3` |
| `Ore di posa x UM` | Montagestunden pro Einheit | `2` |

:::caution Prozentwerte
`Sconto %` und `MarkUp %` werden als Excel-Prozentwerte gelesen — eine Zelle mit der Anzeige *10 %* enthält `0.1`.
`10` einzutippen bedeutet 1000 %.
:::

## `Caracteristics`

Ein Raster, drei Spalten pro Merkmal:

- **Zeile 2**: die Merkmalsnamen, jeweils am Anfang eines Blocks aus drei Spalten (A, D, G, …).
- **Eine Kopfzeile** mit `Nome valore` in jedem Block.
- **Jede Zeile darunter**: eine Option pro Block — `[Optionsname, Preistyp, Wert]`.

|   | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| 1 | Caratteristiche | | | | | |
| 2 | **Vetro** | | | **Colore** | | |
| 3 | Nome valore | Tipo listino | Valore | Nome valore | Tipo listino | Valore |
| 4 | Doppio vetro | Superficie x [€/m2] | 0 | Bianco | Valore_Fisso [€/Pz] | 0 |
| 5 | Triplo vetro | Superficie x [€/m2] | 45 | Antracite | % sul valore base del prodotto | 0.08 |

Bei `% sul valore base del prodotto` ist der Wert ebenfalls ein Excel-Prozentwert (`0.08` = 8 %).
Bei `Tabella BxH [€/Pz]` ist der Wert der Name eines Preistabellen-Blatts.

## `Relations` (optional)

Die erste Spalte `Product line / Caracteristics` enthält die Liniennamen; eine Spalte pro Merkmal.
Jede nicht leere Zelle bedeutet „dieses Merkmal gilt für diese Linie“.

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | x | x | x |
| Zanzariera | | x | |

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
| `Superficie x [€/m2]` | Fläche in m² × Wert |
| `2xAltezza x [€/m]` | 2 × Breite in m × Wert |
| `Base+2xAltezza x [€/m]` | (Breite + 2 × Höhe) in m × Wert |
| `Ore di posa x [€/h]` | Montagestunden × Wert |
| `% sul valore base del prodotto` | Wert % des Linienpreises (nur Optionen) |
| `Tabella BxH [€/Pz]` | aus einem Preistabellen-Blatt nachgeschlagen |

Die genauen Formeln stehen unter [Wie Preise berechnet werden](./pricing.md).

## Häufige Importfehler

| Meldung | Lösung |
|---|---|
| The workbook does not have a sheet named "…" | Blatt hinzufügen / umbenennen — Namen sind groß-/kleinschreibungs- und schreibweisenempfindlich |
| The "Product Family" sheet must have a "Nome_famiglia" row | Eine Zeile `Nome_famiglia` mit Wert hinzufügen |
| Unknown Tipo_Listino "…" | Exakt eine der obigen Bezeichnungen verwenden (inkl. Leerzeichen und Klammern) |
| Failed to read the uploaded file as an Excel workbook | Als `.xlsx` speichern |
