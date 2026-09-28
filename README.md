# PREVIO — Schuco Platform

Monorepo for the PREVIO quote/preventivo platform built with Next.js, Hono, AWS (Cognito, RDS, ECS), Redis/BullMQ, and Vercel.

See [docs/technical-overview.md](docs/technical-overview.md) for architecture diagrams and onboarding guide.  
See [docs/project-context.md](docs/project-context.md) for domain model and roadmap.  
See [docs/architecture.md](docs/architecture.md) for monorepo evolution, Changesets, Docusaurus, and service split.  
See [docs/adr/](docs/adr/) for the architecture decision records behind the multi-tenant, multi-environment design (RLS, tenant isolation, env composition, background jobs, audit logging, secrets, testing strategy).

## Stack

- **Frontend:** Next.js 15 on Vercel, shadcn/ui, Tailwind CSS v4, next-intl (IT/EN/DE)
- **API:** Hono on AWS ECS Fargate (Docker)
- **Auth:** AWS Cognito (identity only) + PostgreSQL RBAC + Row-Level Security (tenant isolation) — see [ADR 0002](docs/adr/0002-cognito-identity-only.md), [ADR 0006](docs/adr/0006-rls-request-scoped-transaction.md)
- **Database:** PostgreSQL (RDS prod, Docker locally). The app always connects as a restricted, non-superuser role (`previo_app`) — never the migration/owner role — see [ADR 0007](docs/adr/0007-application-db-role.md)
- **Background jobs:** BullMQ on Redis — see [ADR 0009](docs/adr/0009-bullmq-background-jobs.md)
- **Testing:** Vitest — repository/DB/RLS integration tests run against a real Postgres (`previo_test`), never mocked — see [ADR 0012](docs/adr/0012-testing-strategy-and-service-layer.md)
- **IaC:** Terraform (dev; stage/prod structured for later)

## Quick start (local) — setting this up on a brand-new machine

