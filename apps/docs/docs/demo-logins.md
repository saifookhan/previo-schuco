---
sidebar_position: 3
title: Demo logins
---

# Demo logins

The database is seeded with demo companies and one user per role. On the login page, under
**"Dev seed login"**, pick one of the emails below and press the button — **no password is needed**.

![Login page with the demo login section](/img/screens/login.png)

:::warning
The demo login shortcut is controlled by `ALLOW_DEV_LOGIN` (on by default). It must be set to `false`
before real customers use the server — then the section disappears and only email + password works.
:::

## Demo companies

| Company | Capabilities | What it can do |
|---|---|---|
| Schüco / PREVIO Platform | platform | Platform operator (super-admin's company) |
| Suppli S.r.l. | manufacturer + supplier | Owns and edits product families, shares them, **creates quotes** |
| Technometal S.p.A. | client | Browses families shared with it (business units Technometal_A, Technometal_B) |
| Fabbrikka S.r.l. | client | Browses families shared with it |

## Demo users

| Email | Name | Role | Company | Best for testing |
|---|---|---|---|---|
| `admin@schuco-demo.it` | Anna Bianchi | Super admin | Schüco | Admin panel, approvals, roles, access rights — sees every company |
| `admin@suppli-demo.it` | Paolo Suppli | Company admin | Suppli | **Catalog + quotes end to end**, sharing, inviting users |
| `admin@technometal-demo.it` | Luca Verdi | Company admin | Technometal | Client view, inviting users (needs approval) |
| `manager@technometal-demo.it` | Giulia Neri | Super user | Technometal | Client view with catalog rights (limited by client capability) |
| `sales@technometal-demo.it` | Marco Rossi | User | Technometal | Lowest role, read-mostly |
| `admin@fabbrikka-demo.it` | Sara Fabbrikka | Company admin | Fabbrikka | Second client — check it cannot see Technometal's data |
| `elena.costa@schuco-demo.it` | Elena Costa | Company admin | Schüco | **Inactive** — not offered in the demo login list |

:::tip Why can't a Technometal user create a quote?
Effective permissions are *role permissions ∩ company capabilities*. Technometal is a **client**, and
only a **supplier** company can create quotes; only a **manufacturer** can edit catalogs. To test
quoting, log in as **`admin@suppli-demo.it`**. See [Roles & permissions](./features/roles-and-permissions.md).
:::

## Real email + password login

Users created through an invite log in with their email and the password they chose on the
set-password page (at least 10 characters). To get one for testing, invite yourself — see
[Users & onboarding](./features/users-and-onboarding.md) — and open the email in
[Mailpit](./email-mailpit.mdx).
