#!/bin/sh
set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
APP_ENV="${APP_ENV:-production}"

echo "Generating runtime config with API_BASE_URL=${API_BASE_URL}"

cat > /usr/share/nginx/html/config.js << EOF
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL}",
  APP_ENV: "${APP_ENV}",
  BUILD_TIME: "$(date -Iseconds)"
};
EOF

NGINX_RUNTIME_CONF="/tmp/nginx-runtime.conf"
envsubst < /etc/nginx/nginx.conf.template > "$NGINX_RUNTIME_CONF"

exec nginx -c "$NGINX_RUNTIME_CONF" -g 'daemon off;'
