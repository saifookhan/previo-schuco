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

A super-admin can also act inside a specific company (tenant override), and every change is written to
an append-only **audit log**.
