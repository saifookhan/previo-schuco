---
sidebar_position: 1
title: Product families (catalog)
---

# Product families (catalog)

A **product family** is a manufacturer's catalog of one product type (for example a window series).
It contains **product lines** (the sellable items), **characteristics** (options such as glass or
colour, each with its own price) and **pricing matrices** (price by width × height).

**Where:** *Product families* in the sidebar · needs `catalog.view`; editing needs `catalog.edit`
(manufacturer companies only).

Every environment already has one: **Demo Window W70** (see [Demo data](../demo-data.md)).

![Product families list](/img/screens/product-families.png)

## What you can do

| Action | How | Notes |
|---|---|---|
| Import from Excel | **Import from Excel** on the list | Creates a new family as an unpublished draft — format: [Excel import format](../excel-format.md) |
| View | Click a family | Lines, characteristics, pricing matrices |
| Edit pricing | **Edit** on a line, characteristic or matrix | Value, formula, discount, markup, installation hours |
| Edit a matrix | Edit → add/remove rows and columns | Width × height grid |
| Publish / unpublish | Actions menu | Only published families can be shared |
| New version | **New version** on a published family | Published families are **locked for editing**; a new version is an editable draft copy that supersedes the old one |
| Duplicate / delete | Actions menu | |

![Product family detail](/img/screens/product-family-detail.png)

## Pricing fields

- **Formula** variables: `valore`, `B` (width), `H` (height), `valore_base_in_vendita`, `ore_di_posa`.
  Functions: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Markup**: `100` means no markup.
- **Discount**: the line's own catalog discount.

Full rules: [How prices are calculated](../pricing.md).

## Tabs

- **Own** — families your company owns.
- **Shared with me** — families other companies shared with you, with the owner and **your discount**.

## Not built yet

Editing which characteristics apply to which lines without re-importing the Excel file.
