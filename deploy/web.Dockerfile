# Web image: Caddy serving the landing page and the admin panel, with automatic HTTPS,
# security headers, and /api/* proxied to the API container.
# Build from the repository root:  docker build -f deploy/web.Dockerfile .

# 1. Build the admin panel (React). It calls the API on its own domain (/api), so no URL is baked in.
FROM node:22-alpine AS admin
WORKDIR /admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ ./
ENV VITE_API_URL=
RUN npm run build

# 2. Caddy with the static files
FROM caddy:2.11-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY landing/ /srv/landing/
COPY --from=admin /admin/dist/ /srv/admin/
