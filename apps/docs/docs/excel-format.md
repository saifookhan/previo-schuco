---
sidebar_position: 5
title: Excel import format
---

# Excel import format

A product family is imported from one Excel workbook (`.xlsx`). Sheet names and column headers must
match **exactly** (spaces around header names are ignored). Download
[the sample workbook](pathname:///samples/previo-sample-family.xlsx) to see a working example.

| Sheet | Required | Contains |
|---|---|---|
| `Product Family` | yes | Family name and details |
| `Product lines` | yes | The sellable items |
| `Caracteristics` | yes | Options (glass, colour, …) and their prices |
| `Relations` | no | Which options apply to which line |
| *any other name* | — | Price tables (width × height), referenced from the sheets above |

Note the spelling **`Caracteristics`** — the import looks for that exact name.

## `Product Family`

Two columns, `Label` and `Value`, one row per field:

| Label | Required | Example |
|---|---|---|
| `Nome_famiglia` | yes | Demo Window W70 |
| `Nome_tecnico_famiglia` | no | W70-DEMO |
| `Categoria prodotti` | no | Finestre |
| `Brand/Fornitore` | no | PREVIO Demo |
| `Descrizione_1`, `Descrizione_2` | no | Free text |

Images placed on this sheet are imported as the family's pictures.

## `Product lines`

One row per line. Rows without a name, unit name, unit symbol or price are skipped.

| Column | Meaning | Example |
|---|---|---|
| `Nome_linea_prodotto` | Line name | Finestra 2 ante |
| `Descrizione_opzionale` | Description (optional) | |
| `Tipo_Listino` | Pricing type — see [Pricing types](#pricing-types) | `Superficie x [€/m2]` |
| `Listino_acquisto` | The price value, **or the name of a price-table sheet** | `280` or `Matrice_1anta` |
| `Nome_UM` / `Simbolo_UM` | Unit name / symbol | Metro quadro / m² |
| `Sconto %` | Discount, as an Excel percentage (`0.1` = 10%) | `0.1` |
| `MarkUp %` | Markup multiplier (`1.3` = 130%; `1` = no markup) | `1.3` |
| `Ore di posa x UM` | Installation hours per unit | `2` |

:::caution Percentages
`Sconto %` and `MarkUp %` are read as Excel percentages — a cell showing *10%* is stored as `0.1`.
Typing `10` means 1000%.
:::

## `Caracteristics`

A grid, three columns per characteristic:

- **Row 2**: the characteristic names, each starting a block of three columns (A, D, G, …).
- **A header row** containing `Nome valore` in each block.
- **Every row below it**: one option per block — `[option name, pricing type, value]`.

|   | A | B | C | D | E | F |
|---|---|---|---|---|---|---|
| 1 | Caratteristiche | | | | | |
| 2 | **Vetro** | | | **Colore** | | |
| 3 | Nome valore | Tipo listino | Valore | Nome valore | Tipo listino | Valore |
| 4 | Doppio vetro | Superficie x [€/m2] | 0 | Bianco | Valore_Fisso [€/Pz] | 0 |
| 5 | Triplo vetro | Superficie x [€/m2] | 45 | Antracite | % sul valore base del prodotto | 0.08 |

For `% sul valore base del prodotto`, the value is an Excel percentage too (`0.08` = 8%).
For `Tabella BxH [€/Pz]`, the value is the name of a price-table sheet.

## `Relations` (optional)

First column `Product line / Caracteristics` holds the line names; one column per characteristic
name. Any non-empty cell means "this characteristic applies to this line".

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | x | x | x |
| Zanzariera | | x | |

## Price-table sheets

Width across the first row, height down the first column, prices in the cells (mm and €):

| H \ B | 600 | 800 | 1000 |
|---|---|---|---|
| 800 | 210 | 240 | 270 |
| 1200 | 260 | 295 | 330 |

Widths and heights must be in ascending order. Non-numeric header cells are ignored.

## Pricing types

`Tipo_Listino` must be one of these exact labels, or the import is rejected:

| Tipo_Listino | Price = |
|---|---|
| `Valore_Fisso [€/Pz]` | value (fixed per piece) |
| `Perimetro x [€/m]` | perimeter in m × value |
| `Base x [€/m]` | width in m × value |
| `Superficie x [€/m2]` | area in m² × value |
| `2xAltezza x [€/m]` | 2 × width in m × value |
| `Base+2xAltezza x [€/m]` | (width + 2 × height) in m × value |
| `Ore di posa x [€/h]` | installation hours × value |
| `% sul valore base del prodotto` | value % of the product line's price (options only) |
| `Tabella BxH [€/Pz]` | looked up in a price-table sheet |

The exact formulas are on [How prices are calculated](./pricing.md).

## Common import errors

| Message | Fix |
|---|---|
| The workbook does not have a sheet named "…" | Add / rename the sheet — names are case- and spelling-sensitive |
| The "Product Family" sheet must have a "Nome_famiglia" row | Add a `Nome_famiglia` row with a value |
| Unknown Tipo_Listino "…" | Use one of the labels above exactly (including spaces and brackets) |
| Failed to read the uploaded file as an Excel workbook | Save as `.xlsx` |
