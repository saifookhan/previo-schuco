# Deployment Guide

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity`)
- Terraform >= 1.6
- Docker
- pnpm 9
- Vercel account

## 1. Bootstrap Terraform state (once)

```bash
chmod +x infra/terraform/bootstrap/bootstrap.sh
./infra/terraform/bootstrap/bootstrap.sh
```

## 2. Provision AWS dev environment

**SSO users:** refresh credentials before apply (`aws sso login`), then:

```bash
chmod +x infra/terraform/scripts/apply-dev.sh
./infra/terraform/scripts/apply-dev.sh -auto-approve
```

Or manually:

```bash
eval "$(aws configure export-credentials --format env)"
cd infra/terraform/environments/dev
terraform init
terraform apply
```

If a previous apply failed with `ExpiredToken`, recover with:

```bash
./infra/terraform/scripts/apply-dev.sh -auto-approve
```

The bootstrap script and remote state bucket are already created in account `795346865194` (eu-central-1).

Capture outputs:

```bash
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_domain
terraform output api_url
terraform output ecr_repository_url
```

## 3. Build and push API image to ECR

```bash
ECR_URL=$(terraform -chdir=infra/terraform/environments/dev output -raw ecr_repository_url)
AWS_REGION=eu-central-1
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin ${ECR_URL%/*}

docker build -f apps/api/Dockerfile -t previo-api .
docker tag previo-api:latest $ECR_URL:latest
docker push $ECR_URL:latest

aws ecs update-service \
  --cluster $(terraform -chdir=infra/terraform/environments/dev output -raw ecs_cluster_name) \
  --service $(terraform -chdir=infra/terraform/environments/dev output -raw ecs_service_name) \
  --force-new-deployment \
  --region $AWS_REGION
```

Run database migrations against RDS (from a machine with VPC access or a one-off ECS task):

```bash
DATABASE_URL="<from Secrets Manager previo/dev/database url field>"
cd packages/db && pnpm db:migrate
```

## 4. Vercel project — `previo-schuco-web`

Project: [previo-schuco-web](https://vercel.com/einsteinsaifoos-projects/previo-schuco-web)  
Production URL: **https://previo-schuco-web.vercel.app**

1. Root Directory: **apps/web** (monorepo)
2. Framework: Next.js (uses [`apps/web/vercel.json`](../apps/web/vercel.json))

**Vercel does not connect to Postgres directly.** The web app calls the ECS API (`NEXT_PUBLIC_API_URL`); the API uses RDS via `DATABASE_URL` from Secrets Manager.

After Terraform dev is applied:

```bash
aws sso login
./infra/terraform/scripts/configure-vercel-dev.sh
cd apps/web && vercel --prod
```

### Environment variables (dev)

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Terraform `api_url` output (ECS ALB) |
| `NEXT_PUBLIC_APP_URL` | `https://previo-schuco-web.vercel.app` |
| `NEXT_PUBLIC_COGNITO_REGION` | `eu-central-1` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Terraform output |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | Terraform output |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | Terraform output (domain prefix only) |
| `AUTH_SECRET` | `openssl rand -base64 32` |

Update Cognito callback/logout URLs and API CORS via Terraform (`variables.tf` includes the Vercel URL), then `./infra/terraform/scripts/apply-dev.sh -auto-approve`.

**Cognito `redirect_mismatch` on Vercel:** the app client still has the old callback URL. Fix without a full apply:

```bash
aws login   # or aws sso login
./infra/terraform/scripts/update-cognito-vercel-urls.sh
```

**Login still fails after Cognito fix:** set `NEXT_PUBLIC_API_URL` (missing today — web defaults to `localhost:3001`):

```bash
./infra/terraform/scripts/configure-vercel-dev.sh
cd apps/web && vercel --prod
```

Optional: enable seed-user login on Vercel while Cognito users are being set up:

```bash
vercel env add NEXT_PUBLIC_ALLOW_DEV_LOGIN production,preview,development \
  --value true --no-sensitive --yes --force -S einsteinsaifoos-projects
vercel env add ALLOW_DEV_LOGIN production,preview \
  --value true --yes --force -S einsteinsaifoos-projects
```

## 5. Local development

```bash
cp .env.example .env
docker compose up -d postgres migrate api
pnpm dev
```

`pnpm dev` starts **web only** (`:3000`). The API runs in Docker on `:3001` — do not run `turbo dev` with the API locally unless you stop the Docker API first (port conflict).

Open http://localhost:3000/login — use dev seed emails (see `.env.example` / login form).

**API documentation:** http://localhost:3001/docs (Swagger UI). The OpenAPI spec covers the core BFF plus planned calculation and files services.

Seed users:

| Email | Role | Company |
|-------|------|---------|
| admin@schuco-demo.it | super-admin | Schuco |
| elena.costa@schuco-demo.it | company-admin (inactive) | Schuco |
| admin@suppli-demo.it | company-admin | Suppli |
| admin@technometal-demo.it | company-admin | Technometal |
| manager@technometal-demo.it | super-user | Technometal |
| sales@technometal-demo.it | user | Technometal |
| admin@fabbrikka-demo.it | company-admin | Fabbrikka |

All defined in [`packages/db/src/demo-users.ts`](../packages/db/src/demo-users.ts) and seeded via `pnpm db:migrate`.

## 6. Cognito user provisioning

1. Create user in Cognito User Pool (AWS Console or CLI)
2. Ensure matching email exists in RDS seed or create user row with correct `company_id` and `role_id`
3. On first login, API links Cognito `sub` to RDS user by email

## Stage / Prod

Copy `infra/terraform/environments/dev/` to `stage/` and `prod/`, adjust backend key and tfvars. See placeholder READMEs in those folders.

## Monorepo & docs (future)

See [architecture.md](./architecture.md) for:

- Separate ECS services (calculation, files) — when and how to split
- **Changesets** — package versioning and changelogs
- **Docusaurus** (`apps/docs`) — product and API documentation on Vercel
