# syntax=docker/dockerfile:1

# ---- deps: install full dependency tree (cached layer) ----
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ---- build: compile TypeScript + generate Prisma client ----
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma:generate
RUN pnpm build
RUN pnpm install --frozen-lockfile --prod

# ---- runtime: minimal image, no build tools ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
RUN mkdir -p /app/storage && chown -R app:app /app
USER app
EXPOSE 3000
CMD ["node", "dist/main.js"]
