# PREVIO — Project Context

Single source of truth for domain model, actors, roles, and phased delivery of the Schuco PREVIO platform.

## Vision

PREVIO is a B2B platform where companies create **invoices** and **quotations** (preventivi) from supplier **rate-lists** built from **product families**, **product lines**, **characteristics**, and versioned **pricing**.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15, next-intl (IT/EN/DE), Tailwind, shadcn-style components |
| API | Hono (Docker), BullMQ worker |
| Authentication | Own email + password (bcrypt) with a signed session JWT |
| Authorization | Editable role × permission matrix, filtered by company capabilities; PostgreSQL Row-Level Security for tenancy |
| Database | PostgreSQL 16 (Docker), Redis for jobs |
| Files / email | Local disk volume; Resend or SMTP |
| Hosting | One Hetzner server, Docker Compose, Caddy (HTTPS) |
| Delivery | GitHub Actions CI → SSH deploy ([deployment.md](./deployment.md), [ADR 0013](./adr/0013-single-server-docker-compose-deployment.md)) |
| Monorepo | pnpm + Turborepo + Changesets (planned) |
| Handbook | Public testing handbook at `/help` in `apps/web` |

## Actors

A company's abilities are independent **capabilities** — one company can hold several:

| Capability | Meaning |
|------------|---------|
| **platform** | The PREVIO / Schuco operator |
| **manufacturer** | Builds and owns a catalog of product families, and can share published families with other companies |
| **supplier** | Creates quotes from its own families or from families shared with it, and may share a received family onward |
| **client** | Browses the families shared with it |

| Actor | Description |
|-------|-------------|
| **Schuco** | Platform operator (`super-admin` users) |
| **Suppli** | Both a manufacturer and a supplier in the demo data |
| **Fabbrikka, Technometal** | Clients in the demo data |

### Example relationships

- Suppli shares a published product family with Technometal at a **15% default discount**; Technometal sees it under "Shared with me", and its quote positions from that family start at 15% (editable).
- Another company can receive the same family with a different discount — the discount belongs to the share, not to a separate copy of the family.
- A supplier that received a family can share it onward with its own clients and its own discount.
- If pricing differs materially, the manufacturer creates a **new family version** and shares that.

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

## Family sharing

Visibility of a product family is decided by **shares** (`product_family_shares`): one row says "company A shares family F with company B at discount d". A company sees a family if it owns it, or if the family is **published** and reachable from the owner through a chain of shares. Unpublishing, or removing a share upstream, cuts off everything downstream automatically. Shares replaced the earlier company-level supplier–client links.

Only the owner, or a company that was itself shared the family, may share it (permission `catalog.share`); the share dialog lives on the family page and list.

## Roles and permissions

Four built-in roles (above) plus **custom roles** a super-admin can create. The **Access Rights** matrix (super-admin, global) decides which permissions each role grants:
`catalog.view`, `catalog.edit`, `catalog.share`, `quote.view`, `quote.edit`, `users.manage`.
A user's effective permissions are the union of their roles' permissions, limited to what their company's capabilities unlock (for example only a manufacturer can edit a catalog; only a supplier can create quotes). Super-admin is cross-tenant and always holds everything. A company-admin can only hand out roles whose permissions they themselves hold.

## Phased roadmap

| Phase | Focus | Weeks |
|-------|-------|-------|
| **1 — Foundations** | Hosting, Docker, CI/CD, Next.js, auth/RBAC + RLS (originally planned on AWS + Vercel — see [ADR 0013](adr/0013-single-server-docker-compose-deployment.md)) | W1–W3 |
| **2 — Core data** | Product lines, profiles, per-tenant overrides, audit, price-list UI | W4–W7 |
| **3 — Quote engine** | Calculator, installation hours, workflow, quote builder UI | W8–W12 |
| **4 — Documents & I/O** | PDF, import/export, print templates | W13–W15 |
| **5 — Platform services** | Reporting, notifications, jobs, Schuco admin portal | W16–W18 |
| **6 — Integration & polish** | E2E integration, responsive UX, permission QA | W19–W20 |
| **7 — Hardening** | Backups, security review, bug fixes | W21–W22 |
| **Code freeze** | End of W22 | |
| **8 — Testing & UAT** | QA, Schuco sign-off | W23–W24 |

## Delivery status

The roadmap above is the original plan; the platform has moved well past Phase 1. Built so far: product families (Excel import, versioning, pricing editor, publish), per-family sharing, the quote builder (auto/manual pricing, edit, custom position codes, PDF), company capabilities, custom roles and the permission matrix, invite-only user management with approval, tenant-aware audit logging ([ADR 0010](adr/0010-tenant-aware-audit-logging.md)), and the admin panel.

Quotes are a matrix of versions and alternatives ([ADR 0016](adr/0016-quote-variants.md)): a new alternative copies only the open cell (`V1A2` → `V1A3`), and a new version copies only that cell forward (`V1A2` → `V2A2`). Statuses are draft, invoiced and accepted. One variant per quote can be marked final and is what the dashboard uses. Any number of quote variants, and any product-family version, can also be marked as a favorite for that company ([ADR 0017](adr/0017-favorites.md)). Company admins can archive a quote or one product-family version. A variant can be duplicated into a new quote as `V1A1`.

Still open: editing characteristic ↔ line relations without Excel, Word/Excel export and emailing a quote, the dashboard's active-user count, and automated backups and monitoring ([infra-status.md](./infra-status.md)).

## Repository layout

```
apps/
  web/          Next.js frontend (+ server-side proxy to the API)
  api/          Hono API + BullMQ worker entrypoint
packages/
  calculation/  Quote pricing engine (library)
  contracts/    Zod schemas, permission map, OpenAPI spec
  db/           Drizzle schema, migrations, RLS, seed
  env/          Env resolution for local dev
  queue/        BullMQ helpers
docs/           This documentation (project-context, architecture, deployment, infra-status, ADRs)
docker-compose.yml, Caddyfile   The deployable stack
infra/terraform/                Legacy, unused (retired AWS setup)
```

**Possible future services:** see [architecture.md](./architecture.md) — optional `calculation-service` and `files-service`.

**Diagrams:** see [technical-overview.md](./technical-overview.md) for system architecture, domain model, auth flow, and RBAC.
