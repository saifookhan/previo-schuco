# PREVIO — Schuco Platform

Monorepo for the PREVIO quote/preventivo platform built with Next.js, Hono, PostgreSQL/Redis/BullMQ, and our own email+password auth (JWT session — no external identity provider).

See [docs/technical-overview.md](docs/technical-overview.md) for architecture diagrams and onboarding guide.  
See [docs/project-context.md](docs/project-context.md) for domain model and roadmap.  
See [docs/architecture.md](docs/architecture.md) for monorepo evolution, Changesets, Docusaurus, and service split.  
See [docs/adr/](docs/adr/) for the architecture decision records behind the multi-tenant, multi-environment design (RLS, tenant isolation, env composition, background jobs, audit logging, secrets, testing strategy).

## Stack

- **Frontend:** Next.js 15, shadcn/ui, Tailwind CSS v4, next-intl (IT/EN/DE)
- **API:** Hono (Docker)
- **Auth:** Our own email+password, hashed with bcrypt — no external identity provider. apps/web signs a session JWT (`AUTH_SECRET`, shared with apps/api) on login and forwards it as `Authorization: Bearer` on every server-side API call; apps/api verifies it with the same secret (see `apps/api/src/lib/session-jwt.ts`). Invite-accept and password-reset are one-time tokens emailed via [Resend](https://resend.com) (`RESEND_API_KEY` — unset in local dev, which just logs the link instead of sending). PostgreSQL RBAC + Row-Level Security still does tenant isolation — see [ADR 0006](docs/adr/0006-rls-request-scoped-transaction.md)
- **Database:** PostgreSQL (Docker locally). The app always connects as a restricted, non-superuser role (`previo_app`) — never the migration/owner role — see [ADR 0007](docs/adr/0007-application-db-role.md)
- **Background jobs:** BullMQ on Redis — see [ADR 0009](docs/adr/0009-bullmq-background-jobs.md)
- **Testing:** Vitest — repository/DB/RLS integration tests run against a real Postgres (`previo_test`), never mocked — see [ADR 0012](docs/adr/0012-testing-strategy-and-service-layer.md)

## Quick start (local) — setting this up on a brand-new machine

**Prerequisites:** Node 22 (see `.nvmrc`), [pnpm 9](https://pnpm.io) (`corepack enable` picks up the version pinned in `package.json`'s `packageManager`), and Docker Desktop (or another Docker Engine) running.

```bash
pnpm install
cp .env.example .env.local        # NOT .env — see docs/environments.md and ADR 0005
```

Now open `.env.local` and **generate a real `AUTH_SECRET`** — the file ships with it blank, and that's the #1 cause of "not authenticated" errors on a fresh setup (see Troubleshooting below). It's shared: apps/web signs session JWTs with it, apps/api verifies them with it — the same value must reach both.

```bash
openssl rand -base64 32
```

Paste the output as `AUTH_SECRET=...` in **both** `.env.local` (which `pnpm dev`'s Node processes read) **and** a new `.env` file at the repo root next to `docker-compose.yml` (Compose's own auto-loaded file, a separate mechanism from `.env.local` — see ADR 0005):

```bash
echo "AUTH_SECRET=<the value you just generated>" > .env
```

Everything else in `.env.example` already has working local defaults.

```bash
docker compose up -d              # Postgres + Redis + Mailpit + API + worker (waits for migrate+seed to finish)
pnpm dev                          # Web on :3000 — MUST be `pnpm dev`, not `pnpm build && pnpm start` (see Troubleshooting)
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger UI: http://localhost:3001/docs
- OpenAPI spec: http://localhost:3001/openapi.json
- **Mailpit (local email inbox):** http://localhost:8025 — invite and password-reset emails land here instead of a real inbox (no `RESEND_API_KEY` needed for local dev); apps/api is already pointed at it by default (see `.env.example`)
- Login: go to `/login` and sign in as one of the seeded demo users via the "dev seed login" shortcut (no password needed for these — real accounts go through email+password, invited from the admin panel and set via the `/set-password` link that shows up in Mailpit):

  | Email | Role | Company |
  |---|---|---|
  | `admin@schuco-demo.it` | super-admin | Schuco (platform) |
  | `admin@suppli-demo.it` | company-admin | Suppli S.r.l. (supplier — use this one to test product-family import/quotes) |
  | `admin@technometal-demo.it` | company-admin | Technometal S.p.A. (client) |
  | `manager@technometal-demo.it` | super-user | Technometal S.p.A. |
  | `sales@technometal-demo.it` | user | Technometal S.p.A. |
  | `admin@fabbrikka-demo.it` | company-admin | Fabbrikka (client) |

### Troubleshooting a fresh setup

- **"Not authenticated" errors, especially right after upload/save actions** — almost always one of:
  1. `AUTH_SECRET` is still blank in `.env.local` (see above) — regenerate it and restart `pnpm dev`. Next.js only reads `.env.local` at process startup, so changing it requires a restart, not just a save.
  2. `AUTH_SECRET` is set in `.env.local` but **not** in the root `.env` file (or the two values don't match) — apps/web (host, reading `.env.local`) and the dockerized apps/api (reading `.env`) are then signing/verifying with different secrets, so every real (non-dev-login) session fails verification even though login itself appears to succeed. Dev-login is unaffected (it doesn't use a JWT at all — see below), which is why this one can look confusing: seed-user login keeps working while real email+password login doesn't.
  3. You ran `pnpm build && pnpm start` instead of `pnpm dev`. Production mode marks the session cookie `Secure`, which browsers silently drop over plain `http://localhost` — the login screen appears to work but nothing after it does. Use `pnpm dev` for local work; production builds are for the Docker/self-host paths below, which set `COOKIE_SECURE` explicitly.
  4. `docker compose up -d` hadn't finished yet — the `migrate` container (schema + seed data) must complete before the demo login users exist. Check with `docker compose ps` (everything should show `running`/`healthy`, and `migrate` should show `exited (0)` — that's success, it's a one-shot job) or `docker compose logs migrate`.
- **Import/upload silently fails or times out** — confirm the `api` container is actually up: `curl http://localhost:3001/health` should return `{"status":"ok",...}`. If not, `docker compose logs api`.
- **Nothing loads at all / 500 on every page** — usually a stale Next.js dev server from an earlier run still holding port 3000, or a stale `.next` cache after pulling changes that touched shared files (layout, middleware, i18n messages). Kill whatever's on :3000 and `rm -rf apps/web/.next` before `pnpm dev` again.

### Running the whole app with just `docker compose up -d` (self-hosted / demo server)

For handing the app to someone via SSH on a bare server (no Node/pnpm needed on the host, no Vercel/AWS) — the `web` app is also containerized, opt-in via the `selfhost` [Compose profile](https://docs.docker.com/compose/how-tos/profiles/) so it doesn't interfere with the local-dev flow above.

**On a completely fresh server** (verified against a fresh Ubuntu 26.04 Hetzner box):

```bash
# 1. Docker — apt's own docker.io package lags behind new Ubuntu releases;
#    the official convenience script handles this more reliably:
curl -fsSL https://get.docker.com | sh

# 2. Clone the repo. It's private, so a plain `git clone https://...` needs
#    credentials — the clean way is a repo-scoped, READ-ONLY deploy key:
#    GitHub repo → Settings → Deploy keys → Add deploy key (don't check
#    "Allow write access"). Generate the key pair on the server first:
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy_key -N ""
cat ~/.ssh/github_deploy_key.pub   # paste this into GitHub's "Add deploy key" form
cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy_key
  IdentitiesOnly yes
EOF
git clone git@github.com:<owner>/previo-schuco.git
cd previo-schuco

# 3. Env — same idea as local dev's root .env (see above), but with a
#    server-specific AUTH_SECRET and the server's real address:
cat > .env << EOF
AUTH_SECRET=$(openssl rand -base64 32)
APP_PUBLIC_URL=http://<server-ip>:3000
EOF

# 4. Up
docker compose --profile selfhost up -d --build
```

That's it — the whole app (Postgres, Redis, Mailpit, API, worker, web) comes up, and the browser only ever talks to the `web` container (every `/api/*` route in `apps/web` proxies to the `api` service over Docker's internal network — nothing but port 3000 needs to be reachable from outside).

- App: `http://<server-ip>:3000`
- Login: same seeded demo users as above (dev-login stays enabled in this profile even though it runs in production mode — see `ALLOW_DEV_LOGIN` below)

**Env vars this profile reads** (all have sane defaults for an IP-only demo box; override by exporting them before `docker compose up`, or in a `.env` file next to `docker-compose.yml`):

| Var | Default | When to change it |
|---|---|---|
| `AUTH_SECRET` | *(insecure placeholder — always override this one)* | Always — `openssl rand -base64 32`. Shared by the `web` and `api` services (same var, same value — apps/web signs sessions, apps/api verifies them) |
| `COOKIE_SECURE` | `false` | Set to `true` once this sits behind HTTPS (a reverse proxy with a real cert) — otherwise leave `false`, or logins won't persist over plain HTTP |
| `APP_PUBLIC_URL` | `http://localhost:3000` | Set to `http://<server-ip>:3000` (or your domain) once you're not just hitting it from the same box — also what invite/reset-password email links point at |
| `ALLOW_DEV_LOGIN` | `true` | Set to `false` for a deployment real customers will use — leaves the password-less seed-user shortcut disabled |
| `APP_DB_PASSWORD` | `previo_app` | Change for anything beyond a throwaway demo |
| `RESEND_API_KEY` | *(unset)* | A [Resend](https://resend.com) API key for real outbound email — takes priority over the `mailpit` catcher below whenever it's set. Set this for any deployment real customers will use |
| `RESEND_FROM_EMAIL` | `PREVIO <onboarding@resend.dev>` | Resend's shared test sender works until you verify your own domain with them |
| `SMTP_HOST` | `mailpit` | Without `RESEND_API_KEY`, invite/reset emails go to the bundled `mailpit` container instead — see below for how to read them. Blank `SMTP_HOST` out to fall back to just logging the link (`docker compose logs api`) |
| `MAILPIT_UI_AUTH` | *(unset)* | Set to `user:pass` to protect Mailpit's web UI with HTTP Basic Auth, as an alternative to the SSH tunnel below — only takes effect together with `MAILPIT_BIND=0.0.0.0` |
| `MAILPIT_BIND` | `127.0.0.1` | Set to `0.0.0.0` to publish Mailpit's ports (8025 web UI, 1025 SMTP) off the box — only do this alongside a real `MAILPIT_UI_AUTH`, or anyone can read every invite/reset-password email |
| `DOMAIN` | *(unset)* | Set to enable automatic HTTPS via the bundled `caddy` reverse proxy — see below |

**Reading Mailpit's inbox** — its web UI is bound to `127.0.0.1:8025` on the server by default (not reachable off the box), so pick one:

- **SSH tunnel (default, no config needed):**
  ```bash
  # Foreground (keeps your terminal attached — Ctrl+C to close it):
  ssh -L 8025:localhost:8025 <server>
  # Background (detaches immediately; kill it later with the PID it prints,
  # or `pkill -f 'L 8025:localhost:8025'`):
  ssh -f -N -L 8025:localhost:8025 <server>
  ```
  Then open `http://localhost:8025` locally.
- **Expose it publicly, behind a login:** set both `MAILPIT_UI_AUTH=admin:<a-real-password>` and `MAILPIT_BIND=0.0.0.0` (in your `.env` file or exported before `docker compose up`), then `docker compose --profile selfhost up -d --force-recreate mailpit`. Mailpit then serves `http://<server-ip>:8025` directly, asking for that `user:pass` over HTTP Basic Auth — convenient, but still plain HTTP (no TLS) unless this sits behind a reverse proxy, so don't reuse a password that matters elsewhere.
- **Expose it via Caddy, with HTTPS (best option if you already set up `DOMAIN` above):** set `MAILPIT_DOMAIN=mail.<your-domain>` (e.g. `mail.188-245-28-215.sslip.io`) alongside `MAILPIT_UI_AUTH` — leave `MAILPIT_BIND` at its default `127.0.0.1` (Caddy reaches `mailpit:8025` over the internal Docker network regardless; no need to publish the port to the host at all this way). Then `docker compose --profile selfhost up -d --build`. You get a real cert *and* the `user:pass` login, at `https://mail.<your-domain>`.

**HTTPS (optional but recommended for anything beyond your own testing)** — by default everything above is plain HTTP, which means login cookies and Mailpit's password (if you turned that on) cross the network unencrypted. A bundled `caddy` service gets you real, auto-renewing HTTPS with essentially no config, via [Let's Encrypt](https://letsencrypt.org) — but Let's Encrypt only issues certificates for a **domain name**, never a bare IP, so you need one first:

- **Free, instant, no signup** — [sslip.io](https://sslip.io) maps `<ip-with-dashes>.sslip.io` straight back to that IP automatically. For `188.245.28.215` that's `188-245-28-215.sslip.io` — no DNS setup needed, it just works.
- **Free, a name you choose** — [duckdns.org](https://www.duckdns.org): sign in (GitHub/Google), pick a subdomain like `previo-schuco.duckdns.org`, point it at your server's IP.
- **A real domain** — any registrar (~$10–12/yr for `.com`), pointed at the server via an `A` record. The right choice once this isn't just a demo box anymore.

Once you have one:

```bash
# In your server's .env (alongside AUTH_SECRET etc.):
cat >> .env << EOF
DOMAIN=188-245-28-215.sslip.io
APP_PUBLIC_URL=https://188-245-28-215.sslip.io
COOKIE_SECURE=true
EOF

docker compose --profile selfhost up -d --build
```

Open ports **80** and **443** to the internet first (Let's Encrypt validates over port 80; Caddy then serves everything over 443) — on Hetzner that's a Cloud Firewall inbound rule, same as the one you added for 22/3000/3001/8025. Caddy requests and renews the certificate itself on first start; nothing else to do. The app is then reachable at `https://<your-domain>` — plain `http://<server-ip>:3000` still works directly (Caddy just fronts it), but isn't encrypted, so prefer the HTTPS URL once it's up.

This is a single-server convenience path — see [docs/deployment.md](docs/deployment.md) for other options.

### Running everything locally (no Docker API/worker)

```bash
pnpm dev:local     # web + api + worker, all pointed at local Docker Postgres/Redis
pnpm dev:hybrid    # web + api local, DB/Redis pointed at dev (needs: pnpm env:fetch dev)
pnpm dev:remote    # web only, API/DB/Redis all remote dev
```

Each dependency (DB, Redis, API) resolves independently via `*_TARGET` env vars (`DB_TARGET`, `REDIS_TARGET`, `API_TARGET`) read from `.env.local` plus, for non-local targets, a fetched `.env.<target>.local` (never hand-typed — `pnpm env:fetch dev`, requires `aws sso login`). See [ADR 0005](docs/adr/0005-env-target-composition.md) and [ADR 0011](docs/adr/0011-secrets-config-management.md).

### Tests

```bash
pnpm test          # runs packages/db then apps/api via Turborepo
```

Spins up a real `previo_test` Postgres database (dropped/recreated each run) and runs RLS/tenant-isolation integration tests against it — no mocked repository layer. See [ADR 0012](docs/adr/0012-testing-strategy-and-service-layer.md).

## Project structure

```
apps/
  web/     → Next.js frontend (Vercel)
  api/     → Hono BFF (ECS / Docker); also the BullMQ worker entrypoint (src/worker.ts)
  docs/    → Docusaurus (planned)
packages/
  calculation/  → Quote pricing engine
  db/           → Drizzle schema, migrations, RBAC, RLS policies
  contracts/    → Shared Zod schemas + OpenAPI spec
  env/          → Per-environment env resolution (ADR 0005)
  queue/        → BullMQ job/worker helpers (ADR 0009)
infra/
  terraform/    → AWS infrastructure
docs/
  technical-overview.md
  project-context.md
  deployment.md
  architecture.md
  adr/          → Architecture decision records
```

## Roles

| Role ID | Display name |
|---------|--------------|
| `super-admin` | Super Admin (PREVIO / Schuco) |
| `company-admin` | Company Admin |
| `super-user` | Super User (Sales Manager) |
| `user` | User (Sales Associate) |

A super-admin can act on behalf of another company via the `X-Tenant-Id` request header — see [ADR 0008](docs/adr/0008-super-admin-tenant-override-header.md).

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
