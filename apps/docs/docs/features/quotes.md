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
   - **Top bar** — the reference, the version and its status, the customer and project (click them to edit the
     customer, fiscal code, address, city, project, date and internal notes), the **total VAT excluded**, and the
     buttons **Print settings**, **Preview**, **Export** (coming soon), **Change history** and **Save**.
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
3. **Save** asks how: on a **draft**, **Fix version N** (in place) or **Save as a new version**; on a version that was
   **sent**, accepted or rejected, only **Save as a new version** — a sent version never changes.
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

## Versions and expired price lists

- Every version keeps its own document; the version menu in the top bar switches between them and changes the status:
  draft → **sent** → **accepted** / **rejected**.
- When a family's prices have expired, a **draft** moves its lines to the newest valid version of that family (matched
  by line and option name) and reprices them, with a notice of what was moved and what could not be matched. A sent
  version keeps its prices; **Update prices** applies the newer version to your edits, which then become a new version.
- If there is no valid version of the family, saving and printing are blocked and the quote links to the family to
  upload a new price list.

## History

**Change history** lists every save of the version — who, when, the total, and what changed (fields of the header,
families and lines, added/removed/reordered items, closing and print settings). Any save can be opened read-only and
**Restored** as the starting point of new edits. The quote's audit trail (created, saved, new version, status) is kept
as before.

## Quote assistant

On the quotes list and on a quote, users who can edit quotes get a chat button. The assistant creates a draft, adds a catalog product as a new row, duplicates a row or a family, moves a row, and changes width, height, extra %, €/pc, discount, VAT, and installation hours. Net € and the total stay calculated. Prices come from the catalog. The conversation is kept only in the browser; closing or refreshing clears it, and the saved quote remains. Draft and expired families are hidden unless you ask to see them, and they are still not added. When several current families or lines match, the assistant asks which one and does not pick.

## Not built yet

- Word and Excel export, images in the print, sending the quote by email from the app.
- Deleting or duplicating a whole quote.
