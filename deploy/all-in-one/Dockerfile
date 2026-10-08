############################
# Stage 1: build frontend
############################
# Static assets are platform-independent, so the JS build always runs on the
# build host instead of under QEMU for each target architecture.
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY services/web-app/package.json services/web-app/pnpm-lock.yaml services/web-app/.npmrc ./
COPY services/web-app/patches ./patches
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY services/web-app/ .
ARG VITE_APP_ENV=production
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN pnpm build

############################
# Stage 2: build backend deps
############################
FROM python:3.14-slim-bookworm AS backend-builder
WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv/bin/uv

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates libffi-dev libssl-dev \
  && rm -rf /var/lib/apt/lists/*

COPY services/mr-review/pyproject.toml services/mr-review/uv.lock* ./
RUN /uv/bin/uv export --frozen --no-hashes --extra api | grep -v "^-e \.$" > requirements.txt
RUN --mount=type=cache,target=/root/.cache/uv \
    /uv/bin/uv pip install --system -r requirements.txt

COPY services/mr-review/mr_review /app/mr_review

############################
# Stage 3: production image
############################
FROM python:3.14-slim-bookworm AS production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# Unprivileged user the application runs as. Fixed 1000:1000 so a host
# directory can be given to it ahead of time; PUID/PGID override it at start.
RUN groupadd --gid 1000 app \
 && useradd --uid 1000 --gid app --home-dir /home/app --create-home \
    --shell /usr/sbin/nologin app \
 && mkdir /data && chown app:app /data

COPY --from=backend-builder /usr/local /usr/local
COPY --from=backend-builder /app /app
COPY --chmod=755 services/mr-review/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Frontend built assets served as static files by FastAPI
COPY --from=frontend-builder /app/dist /app/static

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONPATH=/app \
    MR_REVIEW__DATA_DIR=/data \
    MR_REVIEW__STATIC_DIR=/app/static

# No USER: the entrypoint starts as root only to make the data directory
# writable, then drops to the unprivileged user before the application starts.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/system/health/livez || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["python", "-m", "mr_review.api.entrypoint"]
