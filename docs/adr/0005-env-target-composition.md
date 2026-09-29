# 0005 — Per-dependency `*_TARGET` vars, per-target credential files

## Status

Accepted

**Author:** Syed Arif Iqbal (arifiqbal@outlook.com)
**Date:** 2026-09-04

## Context

Local development needs to run against different combinations of services: everything local (Docker Postgres/Redis + local API), or a local API pointed at dev's real DB (to avoid reseeding realistic data), or just the web app pointed entirely at an already-deployed dev API. Today there's a single flat `.env` with no way to express "which environment does this dependency point at" per service.

Two questions had to be answered, not one:

1. **How is the target expressed?** A fixed set of named presets (`dev:local`, `dev:hybrid`, `dev:remote`, each its own `.env.<preset>`) doesn't scale — adding `staging` as a reachable DB target, or a future service (a queue broker, per [0009](./0009-bullmq-background-jobs.md)), means either a combinatorial explosion of preset scripts or presets that don't cover the combination someone actually needs that day. **Decision: per-dependency target variables** (`DB_TARGET`, `REDIS_TARGET`, `API_TARGET`, valued as an environment name — `local | dev | staging`), unchanged from the original design.

2. **Where do the actual credentials for each target live on a developer's machine?** The original design put every environment's connection string side by side in one `.env.local` (`DATABASE_URL_LOCAL`, `DATABASE_URL_DEV`, `DATABASE_URL_STAGING`, ...). **This was reconsidered and rejected** — it means every developer's laptop that has ever touched staging carries dev *and* staging credentials simultaneously in one file, regardless of which one they're actually using that day. A leaked or synced `.env.local` leaks every environment's access at once, not just the one in use. There's also no natural place to *not* have a credential — a developer who's never been given staging access still ends up with an (empty, but present) `DATABASE_URL_STAGING=` line inviting someone to fill it in "for convenience."

## Decision

Keep the per-dependency `*_TARGET` variables (`DB_TARGET`, `REDIS_TARGET`, `API_TARGET`, `COGNITO_TARGET`) exactly as before — that part of the design was sound. Change where their values are read from:

- **`.env.local`** holds only the target selections (`DB_TARGET=local`, etc.) and genuinely local-only, non-secret values (e.g. `PORT`). No credentials for any remote environment live here.
- **One credential file per target, fetched only when needed**: `.env.dev.local`, `.env.staging.local` (never `.env.prod.local` on a developer laptop — see below), each holding *only* that environment's `DATABASE_URL`, `REDIS_URL`, `API_URL`, `COGNITO_*` values. A developer who has never needed to point their local API at staging simply never has `.env.staging.local` on disk.
- The env resolver ([`packages/env`](../../packages/env), see the implementation plan) loads `.env.local` first for target selection, then loads *only* `.env.<target>.local` for each target actually selected that run — never all of them. If a selected target's credential file is missing, it fails fast with a clear message ("run `pnpm env:fetch dev` to get dev credentials") rather than silently falling through to an empty/default value.
- **Production credentials never live on a developer workstation in this scheme at all.** There is no local-dev target value of `prod` in the first place — `apps/api`/`apps/web` running locally can point at `local`, `dev`, or `staging`, never `production`. Production's own runtime credentials are handled entirely by [0011](./0011-secrets-config-management.md) (ECS task env sourced from Secrets Manager/SSM), not by anything in this file scheme.
- Credential files (`.env.dev.local`, `.env.staging.local`) are fetched via an explicit, auditable step (a script pulling from AWS Secrets Manager/SSM for that one environment, scoped to the developer's own IAM permissions) — not shared ad hoc through chat/1Password/email. That fetch mechanism's exact shape is implementation detail for [0011](./0011-secrets-config-management.md), not fixed here.

The resolver mechanics from the original design are unchanged: it mutates `process.env` in place so downstream code (`lib/db.ts`, `lib/cognito.ts`, Next's `NEXT_PUBLIC_*` inlining) needs zero changes; only the bootstrap step and file layout are new.

## Consequences

- Blast radius of a leaked/synced local file is now one environment's credentials, not every environment's at once.
- A developer's local disk only ever contains credentials for environments they've explicitly fetched — least-privilege by default, not by discipline.
- Slightly more moving parts than a single file (multiple files to gitignore, a fetch step to run before first using a new target) — accepted as the cost of the blast-radius reduction above.
- Adding a new environment or a new service-dependency still doesn't require new npm scripts (per the original design) — it requires one new `.env.<env>.local` file (fetched, not hand-typed) and one more `*_TARGET` value.
- All `.env*.local` files are gitignored; `.env.example` documents the shape (target vars + which credential-file-per-target pattern to expect) without containing any real value.
