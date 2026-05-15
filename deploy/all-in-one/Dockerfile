############################
# Stage 1: build frontend
############################
FROM node:20-alpine AS frontend-builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY services/web-app/package.json services/web-app/pnpm-lock.yaml services/web-app/.npmrc ./
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

RUN addgroup --system app && adduser --system --ingroup app \
    --no-create-home --disabled-password --shell /usr/sbin/nologin app

COPY --from=backend-builder /usr/local /usr/local
COPY --from=backend-builder /app /app

# Frontend built assets served as static files by FastAPI
COPY --from=frontend-builder --chown=app:app /app/dist /app/static

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PYTHONPATH=/app \
    MR_REVIEW__STATIC_DIR=/app/static

USER app
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "mr_review.api.entrypoint"]
