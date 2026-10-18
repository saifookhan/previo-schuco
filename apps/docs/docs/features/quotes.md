---
sidebar_position: 3
title: Quotes
---

# Quotes (preventivi)

**Where:** *Quotes* in the sidebar · viewing needs `quote.view`, creating and editing needs `quote.edit`,
which only **supplier** companies have (in the demo data: Suppli).

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

Positions from a shared family start with the discount set on the share.

## Not built yet

- Status workflow — every quote stays **Draft** (Sent / Accepted / Rejected exist in the data model only).
- Editing the quote header, deleting a whole quote, duplicating a whole quote.
