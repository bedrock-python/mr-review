# mr-review

AI-powered merge request review tool. Runs locally via Docker, connects to GitLab, GitHub, Gitea, Forgejo, or Bitbucket, and works with Claude, OpenAI, or any OpenAI-compatible model.

> **Full documentation → [bedrock-python.github.io/mr-review](https://bedrock-python.github.io/mr-review/)**

---

## Quick start

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml
docker compose up -d
```

Open **http://localhost:8000**, add an AI provider and a VCS host, then pick an MR to review.

That's it — no accounts, no cloud, no data leaves your machine.

---

## How it works

Pick a merge request and let the AI walk through it in four stages:

| Stage | What happens |
|-------|-------------|
| **Brief** | Choose a review preset (thorough / security / style / performance) and add custom instructions |
| **Dispatch** | AI reviews the diff — comments appear as they stream in |
| **Polish** | Edit, keep, or dismiss individual comments before posting |
| **Post** | Approved comments are sent back to the MR as inline review notes |

---

## Deployment

### All-in-one (recommended)

Single container, single port. Easiest way to get started.

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml
docker compose up -d
# → http://localhost:8000
```

### Standard (separate services)

API and UI run as separate containers — useful if you want more control over networking or scaling.

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/docker-compose.yml
docker compose up -d
# API → http://localhost:8000
# UI  → http://localhost:8080
```

Docker images are published to GitHub Container Registry:

```
ghcr.io/bedrock-python/mr-review/all-in-one:latest
ghcr.io/bedrock-python/mr-review/api:latest
ghcr.io/bedrock-python/mr-review/web-app:latest
```

---

## Configuration

All configuration is done through the UI after first launch:

1. **Add an AI provider** — Claude (Anthropic), OpenAI, or any OpenAI-compatible endpoint
2. **Add a VCS host** — GitLab, GitHub, Gitea, Forgejo, or Bitbucket with a personal access token
3. **Pick a repository and MR** — start reviewing

See the [configuration guide](https://bedrock-python.github.io/mr-review/configuration/) for environment variables and advanced options.

---

## Documentation

| | |
|---|---|
| [Quick start](https://bedrock-python.github.io/mr-review/quick-start/) | Get up and running in 2 minutes |
| [Configuration](https://bedrock-python.github.io/mr-review/configuration/) | AI providers, VCS hosts, environment variables |
| [Deployment](https://bedrock-python.github.io/mr-review/deployment/) | Docker options, reverse proxy, TLS |
| [Development](https://bedrock-python.github.io/mr-review/development/) | Running locally, contributing |

---

## Development

```bash
# Start backend (:8000) + frontend dev server (:5173)
make dev

# Run tests
make run-tests

# Format all services
make fmt-services

# See all available commands
make help
```

Service READMEs:
- [services/mr-review/README.md](services/mr-review/README.md) — Python FastAPI backend
- [services/web-app/README.md](services/web-app/README.md) — React TypeScript frontend
