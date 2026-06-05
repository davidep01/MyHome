#!/bin/sh
set -e

# Read options written by the HA Supervisor to /data/options.json
CONFIG_FILE=/data/options.json
if [ -f "$CONFIG_FILE" ]; then
  val() { jq -r ".$1 // empty" "$CONFIG_FILE"; }

  HA_URL_OPT=$(val ha_url);       [ -n "$HA_URL_OPT" ]       && export HA_URL="$HA_URL_OPT"
  HA_TOKEN_OPT=$(val ha_token);   [ -n "$HA_TOKEN_OPT" ]     && export HA_TOKEN="$HA_TOKEN_OPT"
  SB_URL=$(val supabase_url);     [ -n "$SB_URL" ]            && export SUPABASE_URL="$SB_URL"
  SB_KEY=$(val supabase_key);     [ -n "$SB_KEY" ]            && export SUPABASE_SERVICE_ROLE_KEY="$SB_KEY"
  OW_KEY=$(val openweather_key);  [ -n "$OW_KEY" ]            && export OPENWEATHER_API_KEY="$OW_KEY"
  GEM_KEY=$(val gemini_key);      [ -n "$GEM_KEY" ]           && export GEMINI_API_KEY="$GEM_KEY"
  PORT_OPT=$(val port);           [ -n "$PORT_OPT" ]          && export PORT="$PORT_OPT"
fi

exec node /app/backend/dist/index.js
