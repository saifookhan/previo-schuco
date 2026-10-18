# 0001 — No tenant identifier in any URL

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

PREVIO is a shared-schema, multi-tenant platform (`companies` table = tenant). We need a convention for how a request's tenant (company) is determined, for both `apps/web` (Next.js) and `apps/api` (Hono BFF). Common alternatives in multi-tenant SaaS:

- Subdomain per tenant (`{company-slug}.previo.it`)
- Path-based tenant slug (`previo.it/t/{company-slug}/...`)
- No tenant in the URL at all — resolved server-side from the authenticated session

Subdomain routing needs wildcard DNS, a wildcard SSL cert, Vercel wildcard domain configuration, and Cognito callback URLs that accept a wildcard host — meaningful infra overhead for a B2B app with a handful of tenants today. Path-based slugs are lighter but still require middleware to reconcile the URL slug against the session's actual `company_id` on every request (and handle the mismatch case), and expose tenant identity/slugs in every shared link.

## Decision

**No tenant identifier appears in any URL, in `apps/web` or `apps/api`.** Tenant (`company_id`) is always resolved server-side from the authenticated session:

- Web: session cookie → user profile (already includes `company`).
- API: `Authorization` Bearer JWT → `cognito_sub` → `users.company_id` (see [0002](./0002-cognito-identity-only.md)).

API route paths never carry a company/tenant path segment (e.g. `/users`, not `/companies/:id/users`) — every route is implicitly scoped to the caller's own company via RLS ([0006](./0006-rls-request-scoped-transaction.md)).

The one exception is **super-admin**, who can act on behalf of another tenant. That capability is expressed as an explicit `X-Tenant-Id` request header, never a URL — see [0007](./0008-super-admin-tenant-override-header.md).

## Consequences

- Simplest possible routing on both apps; no wildcard DNS/SSL/Vercel domain config, no Cognito callback URL wildcarding.
- URLs are stable and shareable without leaking tenant identity into browser history, logs, or referrer headers.
- Trade-off: no tenant-scoped deep link (can't bookmark "Fabbrikka's dashboard" as a distinct URL from "Technometal's dashboard"). **Tenant context is request/session state, not resource identity** — `/app/dashboard` resolves against whichever company the current request's session implies, however that resolution logic evolves. This framing deliberately avoids depending on today's membership model (a user currently belongs to one `company_id` but multiple `business_units` via `user_business_units`); if the platform later lets a single login represent multiple companies, the fix is a request-scoped "active company" selection mechanism (session state), not a change to this ADR's URL rule.
- Any future route that appears to need a company identifier in its path (e.g. a super-admin "view company X" screen) must instead carry the target company via the `X-Tenant-Id` header (API) or an equivalent session-scoped "acting as" state (web), not a path param — this is a standing rule for all future route design, not just the routes covered by the initial implementation.
