FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/calculation/package.json ./packages/calculation/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/db/package.json ./packages/db/
COPY packages/env/package.json ./packages/env/
COPY packages/queue/package.json ./packages/queue/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/web ./apps/web
COPY packages ./packages
# `next build` runs bootstrapWebEnv(), which validates the full env schema
# (including AUTH_SECRET) even though nothing at build time actually
# reads these values — none of this is baked into the client bundle
# (AUTH_SECRET isn't NEXT_PUBLIC_*, and NEXT_PUBLIC_API_URL is only ever
# read server-side here, never from the browser). The real values come
# from docker-compose's `environment:` at container *start*, which
# `next start` reads fresh — this build-time value is just a placeholder
# to satisfy validation, never the secret actually used to sign sessions.
ENV NEXT_PUBLIC_API_URL=http://api:3001
ENV AUTH_SECRET=build-time-placeholder-overridden-at-container-start
RUN pnpm --filter @schuco/web build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
EXPOSE 3000
WORKDIR /app/apps/web
CMD ["pnpm", "exec", "tsx", "scripts/bootstrap-env.ts", "start"]
