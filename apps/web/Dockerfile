# syntax=docker/dockerfile:1
# Build from monorepo root: docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

FROM base AS build
WORKDIR /app

# Production panel defaults. Coolify may pass empty --build-arg and wipe ARG
# defaults; hardcode here so Vite never embeds localhost.
ENV PUBLIC_API_URL=https://api.verimaya.com \
	PUBLIC_SITE_URL=https://verimaya.com \
	PUBLIC_APP_URL=https://app.verimaya.com \
	PUBLIC_CRM_URL=https://crm.verimaya.com \
	PUBLIC_USE_MSW=false

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @verimaya/web...

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN printf '%s\n' \
	'PUBLIC_API_URL=https://api.verimaya.com' \
	'PUBLIC_SITE_URL=https://verimaya.com' \
	'PUBLIC_APP_URL=https://app.verimaya.com' \
	'PUBLIC_CRM_URL=https://crm.verimaya.com' \
	'PUBLIC_USE_MSW=false' \
	> apps/web/.env.production

RUN pnpm --filter @verimaya/shared build
RUN pnpm --filter @verimaya/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/build /usr/share/nginx/html
EXPOSE 80
