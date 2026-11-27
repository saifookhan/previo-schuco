---
sidebar_position: 3
title: Quotes
---

# Quotes (preventivi)

**Where:** *Quotes* in the sidebar · viewing needs `quote.view`, creating and editing needs `quote.edit`,
which only **supplier** companies have (in the demo data: Suppli).

![Quotes list](/img/screens/quotes.png)

## Flow

1. **New quote** → reference and customer (fiscal code, address, city and project are optional and can be changed later).
2. The quote opens on one page, as in the client's design:
   - **Top bar** — the reference, the variant (`V1A2`), its name and status, the customer and project (click them to edit the
     customer, fiscal code, address, city, project, date and internal notes), the **total VAT excluded**, and the
     buttons **Version matrix**, **Print settings**, **Preview**, **Export** (coming soon), **Change history** and **Save**.
   - **Intestazione** — text modules (rich text: headings, bold, lists, alignment, links, images up to 1 MB). Add an
     empty text or one of the company's **saved texts**; any text can be saved as a new saved text. Drag or use the arrows
     to reorder.
   - **Product families** — **Add product family** picks a family from the catalog (published, in your library, ready
     for invoicing and valid today; search and category filter) or an **Empty product** typed in by hand. Each family has
     its validity badge, **ALT/STD**, duplicate, delete, collapse, and **Details & specifications** (category,
     description, notes and the technical table).
   - **Lines** — one row each: Pos, Q.tà, Linea, U.M., B, H, m², Extra%, €/pz, Sc%, Netto €, Totale, IVA, Ore posa, then
     ALT/STD, duplicate, delete, characteristics and lock. Lines and families can be dragged or moved with the arrows.
   - **Riepilogo e Chiusura** — sortable blocks: texts, *Detail by product*, *Grouping by category* (categories can be
     reordered), *Offer total*, *Payment plan* (with a check that it adds up to 100%) and *Activities* (drag between
     **Included** and **Not included**; the eye hides one from the print). New quotes start with the client's default
     payment plan and activities.
3. **Save** asks how: on a **draft**, fix this variant in place or save only this alternative as the next version
   (`V1A2` stays, `V2A2` is created). On an **invoiced** or **accepted** variant, only that new version is offered.
4. **Preview** opens *Anteprima Preventivo* in a new tab: A4 pages with the branch's logo and colour in the header, the
   company's fiscal data and *Pagina X di Y* in the footer. **Print / Save PDF** uses the browser's print dialog. Unsaved
   changes are shown too.

## Prices

- **€/pz** is the catalog price of the line with its options (at the family's or the share's discount and markup). It
  is recalculated as soon as the line, its options or its size change, and again by the server on every save.
- **Netto** = €/pz × (1 + Extra%/100) × (1 − Sc%/100); **Totale** = Q.tà × Netto.
- Alternative lines (**ALT**) are left out of their family's subtotal, alternative families out of the quote total.
- Typing a €/pz of your own makes the line manual (shown in italics); the arrow next to it goes back to the catalog price.
- The lock only freezes the row in the editor; it has no effect on the price or the print.

How every number is computed: [How prices are calculated](../pricing.md).

## Print settings

Who prints as **sales contact** (*Vostro referente*: name, email, phone), which **branch** heads the pages (when the
contact works for more than one), and which parts print: sales contact, family descriptions, line characteristics,
detail by product, grouping by category, offer total, payment plan, activities, Extra % and Discount % columns. The
discount column is required while any line has a discount.

The header, footer and sales contacts come from **Settings → Company**: fiscal data, branches (logo up to 512 KB,
colour, address, email, phone, users), each user's phone, and the saved texts.

## Versions, alternatives and expired price lists

A quote is a grid: versions down the side, alternatives across (`V1A1`, `V1A2`, `V2A2`). See
[ADR 0016](https://github.com/saifookhan/previo-schuco/blob/main/docs/adr/0016-quote-variants.md).

- **New alternative** copies only the open cell to the next free alternative on the same version (`V1A2` → `V1A3`).
- **Save as a new version** copies only that alternative to the next version (`V1A2` → `V2A2`). The other columns stay empty.
- The **version matrix** (in the editor, and in the expanded row on the quotes list) shows the grid. Hover a saved cell
  to create the one below it. Hover an empty cell, when the one above exists, to copy that saved document down.
  Unsaved editor edits are not included.
- The variant menu sets a name, duplicates this variant as a new quote (`V1A1` only), marks it **final** (the one the
  dashboard uses), and sets the status to **draft**, **invoiced** or **accepted** — any of them except the current one.
  Only a draft is edited in place. Marking invoiced or accepted still requires catalog families whose prices are valid today.
- When a family's prices have expired, a **draft** moves its lines to the newest valid version of that family (matched
  by line and option name) and reprices them, with a notice of what was moved and what could not be matched. An invoiced
  or accepted variant keeps its prices; **Update prices** applies the newer version to your edits, which then become the
  next version of this alternative only.
- If there is no valid version of the family, saving, printing, and leaving draft are blocked and the quote links to the family to
  upload a new price list.

## List, archive and quick look

The quotes list searches reference, customer and project, and filters by status. **Archived** is off until you tick it.
Each row shows the alternatives of the latest version. Open the row for the matrix, **Duplicate** of one variant, and
**Archive** (company admins and super admins). The eye is a short overview of families and lines. Archiving hides the
quote from the list; a direct link still opens it. The same archive exists on product families, one version at a time.

## History

**Change history** lists every save of the version — who, when, the total, and what changed (fields of the header,
families and lines, added/removed/reordered items, closing and print settings). Any save can be opened read-only and
**Restored** as the starting point of new edits. The quote's audit trail (created, saved, new version, status) is kept
as before.

## Quote assistant

On the quotes list and on a quote, users who can edit quotes get a chat button. The assistant creates a draft, adds a catalog product as a new row, and edits the open quote: header, rows, options, activities, payments, text, print settings, and status (draft, invoiced or accepted). It does not create alternatives, mark a variant final, archive, or duplicate a quote. A click on a chip runs that action directly. Removing a row, a manual price, a bulk change, and a status change ask for confirmation first. A catalog row is added only at a size the user typed. Net € and the total stay calculated. Prices come from the catalog. The conversation is kept only in the browser; closing or refreshing clears it, and the saved quote remains. Draft and expired families are hidden unless you ask to see them, and they are still not added. When several lines or families match, the assistant asks which one and does not pick.

## Not built yet

- Word and Excel export, images in the print, sending the quote by email from the app.
- Permanently deleting a quote. Archive hides it instead.
