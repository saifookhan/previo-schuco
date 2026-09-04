# 0008 — Super-admin tenant override via `X-Tenant-Id` header

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

`docs/project-context.md` describes a `super-admin` role that can view/manage any company on the platform, but no such capability exists in code today — RLS's `app_is_super_admin()` bypass exists at the policy level, but nothing in `apps/api` lets a super-admin actually direct a request at a specific tenant. Per [0001](./0001-no-tenant-in-url.md), this cannot be a URL path segment (`/companies/:id/...`).

A raw UUID header is enough to make the feature *work*, but it is not enough to make it **auditable**. For every action a super-admin takes while acting on behalf of another tenant, the system must be able to answer, unambiguously and later: who performed this, which tenant were they acting for, and were they acting as themselves or on someone else's behalf? A header alone doesn't distinguish "the real caller" from "the tenant being acted on" in a way that's convenient to log — both need to be first-class, separately-named values from the moment the request is authenticated, not derived ad hoc wherever a log line happens to be written.

## Decision

A super-admin may act on behalf of another company by sending an `X-Tenant-Id: <company-uuid>` request header. `requireAuth` resolves three distinct, explicitly named values onto the Hono context — not just one "effective company" value:

- **`actorUserId`** — `profile.id`, the real, authenticated caller. Never changes based on the header.
- **`effectiveCompanyId`** — the company the request is scoped to: the header's value if present and valid, otherwise the actor's own `company.id`.
- **`isActingAsTenant`** — `boolean`, `true` only when the header was present and validated successfully. This is what distinguishes "super-admin looking at their own company (Schuco)" from "super-admin acting as Fabbrikka" — both have an `effectiveCompanyId`, only one is an override.

Validation order, unchanged from the original design:

1. Header present and caller is **not** `super-admin` → `403 Forbidden`. (Checked before format/existence validation, so a non-super-admin gets the same response whether the header is malformed or points at a real company — no information about company existence leaks to unauthorized callers.)
2. Value isn't a valid UUID → `400 Bad Request`.
3. No company with that id exists → `404 Not Found`. (This existence check runs inside `withSystemTransaction`, per [0007](./0007-application-db-role.md) — not a fabricated-tenant `withRlsTransaction` call.)
4. Otherwise, `effectiveCompanyId` becomes the header's value, `isActingAsTenant` becomes `true`, and the `app_is_super_admin()` GUC stays `true` for any subsequent RLS-scoped transaction — current RLS policies are `app_is_super_admin() OR company_id = app_current_company_id()`, so this is a superset-safe operation (a super-admin could already see the row anyway). This decision would need revisiting only if a future policy moves from `OR` to `AND`-based scoping.

Absent the header, a super-admin's requests behave exactly as any other user's — `effectiveCompanyId` is their own company, `isActingAsTenant` is `false`.

**The frontend is never trusted to remember or assert tenant context across requests.** Every request re-sends the header (or doesn't) and the backend re-validates it from scratch — there is no server-side "currently acting as" session state to get out of sync. A tenant-switcher UI in `apps/web` is responsible for attaching the header to each API call for as long as the operator is "viewing as" a company, but that's a UI convenience, not a trust boundary; the backend's validation in `requireAuth` is the only thing that matters.

## Consequences

- No new route surface for "switch tenant" — it's a per-request header, not a stateful session mode, which keeps request handling simple (no cross-request state to invalidate or leak between requests).
- `actorUserId`, `effectiveCompanyId`, and `isActingAsTenant` are exactly the three fields [0010](./0010-tenant-aware-audit-logging.md) needs to record "who did this, on whose behalf" — this ADR produces them as a side effect of authentication specifically so audit logging has nothing further to derive or reconstruct.
- Every route that reads `c.get('user').company.id` directly instead of `c.get('effectiveCompanyId')` bypasses this override — and, per [0006](./0006-rls-request-scoped-transaction.md), any query relying on RLS alone (rather than an explicit `WHERE company_id = effectiveCompanyId`) won't actually narrow a super-admin's results either, since `is_super_admin()` makes the RLS company clause moot for that role. Both rules point the same direction: routes must use the resolved `effectiveCompanyId` explicitly, not assume RLS alone enforces the override.
