FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 8787}/api/health`).then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"]
CMD ["node", "dist/server/index.js"]
