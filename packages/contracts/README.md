# @schuco/contracts

Shared API contracts for the PREVIO monorepo — Zod schemas, inferred TypeScript types, and the OpenAPI document.

## Purpose

Single source of truth so the web app, API, and future microservices agree on request/response shapes. Prevents type drift between frontend and backend.

## Modules

| Path | Contents |
|------|----------|
| `schemas/common.ts` | Role IDs, error payloads, health check |
| `schemas/auth.ts` | User profile, business-unit scope, `GET /api/me` |
| `schemas/users.ts` | User list and admin user DTOs |
| `schemas/quote.ts` | Quote configuration, calculation results, create-quote |
| `schemas/files.ts` | Upload/download schemas (Phase 4) |
| `openapi/spec.ts` | `buildOpenApiDocument()` for Swagger UI |

## Usage

```typescript
// Types and validators
import { meResponseSchema, type MeResponse } from '@schuco/contracts'

// OpenAPI builder (API only)
import { buildOpenApiDocument } from '@schuco/contracts'
```

Each schema exports a **Zod validator** (runtime) and a **TypeScript type** via `z.infer<>`.

## Consumers

- **`apps/api`** — validates requests/responses; serves `/docs` and `/openapi.json`
- **`apps/web`** — imports types for admin pages and API client code

## Scripts

```bash
pnpm --filter @schuco/contracts build
```
