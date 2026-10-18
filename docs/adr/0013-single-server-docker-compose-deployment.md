# 0013 — Single-server Docker Compose deployment; AWS, Terraform, Vercel and Cognito retired

## Status

Accepted — records a decision already in effect in the codebase and deploy pipeline.

Supersedes [0002](./0002-cognito-identity-only.md) and [0011](./0011-secrets-config-management.md). Amends [0003](./0003-per-environment-isolation.md), [0004](./0004-admin-invite-only-onboarding.md) (invite *mechanism* only) and [0005](./0005-env-target-composition.md) (remote targets).

**Author:** Syed Arif Iqbal
**Date:** 2026-10-15

## Context

ADRs 0002–0011 were written when the target platform was AWS: Terraform-provisioned RDS, ECS Fargate, ECR, S3 and Cognito, the web app on Vercel, and credentials in AWS Secrets Manager, with fully isolated infrastructure per environment.

The repository no longer works that way:

- `docker-compose.yml` runs the whole product (`web`, `api`, `worker`, `migrate`, `postgres`, `redis`, `mailpit`, `caddy`) and its `selfhost` profile is what production uses.
- `.github/workflows/deploy.yml` deploys by SSHing to a Hetzner server after CI passes on `main`; CI has no Vercel, Terraform or AWS steps.
- Login is our own email + password with a signed session JWT (`apps/api/src/lib/session-jwt.ts`); Cognito is no longer involved in login; `users.cognito_sub` survives only as a nullable external-identity column (the seeded demo users use it).
- Files go to local disk, email goes through Resend or SMTP, and configuration comes from a server-side `.env`.

The older ADRs and the docs built on them (`architecture.md`, `deployment.md`, `infra-status.md`, `environments.md`) still described the AWS design, which misled anyone reading them.

## Decision

1. **Production is one self-hosted server running Docker Compose** (`--profile selfhost`), fronted by Caddy for automatic HTTPS. A second environment would be a second Compose project or server, not a shared one.
2. **Delivery is CI → SSH deploy:** `ci.yml` builds, tests (against real Postgres) and builds both images; on success `deploy.yml` updates the server checkout and runs `docker compose --profile selfhost up -d --build`. Migrations run in the `migrate` service on every `up`.
3. **Authentication is first-party** (email + password, bcrypt, session JWT verified by `apps/api`). **Postgres remains the single source of truth for tenant, role and permission** — the core of ADR 0002 stands; only the identity provider is gone.
4. **Secrets and config** live in the server's gitignored `.env` plus GitHub repository secrets for deploys. No cloud secret manager. This replaces ADR 0011.
5. **Storage and mail:** local disk volume for uploads; Resend when `RESEND_API_KEY` is set, otherwise SMTP (Mailpit by default), otherwise the link is logged.
6. **`infra/terraform/` (AWS) and Vercel are retired.** The Terraform directory stays in the repository only until someone removes it.

What still holds from the earlier ADRs: [0001](./0001-no-tenant-in-url.md) (no tenant in URLs), the **invite-only onboarding decision** of [0004](./0004-admin-invite-only-onboarding.md) (now an emailed one-time token plus a `/set-password` page, with company-admin requests held for super-admin approval, instead of a Cognito temporary password), and [0006](./0006-rls-request-scoped-transaction.md)–[0010](./0010-tenant-aware-audit-logging.md) and [0012](./0012-testing-strategy-and-service-layer.md) unchanged.

## Consequences

- **Simpler and cheaper to run:** one box, one deploy path, nothing to provision besides the server.
- **Single point of failure.** One server holds the database, the uploads and the certificates. Backups are therefore essential — and are **not automated yet** (see [infra-status.md](../infra-status.md)). This is the main follow-up.
- **No staging.** Every merge to `main` that passes CI reaches the only environment. ADR 0003's "full isolation for every environment" is satisfied between `local` and production only; a real staging environment would need its own server.
- **ADR 0005's `dev` / `staging` targets** have no backing environment today. The resolver still supports them, but `pnpm env:fetch`, `dev:hybrid` and `dev:remote` depend on the retired AWS setup and do not work.
- **No managed database:** upgrades, disk space and restores are our responsibility; the `previo_app` / owner role split of [0007](./0007-application-db-role.md) still applies.
- **Documentation** was rewritten to match (`deployment.md`, `infra-status.md`, `architecture.md`, `environments.md`, `technical-overview.md`, `project-context.md`, README).
