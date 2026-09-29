# Architecture Decision Records

Index of ADRs for the multi-environment, multi-tenant architecture work. Each ADR is numbered, immutable once accepted (superseded by a new ADR rather than edited), and follows: Status, Context, Decision, Consequences.

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-no-tenant-in-url.md) | No tenant identifier in any URL | Accepted |
| [0002](./0002-cognito-identity-only.md) | Cognito stays identity-only; Postgres is the tenant/role source of truth | Accepted |
| [0003](./0003-per-environment-isolation.md) | Isolated application/data/security boundaries per environment | Accepted |
| [0004](./0004-admin-invite-only-onboarding.md) | Admin-invite-only user onboarding | Accepted |
| [0005](./0005-env-target-composition.md) | Per-dependency `*_TARGET` vars, per-target credential files | Accepted |
| [0006](./0006-rls-request-scoped-transaction.md) | RLS tenant context via short, per-operation transactions | Accepted |
| [0007](./0007-application-db-role.md) | Application database role is non-owner, non-superuser | Accepted |
| [0008](./0008-super-admin-tenant-override-header.md) | Super-admin tenant override via `X-Tenant-Id` header | Accepted |
| [0009](./0009-bullmq-background-jobs.md) | BullMQ (Redis) for background job processing | Proposed |
| [0010](./0010-tenant-aware-audit-logging.md) | Tenant-aware audit logging | Proposed |
| [0011](./0011-secrets-config-management.md) | Secrets and config management | Proposed |
| [0012](./0012-testing-strategy-and-service-layer.md) | Repository/service layering, Vitest, no direct DB access from tests | Accepted |

See also: [project-context.md](../project-context.md) (domain/roles), [technical-overview.md](../technical-overview.md) (system diagrams), [deployment.md](../deployment.md), [environments.md](../environments.md) (env/target composition, once written).
