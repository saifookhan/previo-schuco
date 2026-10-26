---
sidebar_position: 4
title: Users & onboarding
---

# Users & onboarding

There is no public sign-up. Users only join by **invite**.

**Where:** *Settings → Users* · needs `users.manage`.

![Users in Settings](/img/screens/settings-users.png)

## Invite flow

1. A company admin clicks **Add user**, enters an email and picks one or more roles.
   They can only hand out roles whose permissions they hold themselves.
2. The user is **pending approval** — no email goes out yet.
3. A super-admin approves or rejects it in *Admin → Users*.
4. On approval an invite email is sent (see [Email & Mailpit](../email-mailpit.mdx)) with a one-time link.
5. The user opens the link, sets a password (10+ characters) on **Set password**, and can log in.

**Forgot password** on the login page sends a reset link the same way.

A user can have **multiple roles**; their permissions are the union of all of them.

## Editing a user

Click the **pencil** on a user's row to change their **name**, **roles** and whether they are **active**.

- The email can't be changed — it's how the user signs in.
- An inactive user can't sign in and is signed out on their next click. Tick **Active** again to let them back in.
- Active/inactive can only be changed once the user has accepted the invite.
- You can't deactivate yourself or remove your own *Company Admin* (or *Super Admin*) role, and a company always keeps at least one active company admin — so it never locks itself out.
- A company admin can't edit a super-admin, and can only give roles whose permissions they hold.
