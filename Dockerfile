FROM node:20-bookworm-slim

WORKDIR /app

# Native build tools for npm packages with compiled bindings (e.g. better-sqlite3)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./

RUN npm install --omit=dev \
  && npm cache clean --force

COPY . .

ENV NODE_ENV=production

RUN chown -R node:node /app

USER node

CMD ["node", "index.js"]
