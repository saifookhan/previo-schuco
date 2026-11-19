---
sidebar_position: 3
title: Quotes
---

# Quotes (preventivi)

**Where:** *Quotes* in the sidebar · viewing needs `quote.view`, creating and editing needs `quote.edit`,
which only **supplier** companies have (in the demo data: Suppli).

![Quotes list](/img/screens/quotes.png)

## Flow

1. **New quote** → reference, customer name, fiscal code, address, city, project location.
2. Open the quote. It has three panes:
   - **Left — positions:** the quote overview, every position with its price, **New position** and the total. Click a
     position to edit it; the selected one also has **move up / down**, **duplicate** and **delete**.
   - **Middle — the position's form:**
     - **Product** — pick a family (own or shared with you) and a product line.
     - **Size & position** — position name/code (custom codes allowed), width, height, quantity.
     - **Characteristics** — one row per option of the line, each auto (**A**) or manual (**M**) priced.
     - **Pricing** — the line's price is calculated automatically (**A**); switch to manual (**M**) to override it.
       Discount and markup.
   - **Right — preview:**
     - **Calculation** — how the price is built, live as you type: the line's list price, discount and markup, each
       option at its own terms, the unit price, the quantity and the total, plus a **Formula trace** with every step.
     - **PDF** — the quote's PDF as it is saved. It reloads after you add or save a position.
3. **Add position** / **Save changes**. After saving, the position stays selected. Clicking another position (or
   **New position**) with unsaved changes asks before discarding them.
4. **Download PDF** (top right).

On a smaller screen the preview moves under the form; on a phone the three panes are tabs (**Positions**, **Edit**,
**Preview**).

![Quote builder: positions, form and calculation](/img/screens/quote-detail.png)

![The PDF preview](/img/screens/add-position.png)

Positions from a shared family start with the discount, markup and installation hours set on the share for that line and its options. How every number is computed: [How prices are calculated](../pricing.md).

## Family versions in a quote

- The family list shows each family's version, e.g. “Finestra (v2)”. As soon as a family is picked, what that version
  changed compared with the previous one (added, removed, economic, description) opens below it as a tree, the same as
  on the family's page: hide kinds of change, switch to a list, click a change for its before and after (or the price
  table cell by cell). **Hide changes** folds it; **Family page** opens the comparison there.
- The changes are detected from the content of the two versions when the new one is uploaded, not from the file's name
  or highlighted cells, and stored with the version.
- When a newer version of a position's family can be quoted, the position shows a branch icon in the list, and
  opening it shows **v3 available** with what changed and the link to the comparison. The position keeps its price
  until you switch: pick the new version in its form — the size, quantity and code stay, and so do the line and the
  options that have the same names in the new version — then **Save changes**.
- In the PDF, each family's heading shows its version, and under it what changed since the previous version: what was
  added or removed, and which items have price changes (price tables with their % range) or text changes. A copy's
  first version is not compared with the family it was copied from.

## History

Open **Quote overview** in the positions pane, then **History**, to see who created it and who added, edited, duplicated, reordered or
removed which position, and when. Anyone who can see the quote can see its history.

![Quote history](/img/screens/quote-history.png)

## Not built yet

- Status workflow — every quote stays **Draft** (Sent / Accepted / Rejected exist in the data model only).
- Editing the quote header, deleting a whole quote, duplicating a whole quote.
