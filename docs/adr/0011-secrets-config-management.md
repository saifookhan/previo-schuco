# 0011 — Secrets and config management

## Status

Superseded by [0013](./0013-single-server-docker-compose-deployment.md) — secrets now live in the server's `.env` and GitHub repository secrets; AWS Secrets Manager is not used.

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

[0005](./0005-env-target-composition.md) decided how environment configuration is *composed* on a developer's own machine (per-dependency `*_TARGET` vars, per-target credential files, no environment's secrets bleeding into another's file). That ADR deliberately left one question open: where do those per-target credential files, and the equivalent runtime configuration for deployed environments, actually come from — and where do secrets live once the platform is running in AWS, not on a laptop.

Today, secret handling is inconsistent across the codebase: `infra/terraform/modules/ecs/main.tf` already sources `DATABASE_URL` from Secrets Manager for the ECS task definition (the right pattern), but every other credential is either a plaintext Terraform variable, a plaintext `docker-compose.yml` environment value (`POSTGRES_PASSWORD: previo`, and — as of [0007](./0007-application-db-role.md) — `APP_DB_PASSWORD` with a hardcoded local-only default), or absent from the deployed-environment story entirely (Cognito app client configuration, the future Redis connection [0009](./0009-bullmq-background-jobs.md) needs, `AUTH_SECRET`). None of this is wrong for `local` — plaintext, low-stakes, throwaway credentials are the correct choice there — but there is no explicit line drawn between "this is fine because it's local" and "this must never be plaintext because it's a real environment."

## Decision

### Secrets vs. config — two different problems, handled two different ways

This ADR previously talked about "environment configuration" as one undifferentiated thing. It isn't:

| | Examples | Where it lives |
|---|---|---|
| **Secret** — must never be readable by someone without an explicit grant | DB passwords, `AUTH_SECRET`, Cognito app client secret, a Redis auth token | AWS Secrets Manager |
| **Non-sensitive config** — fine to be widely readable, still environment-specific | `DATABASE_HOST`, `AWS_REGION`, `LOG_LEVEL`, feature flags | SSM Parameter Store, Terraform variables, or plain ECS task-definition environment values |
| **Local development** | anything, since it's not protecting real data | `.env*.local` files, per [0005](./0005-env-target-composition.md) |

Something that merely *contains* a secret as part of a larger value (a full `DATABASE_URL` connection string, a Redis URL with an embedded auth token) is treated as a secret in its entirety — it goes through Secrets Manager, not SSM, even though most of the string (host, port, db name) isn't sensitive on its own.

### AWS Secrets Manager is the source of truth for every secret in `dev`, `staging`, and `production` — never a plaintext Terraform variable, `.tfvars` file, or hardcoded default for those environments

- **Generation and storage of the secret *value* itself should live in Secrets Manager, not primarily in Terraform state.** The original version of this decision proposed generating every secret via Terraform's `random_password` resource. That's reconsidered: **Terraform state can (and, for a `random_password` resource, does) contain the generated secret value in plaintext**, regardless of whether it's printed in `plan`/`apply` output — state itself becomes a highly sensitive artifact the moment it holds real credentials, and protecting Terraform state to the same standard as the secrets it contains is an easy thing to get wrong (remote state access, state file backups, CI runner access to state). Where practical, prefer secrets that are generated and managed *by* Secrets Manager itself (e.g. via its native rotation support, or a value set once outside Terraform and only *referenced* — not generated — by Terraform), so state holds ARNs and references, not the credential material. `random_password` + Terraform-managed `aws_secretsmanager_secret_version` remains acceptable where Secrets Manager-native generation isn't practical (e.g. the `previo_app` DB password, which must match what a SQL migration sets on the Postgres side) — but state sensitivity is then an explicit, acknowledged property of that choice, not an overlooked side effect.
- **Delivery to running services**: ECS task definitions reference secrets via the `secrets` block (`valueFrom` a Secrets Manager ARN), exactly as `DATABASE_URL` already does — extended to cover every item in the secrets column above, for every environment, not just `DATABASE_URL` in `dev`.
- **Rotation is not treated as automatically solved by "regenerate and re-apply."** For a credential like the `previo_app` DB password, the Postgres-side password, the Secrets Manager value, and the running application's connection all have to change in a coordinated order — updating Secrets Manager before Postgres (or vice versa, done carelessly) breaks the application's DB access until every side catches up. This ADR does **not** claim automated rotation as a consequence unless a real rotation mechanism (e.g. Secrets Manager's native rotation Lambda support, coordinating the Postgres-side `ALTER ROLE` as part of the same rotation function) is actually implemented. Until then, rotation is a deliberate, coordinated manual procedure — documented as such, not glossed over as "just re-apply."

### Delivery to developer workstations — tiered, not uniform

Closing the gap [0005](./0005-env-target-composition.md) deliberately left open, but **not** as a uniform "fetch whatever you need" script:

- **`dev`**: fetchable by any developer via an explicit, auditable script pulling from Secrets Manager for their own IAM identity into `.env.dev.local` — this is the default, expected workflow. A developer working locally should default to `DB_TARGET=dev`-style hybrid work against `dev`, not staging.
- **`staging`**: fetchable only with an explicit, separately-granted IAM permission — not part of every developer's default access. Staging is closer to a pre-release/sign-off environment than a everyday dev target; treat pulling its credentials to a laptop as an exception that requires a specific reason and a specific grant, not a routine action available to everyone who can fetch `dev`.
- **`production`**: never fetched to a developer workstation by this mechanism, full stop — production's Secrets Manager values are consumed only by production's own ECS tasks. This is unchanged from the original decision.
- In all cases, this is a *read* of the same Secrets Manager values the running ECS tasks use, not a separately-issued credential — one source of truth, tiered consumers.
- **Local (`local` target)**: plaintext defaults in `docker-compose.yml`/`.env.local` remain acceptable and are explicitly out of scope for this ADR — not real credentials protecting real data, and Secrets Manager machinery for local Docker Postgres would be complexity with no security benefit.

## Consequences

- Closes the gap [0005](./0005-env-target-composition.md) left open ("that fetch mechanism's exact shape is implementation detail for 0011") — this ADR is that detail, now with tiered access rather than uniform access.
- Extends the pattern `infra/terraform/modules/ecs/main.tf` already uses correctly for `DATABASE_URL` to every other secret, rather than leaving it as the one correctly-handled exception.
- Terraform state that holds any Terraform-generated secret value must itself be treated as sensitive infrastructure (restricted remote-state access, encrypted at rest, access-logged) — this is now an explicit consequence of choosing `random_password` for a given secret, not an overlooked detail.
- Rotation of any Terraform-generated secret (e.g. the `previo_app` password) requires a coordinated procedure across Postgres, Secrets Manager, and the running application, in the correct order — this ADR does not claim it's automated unless a real rotation mechanism is built and documented separately.
- Requires IAM scoping work: developers get `dev` secret access by default; `staging` access is a separate, explicitly-granted permission; `production` access through this mechanism doesn't exist. Exact IAM policy shapes are implementation detail, not fixed further by this ADR.
- No code changes ship from this ADR alone; it fixes the target state that [0007](./0007-application-db-role.md)'s password handling and [0005](./0005-env-target-composition.md)'s per-target credential files are written against, once implemented.
