# Installation

mr-review runs as a Docker container — no Python or Node.js required on your machine.

## Prerequisites

- **Docker Desktop** — [Windows / macOS](https://www.docker.com/products/docker-desktop/)
- **Docker Engine + Compose plugin** — [Linux install guide](https://docs.docker.com/engine/install/)

That's the only requirement.

## Quick start (all-in-one)

Single container, everything on one port. Good for trying it out.

```bash
# 1. Create a working directory
mkdir mr-review && cd mr-review

# 2. Download compose file
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml

# 3. Start
docker compose up -d

# 4. Open the app
#    http://localhost:17240
```

Data is stored in `./data` next to the compose file.

### One-liner (no compose file)

If you just want to try it without downloading anything:

```bash
docker run -d \
  --name mr-review \
  -p 17240:8000 \
  -v "$HOME/mr-review-data:/data" \
  -e MR_REVIEW__SERVER__HOST=0.0.0.0 \
  -e MR_REVIEW__SERVER__PORT=8000 \
  -e MR_REVIEW__DATA_DIR=/data \
  -e MR_REVIEW__HOST_DATA_DIR="$HOME/mr-review-data" \
  ghcr.io/bedrock-python/mr-review/all-in-one:latest
```

On Windows (PowerShell):

```powershell
docker run -d `
  --name mr-review `
  -p 17240:8000 `
  -v "$env:USERPROFILE\mr-review-data:/data" `
  -e MR_REVIEW__SERVER__HOST=0.0.0.0 `
  -e MR_REVIEW__SERVER__PORT=8000 `
  -e MR_REVIEW__DATA_DIR=/data `
  -e "MR_REVIEW__HOST_DATA_DIR=$env:USERPROFILE\mr-review-data" `
  ghcr.io/bedrock-python/mr-review/all-in-one:latest
```

Open http://localhost:17240. To stop: `docker stop mr-review && docker rm mr-review`.

## Standard deployment (recommended)

Two containers: API on port 17241, web UI on port 17242. Allows independent updates and more control.

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/docker-compose.yml

# Optional: customize ports or data directory
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/.env.example
cp .env.example .env
# edit .env if needed

docker compose up -d
# API: http://localhost:17241
# UI:  http://localhost:17242
```

## Updating

```bash
docker compose pull
docker compose up -d
```

## Stopping

```bash
docker compose down
```

## Data persistence

All application data (SQLite database, settings) is stored in `DATA_DIR`, which defaults to `./data` relative to the compose file. This directory is mounted as a volume, so data survives container restarts and image updates.

To use a different location, set `DATA_DIR` in your `.env` file:

```env
DATA_DIR=/opt/mr-review/data
```

## For developers

If you want to run the services without Docker (for local development), see the README files in the repository:

- `services/mr-review/README.md` — Python backend
- `services/web-app/README.md` — React frontend
