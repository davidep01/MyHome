#!/bin/sh
set -e
umask 077

mkdir -p /data

if [ -L /data ] || [ ! -d /data ]; then
  echo "Errore: /data deve essere una directory reale, non un collegamento simbolico." >&2
  exit 1
fi

write_token_file() {
  target="$1"
  value="$2"
  temporary=$(mktemp "${target}.tmp.XXXXXX") || return 1
  chmod 600 "$temporary"
  if ! printf '%s' "$value" > "$temporary"; then
    rm -f "$temporary"
    return 1
  fi
  chown root:root "$temporary"
  # rename(2) replaces a hostile symlink entry instead of following it.
  if ! mv -f "$temporary" "$target"; then
    rm -f "$temporary"
    return 1
  fi
}

load_token() {
  option_value="$1"
  token_file="$2"
  label="$3"
  if [ -e "$token_file" ] || [ -L "$token_file" ]; then
    if [ -L "$token_file" ] || [ ! -f "$token_file" ]; then
      echo "Errore: $token_file deve essere un file regolare, non un collegamento simbolico." >&2
      return 1
    fi
    chown root:root "$token_file"
    chmod 600 "$token_file"
  fi
  if [ -n "$option_value" ]; then
    token="$option_value"
    if [ "${#token}" -lt 12 ] || [ "${#token}" -gt 512 ]; then
      echo "Errore: il codice $label deve contenere da 12 a 512 caratteri." >&2
      return 1
    fi
    write_token_file "$token_file" "$token" || return 1
  elif [ -s "$token_file" ]; then
    token=$(cat "$token_file")
    if [ "${#token}" -lt 12 ] || [ "${#token}" -gt 512 ]; then
      echo "Errore: il codice $label salvato in $token_file non è valido." >&2
      return 1
    fi
  else
    token=$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))")
    write_token_file "$token_file" "$token" || return 1
    echo "🔐 Codice $label generato: $token" >&2
    echo "   Conservalo nel tuo password manager; resta disponibile in $token_file" >&2
  fi
  printf '%s' "$token"
}

# Read options written by the HA Supervisor to /data/options.json
CONFIG_FILE=/data/options.json
ADMIN_OPT=${MYHOME_ADMIN_TOKEN:-}
KIOSK_OPT=${MYHOME_KIOSK_TOKEN:-}
if [ -e "$CONFIG_FILE" ] || [ -L "$CONFIG_FILE" ]; then
  if [ -L "$CONFIG_FILE" ] || [ ! -f "$CONFIG_FILE" ]; then
    echo "Errore: $CONFIG_FILE deve essere un file regolare, non un collegamento simbolico." >&2
    exit 1
  fi
  val() { jq -r ".$1 // empty" "$CONFIG_FILE"; }

  HA_URL_OPT=$(val ha_url);       [ -n "$HA_URL_OPT" ]       && export HA_URL="$HA_URL_OPT"
  HA_TOKEN_OPT=$(val ha_token);   [ -n "$HA_TOKEN_OPT" ]     && export HA_TOKEN="$HA_TOKEN_OPT"
  ADMIN_OPTION=$(val admin_token); [ -n "$ADMIN_OPTION" ]     && ADMIN_OPT="$ADMIN_OPTION"
  KIOSK_OPTION=$(val kiosk_token); [ -n "$KIOSK_OPTION" ]     && KIOSK_OPT="$KIOSK_OPTION"
  OW_KEY=$(val openweather_key);  [ -n "$OW_KEY" ]            && export OPENWEATHER_API_KEY="$OW_KEY"
  GEM_KEY=$(val gemini_key);      [ -n "$GEM_KEY" ]           && export GEMINI_API_KEY="$GEM_KEY"
fi

# Inside a Home Assistant app, use the Supervisor Core proxy automatically.
# Custom HA_URL/HA_TOKEN options still override this as an explicit pair.
if [ -z "${HA_URL:-}" ] && [ -z "${HA_TOKEN:-}" ] && [ -n "${SUPERVISOR_TOKEN:-}" ]; then
  export HA_URL="http://supervisor/core"
  export HA_TOKEN="$SUPERVISOR_TOKEN"
fi

# Authentication is OFF by default: MyHome runs on a trusted home LAN and the
# owner wants immediate access. It turns ON only when an admin_token option is
# set — then (optionally) a distinct kiosk_token adds the reduced kiosk role.
if [ -n "$ADMIN_OPT" ]; then
  MYHOME_ADMIN_TOKEN=$(load_token "$ADMIN_OPT" /data/myhome-admin-token "amministratore") || exit 1
  export MYHOME_ADMIN_TOKEN
  if [ -n "$KIOSK_OPT" ]; then
    MYHOME_KIOSK_TOKEN=$(load_token "$KIOSK_OPT" /data/myhome-kiosk-token "kiosk") || exit 1
    if [ "$MYHOME_ADMIN_TOKEN" = "$MYHOME_KIOSK_TOKEN" ]; then
      echo "Errore: i codici amministratore e kiosk devono essere diversi." >&2
      exit 1
    fi
    export MYHOME_KIOSK_TOKEN
  fi
  export MYHOME_AUTH_MODE=required
  echo "🔐 Accesso protetto: è richiesto il codice amministratore." >&2
else
  export MYHOME_AUTH_MODE=disabled
  echo "🔓 Accesso diretto in LAN (nessun codice richiesto)." >&2
fi

chown node:node /data
if [ -e /data/db.json ] || [ -L /data/db.json ]; then
  if [ -L /data/db.json ] || [ ! -f /data/db.json ]; then
    echo "Errore: /data/db.json deve essere un file regolare, non un collegamento simbolico." >&2
    exit 1
  fi
  chown node:node /data/db.json
  chmod 600 /data/db.json
fi
exec su-exec node:node node /app/backend/dist/index.js
