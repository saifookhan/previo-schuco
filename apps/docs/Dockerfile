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
ARG APP_PUBLIC_URL=
ARG MAILPIT_DOMAIN=
ARG DOCS_DOMAIN=
RUN DOMAIN=$DOMAIN APP_PUBLIC_URL=$APP_PUBLIC_URL MAILPIT_DOMAIN=$MAILPIT_DOMAIN DOCS_DOMAIN=$DOCS_DOMAIN GIT_COMMIT=__GIT_COMMIT__ pnpm --filter @schuco/docs build

FROM caddy:2-alpine
COPY apps/docs/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/docs/build /srv
# The commit changes on every deploy, so it is filled in here instead of in
# the (slow) build step above — that layer stays cached when docs don't change.
ARG GIT_COMMIT=unknown
RUN find /srv -type f \( -name '*.html' -o -name '*.js' \) -exec sed -i "s/__GIT_COMMIT__/${GIT_COMMIT}/g" {} +
EXPOSE 80
