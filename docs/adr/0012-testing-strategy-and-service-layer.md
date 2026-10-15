# 0012 — Repository/service layering, Vitest, and no direct DB access from tests

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

The codebase has no explicit service layer today: route handlers (`apps/api/src/routes/**`) call `packages/db/src/queries/*.ts` functions — data-access functions, i.e. a repository layer in everything but name — directly, via `withTenantDb`. This mixes HTTP concerns (request parsing, response shaping, RBAC via `requireRoles`) with orchestration concerns (deciding which repository calls belong in one transaction, calling out to Cognito, enqueueing jobs, writing audit records) in the same route file.

There is also no test framework or test file anywhere in the repository (confirmed while writing this ADR — no `vitest`/`jest` dependency, no `*.test.ts` file exists yet).

This session's own experience is the direct motivation for how testing is decided here, not a generic best-practice argument: the RLS transaction-scoping bug ([0006](./0006-rls-request-scoped-transaction.md)) and the Postgres-superuser-bypass bug ([0007](./0007-application-db-role.md)) were both found only by manual, ad hoc `curl` verification against a running Docker stack — because no automated test exists that could have caught either. Critically, a test that **mocks the repository layer** would not have caught them either: a mock returns whatever the test tells it to, regardless of whether the real database and its RLS policies actually enforce tenant isolation. For a platform whose core correctness property is multi-tenant data isolation, a test suite that cannot observe an RLS failure is worse than no test at that layer — it creates false confidence.

## Decision

**1. Three-layer separation, strictly one-directional:**

```
Route (apps/api/src/routes/**)
  -> Service (apps/api/src/services/**, new)
    -> Repository (packages/db/src/queries/**, existing — this is already the repository layer, just not previously named that)
      -> DB
```

- A **route** parses the request, calls exactly one service function, shapes the response. It never calls a repository function directly and never calls `getDb()`.
- A **service** contains business logic and orchestration: it may call one or more repositories, call out to Cognito or other external systems, enqueue BullMQ jobs, write audit records. **Services own the transaction boundary** — `withTenantDb(c, fn)` (or its non-HTTP equivalent for job handlers, below) is called from within a service, not from a route handler. A route hands the service `effectiveCompanyId`/`isSuperAdmin`/`actorUserId` (already resolved by `requireAuth`, [0008](./0008-super-admin-tenant-override-header.md)); the service decides how many repository calls belong inside one transaction, per [0006](./0006-rls-request-scoped-transaction.md)'s "one logical unit of DB work" rule — that's a business-logic decision, not a routing one.
- A **repository** (`packages/db/src/queries/**`) does data access only — no business rules, no calling other repositories on its own initiative, no calling services. This layer keeps its existing name and location; this ADR formalizes the rule that nothing above it may reach past it, it does not rename or move it.

**2. BullMQ job handlers ([0009](./0009-bullmq-background-jobs.md)) call services too, not repositories directly.** A job and an HTTP route are just two different triggers for the same business logic — if a job handler calls a repository directly while a route calls a service for the equivalent operation, the two paths will drift out of sync over time. One business rule, one service function, two callers.

**3. Vitest is the test framework.**

**4. Four test categories, each with a different, deliberate relationship to the layers above — not one blanket rule for all tests:**

| Category | Exercises | May call repositories/DB directly? |
|---|---|---|
| **Unit** | Pure functions — no DB, no IO | N/A — no DB involved at all |
| **Service** | Business logic in `apps/api/src/services/**` | External providers (Cognito, email) mocked where appropriate; DB access may be real or mocked depending on what the test is verifying |
| **Integration** (repository/DB/RLS) | `packages/db/src/queries/**` and Postgres itself — persistence, constraints, transactions, RLS policies | **Yes — this category's entire purpose is to call repositories and the DB directly** |
| **API/E2E** | Full stack: HTTP → `requireAuth` → service → repository → Postgres | Never directly — goes through the real HTTP surface |

The rule from the original version of this ADR — "tests never call a repository or the DB directly" — was too absolute and is replaced by a narrower, more useful one:

