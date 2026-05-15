############################
# Builder (deps + build)
############################
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN pnpm build

############################
# Test
############################
FROM builder AS test
RUN pnpm test
CMD ["pnpm", "test"]

############################
# Production (Nginx)
############################
FROM nginx:alpine AS production
WORKDIR /app

RUN apk add --no-cache ca-certificates wget gettext

COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

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
