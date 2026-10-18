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

- [ ] Import a product family from Excel.
- [ ] Edit a line price, a characteristic and a pricing matrix; save.
- [ ] Publish it — editing is now locked.
- [ ] Create a **new version**, edit it, publish it.
- [ ] Share it with Technometal at 10%.

## Visibility

- [ ] Technometal users see it under *Shared with me* with 10%.
- [ ] Fabbrikka does **not** see it.
- [ ] After unpublishing, Technometal no longer sees it.

## Quotes — as `admin@suppli-demo.it`

- [ ] Create a quote.
- [ ] Add a position with automatic price; check the live preview.
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
