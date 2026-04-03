#!/usr/bin/env bash
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-root@43.139.156.39}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/poker-app}"
REMOTE_WEB_DIR="${REMOTE_WEB_DIR:-/www/wwwroot/quantart/poker}"

pnpm install
pnpm build

rsync -az --delete \
  --exclude node_modules \
  --exclude data \
  --exclude .git \
  ./ "${REMOTE_HOST}:${REMOTE_APP_DIR}/"

ssh "${REMOTE_HOST}" "mkdir -p '${REMOTE_WEB_DIR}' '${REMOTE_APP_DIR}/data'"
rsync -az --delete ./apps/web/dist/ "${REMOTE_HOST}:${REMOTE_WEB_DIR}/"

ssh "${REMOTE_HOST}" "
  cd '${REMOTE_APP_DIR}' && \
  pnpm install --prod=false && \
  pnpm build && \
  if [ -f /opt/monitor-api/.env ]; then
    grep -E '^(DEEPSEEK_API_KEY|AI_KEY|OPENAI_API_KEY|QUANT_SIGNAL_LLM_MODEL|QUANT_SIGNAL_LLM_BASE_URL)=' /opt/monitor-api/.env > '${REMOTE_APP_DIR}/.env.ai';
  fi && \
  cp '${REMOTE_APP_DIR}/deploy/ecosystem.config.cjs' /tmp/poker-ecosystem.config.cjs && \
  pm2 startOrReload /tmp/poker-ecosystem.config.cjs && \
  rm -f /tmp/poker-ecosystem.config.cjs
"
