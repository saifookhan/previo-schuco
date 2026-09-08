# Infrastructure & Deployment Status

Tracks what's actually provisioned/live vs. planned, across auth, environments,
AWS infra, and deployment — so this doesn't have to be re-derived from the
codebase every time. Update this file whenever one of these items changes
state; don't let it silently drift like `docs/project-context.md`'s phase
table can.

**Last verified:** 2026-09-06 (against `feat/multi-tenant-env-hardening`, by reading `infra/terraform/**`, `.github/workflows/**`, and `docs/deployment.md` directly — not from memory).

## Authentication & RBAC

| Item | Status | Notes |
|---|---|---|
| Cognito JWT verification | ✅ Done | `apps/api/src/middleware/auth.ts` |
| RBAC (4 canonical roles) | ✅ Done | `super-admin`, `company-admin`, `super-user`, `user` |
| Postgres RLS tenant isolation | ✅ Done | ADR 0006/0007; restricted `previo_app` DB role, not superuser |
| Admin-invite-only onboarding | ✅ Done | ADR 0004; no public signup |
| Super-admin tenant override (`X-Tenant-Id`) | ✅ Done | ADR 0008 |
| Tenant-aware audit logging | ✅ Done | ADR 0010, pulled forward from Phase 5 |
| Fine-grained resource:action permissions | ⏸️ Deferred | Intentionally out of scope until Phase 3 (offer-level permissions); current 4-role model is sufficient for now |

## Environment setup

| Item | Status | Notes |
|---|---|---|
| Per-environment env resolution | ✅ Done | ADR 0005 (`DB_TARGET`/`REDIS_TARGET`/`API_TARGET` composition) |
| Secrets Manager-backed config | ✅ Done | ADR 0011; dev fetchable via `pnpm env:fetch dev`, staging needs separate IAM grant, prod never fetched to a workstation |
| Local dev off `.env` files | ✅ Done | `docs/environments.md` |

## AWS infrastructure (Terraform)

| Environment | Status | Notes |
|---|---|---|
| **dev** | ✅ Provisioned | VPC/network, RDS Postgres, Cognito, ECS Fargate + ALB + ECR, S3 — `infra/terraform/environments/dev/` |
| **stage** | ❌ Not started | `infra/terraform/environments/stage/` is a placeholder README only ("copy dev/ and adjust tfvars when ready") — no `.tf` files exist |
| **prod** | ❌ Not started | Same — `infra/terraform/environments/prod/` is a placeholder README only |

## Live deployment

| Environment | API | Web | Notes |
|---|---|---|---|
| **dev** | ✅ Live | ✅ Live | API on ECS Fargate behind an ALB; web on Vercel (`previo-schuco-web.vercel.app`) |
| **stage** | ❌ None | ❌ None | No infra, no pipeline |
| **prod** | ❌ None | ❌ None | No infra, no pipeline |

## CI/CD

| Pipeline | Status |
|---|---|
| `.github/workflows/ci.yml` | ✅ Exists (build/test) |
| `.github/workflows/terraform-plan.yml` | ✅ Exists (dev only) |
| `.github/workflows/deploy-api-dev.yml` | ✅ Exists (dev only) |
| Stage/prod deploy workflows | ❌ Not started |

## SSL/HTTPS

| Item | Status | Notes |
|---|---|---|
| ALB listener | ⚠️ HTTP only | `infra/terraform/modules/ecs/main.tf` — `aws_lb_listener "http"` on port 80, no HTTPS listener |
| ACM certificate | ❌ Not provisioned | No `aws_acm_certificate` resource anywhere in the codebase |
| Route53 hosted zone / custom domain | ❌ Not provisioned | ALB is reached via its raw AWS DNS name; no custom domain for the API |
| Auto-renewal | N/A yet | Moot until a cert exists — see recommendation below |

**Recommendation:** add ACM + Route53 + an HTTPS listener to the `ecs` module before dev is used for anything beyond internal testing, and definitely before stage/prod exist. See conversation notes / follow-up task for the concrete Terraform shape.

## Not yet started (product side, for context)

Per `docs/project-context.md`'s phased roadmap: Phase 2 (product families, product lines, rate-lists, pricing versioning, price-list UI) has not begun — `apps/api/src/routes/products.ts` and `quotes.ts` are legacy static-demo-data routes predating the DB work, not real Phase 2 implementation.
