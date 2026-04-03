#!/usr/bin/env bash
set -euo pipefail

cd /opt/poker-app

if [ -f .env.ai ]; then
  set -a
  . ./.env.ai
  set +a
fi

exec node apps/api/dist/server.js
