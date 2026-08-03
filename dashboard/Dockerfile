FROM node:22-bookworm-slim AS web-dependencies
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS web-build
WORKDIR /build/web
COPY --from=web-dependencies /build/web/node_modules ./node_modules
COPY web/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-dependencies
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS server-build
WORKDIR /build/server
COPY --from=server-dependencies /build/server/node_modules ./node_modules
COPY server/ ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5183

RUN groupadd --system --gid 1001 dashboard \
  && useradd --system --uid 1001 --gid dashboard --home-dir /app dashboard

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server-build --chown=dashboard:dashboard /build/server/dist ./dist
COPY --from=web-build --chown=dashboard:dashboard /build/web/dist /app/web/dist

USER dashboard
EXPOSE 5183
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:5183/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
