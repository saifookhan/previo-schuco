# Environments & Env Composition

How `local`, `dev`, `staging`, and `production` are isolated, and how a developer picks which environment each dependency (DB, Redis, API) points at for local work. See [ADR 0003](./adr/0003-per-environment-isolation.md) (isolation boundaries) and [ADR 0005](./adr/0005-env-target-composition.md) (this composition model) for the full rationale — this doc is the practical how-to.

## The model

Each dependency a service needs has its own **target** variable, valued as an environment name:

| Target var | Controls | Values |
|---|---|---|
| `DB_TARGET` | Which Postgres `apps/api` connects to | `local` \| `dev` \| `staging` |
| `REDIS_TARGET` | Which Redis `apps/api`/the worker connect to | `local` \| `dev` \| `staging` |
| `API_TARGET` | Which API `apps/web` calls | `local` \| `dev` \| `staging` |
| `COGNITO_TARGET` | Which Cognito pool's config is used | defaults to `API_TARGET` |

There is **no `production` value** — no local-dev code path can ever point at production. Production is reached only by deploying to it (ECS, Vercel), never by a developer's local `*_TARGET` var.

## Where the actual values live

- **`.env.local`** (gitignored) — the target selections themselves (`DB_TARGET=local`, etc.), plus `local`'s own values directly (local Docker Postgres/Redis aren't real secrets) and non-target-resolved values (`PORT`, `AUTH_SECRET`, `APP_DB_PASSWORD`). Copy `.env.example` to start.
- **`.env.dev.local`** / **`.env.staging.local`** (gitignored, never committed) — *only* fetched, never hand-typed: `pnpm env:fetch dev` or `pnpm env:fetch staging` pulls that one environment's values from AWS Secrets Manager + Terraform outputs (requires `aws sso login`; dev is fetchable by any developer by default, staging needs a separately-granted IAM permission — see [ADR 0011](./adr/0011-secrets-config-management.md)). A developer who's never fetched `staging` simply has no such file.

The resolver (`packages/env`) loads `.env.local` first, then — for whichever target each `*_TARGET` var actually names — loads that target's file and reads `<PREFIX>_<TARGET>` (e.g. `DATABASE_URL_DEV`) into the plain var the rest of the code already expects (`DATABASE_URL`). **If a var is already set** (Docker/ECS env injection, a Vercel dashboard env var, CI), target resolution is skipped entirely for it — this is what makes the same bootstrap code work unchanged in Docker Compose, ECS, and Vercel without any `*_TARGET`/`.env.local` involved there at all.

## Local dev presets

```bash
pnpm dev:local     # web + api + worker, all against local Docker Postgres/Redis
pnpm dev:hybrid    # web + api local, DB/Redis pointed at dev — run `pnpm env:fetch dev` first
pnpm dev:remote    # web only; API/DB/Redis all remote dev
```

These are convenience wrappers, not the only way to compose an environment — any ad hoc combination works without a named preset existing for it, e.g.:

```bash
DB_TARGET=staging pnpm dev:api   # local API, staging DB (needs pnpm env:fetch staging first)
```

## Adding a new environment or dependency

Per [ADR 0005](./adr/0005-env-target-composition.md), this is deliberately cheap:

- **New environment reachable from local dev** (e.g. once `staging`'s Terraform is applied): nothing to add to the resolver itself — `staging` is already a valid target value. Just run `pnpm env:fetch staging` once Terraform outputs exist for it.
- **New service-dependency** (e.g. a future queue broker beyond Redis): add one more `*_TARGET` var and one more `*_URL_<ENV>` line per environment — no new npm scripts required.

## Migrating from the old flat `.env`

If you still have a plain `.env` from before this model existed: `packages/env`'s bootstrap falls back to loading it directly (with a deprecation warning) if `.env.local` doesn't exist, so nothing breaks — but migrate by copying `.env.example` to `.env.local` and filling in the same values under their `_LOCAL` suffix, then delete the old `.env`.
