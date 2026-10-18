# Environments & Env Composition

How configuration is organised, and how a developer picks what each dependency (DB, Redis, API) points at for local work. See [ADR 0003](./adr/0003-per-environment-isolation.md) (isolation principles) and [ADR 0005](./adr/0005-env-target-composition.md) (the composition model) for the rationale; this doc is the practical how-to.

> **Reality check (2026-10-15):** only two environments exist today — **`local`** (your machine, Docker) and **one self-hosted production server** ([deployment.md](./deployment.md)). The `dev` and `staging` targets in the model below were backed by an AWS environment that has been retired ([ADR 0013](./adr/0013-single-server-docker-compose-deployment.md)), so they currently have nothing to connect to. The resolver still supports them, so a future remote environment can be wired in without code changes.

## The model

Each dependency a service needs has its own **target** variable, valued as an environment name:

| Target var | Controls | Values |
|---|---|---|
| `DB_TARGET` | Which Postgres `apps/api` connects to | `local` (`dev` \| `staging` reserved) |
| `REDIS_TARGET` | Which Redis `apps/api` / the worker connect to | `local` (`dev` \| `staging` reserved) |
| `API_TARGET` | Which API `apps/web` calls | `local` (`dev` \| `staging` reserved) |

There is **no `production` value** — no local-dev code path can ever point at production. Production is reached only by deploying to it, never by a developer's local `*_TARGET` variable.

## Where the actual values live

| Context | Source |
|---|---|
| `pnpm dev` (web on your host) and any Node process you start directly | **`.env.local`** (gitignored): the target selections (`DB_TARGET=local`, …), the `local` values themselves (local Docker credentials are not real secrets), and `PORT`, `AUTH_SECRET`, `APP_DB_PASSWORD`. Copy `.env.example` to start |
| `docker compose` (API, worker, migrate on your machine) | A plain **`.env`** file at the repo root, which Compose reads automatically. `AUTH_SECRET` must have the **same value** in `.env` and `.env.local`, or sessions signed by the web app will not verify in the dockerized API |
| Production server | **`.env`** on the server next to `docker-compose.yml` (gitignored), plus GitHub repository secrets for deploys — see [deployment.md](./deployment.md) |

The resolver (`packages/env`) loads `.env.local` first, then, for whichever target each `*_TARGET` var names, reads `<PREFIX>_<TARGET>` (for example `DATABASE_URL_LOCAL`) into the plain variable the rest of the code expects (`DATABASE_URL`). **If a variable is already set** (Docker env injection, CI, the production `.env`), target resolution is skipped for it entirely — this is why the same bootstrap code works unchanged in Docker Compose and on the server without any `*_TARGET` involved there.

## Local dev presets

```bash
pnpm dev:local     # web + api on the host (worker: `pnpm dev:worker`), against the local Docker Postgres/Redis
pnpm dev            # web only on the host; api + worker + db in Docker (the usual setup)
```

`pnpm dev:hybrid`, `pnpm dev:remote` and `pnpm env:fetch <target>` pulled credentials from AWS Secrets Manager for the retired remote environments; they are kept for reference but will not work without that infrastructure.

## Adding another environment

Per [ADR 0005](./adr/0005-env-target-composition.md) this is deliberately cheap:

- **A new remote environment** (for example a second server): `staging` and `dev` are already valid target values. Provide a `.env.<target>.local` with `DATABASE_URL_<TARGET>`, `REDIS_URL_<TARGET>`, `API_URL_<TARGET>` (by hand, or by writing a new fetch script for wherever the secrets live — the AWS one no longer applies).
- **A new service dependency**: add one more `*_TARGET` variable and one more `*_URL_<ENV>` line per environment; no new npm scripts are required.

## Migrating from the old flat `.env`

If you still have a plain `.env` from before this model existed, `packages/env` falls back to loading it (with a deprecation warning) when `.env.local` is missing. Migrate by copying `.env.example` to `.env.local` and filling the same values under their `_LOCAL` suffix. Note that the root `.env` is **still needed** for `docker compose` (it holds `AUTH_SECRET` for the containers) — see the table above.
