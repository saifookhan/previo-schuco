---
sidebar_position: 4
title: Demo data
---

# Demo data

Every environment comes with ready-made data, so you can start testing right after logging in.

| What | Details |
|---|---|
| Companies & users | 4 demo companies, 7 demo users — see [Demo logins](./demo-logins.md) |
| Product family | **Demo Window W70**, owned by **Suppli S.r.l.**, published and shared with **Technometal** at **10%** |

## Demo Window W70

A small, made-up window catalog. All prices are fictional.

| Product line | How it's priced | Discount / markup |
|---|---|---|
| Finestra 1 anta | Width × height table (see below), per piece | 10% / 130% |
| Finestra 2 ante | €280 per m² | 10% / 130% |
| Zanzariera (insect screen) | €18 per metre of perimeter | 0% / 140% |

| Characteristic | Options |
|---|---|
| Vetro (glass) | Doppio vetro €0/m² · Triplo vetro €45/m² · Vetro acustico €60/m² |
| Colore (colour) | Bianco €0 · Antracite +8% of the product price · Effetto legno +15% |
| Maniglia (handle) | Standard €0 · Con chiave €35 · Design inox €55 |

*Zanzariera* only offers *Colore*; the windows offer all three.

**Price table for "Finestra 1 anta"** (€ per piece; width across, height down, in mm):

| H \ B | 600 | 800 | 1000 | 1200 |
|---|---|---|---|---|
| **800** | 210 | 240 | 270 | 300 |
| **1200** | 260 | 295 | 330 | 365 |
| **1600** | 310 | 350 | 390 | 430 |

A size between two columns uses the next bigger one (e.g. 750 × 1000 → the 800 × 1200 cell = €295).
A size bigger than the table (e.g. width 1300) cannot be priced — a good thing to test.

## Download the Excel file

[**previo-sample-family.xlsx**](pathname:///samples/previo-sample-family.xlsx) — the same family as an Excel workbook.
Import it yourself to test the import (it will be created as a new draft family), or use it as a
starting point for your own test catalogs. The format is explained in [Excel import format](./excel-format.md).

## If the demo family is missing

It is created automatically on every deploy. On a local setup, run:

```bash
pnpm --filter @schuco/api seed:demo-family
```

It only creates the family when Suppli doesn't already have one called "Demo Window W70" — if you
renamed or deleted it, the next run creates it again.
