# API NestJS. Contexto de build: raíz del monorepo (usa los paquetes compartidos).
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/fit-engine/package.json packages/fit-engine/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --include-workspace-root

COPY packages ./packages
COPY contracts ./contracts
COPY seed ./seed
COPY apps/api ./apps/api
# prisma generate no se conecta a la base, pero prisma.config.ts exige la variable.
RUN npm run build:packages \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build npm run db:generate -w apps/api \
 && npm run build -w apps/api

USER node
WORKDIR /app/apps/api
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Las migraciones se aplican al arrancar (idempotente); luego se levanta la API.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
