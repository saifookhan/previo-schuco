# Infrastructure & Deployment Status

What is actually running, what is missing, and what is legacy — so it does not have to be re-derived from the codebase each time. Update this file whenever one of these items changes.

**Last verified:** 2026-10-15, against the repository (`docker-compose.yml`, `Caddyfile`, `.github/workflows/*`, application code). The live server itself was **not** re-inspected for this update — check `docker compose ps` there if in doubt.

Production is a single self-hosted server running Docker Compose. See [deployment.md](./deployment.md) for how it works and [ADR 0013](./adr/0013-single-server-docker-compose-deployment.md) for why the earlier AWS / Terraform / Vercel / Cognito setup was retired.

## Hosting & delivery

| Item | Status | Notes |
|---|---|---|
| Server | ✅ One Hetzner Cloud VM | Docker Compose `selfhost` profile: `caddy`, `web`, `docs`, `api`, `worker`, `migrate`, `postgres`, `redis`, `mailpit` |
| HTTPS | ✅ Caddy + Let's Encrypt | Active when `DOMAIN` is set (an `sslip.io` name works without owning a domain); certificates auto-renew; data kept in the `caddy_data` volume |
| CI | ✅ `ci.yml` | Build + tests against real Postgres + Docker builds of `api` and `web` |
| CD | ✅ `deploy.yml` | After CI passes on `main`: SSH to the server, `git reset --hard origin/main`, `docker compose --profile selfhost up -d --build` |
| Staging / separate environments | ❌ None | One environment only; every merge to `main` that passes CI deploys to it |
| Custom domain | ⚠️ Depends on `DOMAIN` | A free `sslip.io`/DuckDNS name works; a purchased domain is the better long-term choice |

## Data

| Item | Status | Notes |
|---|---|---|
| PostgreSQL 16 | ✅ In Docker (`previo_pg_data` volume) | App connects as the restricted `previo_app` role, never the owner ([ADR 0007](./adr/0007-application-db-role.md)) |
| Row-Level Security | ✅ | Tenant isolation, share-chain visibility, quote/catalog write rules — [ADR 0006](./adr/0006-rls-request-scoped-transaction.md); policies live in `packages/db/migrations/0001_rls.sql` |
| Migrations | ✅ Automatic | `migrate` service runs on every `up` — forward-only |
| **Automated backups** | ❌ **Not set up** | The most important gap. Only manual `pg_dump` (see deployment.md). Uploaded files in `data/uploads` are not backed up either |
| Redis (BullMQ) | ✅ In Docker, AOF + `noeviction` | [ADR 0009](./adr/0009-bullmq-background-jobs.md) |
| File storage | ✅ Local disk (`./data/uploads`) | No object storage; S3 is not used |

## Authentication & access

| Item | Status | Notes |
|---|---|---|
| Login | ✅ Own email + password (bcrypt) | Session JWT signed by `apps/web` with `AUTH_SECRET`, verified by `apps/api`. No external identity provider (Cognito was removed) |
| Invite-only onboarding | ✅ | One-time email token → `/set-password`; company-admin requests need super-admin approval ([ADR 0004](./adr/0004-admin-invite-only-onboarding.md)) |
| Roles | ✅ 4 built-in + custom roles | Super-admin creates custom roles; roles are global |
| Permissions | ✅ Editable role × permission matrix | Effective permissions = roles' permissions ∩ the company's capabilities (manufacturer / supplier / client / platform) |
| Super-admin tenant override (`X-Tenant-Id`) | ✅ | [ADR 0008](./adr/0008-super-admin-tenant-override-header.md) |
| Audit log | ✅ | Append-only, written in the same transaction as the change ([ADR 0010](./adr/0010-tenant-aware-audit-logging.md)) |
| Demo-user login shortcut | ⚠️ On by default | `ALLOW_DEV_LOGIN` defaults to `true`; **set it to `false` before real customers use the server** |

## Email

| Item | Status | Notes |
|---|---|---|
| Outbound email | ✅ Resend when `RESEND_API_KEY` is set | Otherwise SMTP (`SMTP_HOST`, defaults to the bundled Mailpit), otherwise the link is only logged |
| Mailpit | ✅ | Local/demo inbox; UI bound to `127.0.0.1:8025` unless deliberately exposed behind a login |

## Secrets & config

| Item | Status | Notes |
|---|---|---|
| Server config | ✅ `.env` on the server (gitignored) | Plain file; keep a copy in a password manager |
| CI/CD secrets | ✅ GitHub repository secrets | `HETZNER_HOST`, `HETZNER_SSH_KEY` |
| Local dev | ✅ `.env.local` (for `pnpm dev`) + `.env` (for Docker Compose) | [environments.md](./environments.md) |

## Documentation

| Item | Status | Notes |
|---|---|---|
| Testing docs site | ✅ `apps/docs` (Docusaurus, EN/IT/DE, local search), `docs` service | Served at `https://<DOCS_DOMAIN>` when set; public, no login. Lists demo logins — those only work while `ALLOW_DEV_LOGIN=true` |
| API reference | ✅ Swagger UI at `https://<DOMAIN>/docs`, spec at `/openapi.json` | Routed by Caddy to `api`; public, read-only (data endpoints still need a session) |
| Demo data | ✅ `seed:demo-family` after every deploy | Imports + publishes *Demo Window W70* for the seeded Suppli company, shares it with Technometal at 10%. Idempotent. Remove from `deploy.yml` once the server holds only real customers |

## Observability

| Item | Status | Notes |
|---|---|---|
| Logs | ✅ `docker compose logs` | No log shipping |
| Monitoring / alerting / uptime checks | ❌ None configured | |
| Error tracking | ❌ None configured | |

## Legacy (kept in the repo, not used)

| Item | Notes |
|---|---|
| `infra/terraform/` | AWS dev environment (VPC, RDS, Cognito, ECS, ECR, S3). Retired; may be removed |
| `scripts/env-fetch.sh`, `pnpm env:fetch`, `pnpm dev:hybrid`, `pnpm dev:remote` | Pulled credentials from AWS Secrets Manager for the retired dev environment |
| `docs/adr/0002`, `0011` | Describe Cognito and Secrets Manager; superseded by ADR 0013 |
| `users.cognito_sub` column | Kept as a nullable external-identity slot; used by the seeded demo users |

## Product status (for context)

Built and in use: product families (Excel import, versioning, pricing editor, publish), per-family sharing with default discounts, quote builder (auto/manual pricing, edit, custom position codes, PDF), company capabilities, custom roles + permission matrix, invite-only user management, admin panel.

Not built yet (see [project-context.md](./project-context.md)): quote status workflow (draft → sent → accepted/rejected), quote header edit / delete / full duplicate, editing characteristic ↔ line relations without Excel, automated backups, monitoring.
