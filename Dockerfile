# Pre-built artifacts are copied from the CI runner (see docker.yml).
# This stage only installs pure-JS backend runtime deps — no native compilation.
ARG TARGETARCH
FROM node:22-alpine AS base
ARG BUILD_VERSION="dev"
ARG TARGETARCH
LABEL io.hass.type="app" \
      io.hass.version="${BUILD_VERSION}" \
      io.hass.name="MyHome Dashboard" \
      io.hass.description="Dashboard privata per Home Assistant, ottimizzata per kiosk e regia desktop" \
      io.hass.url="https://github.com/davidep01/MyHome" \
      org.opencontainers.image.title="MyHome Dashboard" \
      org.opencontainers.image.description="Private Home Assistant dashboard for wall kiosks" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.source="https://github.com/davidep01/MyHome"

# BuildKit supplies TARGETARCH for every platform in the multi-arch build. Keep
# the check here so an unsupported or incorrectly configured build cannot be
# published with valid-looking Home Assistant metadata.
RUN case "${TARGETARCH}" in \
      amd64|arm64) ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH:-unset}" >&2; exit 1 ;; \
    esac \
    && apk add --no-cache jq su-exec

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY dist ./dist
COPY backend/dist ./backend/dist

COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV NODE_ENV=production \
    MYHOME_DB_PATH=/data/db.json \
    MYHOME_AUTH_MODE=required

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["/run.sh"]

# Docker and Home Assistant use different names for 64-bit ARM. Select a tiny
# metadata stage per target so each image in the manifest carries the exact HA
# architecture label (arm64 -> aarch64, amd64 -> amd64).
FROM base AS platform-amd64
LABEL io.hass.arch="amd64"

FROM base AS platform-arm64
LABEL io.hass.arch="aarch64"

FROM platform-${TARGETARCH} AS final
