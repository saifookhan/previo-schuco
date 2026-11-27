# Architecture Decision Records

Index of ADRs for the multi-environment, multi-tenant architecture work. Each ADR is numbered, immutable once accepted (superseded by a new ADR rather than edited; only the Status line is updated), and follows: Status, Context, Decision, Consequences.

| # | Title | Status |
|---|-------|--------|
| [0001](./0001-no-tenant-in-url.md) | No tenant identifier in any URL | Accepted |
| [0002](./0002-cognito-identity-only.md) | Cognito stays identity-only; Postgres is the tenant/role source of truth | Superseded by 0013 |
| [0003](./0003-per-environment-isolation.md) | Isolated application/data/security boundaries per environment | Accepted (AWS parts retired by 0013) |
| [0004](./0004-admin-invite-only-onboarding.md) | Admin-invite-only user onboarding | Accepted (mechanism changed by 0013) |
| [0005](./0005-env-target-composition.md) | Per-dependency `*_TARGET` vars, per-target credential files | Accepted (remote targets unbacked) |
| [0006](./0006-rls-request-scoped-transaction.md) | RLS tenant context via short, per-operation transactions | Accepted |
| [0007](./0007-application-db-role.md) | Application database role is non-owner, non-superuser | Accepted |
| [0008](./0008-super-admin-tenant-override-header.md) | Super-admin tenant override via `X-Tenant-Id` header | Accepted |
| [0009](./0009-bullmq-background-jobs.md) | BullMQ (Redis) for background job processing | Proposed |
| [0010](./0010-tenant-aware-audit-logging.md) | Tenant-aware audit logging | Proposed |
| [0011](./0011-secrets-config-management.md) | Secrets and config management | Superseded by 0013 |
| [0012](./0012-testing-strategy-and-service-layer.md) | Repository/service layering, Vitest, no direct DB access from tests | Accepted |
| [0013](./0013-single-server-docker-compose-deployment.md) | Single-server Docker Compose deployment; AWS, Terraform, Vercel and Cognito retired | Accepted |
| [0014](./0014-table-loading-states.md) | Loading states for data tables: skeleton on first load, overlay on reload | Accepted |
| [0015](./0015-quote-chat-assistant.md) | Quote assistant is a library on Workers AI; the chat is not stored | Accepted |
| [0016](./0016-quote-variants.md) | A quote is a matrix of versions and alternatives | Accepted |

See also: [project-context.md](../project-context.md) (domain/roles), [technical-overview.md](../technical-overview.md) (system diagrams), [deployment.md](../deployment.md), [environments.md](../environments.md) (env/target composition), [infra-status.md](../infra-status.md) (what is actually running).
