# @schuco/api

Hono BFF (Backend-for-Frontend) for the PREVIO platform. Auth gateway, RBAC enforcement, and REST API.

## Purpose

Single entry point for the web app. Validates Cognito JWTs, resolves tenant context from PostgreSQL, orchestrates quote calculation, and serves OpenAPI docs.

Deployed to **AWS ECS Fargate** in dev/prod; runs in **Docker** locally via `docker compose`.

## Routes

| Path | Description |
|------|-------------|
| `GET /health` | Health check |
| `GET /api/me` | Authenticated user profile + RBAC context |
| `GET /api/users` | User list (scoped by role) |
| `GET /api/admin/users` | Cross-tenant user list (super-admin) |
| `GET /api/products` | Product catalog |
| `GET/POST /api/quotes` | Quote CRUD |
| `POST /api/calculate` | Quote pricing (delegates to `@schuco/calculation`) |
| `GET /docs` | Swagger UI |
| `GET /openapi.json` | OpenAPI spec from `@schuco/contracts` |

## Dependencies

| Package | Role |
|---------|------|
| `@schuco/db` | PostgreSQL queries, RLS context |
| `@schuco/contracts` | Request/response validation, OpenAPI |
| `@schuco/calculation` | Quote pricing engine |

## Auth

- **Production:** `Authorization: Bearer <Cognito JWT>`
- **Local dev:** `X-Dev-User-Sub: <cognito-sub>` when Cognito is not configured

## Scripts

```bash
pnpm --filter @schuco/api dev      # Watch mode on :3001
pnpm --filter @schuco/api build
pnpm --filter @schuco/api start    # Run compiled dist/
```

## Environment

See root `.env.example`. Key vars: `DATABASE_URL`, `COGNITO_*`, `CORS_ORIGINS`, `PORT`.
