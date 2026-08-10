# syntax=docker/dockerfile:1
# Build from monorepo root: docker build -f apps/api/Dockerfile .

FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# 11.3+ : --config.trustLockfile skips registry re-verify (Coolify cold builds hang)
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate

FROM base AS build
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile --filter @verimaya/api... --config.trustLockfile=true

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @verimaya/shared build
RUN pnpm --filter @verimaya/api build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
	pnpm install --frozen-lockfile --filter @verimaya/api... --config.trustLockfile=true

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/api/drizzle.config.ts ./apps/api/
COPY --from=build /app/apps/api/scripts ./apps/api/scripts
COPY apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/apps/api/src/main.js"]
