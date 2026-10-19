# 0010 — Tenant-aware audit logging

## Status

Proposed

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

The platform now has several pieces that specifically need an audit trail once real users are on it: multi-tenant data isolation ([0006](./0006-rls-request-scoped-transaction.md)), a super-admin role that can act on behalf of any tenant ([0008](./0008-super-admin-tenant-override-header.md)), admin-driven user invitation and role assignment ([0004](./0004-admin-invite-only-onboarding.md)), and (once built) background jobs performing actions on a tenant's behalf with no live request to attribute them to ([0009](./0009-bullmq-background-jobs.md)). None of these currently write anything to an audit trail — `docs/project-context.md`'s Phase 1 scope explicitly lists "pgaudit / audit tables" as deferred, and that deferral needs a concrete decision now that a super-admin tenant-override capability actually exists in code, since "who did this, and on whose behalf" is exactly the question that capability makes hard to answer without one.

## Decision

### Audit writes for business-critical events are transactional with the business operation — not an implementation choice left open

This is the central rule, stated as an invariant rather than left to whoever implements it: **if the business mutation commits, the audit record for it must also exist; if the mutation rolls back, so does the audit record.** Concretely, for the minimum event list below, the audit `INSERT` happens inside the *same* database transaction as the business write it's recording (e.g. `UPDATE users SET role_id = ...` and `INSERT INTO audit_log (...)` both inside one `withTenantDb(c, tx => ...)` call, per [0006](./0006-rls-request-scoped-transaction.md)'s "one logical unit of DB work" rule).

Writing the audit record via a separate mechanism — a BullMQ job enqueued after the business transaction commits, most obviously — creates exactly the failure this ADR exists to prevent: the business change succeeds, the process crashes or the enqueue call fails before the job is queued, and the audit trail is now silently missing an event that definitely happened. An audit log that can silently lose entries for the exact class of event it was built to capture (security-sensitive, super-admin, permission-changing actions) is not trustworthy. Async delivery (a queue, a separate analytics pipeline) is acceptable only for high-volume, non-critical telemetry that isn't standing in for this ADR's security/compliance trail — that's a different, later decision, not this one.

### Append-only

The application never issues `UPDATE` or `DELETE` against the audit table — only `INSERT`. Audit records are immutable once written; correcting a mistaken entry means writing a new record that references the old one (e.g. via `metadata`), never editing history. This is enforced at minimum by convention/code review; a stronger enforcement (a `REVOKE UPDATE, DELETE` on the table for the application's DB role, per [0007](./0007-application-db-role.md)'s least-privilege grants) is recommended but left as an implementation choice.

### Fields

Every audited action writes one record with, at minimum:

- `id`
- `actor_type` — `'user' | 'system'`. **Not every audited action has a human actor** — a scheduled/background process can perform an auditable action with no user behind it, and that must not be represented by a fabricated user id.
- `actor_user_id` — **nullable**, populated only when `actor_type = 'user'`: the real, authenticated caller, from [0008](./0008-super-admin-tenant-override-header.md)'s `actorUserId`. When `actor_type = 'system'`, this is `NULL` — a system action is not manufactured into a fake user identity just to satisfy a non-null constraint.
- `job_id` — populated when the action was performed by a background job ([0009](./0009-bullmq-background-jobs.md)), for cross-referencing against BullMQ's own job record; `NULL` for request-triggered actions.
- `actor_company_id` — the actor's own company (nullable alongside `actor_user_id` for `system` actions that have no company).
- `effective_company_id` — the tenant the action was actually performed against, from [0008](./0008-super-admin-tenant-override-header.md)'s `effectiveCompanyId`. For the overwhelming majority of actions `actor_company_id == effective_company_id`; the interesting case — and one this ADR exists to make visible — is when they **differ**, which (for user-triggered actions) only happens when a super-admin is acting as another tenant (`isActingAsTenant: true`).
- `action` — a stable, namespaced identifier (e.g. `user.invite`, `user.role_change`, `user.deactivate`), not a free-text description.
- `resource_type` / `resource_id` — what was acted on.
- `metadata` — action-specific detail (e.g. old/new role for a role change), structured, not a formatted string.
- `request_id` — correlates an audit entry back to the specific HTTP request that produced it (log correlation, debugging "what else happened in this request"). Recommended, not optional-by-omission: include it from the start since it's cheap to thread through and expensive to retrofit.
- `created_at`.

