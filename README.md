# PREVIO — Schuco Platform

Monorepo for the PREVIO quote/preventivo platform built with Next.js, Hono, AWS (Cognito, RDS, ECS), and Vercel.

See [docs/project-context.md](docs/project-context.md) for domain model and roadmap.  
See [docs/architecture.md](docs/architecture.md) for monorepo evolution, Changesets, Docusaurus, and service split.

## Stack

- **Frontend:** Next.js 15 on Vercel, shadcn/ui, Tailwind CSS v4, next-intl (IT/EN/DE)
- **API:** Hono on AWS ECS Fargate (Docker)
- **Auth:** AWS Cognito + PostgreSQL RBAC (4 roles)
- **Database:** PostgreSQL (RDS prod, Docker locally)
- **IaC:** Terraform (dev; stage/prod structured for later)

## Quick start (local)

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Login: dev seed users on `/login` when Cognito is not configured

## Project structure

```
apps/
  web/     → Next.js frontend (Vercel)
  api/     → Hono BFF (ECS / Docker)
  docs/    → Docusaurus (planned)
packages/
  calculation/  → Quote pricing engine
  db/           → Drizzle schema, migrations, RBAC
  contracts/    → Shared API schemas (planned)
infra/
  terraform/    → AWS infrastructure
docs/
  project-context.md
  deployment.md
  architecture.md
```

## Roles

| Role ID | Display name |
|---------|--------------|
| `super-admin` | Super Admin (PREVIO / Schuco) |
| `company-admin` | Company Admin |
| `super-user` | Super User (Sales Manager) |
| `user` | User (Sales Associate) |

## Deployment

See [docs/deployment.md](docs/deployment.md) for Terraform bootstrap, ECR/ECS deploy, and Vercel setup.

## Demo routes

| Route | Description |
|-------|-------------|
| `/` | Public home page |
| `/login` | Cognito or dev login |
| `/app/dashboard` | Stats overview (auth required) |
| `/app/invoice` | PREVIO preventivo editor |
| `/app/settings/*` | Role-gated settings screens |
