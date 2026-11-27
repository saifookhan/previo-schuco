---
sidebar_position: 5
title: Excel import format
---

# Excel import format

A product family is imported from one Excel workbook (`.xlsx`). Sheet names and column headers must
match **exactly** (spaces around header names are ignored). Download
[the sample workbook](pathname:///samples/previo-sample-family.xlsx) to see a working example.

This page describes **version 2** of the template. Workbooks made with version 1 still import: the
version is recognised from the headers, and the columns version 2 added are simply empty.

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
| `Brand` | no | PREVIO Demo (version 1: `Brand/Fornitore`) |
| `Distributore` | no | Who the family is bought through |
| `Note` | no | Free text, e.g. a link to the technical documentation |
| `Descrizione_1`, `Descrizione_2` | no | Free text |
| `Titolo_immagine_1` … `Titolo_immagine_10` | no | Generale, Dettaglio, Sezione |

A family has three managed image slots and up to seven more. Titles come from `Titolo_immagine_1` to `Titolo_immagine_10`.
When a managed title is missing it becomes **Generale**, **Dettaglio** or **Sezione**. Pictures placed on this sheet fill
those slots in row order. None are required, and there are never more than ten. The three managed pictures are shown
with the family in the preventivo; the other seven are shown at the end. Empty slots can be filled later on the family's page.

## `Product lines`

One row per line. Rows without a name, unit name or unit symbol are skipped. A blank price is 0 — a
family can be priced entirely through its options.

| Column | Meaning | Example |
|---|---|---|
| `Nome_linea_prodotto` | Line name | Finestra 2 ante |
| `Descrizione_opzionale` | Description (optional) | |
| `Tipo_Listino` | Pricing type — see [Pricing types](#pricing-types) | `Superficie x [€/m2]` |
| `Listino_acquisto` | The price value, **or the name of a price-table sheet** | `280` or `Matrice_1anta` |
| `MinValue` | Lowest purchase price per piece (optional) — see [Minimum price](./pricing.md#minimum-price) | `120` |
| `Nome_UM` / `Simbolo_UM` | Unit name / symbol | Metro quadro / m² |
| `Sconto %` | Discount, as an Excel percentage (`0.1` = 10%) | `0.1` |
| `MarkUp %` | Markup multiplier (`1.3` = 130%; `1` = no markup) | `1.3` |
| `Ore di posa x UM` | Installation hours per unit | `2` |

:::caution Percentages
`Sconto %` and `MarkUp %` are read as Excel percentages — a cell showing *10%* is stored as `0.1`.
Typing `10` means 1000%.
:::

An empty `Sconto %`, `MarkUp %` or `Ore di posa x UM` cell means none (0%, ×1, 0 hours). On a new version, leave it
empty to keep what each company got on the earlier version when you share it again; a value you type is used
instead. See [Family sharing](./features/sharing.md).

## `Caracteristics`

A grid, seven columns per characteristic:

- **Row 2**: the characteristic names, each starting a block of seven columns (B, I, P, …).
- **A header row** containing `Nome valore` in each block.
- **Every row below it**: one option per block — `[Nome valore, Tipo_Listino, Listino_acquisto,
  MinValue, Sconto %, MarkUp %, Ore di posa x UM]`.

|   | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| 2 | **Vetro** | | | | | | |
| 4 | Nome valore | Tipo_Listino | Listino_acquisto | MinValue | Sconto % | MarkUp % | Ore di posa x UM |
| 5 | Doppio vetro | Superficie x [€/m2] | 0 | | 0 | 1 | 0 |
| 6 | Vetro acustico | Superficie x [€/m2] | 60 | 30 | 0.05 | 1.2 | 0.5 |

- `MinValue`, `Sconto %` and `MarkUp %` work like a line's, for **this option's price** — see
  [How prices are calculated](./pricing.md#2-each-chosen-option).
- `Ore di posa x UM` is the installation time the option **adds** to the line's (e.g. a heavier glass).
  An `Ore di posa x [€/h]` option is priced on the total.
- For `% sul valore base del prodotto`, the value is an Excel percentage too (`0.08` = 8%).
- For `Tabella BxH [€/Pz]`, the value is the name of a price-table sheet — the import stops if the
  workbook has no such sheet.

A version 1 workbook has three columns per characteristic (`[option name, pricing type, value]`);
its options use the position's discount and markup and add no installation time.

## `Relations` (optional)

First column `Product line / Caracteristics` holds the line names; one column per characteristic
name. `SI` means "this characteristic applies to this line"; `NO` or an empty cell means it doesn't.

| Product line / Caracteristics | Vetro | Colore | Maniglia |
|---|---|---|---|
| Finestra 1 anta | SI | SI | SI |
| Zanzariera | NO | SI | NO |

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
| `Altezza x [€/m]` | height in m × value |
| `Superficie x [€/m2]` | area in m² × value |
| `2xAltezza x [€/m]` | 2 × height in m × value |
| `Base+2xAltezza x [€/m]` | (width + 2 × height) in m × value |
| `Ore di posa x [€/h]` | installation hours (the line's plus its options') × value |
| `% sul valore base del prodotto` | value % of the product line's price (options only) |
| `Tabella BxH [€/Pz]` | looked up in a price-table sheet |

The exact formulas are on [How prices are calculated](./pricing.md).

## Common import errors

| Message | Fix |
|---|---|
| The workbook does not have a sheet named "…" | Add / rename the sheet — names are case- and spelling-sensitive |
| The "Product Family" sheet must have a "Nome_famiglia" row | Add a `Nome_famiglia` row with a value |
| Unknown Tipo_Listino "…" | Use one of the labels above exactly (including spaces and brackets) |
| … uses the price table "…", but the workbook has no sheet with that name | Add the price-table sheet, or fix the name in `Listino_acquisto` |
| … has the price "…", which is neither a number nor a sheet of the workbook | Type a number, or the name of a price-table sheet |
| Failed to read the uploaded file as an Excel workbook | Save as `.xlsx` |
