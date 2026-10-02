#!/bin/sh
set -eu
image=${1:?immagine richiesta}
name="myhome-smoke-$$"
volume="$name-data"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker volume create "$volume" >/dev/null
start() {
  docker run -d --name "$name" --mount "type=volume,source=$volume,target=/data" "$@" "$image" >/dev/null
}
check() { docker exec -i -e "SMOKE_MODE=$1" "$name" node --input-type=module < scripts/container-smoke.mjs; }
start -e MYHOME_AUTH_MODE=disabled
check direct
docker restart "$name" >/dev/null
check restart
docker rm -f "$name" >/dev/null
start -e MYHOME_AUTH_MODE=disabled -e MYHOME_READ_ONLY=true
check readonly
docker rm -f "$name" >/dev/null
start -e MYHOME_AUTH_MODE=required -e MYHOME_ADMIN_TOKEN=smoke-admin-code-123 -e MYHOME_KIOSK_TOKEN=smoke-kiosk-code-123
check protected
docker rm -f "$name" >/dev/null
# Required auth without credentials must fail before starting the server.
if docker run --rm --mount "type=volume,source=$volume,target=/data" -e MYHOME_AUTH_MODE=required "$image"; then
  echo "Auth required senza credenziali non ha bloccato l'avvio" >&2
  exit 1
fi
