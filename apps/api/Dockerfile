FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/calculation/package.json ./packages/calculation/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

FROM deps AS migrate
COPY packages ./packages
WORKDIR /app/packages/db
CMD ["pnpm", "db:migrate"]

FROM deps AS build
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm --filter @schuco/api build

FROM deps AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api ./apps/api
COPY packages ./packages
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
