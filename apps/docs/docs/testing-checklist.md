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
- [ ] Import [the sample Excel](pathname:///samples/previo-sample-family.xlsx) — a new draft family appears.
- [ ] Edit a line price, a characteristic and a pricing matrix; save.
- [ ] Publish it — editing is now locked.
- [ ] Create a **new version**, edit it, publish it.
- [ ] Share the demo family with Fabbrikka at 5%.

## Visibility

- [ ] Technometal users see *Demo Window W70* under *Shared with me* with 10%.
- [ ] Fabbrikka sees it with 5%; after removing that share, Fabbrikka no longer sees it.
- [ ] After unpublishing, Technometal no longer sees it (publish it again afterwards).

## Quotes — as `admin@suppli-demo.it`

- [ ] Create a quote.
- [ ] Add *Finestra 1 anta*, 800 × 1200, qty 4, Triplo vetro / Antracite / Con chiave → **1 857,02 €**
      (see the [worked example](./pricing.md#worked-example)).
- [ ] Try a size bigger than the price table (e.g. 1300 × 900) → a clear error, no price.
- [ ] Switch a position and a characteristic to manual price.
- [ ] Edit, duplicate, reorder and delete positions.
- [ ] Download the PDF and check totals.
- [ ] As `sales@technometal-demo.it`: no option to create quotes.

## Users & onboarding

- [ ] As a company admin, invite `tester@example.com` → status *pending approval*, no email in Mailpit.
- [ ] As super-admin, approve it → invite email appears in Mailpit.
- [ ] Set password from the email link, then log in with it.
- [ ] Forgot password → reset email in Mailpit → new password works.

## Roles & access — as `admin@schuco-demo.it`

- [ ] Create a custom role, give it permissions in Access rights, assign it to a user.
- [ ] The user sees exactly the pages their permissions (∩ company capabilities) allow.
- [ ] Super-admin's and company-admin `users.manage` cells cannot be unticked.

## Admin

- [ ] Create a company, set capabilities, deactivate and re-activate it.
- [ ] *Admin → Audit log* shows each of the changes above, newest first; *Load more* pages further.
- [ ] Log in with a wrong password for a real account → an `auth.login_failed` entry appears for its company.
- [ ] As `admin@suppli-demo.it`, *Settings → Audit log* shows only Suppli's entries.
