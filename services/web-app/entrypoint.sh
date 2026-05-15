#!/bin/sh
set -e

# Set default API URL if not provided
API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
APP_ENV="${APP_ENV:-production}"
OAUTH_CLIENT_ID="${OAUTH_CLIENT_ID:-mr-review-web-app}"
VITE_USE_MOCKS="${VITE_USE_MOCKS:-false}"

echo "Generating runtime config with API_BASE_URL=${API_BASE_URL}"

# Generate config.js at runtime
cat > /usr/share/nginx/html/config.js << EOF
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL}",
  APP_ENV: "${APP_ENV}",
  OAUTH_CLIENT_ID: "${OAUTH_CLIENT_ID}",
  VITE_USE_MOCKS: "${VITE_USE_MOCKS}",
  BUILD_TIME: "$(date -Iseconds)",
  VERSION: "${APP_VERSION:-unknown}"
};
EOF

# Nginx config generation from template
# Default API_URL for CSP if not provided
export API_URL="${API_URL:-$API_BASE_URL}"

# HSTS header for production-like environments
if [ "$APP_ENV" = "production" ] || [ "$APP_ENV" = "staging" ] || [ "$APP_ENV" = "pre" ]; then
  export HSTS_HEADER='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
else
  export HSTS_HEADER=""
fi

echo "Generating nginx.conf from template..."
# Writable under K8s runAsUser 1000 even when /etc/nginx is root-owned.
NGINX_RUNTIME_CONF="/tmp/nginx-runtime.conf"
envsubst '${API_URL} ${HSTS_HEADER}' < /etc/nginx/nginx.conf.template > "$NGINX_RUNTIME_CONF"

echo "Runtime config generated successfully"

# Start nginx (config path must match NGINX_RUNTIME_CONF above)
exec nginx -c "$NGINX_RUNTIME_CONF" -g 'daemon off;'
