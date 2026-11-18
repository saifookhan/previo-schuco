---
sidebar_position: 6
title: How prices are calculated
---

# How prices are calculated

All sizes are in **millimetres**. `B` = width, `H` = height.

## 1. The product line's own price

Either looked up in a **price table**, or computed with the formula of its pricing type:

| Pricing type | Formula |
|---|---|
| Fixed per piece | `valore` |
| Per metre of perimeter | `((B+H)*2/1000) * valore` |
| Per metre of width | `(B/1000) * valore` |
| Per metre of height | `(H/1000) * valore` |
| Per m² | `((B*H)/1000000) * valore` |
| 2 × height | `(H*2/1000) * valore` |
| Width + 2 × height | `((H*2+B)/1000) * valore` |
| Installation hours | `ore_di_posa * valore` — `ore_di_posa` is the line's hours plus those of the chosen options |
| Price table | first width ≥ B, first height ≥ H — no price if the size is bigger than the table |

`valore` is the line's value from the catalog.

A workbook made with version 1 of the Excel template keeps that version's "2 × height" formula,
`(B*2/1000) * valore` (a mistake version 2 fixed), so re-importing it doesn't change any price.

### Minimum price

A line or option with a **minimum purchase price** (`MinValue` in the Excel) never costs less: when
the computed price is lower, the minimum is used instead — before discount and markup.

A catalog owner can also write their own formula
using `valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` and `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Each chosen option

Same rules, with one addition: **"% of the product price"** options use
`valore_base_in_vendita * valore / 100`, where `valore_base_in_vendita` is the line's price from step 1.

An option imported from a version 2 Excel has its **own discount and markup**, used for its price
instead of the position's. Options without them (version 1) take the position's. On a family **shared with
you**, every option has its own: the ones set on the share.

## 3. The position total

```
each part       = price × (1 − discount% / 100) × (markup% / 100)
position total  = (line part + sum of option parts) × quantity
```

- The line uses the position's **discount** and **markup**; each option its own, or the position's
  when it has none. With no option discounts or markups this is the same as
  `(line + options) × quantity × (1 − discount%) × markup%`.
- **Discount** and **markup** start at the line's catalog values, or on a family shared with you at the
  values the share sets for that line. Both can be changed per position. `100` markup means no markup.
- **Installation hours** (for "Ore di posa" options): the line's plus each chosen option's — on a shared
  family, the share's.
- **Manual (M)** pricing replaces the computed line or option price with the value you type.

The quote total is the sum of its positions, **excluding VAT**.

## Worked example

Demo Window W70 → *Finestra 1 anta*, 800 × 1200 mm, quantity 4, *Triplo vetro*, *Antracite*, *Con chiave*,
default 10% discount and 130% markup:

| Part | Calculation | € |
|---|---|---|
| Line (price table, 800 × 1200) | table cell | 295.00 |
| Triplo vetro | 0.96 m² × 45 | 43.20 |
| Antracite | 8% of 295.00 | 23.60 |
| Con chiave | fixed | 35.00 |
| **Unit price** | | **396.80** |
| × 4 pieces | | 1 587.20 |
| − 10% discount | | 1 428.48 |
| × 130% markup | | **1 857.02** |

This is position P01 in the screenshot on [Quotes](./features/quotes.md).
