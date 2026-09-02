# @schuco/db

PostgreSQL data layer for PREVIO — Drizzle schema, migrations, RBAC queries, and seed data.

## Purpose

Owns the database schema (companies, business units, users, roles, supplier–client links) and the queries the API uses for authentication context and authorization (RBAC + RLS).

## Structure

```
src/
  schema/           Drizzle table definitions
  queries/          Typed query helpers (users, RLS context)
  demo-users.ts     Single source of truth for demo user seeds
  seed.ts           Roles + demo companies/users seeding
  data.ts           Demo products, quotes (UI fixtures)
  client.ts         createDb() factory
migrations/         SQL migrations (incl. RLS policies)
scripts/
  migrate-seed.ts   Run migrations + seed
```

## Exports

| Export | Description |
|--------|-------------|
| `createDb(url)` | Drizzle client factory |
| `getUserProfileByCognitoSub`, `listUsers`, … | RBAC-aware user queries |
| `setRlsContext` | Set PostgreSQL session vars for row-level security |
| `seedDatabase`, `CANONICAL_ROLES` | Seed script helpers |
| `@schuco/db/demo-users` | Demo user list (safe for client import — no Postgres driver) |

## Demo users

Define demo users in `src/demo-users.ts` only. Seed via `seed.ts`.

- **Client UI:** import from `@schuco/db/demo-users` (never `@schuco/db` in client components — pulls Postgres)
- **Server routes:** may import from `@schuco/db`

## Scripts

```bash
pnpm --filter @schuco/db db:generate   # Generate migration from schema changes
pnpm --filter @schuco/db db:migrate    # Apply migrations + seed
pnpm --filter @schuco/db db:studio     # Drizzle Studio GUI
```

## Dependencies

- `drizzle-orm` + `postgres` driver
- Requires `DATABASE_URL` (see root `.env.example`)
