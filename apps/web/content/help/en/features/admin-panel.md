---
sidebar_position: 6
title: Admin panel
---

# Admin panel

Super-admin only (`admin@schuco-demo.it`). Open it from **Admin portal** in the sidebar.

| Page | What it does |
|---|---|
| Dashboard | Totals: users, active users, companies, super-admins; recent users |
| Users | Every user across all companies, plus **pending approvals** (approve / reject invites) |
| Companies | Create and edit companies, set capabilities (manufacturer / supplier / client / platform), deactivate and re-activate |
| Audit log | Every change on the platform — who, what, when, which record — across all companies; filter by company, type, dates, person or request ID |

![Admin dashboard](/img/screens/admin-dashboard.png)

![All users](/img/screens/admin-users.png)

![Companies](/img/screens/admin-companies.png)

## Audit log

Company admins have the same log for their own company under **Settings → Audit log**. Entries can't be
edited or deleted. It records changes (catalog, sharing, quotes, users, roles, companies) and sign-ins:
successful logins, failed logins on a real account, passwords set and password resets requested.
Click a person to see only their actions; open a row for the details and the request ID.

![Audit log](/img/screens/audit-log.png)

A super-admin can also act inside a specific company (tenant override), and every change is written to
an append-only **audit log**.
