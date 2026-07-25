# syntax=docker/dockerfile:1
# Multi-stage frontend build: Vite build -> static assets served by nginx.
# The backend has its own Dockerfile at backend/Dockerfile.

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the SPA. Vite pre-compresses assets to .br/.gz (see vite.config.js).
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM nginx:1.27-alpine AS runtime

# SPA routing + pre-compressed asset serving.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
