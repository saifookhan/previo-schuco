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
2. Open the quote → **Add position**:
   - **Product** — pick a family (own or shared with you) and a product line.
   - **Size & position** — width, height, quantity, position name/code (custom codes allowed).
   - **Pricing** — price is calculated automatically (**A**); switch to manual (**M**) to override it.
     A live price preview updates as you type.
   - **Characteristics** — options for the line, each also auto or manual priced.
3. Edit, duplicate, delete and **reorder** positions.
4. **Download PDF**.

![Quote with three positions](/img/screens/quote-detail.png)

![Add a position form](/img/screens/add-position.png)

Positions from a shared family start with the discount set on the share. How every number is computed: [How prices are calculated](../pricing.md).

## Family versions in a quote

- The family list shows each family's version, e.g. “Finestra (v2)”, and under it what that version changed compared
  with the previous one (added, removed, economic, description) with **See changes**, which opens the comparison on the
  family's page.
- A position priced from an older version shows the version under its line name and, when a newer version can be
  quoted, a **v3 available** badge: click it for what changed and the link to the comparison. The position keeps its
  price; edit it to switch to the new version.
- In the PDF, each family's heading shows its version, and under it what changed since the previous version: what was
  added or removed, and which items have price changes (price tables with their % range) or text changes. A copy's
  first version is not compared with the family it was copied from.

## History

Open **History** at the bottom of a quote to see who created it and who added, edited, duplicated, reordered or
removed which position, and when. Anyone who can see the quote can see its history.

![Quote history](/img/screens/quote-history.png)

## Not built yet

- Status workflow — every quote stays **Draft** (Sent / Accepted / Rejected exist in the data model only).
- Editing the quote header, deleting a whole quote, duplicating a whole quote.
