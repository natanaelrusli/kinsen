#!/usr/bin/env bash
# Pull the latest code and redeploy Kinsen, keeping the settings of the
# current deployment (port, domain, API port, data dir) read from the
# installed nginx site and systemd unit.
#
# Usage: scripts/update-prod.sh [--force]   (--force rebuilds even if already up to date)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE=/etc/nginx/sites-available/kinsen
UNIT=/etc/systemd/system/kinsen-api.service
cd "$APP_DIR"

args=()
if [[ -f $SITE ]]; then
  port=$(awk '$1=="listen" && $2 !~ /^\[/ {sub(/;.*/,"",$2); print $2; exit}' "$SITE")
  name=$(awk '$1=="server_name" {sub(/;/,"",$2); print $2; exit}' "$SITE")
  [[ -n ${port:-} ]] && args+=("WEB_PORT=${port}")
  [[ -n ${name:-} ]] && args+=("DOMAIN=${name}")
fi
if [[ -f $UNIT ]]; then
  api=$(sed -n 's/^Environment=PORT=//p' "$UNIT")
  db=$(sed -n 's/^Environment=DATABASE_PATH=//p' "$UNIT")
  [[ -n $api ]] && args+=("API_PORT=${api}")
  [[ -n $db ]] && args+=("DATA_DIR=$(dirname "$db")")
else
  echo "No existing deployment found; run 'make deploy' first." >&2
  exit 1
fi

before=$(git rev-parse HEAD)
git pull --ff-only
after=$(git rev-parse HEAD)

if [[ $before == "$after" && ${1:-} != "--force" ]]; then
  echo "Already up to date ($after). Use --force to rebuild anyway."
  exit 0
fi

echo "Updating ${before:0:7} -> ${after:0:7} with: ${args[*]}"
make deploy "${args[@]}"
