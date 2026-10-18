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
| Per m² | `((B*H)/1000000) * valore` |
| 2 × width | `(B*2/1000) * valore` |
| Width + 2 × height | `((H*2+B)/1000) * valore` |
| Installation hours | `ore_di_posa * valore` |
| Price table | first width ≥ B, first height ≥ H — no price if the size is bigger than the table |

`valore` is the line's value from the catalog. A catalog owner can also write their own formula
using `valore`, `B`, `H`, `valore_base_in_vendita`, `ore_di_posa` and `min`, `max`, `round`, `ceil`,
`floor`, `abs`, `sqrt`, `pow`.

## 2. Each chosen option

Same rules, with one addition: **"% of the product price"** options use
`valore_base_in_vendita * valore / 100`, where `valore_base_in_vendita` is the line's price from step 1.

## 3. The position total

```
unit price      = line price + sum of chosen option prices
position total  = unit price × quantity × (1 − discount% / 100) × (markup% / 100)
```

- **Discount** starts at the share's discount (if the family was shared with you at more than 0%),
  otherwise the line's catalog discount. It can be changed per position.
- **Markup** starts at the line's catalog markup. `100` means no markup.
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
