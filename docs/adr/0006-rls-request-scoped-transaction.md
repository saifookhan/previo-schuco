# 0006 — RLS tenant context via short, per-operation transactions

## Status

Accepted (revises an earlier version of this ADR — see "Revision history" at the bottom)

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

`packages/db/migrations/0001_rls.sql` enables Postgres Row-Level Security on `companies`, `business_units`, `users`, `user_business_units`, and `supplier_client_links`, gated by two session GUCs read via `app_current_company_id()` / `app_is_super_admin()` SQL functions. These GUCs must be set with `set_config(key, value, true)` — the `true` third argument makes the setting **transaction-local** — because `apps/api`'s DB client (`packages/db/src/client.ts`) is a process-wide, pooled `postgres-js` client (`max: 10`); a GUC set outside a transaction (or in a different implicit transaction than the query that needs it) is either already gone or set on the wrong pooled connection by the time a query runs.

The first version of this ADR concluded from that fact that `requireAuth` should open one Drizzle transaction and hold it for the **entire HTTP request** — wrapping `next()` and therefore every downstream route handler inside it. That was wrong, and this revision corrects it.

**Why the whole-request transaction is unacceptably risky:** a database transaction's lifetime should be bounded by the database work it protects, not by however long the surrounding request happens to take. `apps/api` will, over time, do non-DB work inside a request — a Cognito admin call ([0004](./0004-admin-invite-only-onboarding.md)'s invite flow), a file upload, PDF generation, an external API call. If any of that sits inside a request-long transaction, a slow or hanging external call now holds a Postgres connection (and an open transaction) for its entire duration — at `max: 10` connections, a handful of slow requests exhausts the pool and starts queuing or failing every other request, and a long-open transaction is its own class of Postgres problem (held row locks, bloated `pg_stat_activity`, autovacuum interference on high-churn tables). This is a correctness-adjacent risk, not just a performance one.

## Decision

**A transaction's lifetime is scoped to one logical unit of database work, never to the HTTP request.** Concretely:

- `requireAuth` **no longer opens a transaction**. It authenticates, resolves the caller's profile, resolves `effectiveCompanyId` / `isSuperAdmin` / `isActingAsTenant` (see [0008](./0008-super-admin-tenant-override-header.md)), and sets them on the Hono context as plain data — `c.set('user', profile)`, `c.set('effectiveCompanyId', ...)`, `c.set('isSuperAdmin', ...)`. No DB connection is held across `next()`.
- Route handlers that need tenant-scoped DB access call a small helper — `withTenantDb(c, fn)` — which opens a transaction, sets the RLS GUCs from `c`'s resolved values, runs `fn`, and commits, all within that one call. The transaction exists only for the duration of the actual queries inside `fn`, never longer.
- **"One logical unit of DB work" can still mean several queries**, when they must be atomic together — e.g. an invite that inserts a `users` row and several `user_business_units` rows: those all belong in one `withTenantDb(c, async (tx) => { ...multiple queries against tx... })` call. What must never happen is an external I/O call (Cognito, an HTTP fetch, file I/O, PDF rendering) *inside* that callback — external work happens before or after a `withTenantDb` call, never inside one.
- **Bootstrap identity resolution is not a request transaction and not a tenant-scoped one** — see [0007](./0007-application-db-role.md) for why the lookup needs elevated (`is_super_admin`) access before a tenant is even known, and for the distinct `withSystemTransaction` helper that makes that elevation explicit rather than folding it into `withRlsTransaction` with a fabricated empty `companyId`.

### RLS is tenant isolation, not authorization — a stronger rule than before

The first version of this ADR treated "the query was allowed to run under RLS" as roughly equivalent to "the user is authorized to do this." That conflation is corrected here as an explicit rule:

> **RLS answers "which tenant's rows can this connection see," nothing more. It is not a substitute for role/action authorization.** A `company-admin` being able to *see* a row (because RLS lets their company's rows through) says nothing about whether they're allowed to *delete* it, or perform any other specific action on it. Role/action permissions are a separate concern, checked separately.

The request pipeline is therefore, in this order:

```
Authentication (requireAuth: who is this?)
  -> Tenant resolution (requireAuth: effectiveCompanyId, isSuperAdmin, isActingAsTenant)
  -> RBAC / action authorization (requireRoles, and any future finer-grained permission check) — before any DB access
  -> Business logic, which opens short RLS-scoped transactions (withTenantDb) as needed for tenant isolation
```

Not:

```
Authentication -> RLS -> "you're authorized"
```

`requireRoles` already runs after `requireAuth` and before the route handler, which already matches this ordering in code — this ADR makes the *reason* explicit (RBAC must not depend on or be conflated with RLS) so future route/permission work doesn't quietly re-couple them. `requireRoles` today is coarse (role-name allow-lists per route); a finer per-action permission model, if it's ever needed, replaces or extends that check — it does not get expressed as an RLS policy.

## Consequences

- No request ever holds a DB connection/transaction for longer than its actual database work — a slow Cognito call, file upload, or PDF render never blocks the connection pool.
- Every DB-touching route handler must go through `withTenantDb(c, fn)` (or, for the narrow system-level cases, `withSystemTransaction`) — calling `getDb()` directly bypasses RLS entirely, same risk as before, now flagged doubly given the pattern is "open a scoped helper," not "read `c.get('db')`."
- Multiple round trips to Postgres within one request each open and close their own transaction — slightly more transaction overhead than one big transaction, traded deliberately for bounded transaction lifetime. Not expected to matter at current scale; revisit if profiling says otherwise.
- `listUsers` (and any future RLS-scoped list query) must still accept an explicit `companyId` filter, applied in the query itself, not rely on RLS alone to narrow a super-admin's view — current policies are `app_is_super_admin() OR company_id = app_current_company_id()`, so a super-admin's `app_is_super_admin()` GUC being `true` makes the `company_id` clause irrelevant to Postgres regardless of what `X-Tenant-Id` set it to. Confirmed end-to-end: a super-admin hitting the tenant-scoped `/api/users` route with `X-Tenant-Id: <fabbrikka>` sees only Fabbrikka's user, not all seven, because the route passes `effectiveCompanyId` into the query explicitly.
- The application database role must itself be non-owner, non-superuser for any of this to matter — RLS is meaningless against a role that bypasses it unconditionally. That finding, and its fix, is significant enough to be its own ADR: see [0007](./0007-application-db-role.md).

## Revision history

- This ADR originally specified a whole-HTTP-request transaction opened in `requireAuth` (`withRlsTransaction(db, ctx, async (tx) => { c.set('db', tx); await next() })`). That design is superseded by the short, per-operation transaction model above. The database-role/superuser discovery that was originally an addendum to this ADR is now its own ADR ([0007](./0007-application-db-role.md)).
