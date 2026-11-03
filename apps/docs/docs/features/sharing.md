---
sidebar_position: 2
title: Family sharing
---

# Family sharing

A company decides who can use each of its product families, and at which default discount.

**Where:** family list or family page → **Share** · needs `catalog.share`. You can only share with companies
you are connected with on the [Partners](./partners.md) page; the dialog's search lists only those.

![Share dialog](/img/screens/share-dialog.png)

## Rules

- A family must be **published** before it can be shared.
- Each share is *"company A shares family F with company B at discount d"*. The discount is the
  default that B's quote positions start with — they can still change it per position.
  `0%` means no specific discount: the line's own catalog discount applies.
- Only the **owner**, or a company the family was itself shared with, may share it onward.
  This makes a chain, e.g. manufacturer → supplier → client.
- **Unpublishing** the family, or removing a share upstream, immediately hides it from everyone
  further down the chain.

## How to test

The demo family *Demo Window W70* is already shared with Technometal at 10%.

1. As `admin@technometal-demo.it`: *Product families → Shared with me* shows it with "Your discount 10%".

   ![Shared with me tab](/img/screens/product-families-shared.png)

2. As `admin@suppli-demo.it`: share it with **Fabbrikka** at 5% too (connect with Fabbrikka on *Partners* first
   if it isn't listed).
3. As `admin@fabbrikka-demo.it`: it now shows with 5%. Remove the share again → it is gone.
4. Back as Suppli: unpublish it → it disappears for Technometal.
