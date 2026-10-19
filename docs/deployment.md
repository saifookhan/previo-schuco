# Deployment Guide

How PREVIO runs in production and how code gets there. Production is **one self-hosted server** (a Hetzner Cloud VM) running Docker Compose — there is no AWS, Terraform or Vercel in the live path (see [ADR 0013](adr/0013-single-server-docker-compose-deployment.md); the old AWS Terraform code still sits in `infra/terraform/` but is unused).

## What runs where

One server, one `docker compose --profile selfhost` stack:

| Service | Image / build | Role |
|---|---|---|
| `caddy` | `caddy:2-alpine` | Public entry point: ports 80/443, automatic Let's Encrypt HTTPS, reverse-proxies to `web` (and optionally Mailpit and `docs`) |
| `docs` | `apps/docs/Dockerfile` | Static testing docs (Docusaurus), reached only through `caddy` on `DOCS_DOMAIN` |
| `web` | `apps/web/Dockerfile` | Next.js. The browser only ever talks to this service; its `/api/*` routes proxy to `api` over Docker's internal network |
| `api` | `apps/api/Dockerfile` | Hono API (auth, RBAC/permissions, quotes, catalog) |
| `worker` | same image as `api` | BullMQ worker (background jobs) |
| `migrate` | `apps/api/Dockerfile` (target `migrate`) | One-shot job on every `up`: Drizzle migrations → RLS policies/grants → app-role password → idempotent seed. Exits `0` when done |
| `postgres` | `postgres:16-alpine` | Database (volume `previo_pg_data`) |
| `redis` | `redis:7-alpine` | Job queue (AOF on, `noeviction`; volume `previo_redis_data`) |
| `mailpit` | `axllent/mailpit` | SMTP catcher used when no `RESEND_API_KEY` is set |

Uploaded files live on the server's disk in `./data/uploads` (mounted into `api` as `LOCAL_STORAGE_DIR`). There is no S3.

## Continuous deployment

Two GitHub Actions workflows:

1. **`ci.yml`** — on every pull request and push to `main`: install, `pnpm build`, `pnpm test` (against a real Postgres service container, so RLS tests hit real policies), and Docker builds of the API and web images (catches a broken self-host build before it deploys).
2. **`deploy.yml`** — runs after CI **succeeds on `main`**. It SSHes into the server as `root` and runs:

   ```bash
   cd /root/previo-schuco
   git fetch origin main
   git reset --hard origin/main
   docker compose --profile selfhost up -d --build
   docker image prune -f
   ```

   Repository secrets required: `HETZNER_HOST` (server address) and `HETZNER_SSH_KEY` (private key for `root`).

Consequences worth knowing:

