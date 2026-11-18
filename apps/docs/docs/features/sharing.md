---
sidebar_position: 2
title: Family sharing
---

# Family sharing

A company decides who can use each of its product families, and what each company gets on every product line and option: a
discount, a markup and installation hours.

**Where:** family list or family page → **Share** · needs `catalog.share`. You can only share with companies
you are connected with on the [Partners](./partners.md) page; the dialog's search lists only those.

![Share dialog](/img/screens/share-dialog.png)

## Rules

- A family must be **published** before it can be shared.
- Each share is *"company A shares family F with company B"*, with a **Discount %**, a **Markup %** and
  **Installation hours** per unit for every product line and every option. These are the values B's quote
  positions start with — B can still change the position's discount and markup.
- When you add a company, the values start from the family's own (the uploaded Excel's). Where the Excel has none
  (a version 1 option), they start at 0% discount, 100% markup and 0 hours. A markup of `100%` means no markup;
  `130%` adds 30%.
- **New version:** shares belong to one version. When you add a company to a new version that you shared an
  earlier version with, its values from then are filled in, matched by line and option name ("Values from another
  version"). A line or option that is new in this version starts from the Excel's values.
- Only the **owner**, or a company the family was itself shared with, may share it onward.
  This makes a chain, e.g. manufacturer → supplier → client.
- **Unpublishing** the family, or removing a share upstream, immediately hides it from everyone
  further down the chain.

## How to test

The demo family *Demo Window W70* is already shared with Technometal at 10% on every line and option.

1. As `admin@technometal-demo.it`: *Product families → Shared with me* shows it with "Your max discount 10%"
   (the highest discount on any line or option).

   ![Shared with me tab](/img/screens/product-families-shared.png)

2. As `admin@suppli-demo.it`: share it with **Fabbrikka** too (connect with Fabbrikka on *Partners* first
   if it isn't listed). Its lines and options open with the Excel's values; set *Finestra 1 anta* to 5% and save.
   Clear a value and save → the company opens again with a message, nothing is saved.
3. As `admin@fabbrikka-demo.it`: it now shows with 10% (the Excel's 10% on *Finestra 2 ante* is the highest).
   Remove the share again → it is gone.
4. Back as Suppli: unpublish it → it disappears for Technometal.
