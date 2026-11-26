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
| View | The family's name, or the icon at the left of the row (opens a new tab) | Clicking the rest of the row expands it. One row is open at a time |
| Edit pricing | **Edit** on a line, characteristic or matrix | Value, formula, discount, markup, installation hours |
| Edit a matrix | Edit → add/remove rows and columns | Width × height grid |
| Publish / unpublish | **Status (published)** switch in the expanded row (button on the family's page) | The row shows Published or Draft. Only published families can be shared |
| New version | **New version** on the family's page | Same dialog as an import; the new version gets its own price validity and the old one keeps its dates |
| Duplicate | Copy icon on the row | A dialog asks for the copy's name, price validity and whether to publish it (starts from the original's dates, unpublished) |
| Delete | **Delete** inside the expanded row (button on the family's page) | |
| Change price validity | **Valid from** and **Valid to** inside the expanded row, then **Save** (or **Edit** on the family's page) | Owner (or super-admin) only. The **Validity dates** column shows the dates as DD.MM.YYYY |
| Ready for invoicing | Tag in the **Tags** column when it is on; switch in the expanded row (Yes/No on the family's page) | Only families ready for invoicing are offered in the quote builder. Owner only |
| With price list | Tag in the **Tags** column when it is on; switch in the expanded row (Yes/No on the family's page) | Whether there are prices behind the family — shown in the quote builder. Owner only |
| In library | Tag in the **Tags** column when it is on; switch in the expanded row (Yes/No on the family's page) | Whether your company's quote builder offers the family — for your own families and for shared ones. Admins and managers |

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
   - **Ready for invoicing** — tick it to offer the family in the quote builder; new families start not ready, copies and new versions start with the original's setting.
4. **Import family** saves it and opens its page.

![Upload dialog](/img/screens/product-family-upload.png)

File format: [Excel import format](../excel-format.md).

## Price validity

A family's prices can be used on **new quote positions** only from *Valid from* to *Valid to* (both days included,
Italian time). Outside those days the family isn't offered in the quote builder and the API refuses it. Positions
already on quotes keep their prices and can still be edited. The list shows the two dates as one range, with an
**Upcoming** or **Expired** badge; families imported before this existed have no dates and are always usable.
In the list, the owner opens the row and edits **Valid from** and **Valid to** together, then saves. *Valid from*
can't be emptied; emptying *Valid to* means until further notice.
Two versions of a family can't share a day: dates that overlap another version (in the list, on the family's page or
when uploading a new version) are refused with that version's number and dates, and nothing is saved. To start a new
version, first give the current one a *Valid to* before the new version's *Valid from* (the upload dialog then starts
the new version the day after). A version without dates counts as valid every day.

## Ready for invoicing

Only families marked **Ready for invoicing** (and published, with prices valid today) are offered when adding a
position to a quote; the API refuses the others. The **Tags** column shows it when it is on. Change it with the switch in the expanded row or the **Yes / No** dropdown on the
family's page — only the owning company can. A new family starts **not ready**; a copy or a new version starts
with the original's setting (change it in the dialog). Families that existed before this setting were marked ready. Positions already on quotes are not affected and can still be
edited. Each change is recorded in the family's history.

## With price list

**With price list** (Yes / No) says whether there are prices behind the family. It is set by hand by the owning
company — it doesn't come from the Excel file — and is **Yes** for every family until someone changes it; a copy keeps
the original's setting. It is information only: in the quote builder a family without a price list is marked
*(no price list)* and shows a reminder to check the prices, but it can still be used.

## In library

**In library** (Yes / No) is your company's own choice of which families its quote builder offers — useful when a
supplier shares many families you don't use. It works on your own families and on families shared with you, and
each company decides for itself: taking a shared family out of your library doesn't change it for anyone else.

- Out of the library, the family is no longer offered when adding a position to a quote (the API refuses it too),
  for everyone in your company. Positions already on quotes are not affected and can still be edited.
- Only admins and managers (whoever can share families) change it, and only they still see families that are out of
  the library in the list — for the other users they disappear from the catalog.
- Every family is in the library until someone takes it out, including families shared with you later.

## Pricing fields

- **Formula** variables: `valore`, `B` (width), `H` (height), `valore_base_in_vendita`, `ore_di_posa`.
  Functions: `min`, `max`, `round`, `ceil`, `floor`, `abs`, `sqrt`, `pow`.
- **Markup**: `100` means no markup.
- **Discount**: the line's own catalog discount.

Full rules: [How prices are calculated](../pricing.md).

## Versions and changes

When a family has more than one version, or has been copied, its page shows **Versions and changes**: a graph like a
git graph. One lane holds this family's versions (draft, current, expired or upcoming), one lane per copy made with
**Duplicate** branches off the version it was copied from, and if the family is itself a copy, a grey lane shows the
family it came from. Every edge shows how many changes lie along it. Click a version — or a copy, or the original — to
compare it with the one you are viewing; **Open** goes to its page.

The changes are drawn as a tree — family details, product lines, options — and each one is one of four kinds:

- **Added** — a new line, option or price-table size; or a line now offers an option.
- **Removed** — a line, option or size taken out; or a line no longer offers an option.
- **Economic** — prices, formulas, discounts, markups, installation hours, price validity, price tables.
- **Description** — names, descriptions, units and settings.

Turn each kind on or off with the chips above the tree, click a line or option to fold it, and click a change for the
before and after; a changed price table opens with the changed sizes coloured (orange more expensive, blue cheaper).
**List** shows the same changes as a list. Lines and options are matched by name, so a renamed line shows as one
removed and one added. Companies a family was shared with only see the versions shared with them.

## History

At the bottom of a family's page, **History** lists its import, publishing, new versions, sharing changes and every
price edit (which line or option, which fields). Only the owning company (and super-admins) see it — not companies
the family was shared with.

## Tabs

- **Own** — families your company owns.
- **Shared with me** — families other companies shared with you, with the owner and **your max discount** (the highest the share gives on any line or option).

## Filters

Above the list, for the tab you're on:

- **Search** — name, technical name, category, brand (and owner on *Shared with me*).
- **Category**, **Brand**, **Status** (published / draft).
- **Price validity** — *Valid today* (what the quote builder offers; families without dates count), *Upcoming*, *Expired*, *No dates*.
- **Ready for invoicing** (under *More filters*) — Yes / No.
- **With price list** and **In library** (under *More filters*) — Yes / No.
- **More filters** — *Prices valid on* a given day, *Updated from / to*, *Latest versions only* (hides versions a newer one replaces); on *Shared with me* also **Owner** and **Your discount** (with / without).
- **Sort** — newest first (default), recently updated, name, prices ending soonest.

Filters are part of the page address, so you can bookmark or share a filtered list, and **Back** undoes the last change.

## Not built yet

Editing which characteristics apply to which lines without re-importing the Excel file.