- Every push to `main` that passes CI deploys. There is no manual approval step and no staging server.
- `git reset --hard` discards any edits made by hand to tracked files on the server. Untracked files (the server's `.env`, `data/uploads`) are untouched.
- Always use `--build`. Plain `docker compose up -d` happily reuses stale cached images and will keep serving old code (and skip new migrations) — this has bitten us after Docker restarts.

## First-time server setup

Full step-by-step (Docker install, read-only deploy key, `.env`, first `up`, HTTPS with `sslip.io`/DuckDNS/a real domain, Mailpit access) is in the **[README's self-host section](../README.md#running-the-whole-app-with-just-docker-compose-up--d-self-hosted--demo-server)**. In short:

1. Install Docker Engine; open ports **22, 80, 443** in the cloud firewall.
2. Clone the repo to `/root/previo-schuco` (the path `deploy.yml` expects) using a read-only deploy key.
3. Create `.env` next to `docker-compose.yml` (see below), then `docker compose --profile selfhost up -d --build`.
4. Add the `HETZNER_HOST` / `HETZNER_SSH_KEY` secrets in GitHub so pushes deploy automatically.

### Production `.env`

| Variable | Set it to |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32`. **Required** — shared by `web` (signs sessions) and `api` (verifies them). The compose default is an insecure placeholder |
| `APP_PUBLIC_URL` | The public URL, e.g. `https://<domain>` — also what invite / password-reset email links point to |
| `DOMAIN` | Domain pointing at the server; enables Caddy's automatic HTTPS |
| `COOKIE_SECURE` | `true` once served over HTTPS |
| `ALLOW_DEV_LOGIN` | `false` for anything real customers use (it enables the password-less demo-user shortcut) |
| `APP_DB_PASSWORD` | A real password for the restricted `previo_app` database role (the app never connects as the owner — [ADR 0007](adr/0007-application-db-role.md)) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Real outbound email. Without a key, mail goes to Mailpit (not delivered) |
| `MAILPIT_UI_AUTH`, `MAILPIT_BIND`, `MAILPIT_DOMAIN` | Only if you expose Mailpit's UI — see the README |
| `GIT_COMMIT` | Set by `deploy.yml`; shown in the docs footer. Not needed in `.env` |
| `DOCS_DOMAIN` | Serves the testing docs (`apps/docs`, `docs` service) at `https://<DOCS_DOMAIN>`, publicly readable. App and Mailpit links inside the docs come from `DOMAIN` / `MAILPIT_DOMAIN` at build time |

`.env` is gitignored and lives only on the server. GitHub only holds the two deploy secrets above.

## Database migrations

Migrations run automatically: the `migrate` service executes on every `docker compose up`. It applies the Drizzle migrations in `packages/db/migrations/`, then re-applies `0001_rls.sql` (idempotent RLS policies, helper functions, grants), sets the `previo_app` password from `APP_DB_PASSWORD`, and runs the idempotent seed (4 roles, the demo companies and demo users if absent).

- Migrations are **forward-only**. Rolling the code back does not undo a migration.
- Migrations that drop or rewrite data (for example `0013` replaced the company `type` column, `0016` replaced company links with per-family shares) deserve a **backup first** — see below.
- When adding a migration with `pnpm --filter @schuco/db db:generate`, check that the generated file number does not collide with an existing one and that the snapshot chain (`migrations/meta/`) stays intact.

## Backups and restore

> **Automated backups are not set up yet.** Until they are, back up by hand before risky changes, and treat this as the top operational gap.

What needs backing up:

| What | Where |
|---|---|
| Database | `postgres` volume `previo_pg_data` |
| Uploaded files | `/root/previo-schuco/data/uploads` |
| `.env` | server only — keep a copy in a password manager (losing `AUTH_SECRET` just logs everyone out; losing `APP_DB_PASSWORD` is recoverable but annoying) |

Manual database backup / restore (run on the server, in the repo directory):

```bash
# backup (custom format, compressed)
docker compose exec -T postgres pg_dump -U previo -Fc previo > previo-$(date +%F).dump

# restore into the running database (stop api/worker/web first to avoid writes)
docker compose exec -T postgres pg_restore -U previo -d previo --clean --if-exists < previo-YYYY-MM-DD.dump
```

Copy the dump off the server (`scp`) — a backup on the same disk does not survive losing the server.

## Operating the server

```bash
docker compose --profile selfhost ps              # status (migrate should show "exited (0)")
docker compose --profile selfhost logs -f api     # follow API logs (also: web, worker, caddy, migrate)
docker compose --profile selfhost up -d --build   # redeploy by hand
```

### Reading the logs

The API and worker log one JSON object per line (pino; `level` 30 = info, 40 = warn, 50 = error). Every
request line has `requestId`, `method`, `path`, `status`, `durationMs`, `userId` and `companyId`. Docker keeps
the last 5 × 10 MB per container (`x-logging` in `docker-compose.yml`).

```bash
docker compose --profile selfhost logs --no-log-prefix api | jq -c 'select(.level >= 50)'           # errors only
docker compose --profile selfhost logs --no-log-prefix api | jq -c 'select(.requestId == "<id>")'   # one request
docker compose --profile selfhost logs --no-log-prefix api | jq -c 'select(.status >= 500)'         # failed requests
```

A 500 response body contains the `requestId`; the same id is on that request's audit entries, so
*Admin → Audit log → Request ID* shows what the request changed. `LOG_LEVEL` (default `info`) and
`LOG_FORMAT` (`json` / `pretty`; default: pretty only in a terminal) tune the output.

Roll back code: `git reset --hard <good-sha>` then `docker compose --profile selfhost up -d --build` (remember migrations stay applied). A later push to `main` will deploy forward again.

## Local development

```bash
pnpm install
cp .env.example .env.local        # NOT .env — see docs/environments.md, ADR 0005
echo "AUTH_SECRET=<same value as in .env.local>" > .env     # Compose reads .env, pnpm dev reads .env.local
docker compose up -d              # Postgres, Redis, Mailpit, migrate, API, worker
pnpm dev                          # web only, on :3000
```

- Web `:3000`, API `:3001`, Swagger UI `:3001/docs`, Mailpit `:8025`.
- Postgres is on host port `5434` and Redis on `6380` (to avoid clashing with local installs).
- `pnpm dev` starts **web only**; the API and worker run in Docker. Do not also run the API on the host (port conflict).
- Preset: `pnpm dev:local` runs web + api on the host against the Docker Postgres/Redis (the worker separately via `pnpm dev:worker`; stop the Docker `api` first to free port 3001). The `dev:hybrid` / `dev:remote` presets and `pnpm env:fetch` belonged to the retired AWS dev environment and no longer have anything to connect to — see [environments.md](./environments.md).

Tests: `pnpm test` runs the `packages/db` and `apps/api` Vitest suites against a real `previo_test` database that is dropped and recreated each run ([ADR 0012](adr/0012-testing-strategy-and-service-layer.md)).

### Demo users

Seeded by `pnpm db:migrate` (and by the `migrate` service). Defined in [`packages/db/src/demo-users.ts`](../packages/db/src/demo-users.ts); on the login page the "dev seed login" shortcut signs in as any of them without a password.

| Email | Role | Company (capabilities) |
|---|---|---|
| admin@schuco-demo.it | super-admin | Schüco / PREVIO Platform (platform) |
| elena.costa@schuco-demo.it | company-admin (inactive) | Schüco / PREVIO Platform |
| admin@suppli-demo.it | company-admin | Suppli S.r.l. (manufacturer + supplier) |
| admin@technometal-demo.it | company-admin | Technometal S.p.A. (client) |
| manager@technometal-demo.it | super-user | Technometal S.p.A. |
| sales@technometal-demo.it | user | Technometal S.p.A. |
| admin@fabbrikka-demo.it | company-admin | Fabbrikka S.r.l. (client) |

The seed does **not** share any product family: a client sees a family only after its owner shares it (see [project-context.md](./project-context.md)).

Real users are invited from the admin panel and set a password through the emailed one-time link (`/set-password`); there is no external identity provider.

## Production checklist

- [ ] `AUTH_SECRET` is a generated secret (not the placeholder)
- [ ] `ALLOW_DEV_LOGIN=false`
- [ ] `APP_DB_PASSWORD` changed from `previo_app`
- [ ] `DOMAIN` set, `COOKIE_SECURE=true`, ports 80/443 open
- [ ] `RESEND_API_KEY` set (or Mailpit deliberately exposed behind a login)
- [ ] A recent off-server database + uploads backup exists