`ip_address`/`user_agent` are **not** part of the minimum model — useful for some investigations, but not mandatory, and can be added later without disrupting the shape above.

**What gets audited, at minimum, for the initial scope**: role changes, user deactivation/reactivation, invitations, and every action taken while `isActingAsTenant: true` — regardless of what the action is, since "a super-admin acted as this tenant" is itself the fact worth recording, on top of whatever the specific action was. This list is a floor, not a ceiling — additional action types are added as they're built, following the same fields and the same transactional-write rule.

A dedicated `audit_log` table in Postgres is the implementation (simplest, queryable with the same tools as everything else, naturally tenant-scoped by `effective_company_id` under the same RLS model as other tables) — that part is not left open; only lower-level details (exact column types, indexing strategy) are left to implementation.

## Consequences

- This ADR is written now, ahead of implementation, specifically because [0008](./0008-super-admin-tenant-override-header.md) was designed to produce exactly the fields (`actorUserId`, `effectiveCompanyId`, `isActingAsTenant`) this decision needs — building the audit log later doesn't require re-threading identity/tenant context through `requireAuth` again.
- The `audit_log` table needs its own RLS policy — a company should see audit entries where it's the `effective_company_id` (actions taken against it, including by an acting-as super-admin), while `super-admin` sees everything, mirroring the pattern already established for every other tenant table.
- Every service ([0012](./0012-testing-strategy-and-service-layer.md)) that performs one of the minimum-scope actions is responsible for writing the audit record as part of its own transaction — this is a standing code-review checklist item (did this mutation's audit write land inside the same `withTenantDb` call as the mutation itself, not after it), the same way [0006](./0006-rls-request-scoped-transaction.md) already flags `getDb()` misuse and [0009](./0009-bullmq-background-jobs.md) flags handler idempotency.
- High-volume, non-critical telemetry (if the platform ever wants e.g. "every read request" logging) is explicitly a separate, later decision from this one — this ADR's transactional-write guarantee applies to the security/compliance-relevant minimum event list, not to a firehose of every request.
- Nothing in the codebase writes an audit record yet; this ADR fixes the shape, the transactional-write invariant, and the non-negotiable minimum event list so implementation can proceed independently without re-litigating those questions, but does not itself land any code.

## Addendum (2026-10) — reading the log, auth events, retention

- **Viewer.** `GET /api/audit-log` (company admin: own company; super-admin with `scope=platform` and not acting as a
  tenant: all, optional `companyId`; `scope=company` or acting as a tenant: the current company) backs
  *Settings → Audit log* and *Admin → Audit log*. Read-only; newest first with a `(created_at, id)` keyset cursor.
  Indexes for each filter: `audit_log_created_idx`, `audit_log_company_created_idx`, `audit_log_actor_created_idx`,
  `audit_log_type_created_idx`, `audit_log_resource_created_idx`, `audit_log_request_id_idx` (migration `0017_audit_log_indexes`).
- **Auth events.** `auth.login`, `auth.login_failed` (`metadata.reason`: `wrong_password` / `account_not_active` /
  `company_inactive` / `no_password_set`; at most one per account per minute, every attempt is still logged),
  `auth.password_set` (`metadata.purpose`: `invite` / `password_reset`) and
  `auth.password_reset_requested`. A login is not a business mutation, so its entry is its own short,
  best-effort transaction (a failed audit insert is logged, never turned into a 500); password set and reset request are written in the same transaction as the token change.
  A login attempt for an **unknown email** is only logged (warn), never audited: there is no company to file it
  under, and storing guessed emails would turn the audit log into a list of them. The web app's demo
  ("dev seed") login does not reach the API's login and is not audited.
- **Request ids** now exist for every request (app-wide middleware, `X-Request-Id` response header), not only
  authenticated ones, and appear on every log line. They are always generated by the API — an incoming
  `X-Request-Id` is ignored, so nobody can make their actions share an id with someone else's.
- **Indexes** are created without `CONCURRENTLY` (drizzle runs a migration in one transaction). Fine while the
  table is small; on a large table, build new indexes by hand with `CREATE INDEX CONCURRENTLY` first.
- **Retention.** Entries are kept indefinitely for now — the table is small (one row per change) and
  append-only by design. When size or a data-protection requirement calls for it, add a scheduled job that
  runs as the table owner (the app role cannot delete) and removes entries older than an agreed period, and
  record that period here. Until then, database backups include the full audit history.
