# Front Angular compilado y servido por nginx, con /api y websockets hacia la API.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/fit-engine/package.json packages/fit-engine/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build:packages && npm run build -w apps/web

FROM nginx:1.29-alpine
# La imagen oficial aplica envsubst a las plantillas al arrancar (PORT, API_UPSTREAM y el resolver DNS local).
ENV PORT=80 API_UPSTREAM=api:3000 NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM|NGINX_LOCAL_RESOLVERS)$"
COPY infra/docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:${PORT}/ >/dev/null || exit 1
