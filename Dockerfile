# Pre-built artifacts are copied from the CI runner (see docker.yml).
# This stage only installs pure-JS backend runtime deps — no native compilation.
FROM node:22-alpine
RUN apk add --no-cache jq

WORKDIR /app

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY dist ./dist
COPY backend/dist ./backend/dist

COPY run.sh /run.sh
RUN chmod +x /run.sh

ENV NODE_ENV=production \
    MYHOME_DB_PATH=/data/db.json \
    MYHOME_ALLOW_FILE_WRITES=true

EXPOSE 3001
CMD ["/run.sh"]
