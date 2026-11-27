---
sidebar_position: 10
title: Testing checklist
---

# Testing checklist

An end-to-end run through the main flows. Use [Demo logins](./demo-logins.md) to switch users.

## Login

- [ ] Demo login works for each active demo user.
- [ ] Wrong password on the normal form shows an error.
- [ ] Language switch IT / EN / DE works.

## Catalog — as `admin@suppli-demo.it`

- [ ] *Demo Window W70* is there, published.
- [ ] Import [the sample Excel](pathname:///samples/previo-sample-family.xlsx) — a dialog shows its counts (3 lines, 3 characteristics, 9 options, 1 price table, 7 relations); nothing is saved until **Import family**.
- [ ] In that dialog, a *Valid to* before *Valid from* disables saving; save with dates and **Publish right away** — the new family opens, published, with its dates.
- [ ] On the family's page, **Edit** the price validity to a past range — the family shows **Expired**, and the quote builder no longer offers it; an existing position from it can still be edited.
- [ ] **Duplicate** a family — a dialog asks for the name, price validity and publish choice; the copy opens with those values and the original is unchanged.
- [ ] **New version** on a family opens the same dialog; the old version keeps its own dates.
- [ ] Edit a line price, a characteristic and a pricing matrix; save.
- [ ] Publish it — editing is now locked.
- [ ] Create a **new version**, edit it, publish it.
- [ ] Share the demo family with Fabbrikka at 5% (if Fabbrikka isn't offered, connect with it on *Partners* first).
- [ ] On *Product families*, try each filter and the sort — the list and the “x of y” count update; copy the URL into a new tab and the same filters are applied; **Back** undoes the last filter.
- [ ] Set a family's **Ready for invoicing** to **No** — the quote builder no longer offers it, and an existing position from it can still be edited; set it back to **Yes** and it is offered again. A newly imported family starts at **No** unless ticked in the dialog.
- [ ] In the list, open a family's row, set **Valid to** to yesterday and **Save** — the row shows **Expired** and the quote builder no longer offers it; clear **Valid from** — an error is shown and **Save** stays disabled.
- [ ] Set **With price list** to **No** — the quote builder shows the family as *(no price list)* with a reminder, and it can still be added.
- [ ] As `admin@suppli-demo.it`, set **In library** to **No** on a family — the quote builder no longer offers it; sign in as a sales user of the same company — the family is not in the list; the company that shared it (or owns it) still sees it in its own library.

## Partners

- [ ] As `admin@technometal-demo.it`, *Partners* shows only *Suppliers*; search by a branch's city finds the company; **Connect** with the platform company → **Pending**.
- [ ] As `admin@schuco-demo.it`, the bell shows 1 and Mailpit has the request email; **Accept** from the bell → the card shows **Connected**; Technometal's bell says it was accepted.
- [ ] Send a request and **Withdraw** it; send one and **Refuse** it — the sender is told and can ask again.
- [ ] As `admin@suppli-demo.it`, the share dialog's search lists only connected companies; **Remove connection** with a company you share with → after confirming, the shared families disappear for it.
- [ ] As `sales@technometal-demo.it`, no *Partners* menu and no bell.

## Visibility

- [ ] Technometal users see *Demo Window W70* under *Shared with me* with 10%.
- [ ] Fabbrikka sees it with 5%; after removing that share, Fabbrikka no longer sees it.
- [ ] After unpublishing, Technometal no longer sees it (publish it again afterwards).

## Quotes — as `admin@suppli-demo.it`

- [ ] Create a quote.
- [ ] **Add product family** → *Finestra 1 anta*; on its line set 800 × 1200, Q.tà 4 and, under the characteristics, Triplo vetro / Antracite / Con chiave → Totale **1 857,02 €**
      (see the [worked example](./pricing.md#worked-example)).
- [ ] Try a size bigger than the price table (e.g. 1300 × 900) → a clear error, no price.
- [ ] Type your own €/pz on a line — it turns manual (italics); the arrow next to it brings back the catalog price. Extra% 110 and Sc% 10 change Netto and Totale.
- [ ] Mark a line and a family **ALT** — they leave the subtotal and the total.
- [ ] Duplicate, drag, move with the arrows and delete lines and families; reorder the closing blocks, the categories and the payment rows; drag an activity between *Included* and *Not included*.
- [ ] Add an intro text, save it as a saved text, and add it again from **Saved texts**.
- [ ] **Save** → fix `V1A1`; mark it **Invoiced**; edit again → only **Save as a new version** is offered, and only `V2A1` appears.
- [ ] **New alternative** from `V1A1` creates `V1A2` and leaves `V1A1` as it was. In the **version matrix**, hover `V1A2` → `V2A2` only; hover the empty cell under `V1A1` → `V2A1`.
- [ ] Name a variant, mark it **final**, and duplicate it: the new quote's only variant is `V1A1`. The dashboard's quote cards follow the final variant.
- [ ] Mark `V1A2` and one product-family version as **favorites**. **Favorites** on each list shows only those. The other versions stay unfavorited, and the dashboard still follows the final variant, not the favorite.
- [ ] As a company admin, **Archive** the quote — it leaves the list until **Archived** is ticked, and the direct link still opens it. A sales user sees it with the filter on and cannot archive it.
- [ ] **Change history** lists each save with what changed; open an older one and **Restore** it.
- [ ] **Preview** → A4 pages with branch logo, *Vostro referente* and the footer; **Print / Save PDF**; untick fields in **Print settings** and check they disappear (the discount column stays while a line has a discount).
- [ ] Set the family's validity to the past: a draft moves to the newest valid version with a notice; without a newer version, Save and Preview are disabled with a link to upload one.
- [ ] *Settings → Company*: change the fiscal data, add a branch with a logo and colour, set a sales contact's phone — the preview shows them.
- [ ] As `sales@technometal-demo.it`: no option to create quotes.

## Users & onboarding

- [ ] As a company admin, invite `tester@example.com` → status *pending approval*, no email in Mailpit.
- [ ] As super-admin, approve it → invite email appears in Mailpit.
- [ ] Set password from the email link, then log in with it.
- [ ] Forgot password → reset email in Mailpit → new password works.
- [ ] *Settings → Users*: edit another user (name, role, untick **Active**) — the row updates; that user can no longer sign in until reactivated. On your own row the *Company Admin* role and **Active** are locked.

## Roles & access — as `admin@schuco-demo.it`

- [ ] In Access rights, click the ⓘ next to each role name — its description pops up, in your language, without making the table wider.
- [ ] The user sees exactly the pages their permissions (∩ company capabilities) allow.
- [ ] Super-admin's and company-admin `users.manage` cells cannot be unticked.

## Admin

- [ ] Create a company, set capabilities, deactivate and re-activate it.
- [ ] *Admin → Audit log* shows each of the changes above, newest first; *Load more* pages further.
- [ ] Log in with a wrong password for a real account → an `auth.login_failed` entry appears for its company.
- [ ] As `admin@suppli-demo.it`, *Settings → Audit log* shows only Suppli's entries.
