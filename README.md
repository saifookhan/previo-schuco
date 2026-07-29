# Schuco Platform

Monorepo for the Schuco quote/preventivo platform — a clone of the PREVIO demo built with Next.js, Hono, and shadcn/ui.

## Stack

- **Frontend:** Next.js 15, shadcn/ui, Tailwind CSS v4, next-intl (IT/EN/DE)
- **Backend:** Hono (Node.js)
- **Data:** Static demo data (no database required)
- **Packages:** `@schuco/calculation` for pricing logic, `@schuco/db` for demo fixtures

## Quick start

```bash
pnpm install
pnpm dev
```

- Web app: http://localhost:3000
- API: http://localhost:3001

## Project structure

```
apps/
  web/     → Next.js frontend (preventivo editor)
  api/     → Hono REST API
packages/
  calculation/  → Quote pricing engine
  db/           → Static demo data and types
```

## Demo routes

| Route | Description |
|-------|-------------|
| `/` | Public home page |
| `/login` | Demo login (any credentials) |
| `/app/dashboard` | Stats overview |
| `/app/invoice` | PREVIO preventivo editor |
| `/app/settings/users` | 5 demo users |
| `/app/settings/roles` | 3 roles + add more |
| `/app/settings/access-rights` | Permission grid |
| `/app/settings/company` | Company details form |
