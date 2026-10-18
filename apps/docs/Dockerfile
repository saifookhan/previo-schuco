FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/docs/package.json ./apps/docs/
RUN pnpm install --frozen-lockfile --filter @schuco/docs
COPY apps/docs ./apps/docs
# Baked into the static pages at build time (docusaurus.config.ts) — the
# docs link to the app, Mailpit and themselves on these hostnames.
ARG DOMAIN=
ARG MAILPIT_DOMAIN=
ARG DOCS_DOMAIN=
RUN DOMAIN=$DOMAIN MAILPIT_DOMAIN=$MAILPIT_DOMAIN DOCS_DOMAIN=$DOCS_DOMAIN pnpm --filter @schuco/docs build

FROM caddy:2-alpine
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/docs/build /srv
EXPOSE 80
