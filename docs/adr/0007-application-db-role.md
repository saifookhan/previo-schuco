# 0007 — Application database role is non-owner, non-superuser

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

Row-Level Security only restricts a Postgres role if that role is actually subject to it. Two categories of role are exempt, unconditionally, with **no override available**:

- **Superusers** bypass RLS regardless of `ENABLE`/`FORCE ROW LEVEL SECURITY` — there is no way to force RLS onto a superuser.
- **Table owners** bypass RLS unless `FORCE ROW LEVEL SECURITY` is explicitly set on that table (`ENABLE` alone is not enough for the owner).

This was discovered, not designed for, during implementation of [0006](./0006-rls-request-scoped-transaction.md): after fixing the transaction-scoping bug, a company-admin's request to the tenant-scoped `/api/users` route still returned every company's users. The cause was that `apps/api`'s DB connection used the role `previo` — the Postgres bootstrap superuser created by `docker-compose.yml`'s `POSTGRES_USER: previo` (the official Postgres Docker image makes whatever `POSTGRES_USER` is set to the initial superuser). Every RLS policy in the system had been a no-op for the API's own connection since the day RLS was introduced, independent of the transaction-scoping bug — the two bugs happened to be masking each other, and the API's own connection was never actually going to enforce tenant isolation until this was fixed.

This is significant enough to be its own architectural decision, not a footnote on the transaction-scoping ADR: **the identity of the role a service connects as is itself a security boundary**, and needs to be stated as a rule future infrastructure changes (new environments, new services, new migrations) must not violate.

## Decision

**No service that should be subject to RLS may ever connect as a Postgres superuser or as the owner of the tables RLS is protecting.** Concretely:

- **Migrations** run as the existing owner/superuser role (DDL — `CREATE TABLE`, `ALTER TYPE`, role/grant management — genuinely needs those rights, and migrations are not tenant-scoped operations to begin with).
- **`apps/api`** (both the request-handling process and, per [0009](./0009-bullmq-background-jobs.md), the background worker process) connects as a dedicated, restricted role — `previo_app` locally, an equivalently-restricted role per AWS environment. This role:
  - Is **not** a superuser (`rolsuper = false`, no `BYPASSRLS` attribute).
  - Does **not** own any table RLS protects (owns nothing — it's granted access, not ownership).
  - Has explicit, minimal grants: `SELECT, INSERT, UPDATE, DELETE` on the tenant tables it needs, nothing broader (no `CREATE`, no `DROP`, no role-management rights).
- Any future service that reads/writes these tables (the BullMQ worker, a future `calculation-service` or `files-service` per `docs/architecture.md`'s target layout) uses this same restricted role — never a new one-off superuser/owner connection for convenience.
- This rule applies identically in every environment ([0003](./0003-per-environment-isolation.md)) — local Docker, dev/staging/prod RDS alike. When provisioning RDS in Terraform, this must be verified explicitly rather than assumed: confirm the RDS master user is not what the application connects as, and that whatever role the application does use has no bypass-equivalent privilege (AWS RDS's "master user" is not a true Postgres superuser by default, but the restricted-role rule above must still be applied deliberately, not left to RDS's defaults).

## Consequences

- RLS is only as trustworthy as this boundary — a code review or infra change that ever points `apps/api`'s `DATABASE_URL` back at the owner/superuser role silently disables tenant isolation platform-wide, with no error, no warning, and (per [0006](./0006-rls-request-scoped-transaction.md)'s finding) a query that returns *more* rows than expected rather than an obvious failure. This deserves an explicit verification step (a smoke test asserting a non-owner role cannot see cross-tenant rows) rather than relying on code review alone to catch a regression here — exact mechanism (CI check, integration test) is implementation detail, not fixed by this ADR.
- A second-order consequence, also discovered during implementation: the very first query of any request — resolving `cognito_sub → profile`, before the caller's `company_id` is knowable — now genuinely runs under RLS (previously it didn't, because the superuser connection ignored RLS entirely). That lookup cannot be tenant-scoped (there's no tenant yet), so it needs a distinct, explicitly-elevated path rather than either (a) reusing the superuser connection (defeats this ADR) or (b) silently failing under a restricted role with no GUCs set. The fix is `withSystemTransaction(db, fn)`: a transaction that sets only `app.is_super_admin = true` (never a fabricated `company_id`) for narrowly-scoped, genuinely system-level operations — the bootstrap identity lookup, and the super-admin `X-Tenant-Id` target-company existence check in [0008](./0008-super-admin-tenant-override-header.md). This function name and its narrow, named use sites are deliberately distinct from `withRlsTransaction` (tenant-scoped, used for all normal request/business-logic DB work) — conflating "bypass tenant restriction for a real system operation" with "RLS transaction for a company that happens to be an empty string" was itself a design smell in the original implementation, worth naming out of existence rather than working around.
- Passwords/credentials for `previo_app` (and its per-environment equivalents) are themselves secrets requiring the same handling as any other credential — see [0011](./0011-secrets-config-management.md); this ADR does not itself specify how that password is generated, rotated, or delivered to each environment, only that the role it belongs to must be restricted as described above.
