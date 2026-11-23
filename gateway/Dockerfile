# StudentControl v2 — gateway (Node 22, faqat "pg" paketi)
# Build konteksti: v2/ papkasi (db/schema.sql ham kerak) —  docker build -f gateway/Dockerfile .
FROM docker.io/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY gateway/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY gateway/src ./src
COPY db ./db
EXPOSE 3000
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "src/server.js"]
