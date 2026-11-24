FROM docker.io/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.js ./
USER node
CMD ["node", "index.js"]
