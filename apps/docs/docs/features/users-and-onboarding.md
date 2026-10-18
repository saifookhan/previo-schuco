---
sidebar_position: 4
title: Users & onboarding
---

# Users & onboarding

There is no public sign-up. Users only join by **invite**.

**Where:** *Settings → Users* · needs `users.manage`.

## Invite flow

1. A company admin clicks **Add user**, enters an email and picks one or more roles.
   They can only hand out roles whose permissions they hold themselves.
2. The user is **pending approval** — no email goes out yet.
3. A super-admin approves or rejects it in *Admin → Users*.
4. On approval an invite email is sent (see [Email & Mailpit](../email-mailpit.mdx)) with a one-time link.
5. The user opens the link, sets a password (10+ characters) on **Set password**, and can log in.

**Forgot password** on the login page sends a reset link the same way.

A user can have **multiple roles**; their permissions are the union of all of them.
