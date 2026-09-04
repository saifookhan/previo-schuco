# 0002 — Cognito stays identity-only; Postgres is the tenant/role source of truth

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

Cognito needs to know *something* about a user beyond email/sub if it's going to gate access by tenant or role. Two approaches were considered:

- **Mirror tenant/role into Cognito** via custom attributes (`custom:company_id`, `custom:role`) or User Pool Groups, read directly off the JWT — saves a DB lookup per request.
- **Keep Cognito purely as an identity provider** (proves "who are you") and resolve company/role from Postgres on every request, exactly as the current code already does (`getUserProfileByCognitoSub` joins `users → roles → companies` by `cognito_sub`).

Mirroring introduces a second system that must stay in sync with the DB: a user moved between companies, a role change, a BU reassignment would all need a matching Cognito attribute update, and Cognito custom attributes are immutable post-creation unless explicitly configured mutable — an easy source of drift and a class of bugs where the JWT and the DB disagree about who a user is.

## Decision

**Cognito remains identity-only.** No custom attributes, no groups carrying tenant/role information. `apps/api`'s `requireAuth` middleware continues to:

1. Verify the Cognito JWT (signature + expiry via JWKS).
2. Extract `sub`/`email`/`name` only.
3. Resolve `company_id`, `role_id`, and business-unit scope from Postgres via `users.cognito_sub`.

Postgres (`users`, `roles`, `companies`, `user_business_units`) is the single source of truth for authorization; Cognito answers only "who are you," never "what can you access."

## Consequences

- One source of truth — no sync jobs, no drift between Cognito attributes and DB state.
- **The standing rule is "Postgres is the authoritative source of authorization," not "Postgres must be queried on every request."** Today's implementation happens to do a DB lookup per request (profile resolution by `cognito_sub`), which is simple and correct, but that's an implementation choice, not the architectural invariant. A future optimization — e.g. caching `cognito_sub → authorization profile` with a short TTL and an explicit invalidation path (on role change, company reassignment, deactivation) — is compatible with this ADR as long as Postgres remains the thing that's authoritative when the cache is cold or invalidated. This ADR does not mandate that optimization; it only leaves room for it without requiring a new ADR later.
- A user's access changes (role change, company reassignment, deactivation) take effect on their next *uncached* lookup — immediately under today's no-cache implementation; bounded by the TTL if caching is introduced later. Any caching design must state its staleness bound explicitly.
- Admin-invite ([0004](./0004-admin-invite-only-onboarding.md)) creates a Cognito identity and a DB row as two coordinated steps rather than one — the DB row is the actual grant of access; the Cognito account only lets someone prove who they claim to be.
