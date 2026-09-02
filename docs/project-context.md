# PREVIO — Project Context

Single source of truth for domain model, actors, roles, and phased delivery of the Schuco PREVIO platform.

## Vision

PREVIO is a B2B platform where companies create **invoices** and **quotations** (preventivi) from supplier **rate-lists** built from **product families**, **product lines**, **characteristics**, and versioned **pricing**.

## Tech stack (Phase 1+)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15 on Vercel |
| API | Hono on AWS ECS Fargate (Docker) |
| Auth | AWS Cognito (authentication) |
| Authorization | PostgreSQL RBAC + RLS (authorization) |
| Database | AWS RDS PostgreSQL |
| Documents (future) | AWS S3 |
| IaC | Terraform (dev / stage / prod) |
| Monorepo | pnpm + Turborepo + Changesets (planned) |
| Docs site | Docusaurus `apps/docs` (planned) → Vercel |

## Actors

| Actor | Description |
|-------|-------------|
| **Schuco** | Platform operator (`super-admin`) and also a **supplier** whose product families are available to all clients |
| **Supplier** (e.g. Suppli) | Provides product lines with client-specific pricing via discounts, not duplicate rate-lists for the same product family |
| **Client** (e.g. Fabbrikka, Technometa) | Creates quotations from rate-lists provided by linked suppliers |

### Example relationships

- **Fabbrikka** is a client of Schuco and Suppli → sourcing rate-lists from both.
- **Technometa** is a client of Suppli → same Suppli rate-list as Fabbrikka for a product family, with a **different client discount** (discount is client input, not a separate rate-list).
- If a client needs different pricing for North Italy vs South Italy, they create a **copy with new pricing** and share it — not a different underlying product family.

## Product model (Phase 2+)

```
Product family (versioned)
  └── Product line
        └── Sub-characteristics (color, glazing, etc.)
              └── Linked characteristics + installation hours
```

- **Product families** and **prices** are versioned (characteristics, pricing, images can differ per version).
- Suppliers with different prices for different clients should create a **new product family** when pricing structure differs materially; otherwise apply **client discount** on the same rate-list.

## Organization model

```
Company (shared VAT)
  └── Business unit(s) — unique address, logo, branding
        └── Users (scoped)
```

- A company may have many **branches** and **business units**.
- VAT number is shared across business units of the same company.
- Users can belong to **multiple** business units but have **editing rights** on a subset.

### Technometal example

| Entity | Value |
|--------|-------|
| Company | Technometal |
| Business units | Technometal_A, Technometal_B |
| Company admin | One admin for Technometal — manages platform, sees both BUs, controls product visibility |
| Super user | Sales coordinator for one or both BUs — creates offers, sees team offers |
| User | Sales associate — sees only own offers; may be in one or both BUs |

Example scoping: user belongs to `[Technometal_A, Technometal_B]`, editing rights on `[Technometal_B]` only.

## RBAC — four canonical roles

| Role ID | Display name | Who | Summary |
|---------|--------------|-----|---------|
| `super-admin` | Super Admin | PREVIO / Schuco operators | Cross-tenant; all companies, users, platform settings |
| `company-admin` | Company Admin | One per supplier or client company | Company settings, users, product visibility across assigned BUs |
| `super-user` | Super User (Sales Manager) | Sales coordinator | Create/edit offers; view team offers within scoped BUs |
| `user` | User (Sales Associate) | Standard sales staff | Create/edit own offers only; scoped to assigned BUs |

Every supplier and every client has at least one **company-admin**.

## Supplier ↔ client links

Many-to-many: a supplier can have multiple clients; a client can have multiple suppliers. Rate-lists are provided per supplier–client relationship with optional client-specific discount and installation hours.

## Phased roadmap

| Phase | Focus | Weeks |
|-------|-------|-------|
| **1 — Foundations** | Infra (RDS, Cognito, S3, Docker, CI/CD), Next.js + Vercel, auth/RBAC + RLS | W1–W3 |
| **2 — Core data** | Product lines, profiles, per-tenant overrides, audit, price-list UI | W4–W7 |
| **3 — Quote engine** | Calculator, installation hours, workflow, quote builder UI | W8–W12 |
| **4 — Documents & I/O** | PDF, import/export, print templates | W13–W15 |
| **5 — Platform services** | Reporting, notifications, jobs, Schuco admin portal | W16–W18 |
| **6 — Integration & polish** | E2E integration, responsive UX, permission QA | W19–W20 |
| **7 — Hardening** | Backups, security review, bug fixes | W21–W22 |
| **Code freeze** | End of W22 | |
| **8 — Testing & UAT** | QA, Schuco sign-off | W23–W24 |

## Phase 1 scope (this delivery)

### In scope

- `docs/project-context.md` (this file)
- PostgreSQL schema: companies, business units, users, roles, BU assignments, supplier–client links
- Drizzle migrations + seed data (4 roles, demo companies)
- Docker Compose (Postgres + API) + API Dockerfile
- Cognito JWT verification on API; `GET /api/me`
- Next.js Cognito login, session, `/app/*` route protection
- Terraform dev: VPC, RDS, Cognito, ECS, S3 placeholder
- Vercel monorepo config + deployment docs
- CI skeleton (build, terraform plan, API deploy)

### Out of scope (deferred)

- Product families, rate-lists, pricing versioning
- Quote calculator persistence changes
- S3 upload flows (bucket only)
- Stage/prod Terraform apply
- Cognito Lambda triggers
- Full access-matrix wired to DB
- pgaudit / audit tables
- Offer-level permission enforcement (Phase 3)

## Repository layout

**Current (Phase 1):**

```
apps/
  web/          Next.js frontend → Vercel
  api/          Hono BFF → ECS / Docker
packages/
  calculation/  Quote pricing engine (library)
  db/           Drizzle schema, migrations, RBAC
infra/
  terraform/    AWS infrastructure
docs/
  project-context.md
  deployment.md
  architecture.md   ← monorepo, services, Changesets, Docusaurus (future)
```

**Target (Phase 2–5):** see [architecture.md](./architecture.md) — `apps/docs`, `packages/contracts`, optional `calculation-service` and `files-service` on ECS.

**Diagrams:** see [technical-overview.md](./technical-overview.md) for system architecture, domain model, auth flow, and RBAC.
