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
| Import from Excel | **Import from Excel** on the list | Pick the file, check it, set price validity — see [Importing from Excel](#importing-from-excel) |
| View | Click a family | Lines, characteristics, pricing matrices |
| Edit pricing | **Edit** on a line, characteristic or matrix | Value, formula, discount, markup, installation hours |
| Edit a matrix | Edit → add/remove rows and columns | Width × height grid |
| Publish / unpublish | Actions menu | Only published families can be shared |
| New version | **New version** on the family's page | Same dialog as an import; the new version gets its own price validity and the old one keeps its dates |
| Duplicate | Copy icon in the actions | A dialog asks for the copy's name, price validity and whether to publish it (starts from the original's dates, unpublished) |
| Delete | Actions menu | |
| Change price validity | **Edit** next to the dates on the family's page | Owner (or super-admin) only |

![Product family detail](/img/screens/product-family-detail.png)

## Importing from Excel

1. Click **Import from Excel** and pick the `.xlsx` file. It is only **checked** — nothing is saved yet.
2. A dialog shows what the file holds: the family name, how many product lines, characteristics, options, price
   tables, relations and images, and anything worth checking (for example a Relations row naming a product line
   that doesn't exist — that row will be skipped). A file that can't be imported is rejected here with the reason.
3. Fill in:
   - **Family name** — taken from the file; change it if you like.
   - **Valid from** (required, today by default) and **Valid to** (empty = until further notice).
   - **Publish right away** — otherwise it is saved as a draft.
4. **Import family** saves it and opens its page.

![Upload dialog](/img/screens/product-family-upload.png)

File format: [Excel import format](../excel-format.md).

## Price validity

A family's prices can be used on **new quote positions** only from *Valid from* to *Valid to* (both days included,
Italian time). Outside those days the family isn't offered in the quote builder and the API refuses it. Positions
already on quotes keep their prices and can still be edited. The list shows the dates with an **Upcoming** or
**Expired** badge; families imported before this existed have no dates and are always usable.

## Pricing fields

- **Formula** variables: `valore`, `B` (width), `H` (height), `valore_base_in_vendita`, `ore_di_posa`.
  Functions: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Markup**: `100` means no markup.
- **Discount**: the line's own catalog discount.

Full rules: [How prices are calculated](../pricing.md).

## History

At the bottom of a family's page, **History** lists its import, publishing, new versions, sharing changes and every
price edit (which line or option, which fields). Only the owning company (and super-admins) see it — not companies
the family was shared with.

## Tabs

- **Own** — families your company owns.
- **Shared with me** — families other companies shared with you, with the owner and **your discount**.

## Filters

Above the list, for the tab you're on:

- **Search** — name, technical name, category, brand (and owner on *Shared with me*).
- **Category**, **Brand**, **Status** (published / draft).
- **Price validity** — *Valid today* (what the quote builder offers; families without dates count), *Upcoming*, *Expired*, *No dates*.
- **More filters** — *Prices valid on* a given day, *Updated from / to*, *Latest versions only* (hides versions a newer one replaces); on *Shared with me* also **Owner** and **Your discount** (with / without).
- **Sort** — newest first (default), recently updated, name, prices ending soonest.

Filters are part of the page address, so you can bookmark or share a filtered list, and **Back** undoes the last change.

## Not built yet

Editing which characteristics apply to which lines without re-importing the Excel file.
