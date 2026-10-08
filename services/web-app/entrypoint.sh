#!/bin/sh
set -e

# Where the browser sends API calls. Empty (the default) means the UI's own
# origin: nginx proxies /api/ to API_UPSTREAM below. Set it only when the API
# is served from another origin, which then has to allow this one in CORS.
API_BASE_URL="${API_BASE_URL:-}"
API_BASE_URL="${API_BASE_URL%/}"
APP_ENV="${APP_ENV:-production}"
OAUTH_CLIENT_ID="${OAUTH_CLIENT_ID:-mr-review-web-app}"
VITE_USE_MOCKS="${VITE_USE_MOCKS:-false}"

echo "Generating runtime config with API_BASE_URL=${API_BASE_URL:-<same origin>}"

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
# CSP connect-src gets the API's origin — scheme://host[:port], since a CSP
# source with a path matches that exact path only. A relative or empty
# API_BASE_URL is same-origin, which 'self' already allows.
case "$API_BASE_URL" in
  *://*) API_ORIGIN=$(printf '%s\n' "$API_BASE_URL" | sed -E 's#^([^:/]+://[^/]+).*#\1#') ;;
  *) API_ORIGIN="" ;;
esac
export API_URL="${API_URL:-$API_ORIGIN}"

# HSTS is off unless asked for. This container speaks plain HTTP; the header
# belongs to whatever terminates TLS in front of it, which knows whether every
# subdomain of the host is HTTPS too. HSTS_MAX_AGE (seconds) turns it on here;
# HSTS_INCLUDE_SUBDOMAINS=true extends it to every subdomain.
HSTS_MAX_AGE="${HSTS_MAX_AGE:-}"
case "$HSTS_MAX_AGE" in
  '') export HSTS_HEADER="" ;;
  *[!0-9]*)
    echo "HSTS_MAX_AGE must be a number of seconds, got '$HSTS_MAX_AGE'" >&2
    exit 1
    ;;
  *)
    hsts_value="max-age=$HSTS_MAX_AGE"
    if [ "${HSTS_INCLUDE_SUBDOMAINS:-false}" = "true" ]; then
      hsts_value="$hsts_value; includeSubDomains"
    fi
    export HSTS_HEADER="add_header Strict-Transport-Security \"$hsts_value\" always;"
    ;;
esac

# Where nginx proxies /api/ to, resolved inside the container network — never
# by the browser. scheme://host:port with no path: nginx appends the request
# URI to it as it is.
API_UPSTREAM="${API_UPSTREAM:-http://api:8000}"
export API_UPSTREAM="${API_UPSTREAM%/}"

# The DNS server nginx resolves API_UPSTREAM through: the container's own
# nameservers (Docker's embedded DNS on a compose network) unless overridden.
if [ -z "${NGINX_RESOLVER:-}" ]; then
  NGINX_RESOLVER=$(awk 'BEGIN { ORS = " " } $1 == "nameserver" { if ($2 ~ ":") print "[" $2 "]"; else print $2 }' /etc/resolv.conf)
  NGINX_RESOLVER="${NGINX_RESOLVER% }"
fi
export NGINX_RESOLVER="${NGINX_RESOLVER:-127.0.0.11}"

echo "Generating nginx.conf from template..."
# Writable under K8s runAsUser 1000 even when /etc/nginx is root-owned.
NGINX_RUNTIME_CONF="/tmp/nginx-runtime.conf"
envsubst '${API_URL} ${HSTS_HEADER}' < /etc/nginx/security-headers.conf.template > /tmp/nginx-security-headers.conf
envsubst '${API_UPSTREAM} ${NGINX_RESOLVER}' < /etc/nginx/nginx.conf.template > "$NGINX_RUNTIME_CONF"

echo "Runtime config generated successfully"

# Start nginx (config path must match NGINX_RUNTIME_CONF above)
exec nginx -c "$NGINX_RUNTIME_CONF" -g 'daemon off;'
