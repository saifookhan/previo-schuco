---
sidebar_position: 5
title: Roles & permissions
---

# Roles & permissions

## Permissions

| Permission | Allows |
|---|---|
| `catalog.view` | See product families |
| `catalog.edit` | Import, edit, publish, version product families |
| `catalog.share` | Share families with other companies |
| `quote.view` | See quotes |
| `quote.edit` | Create and edit quotes |
| `users.manage` | Invite users in your company |

## Default roles

| Role | Default permissions |
|---|---|
| Super admin | Everything, across all companies (cannot be changed) |
| Company admin | All six (always keeps `users.manage`) |
| Super user | catalog view/edit/share, quote view/edit |
| User | catalog view, quote view/edit |

A super-admin can change these in **Settings → Access rights** (role × permission matrix). Click the ⓘ
icon next to a role's name to see what the role is for. Roles are global — the same for every company.
The Roles page (creating custom roles) is hidden for now.

![Access rights matrix](/img/screens/access-rights.png)

## Company capabilities

A permission only takes effect if the user's **company** also has a capability that unlocks it:

| Capability | Unlocks |
|---|---|
| Manufacturer | catalog view, edit, share · users |
| Supplier | catalog view, share · quote view, edit · users |
| Client | catalog view · users |
| Platform | catalog view · quote view · users |

**Effective permissions = role permissions ∩ company capabilities.** Example: Marco Rossi has the *User*
role (which includes `quote.edit`), but Technometal is only a *client*, so he cannot create quotes.

Capabilities are set per company by a super-admin in *Admin → Companies*.
