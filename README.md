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

## Quick start (local)

```bash
pnpm install
cp .env.example .env.local        # NOT .env — see docs/environments.md and ADR 0005
docker compose up -d              # Postgres + Redis + API + worker
pnpm dev                          # Web only on :3000 (API/worker run in Docker)
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger UI: http://localhost:3001/docs
- OpenAPI spec: http://localhost:3001/openapi.json
- Login: dev seed users on `/login` when Cognito is not configured

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
