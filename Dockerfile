# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:22-alpine AS frontend
RUN npm install -g npm@latest
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 2: Build Hono backend ──────────────────────────────────────────────
FROM node:22-alpine AS backend-builder
RUN npm install -g npm@latest
WORKDIR /build/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npm run build

# ── Stage 3: Runtime (minimal) ───────────────────────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache jq

WORKDIR /app

# Backend production dependencies only
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm install -g npm@latest && cd backend && npm ci --omit=dev

# Built artifacts
COPY --from=backend-builder /build/backend/dist ./backend/dist
COPY --from=frontend /build/dist ./dist

COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV NODE_ENV=production \
    MYHOME_DB_PATH=/data/db.json \
    MYHOME_ALLOW_FILE_WRITES=true

EXPOSE 3001

CMD ["/run.sh"]
