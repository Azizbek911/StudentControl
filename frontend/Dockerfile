# ---- build: React + Vite -> dist ----
FROM docker.io/library/node:22-alpine AS build
# Paketlar bun bilan o'rnatiladi (bun.lock), build esa node'da (vite, tsc)
COPY --from=docker.io/oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Bo'sh: API shu domenning /api yo'lida (nginx backendga uzatadi)
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- run: nginx statik fayllar + /api proxy ----
FROM docker.io/library/nginx:1.27-alpine
# Konteyner DNS serverini aniqlab, shablonga qo'yadi (backend IP si o'zgarsa ham ishlashi uchun)
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
