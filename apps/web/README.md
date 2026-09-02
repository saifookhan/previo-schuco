# @schuco/web

Next.js 15 frontend for the PREVIO platform. Deployed to **Vercel**.

## Purpose

User-facing app for sales staff and admins: login, preventivo (quote) editor, settings, and the super-admin portal.

## Routes

| Path | Description |
|------|-------------|
| `/` | Public home |
| `/login` | Cognito OIDC or dev login |
| `/app/dashboard` | Stats overview (auth required) |
| `/app/invoice` | PREVIO preventivo editor |
| `/app/settings/*` | Role-gated company, roles, access-rights screens |
| `/admin/*` | Super-admin portal (users, dashboard) |

Locale prefix: `/en`, `/it` (next-intl).

## Stack

- Next.js 15 (App Router, Turbopack in dev)
- Tailwind CSS v4, shadcn/ui
- next-intl (IT / EN / DE)
- Session + middleware route protection

## Dependencies

| Package | Role |
|---------|------|
| `@schuco/contracts` | Shared API types |
| `@schuco/db/demo-users` | Dev login user list (client-safe subpath) |
| `@schuco/calculation` | Client-side quote preview (where used) |

Do **not** import `@schuco/db` in client components — it pulls the Postgres driver.

## Scripts

```bash
pnpm --filter @schuco/web dev      # :3000 (API expected on :3001)
pnpm --filter @schuco/web build
pnpm --filter @schuco/web start
```

## Environment

See root `.env.example` and `vercel.json`. API calls proxy to `apps/api` via `NEXT_PUBLIC_API_URL` or server client config.
