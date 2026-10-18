# 0003 — Isolated application/data/security boundaries per environment

## Status

Accepted — AWS-specific parts (RDS, Cognito pool, ECS, S3 per environment) were retired by [0013](./0013-single-server-docker-compose-deployment.md); only `local` and one production server exist today.

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

Today only `dev` exists as a real Terraform-provisioned environment (`infra/terraform/environments/dev/`); `stage/` and `prod/` are placeholder READMEs. As the product matures we need `local`, `dev`, `staging`, and `production` to all be usable, and to decide how much infrastructure each one gets of its own.

Two options:
- **Full isolation**: each environment gets its own RDS instance, its own Cognito User Pool, its own ECS cluster/task — matching the existing `dev` Terraform module pattern, copied outward to `stage/` and `prod/`.
- **Shared infra for staging**: only production gets fully isolated infra; staging deploys point at dev's RDS/Cognito (perhaps a separate database/schema name) to save cost and setup time.

Shared infra is cheaper and faster to stand up, but staging test data pollutes dev (and vice versa), a bad staging migration can break dev, and a staging Cognito test user is indistinguishable from a dev one — none of which is acceptable once staging is used for pre-release sign-off rather than ad hoc testing.

## Decision

**Every environment — local, dev, staging, production — gets an isolated application boundary, an isolated data boundary, and an isolated security boundary.** Concretely, this means each environment always gets its own:

- **Data boundary**: independent RDS instance (never a shared instance with a different database/schema name standing in for isolation) and independent S3 bucket.
- **Security boundary**: independent Cognito User Pool (so a staging test identity can never authenticate against dev or prod), independent IAM roles/security groups.
- **Application boundary**: independent ECS cluster and task definition/deployment, so a bad deploy or a load test in one environment cannot affect another's running containers.

What this ADR deliberately does **not** mandate is identical resource topology for every environment — e.g. whether staging gets its own ALB or shares one with dev (with strict per-environment listener/target-group routing) is a cost/complexity trade-off, decided at implementation time against the actual deployment architecture, not a rule this ADR fixes. The isolation that matters is *application, data, and security* isolation; a shared edge-routing component is acceptable only if it cannot become a path for one environment's traffic or credentials to reach another's containers or database.

Provisioning follows the existing `infra/terraform/environments/dev/` module pattern (`infra/terraform/modules/{network,cognito,rds,ecs,s3}`), copied into `stage/` and `prod/` with per-environment Terraform variables for sizing/backup/deletion-protection differences.

## Consequences

- Clean blast-radius isolation for the boundaries that matter — a bad migration, a load test, or a bulk data operation in one environment's database or containers cannot touch another's.
- Non-overlapping VPC CIDRs are required across environments in case of future peering (dev `10.20.0.0/16`, staging `10.21.0.0/16`, prod `10.22.0.0/16`).
- Cognito domain prefixes must be globally unique across AWS (`previo-schuco-dev`, `previo-schuco-stage`, `previo-schuco-prod`).
- Cost/complexity trade-offs (e.g. ALB sharing, smaller staging instance classes) are implementation decisions, revisited independently of this ADR as the deployment architecture matures — they don't require amending or superseding this decision as long as the data/security/application boundaries above stay intact.
- Each environment's per-target credential file (see [0005](./0005-env-target-composition.md)) needs its own set of Terraform output values populated once that environment is provisioned.