> **Application-level integration tests and API/E2E tests must exercise business behavior through services and must not bypass the service layer to test the application's actual request/response flow.** Database/repository/RLS integration tests **may, and should,** access repositories or the database directly, when the specific purpose of the test is to validate persistence behavior, constraints, transactions, or RLS policy enforcement itself — that's precisely the layer those tests exist to examine, and forcing them through a service adds indirection without adding coverage of anything the service layer doesn't already own.

This distinction exists because RLS is the platform's core correctness property, and testing it properly sometimes means writing exactly the kind of test the original rule would have banned — e.g. "as tenant A's restricted DB role, with RLS session vars set for tenant A, attempt to read a row belonging to tenant B, and assert zero rows come back" is a repository/DB-layer test by nature; forcing it through a service adds nothing, since the thing under test is Postgres's own policy enforcement, not any application code.

**Fixtures follow the same split, not a single rule.** A repository/DB-layer test's fixtures may be created directly via repository calls or raw inserts — that's appropriate and simpler for a test whose whole point is examining persistence behavior. A service-layer or API/E2E test's fixtures should generally go through services (e.g. an admin-invite service, once it exists per [0004](./0004-admin-invite-only-onboarding.md)) when doing so isn't excessively coupled — but this is a preference for realism, not an absolute rule that turns "set up a company, a role, a user, and a business unit" into a chain of five service calls when a direct repository-level fixture helper is clearly more appropriate for what that particular test is checking.

**5. RLS test coverage is mandatory, not incidental.** Every tenant-scoped table/policy (`companies`, `business_units`, `users`, `user_business_units`, `product_family_shares`, and the future `audit_log` per [0010](./0010-tenant-aware-audit-logging.md)) must have at least one repository/DB-layer integration test proving, at minimum:

1. A tenant can access its own records.
2. A tenant **cannot** access another tenant's records (the negative case — this is the one that actually matters and is the one most likely to be skipped without an explicit rule requiring it).
3. `super-admin` behavior is correct (sees across tenants).
4. Acting-as-tenant behavior (`X-Tenant-Id`, [0008](./0008-super-admin-tenant-override-header.md)) is correct where the table/route supports it.

This is a stronger, more specific requirement than "we use Vitest" — it's the actual invariant this whole testing strategy exists to protect, made an explicit, checkable requirement rather than something a general "write tests" policy would leave to chance (and, per this session's own history, did leave to chance — twice).

**6. What's fine to unit-test in isolation, no DB involved at all**: pure functions — `packages/calculation`'s pricing logic, Zod schema validation, `packages/queue`'s payload-parsing, DTO/formatting helpers (`apps/api/src/lib/user-dto.ts` and similar).

## Consequences

- `apps/api/src/routes/users.ts` and `apps/api/src/routes/admin/users.ts` — both built during [0006](./0006-rls-request-scoped-transaction.md)/[0008](./0008-super-admin-tenant-override-header.md)'s implementation — currently call `listUsers` (a repository function) directly from the route via `withTenantDb`, and do not yet conform to the service-layering rule. Writing this ADR does not retroactively fix them; extracting a `usersService` (`listUsersForCompany`, `listAllUsers`) that routes call instead is flagged as a follow-up, not done automatically here.
- Repository/DB/RLS integration tests need a running Postgres in CI, not just local dev — accepted as the direct cost of tests that can actually catch tenant-isolation regressions, which is the whole point of category 4's split.
- New service files live in `apps/api/src/services/**` (one file per resource/domain, mirroring `apps/api/src/routes/**`'s structure) — not a new workspace package. If a second consumer of the same business logic ever needs it outside `apps/api` (e.g. a promoted `calculation-service` per `docs/architecture.md`'s target layout), promoting the relevant services out to a shared package is the natural next step then, not done preemptively now.
- Every future route, and every future BullMQ job handler, is reviewed against rule 1/2 (route/job -> service -> repository, service owns the transaction) the same way [0006](./0006-rls-request-scoped-transaction.md) already flags `getDb()` misuse and [0009](./0009-bullmq-background-jobs.md) flags handler idempotency.
- Every new tenant-scoped table or RLS policy is reviewed against rule 5 (the four-point minimum RLS test coverage) before being considered done — this is now a standing definition-of-done item for schema changes, not an optional nice-to-have.