**Prerequisites:** Node 22 (see `.nvmrc`), [pnpm 9](https://pnpm.io) (`corepack enable` picks up the version pinned in `package.json`'s `packageManager`), and Docker Desktop (or another Docker Engine) running.

```bash
pnpm install
cp .env.example .env.local        # NOT .env — see docs/environments.md and ADR 0005
```

Now open `.env.local` and **generate a real `AUTH_SECRET`** — the file ships with it blank, and that's the #1 cause of "not authenticated" errors on a fresh setup (see Troubleshooting below):

```bash
openssl rand -base64 32
```

Paste the output as `AUTH_SECRET=...` in `.env.local`. Everything else in `.env.example` already has working local defaults (Cognito is deliberately left unconfigured — you get the dev/seed-user login instead, see below).

```bash
docker compose up -d              # Postgres + Redis + API + worker (waits for migrate+seed to finish)
pnpm dev                          # Web on :3000 — MUST be `pnpm dev`, not `pnpm build && pnpm start` (see Troubleshooting)
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger UI: http://localhost:3001/docs
- OpenAPI spec: http://localhost:3001/openapi.json
- Login: go to `/login` and sign in as one of the seeded demo users (no password — this is dev-only, disabled once Cognito is configured):

  | Email | Role | Company |
  |---|---|---|
  | `admin@schuco-demo.it` | super-admin | Schuco (platform) |
  | `admin@suppli-demo.it` | company-admin | Suppli S.r.l. (supplier — use this one to test product-family import/quotes) |
  | `admin@technometal-demo.it` | company-admin | Technometal S.p.A. (client) |
  | `manager@technometal-demo.it` | super-user | Technometal S.p.A. |
  | `sales@technometal-demo.it` | user | Technometal S.p.A. |
  | `admin@fabbrikka-demo.it` | company-admin | Fabbrikka (client) |

### Troubleshooting a fresh setup

- **"Not authenticated" errors, especially right after upload/save actions** — almost always one of:
  1. `AUTH_SECRET` is still blank in `.env.local` (see above) — regenerate it and restart `pnpm dev`. Next.js only reads `.env.local` at process startup, so changing it requires a restart, not just a save.
  2. You ran `pnpm build && pnpm start` instead of `pnpm dev`. Production mode marks the session cookie `Secure`, which browsers silently drop over plain `http://localhost` — the login screen appears to work but nothing after it does. Use `pnpm dev` for local work; production builds are for the Docker/self-host paths below, which set `COOKIE_SECURE` explicitly.
  3. `docker compose up -d` hadn't finished yet — the `migrate` container (schema + seed data) must complete before the demo login users exist. Check with `docker compose ps` (everything should show `running`/`healthy`, and `migrate` should show `exited (0)` — that's success, it's a one-shot job) or `docker compose logs migrate`.
- **Import/upload silently fails or times out** — confirm the `api` container is actually up: `curl http://localhost:3001/health` should return `{"status":"ok",...}`. If not, `docker compose logs api`.
- **Nothing loads at all / 500 on every page** — usually a stale Next.js dev server from an earlier run still holding port 3000, or a stale `.next` cache after pulling changes that touched shared files (layout, middleware, i18n messages). Kill whatever's on :3000 and `rm -rf apps/web/.next` before `pnpm dev` again.

### Running the whole app with just `docker compose up -d` (self-hosted / demo server)

For handing the app to someone via SSH on a bare server (no Node/pnpm needed on the host, no Vercel/AWS) — the `web` app is also containerized, opt-in via the `selfhost` [Compose profile](https://docs.docker.com/compose/how-tos/profiles/) so it doesn't interfere with the local-dev flow above:

```bash
export AUTH_SECRET=$(openssl rand -base64 32)   # required — see below
docker compose --profile selfhost up -d --build
```

That's it — the whole app (Postgres, Redis, API, worker, web) comes up, and the browser only ever talks to the `web` container (every `/api/*` route in `apps/web` proxies to the `api` service over Docker's internal network — nothing but port 3000 needs to be reachable from outside).

- App: `http://<server-ip>:3000`
- Login: same seeded demo users as above (dev-login stays enabled in this profile even though it runs in production mode — see `ALLOW_DEV_LOGIN` below)

**Env vars this profile reads** (all have sane defaults for an IP-only demo box; override by exporting them before `docker compose up`, or in a `.env` file next to `docker-compose.yml`):

| Var | Default | When to change it |
|---|---|---|
| `AUTH_SECRET` | *(insecure placeholder — always override this one)* | Always — `openssl rand -base64 32` |
| `COOKIE_SECURE` | `false` | Set to `true` once this sits behind HTTPS (a reverse proxy with a real cert) — otherwise leave `false`, or logins won't persist over plain HTTP |
| `APP_PUBLIC_URL` | `http://localhost:3000` | Set to `http://<server-ip>:3000` (or your domain) once you're not just hitting it from the same box |
| `ALLOW_DEV_LOGIN` | `true` | Set to `false` once real Cognito is configured for this deployment |
| `APP_DB_PASSWORD` | `previo_app` | Change for anything beyond a throwaway demo |

This is a single-server convenience path, not the production architecture — real production is Next.js on Vercel + the API on ECS Fargate (see [docs/deployment.md](docs/deployment.md)).

### Running everything locally (no Docker API/worker)

```bash
pnpm dev:local     # web + api + worker, all pointed at local Docker Postgres/Redis
pnpm dev:hybrid    # web + api local, DB/Redis pointed at dev (needs: pnpm env:fetch dev)
pnpm dev:remote    # web only, API/DB/Redis all remote dev
```

Each dependency (DB, Redis, API) resolves independently via `*_TARGET` env vars (`DB_TARGET`, `REDIS_TARGET`, `API_TARGET`) read from `.env.local` plus, for non-local targets, a fetched `.env.<target>.local` (never hand-typed — `pnpm env:fetch dev`, requires `aws sso login`). See [ADR 0005](docs/adr/0005-env-target-composition.md) and [ADR 0011](docs/adr/0011-secrets-config-management.md).

### Tests

```bash
pnpm test          # runs packages/db then apps/api via Turborepo
```

Spins up a real `previo_test` Postgres database (dropped/recreated each run) and runs RLS/tenant-isolation integration tests against it — no mocked repository layer. See [ADR 0012](docs/adr/0012-testing-strategy-and-service-layer.md).

## Project structure

```
apps/
  web/     → Next.js frontend (Vercel)
  api/     → Hono BFF (ECS / Docker); also the BullMQ worker entrypoint (src/worker.ts)
  docs/    → Docusaurus (planned)
packages/
  calculation/  → Quote pricing engine
  db/           → Drizzle schema, migrations, RBAC, RLS policies
  contracts/    → Shared Zod schemas + OpenAPI spec
  env/          → Per-environment env resolution (ADR 0005)
  queue/        → BullMQ job/worker helpers (ADR 0009)
infra/
  terraform/    → AWS infrastructure
docs/
  technical-overview.md
  project-context.md
  deployment.md
  architecture.md
  adr/          → Architecture decision records
```

## Roles

| Role ID | Display name |
|---------|--------------|
| `super-admin` | Super Admin (PREVIO / Schuco) |
| `company-admin` | Company Admin |
| `super-user` | Super User (Sales Manager) |
| `user` | User (Sales Associate) |

A super-admin can act on behalf of another company via the `X-Tenant-Id` request header — see [ADR 0008](docs/adr/0008-super-admin-tenant-override-header.md).

## Deployment

See [docs/deployment.md](docs/deployment.md) for Terraform bootstrap, ECR/ECS deploy, and Vercel setup.

## Demo routes

| Route | Description |
|-------|-------------|
| `/` | Public home page |
| `/login` | Cognito or dev login |
| `/app/dashboard` | Stats overview (auth required) |
| `/app/invoice` | PREVIO preventivo editor |
| `/app/settings/*` | Role-gated settings screens |
