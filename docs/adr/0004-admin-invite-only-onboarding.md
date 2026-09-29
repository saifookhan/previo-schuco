# 0004 — Admin-invite-only user onboarding

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

Today users only exist via pre-seeded demo rows (`packages/db/src/demo-users.ts`) — there is no way for a real company-admin or super-admin to onboard a new user. Two onboarding models were considered:

- **Admin-invite only**: an admin creates the user (Cognito account + DB row) on someone else's behalf; the invitee just accepts and sets a password.
- **Self-signup + admin approval**: anyone can sign up via the Cognito Hosted UI; the resulting DB row sits in a `pending` state until an admin assigns them to a company/role.

Self-signup fits public consumer products but not this B2B model, where every user must belong to a specific company and business unit from day one, and where a company-admin is expected to be the one managing their own team's membership (per `docs/project-context.md`'s org model). Self-signup would also require a public sign-up surface and an approval-queue UI that don't otherwise exist.

## Decision

**Onboarding is admin-invite only.** A `company-admin` (into their own company) or `super-admin` (into any company) invites a user by email + role (+ optional business-unit assignment). The invite endpoint:

1. Creates a `users` row with `status = 'invited'` and `cognito_sub = NULL` first (see [0002](./0002-cognito-identity-only.md) — the DB grant is authoritative; the Cognito identity only lets someone later prove they're who the grant says).
2. Then creates a Cognito user via `AdminCreateUserCommand` (Cognito auto-generates and emails a temporary password — no custom SES/email setup needed). This ordering, and what happens when step 2 fails, is deliberate — see "Reconciliation strategy" below.
3. On first login, the existing `syncUserFromCognito` email-match path links the real `cognito_sub` to that row and flips `status` to `'active'`.

No self-signup surface exists or is planned.

## Consequences

- `users.cognito_sub` must be nullable (previously `NOT NULL UNIQUE`) — a relaxation, not a behavior change for existing rows.
- `user_status` enum gains an `'invited'` value alongside `active`/`inactive` (and, per the reconciliation strategy below, an `'invite_failed'` value).
- In local/dev-bypass mode (no Cognito configured), the invite endpoint skips the Cognito call, creates the DB row only, and logs a warning — mirroring the existing dev-bypass philosophy elsewhere in the codebase.

## Reconciliation strategy (no distributed transaction exists)

Creating a Cognito user and a DB row is two systems, two calls, no shared transaction — either can fail independently after the other has already succeeded. Two failure modes must both be handled, not just the happy path:

- **DB insert succeeds, Cognito call fails** (network error, throttling, Cognito outage): the DB row exists with a grant that has no way to authenticate yet.
- **Cognito call succeeds, DB insert fails** (constraint violation, DB outage): an orphaned Cognito identity exists with no corresponding authorization row — someone who could theoretically prove identity but has no `company_id`/`role_id` grant, so `requireAuth`'s `getUserProfileByCognitoSub` lookup simply returns null for them (safe by default, but a leftover Cognito account is still cleanup debt).

**Decision: the DB row is created first, inside its own short transaction (see [0006](./0006-rls-request-scoped-transaction.md)), and is authoritative.** The Cognito call happens after, not before — this ordering means a failure only ever leaves "a DB grant with no matching Cognito identity yet," never an orphaned Cognito identity with no DB record, which is the easier of the two failure states to detect and safely retry (querying `users WHERE status IN ('invited', 'invite_failed')` finds every pending case; there's no need to reconcile against Cognito's own user list to find orphans).

Concretely:

1. `POST /invite` inserts the `users` row (`status: 'invited'`, `cognito_sub: NULL`) and commits.
2. The handler then attempts the Cognito `AdminCreateUserCommand` call.
   - On success: no further action needed now — the row already reflects `'invited'`, and `syncUserFromCognito`'s existing email-match path flips it to `'active'` on first login.
   - On failure: update the row's status to `'invite_failed'` (new enum value) in a separate, short transaction. The invite is not silently lost — it's a distinct, queryable state.
3. **Retries are idempotent by construction**: re-attempting the Cognito call for a row already in `'invite_failed'` uses `AdminCreateUserCommand` with `MessageAction: 'RESEND'` if Cognito reports the identity already exists (`UsernameExistsException` — meaning step 2's Cognito call actually succeeded but the app crashed/timed out before recording that), or a plain `AdminCreateUserCommand` if it doesn't exist yet. Either branch is safe to run multiple times.
4. **Retry trigger**: step 2's Cognito call is a natural candidate to run as a BullMQ job ([0009](./0009-bullmq-background-jobs.md)) rather than inline in the HTTP request — this gets retry/backoff for free from the queue instead of hand-rolling it, and decouples "the invite was accepted" (DB commit, fast) from "the external Cognito call succeeded" (can be slow/flaky, shouldn't hold the HTTP response). A periodic reconciliation job (also BullMQ, scheduled) scans for rows stuck in `'invite_failed'` past a threshold and either retries automatically or surfaces them to an admin — exact threshold/alerting mechanism is implementation detail, not decided here.

This makes "an admin invited someone and nothing happened" a detectable, queryable, retryable state rather than a silent failure — the one thing a two-system operation without a distributed transaction absolutely must guarantee.
