############################
# Builder (deps + build)
############################
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Optional: CI passes Nexus npm-proxy; local builds default to registry.npmjs.org.
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ARG NPM_CONFIG_STRICT_SSL=true
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY}
ENV NPM_CONFIG_STRICT_SSL=${NPM_CONFIG_STRICT_SSL}

# Cache dependencies layer (.npmrc: lower concurrency vs Nexus proxy timeouts)
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# Build application
COPY . .
ARG VITE_APP_ENV=production
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN pnpm build

############################
# Test (CI/CD integration)
############################
FROM builder AS test
RUN pnpm test:coverage
CMD ["pnpm", "test:coverage"]

############################
# Production (Nginx)
############################
FROM nginx:alpine AS production
WORKDIR /app

# Runtime deps
RUN apk add --no-cache ca-certificates wget gettext

# Copy entrypoint script (generates config.js and nginx.conf at runtime)
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

# Non-root user aligned with deploy/charts/base-service (runAsUser/fsGroup 1000)
RUN addgroup -g 1000 app && adduser -D -u 1000 -G app app \
 && chown -R app:app /usr/share/nginx/html \
 && chown -R app:app /var/cache/nginx

COPY --from=builder --chown=app:app /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template

USER app
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:8080/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
