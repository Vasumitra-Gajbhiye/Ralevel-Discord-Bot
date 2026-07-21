FROM node:20-bookworm-slim

WORKDIR /app

# Native build tools for npm packages with compiled bindings (e.g. @napi-rs/canvas)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Workspace manifests first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Install bot and its workspace dependencies only
RUN pnpm install --frozen-lockfile --filter @ralevel/bot... --prod \
  && pnpm store prune

COPY apps/bot ./apps/bot
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared

ENV NODE_ENV=production

RUN chown -R node:node /app

USER node

CMD ["node", "apps/bot/index.js"]
