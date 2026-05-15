# mr-review

AI-powered merge request review tool. Runs locally via Docker, works with GitLab and GitHub, supports Claude and any OpenAI-compatible model.

## Quick start

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml
docker compose up -d
```

Open http://localhost:8000, add an AI provider and a VCS host, pick an MR.

## How it works

| Stage | Description |
|-------|-------------|
| **BRIEF** | Choose a review preset and add custom instructions for the AI |
| **DISPATCH** | Run the AI review — comments stream in as they are generated |
| **POLISH** | Edit, keep, or dismiss individual comments |
| **POST** | Send approved comments back to the MR in GitLab or GitHub |

## Deployment options

| Option | Compose file | When to use |
|--------|-------------|-------------|
| All-in-one | `deploy/all-in-one/` | Simplest setup, single port (8000) |
| Standard | `deploy/standard/` | Separate API (8000) and UI (8080), more control |

Images are published to `ghcr.io/bedrock-python/mr-review/{api,web-app,all-in-one}:latest`.

## Documentation

See [docs/](docs/) for installation, quick start, and configuration guides.

## Development

```bash
# Start backend (:8000) + frontend (:5173)
make dev

# Run tests
make run-tests

# Format all services
make fmt-services

# See all commands
make help
```

Service READMEs:
- [services/mr-review/README.md](services/mr-review/README.md) — Python FastAPI backend
- [services/web-app/README.md](services/web-app/README.md) — React TypeScript frontend
