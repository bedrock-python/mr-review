# mr-review

AI-powered merge request review tool. Runs locally via Docker, connects to GitLab, GitHub, Gitea, Forgejo, or Bitbucket, and works with Claude, OpenAI, or any OpenAI-compatible model.

> **Full documentation → [bedrock-python.github.io/mr-review](https://bedrock-python.github.io/mr-review/)**

> [!TIP]
> **Deploying this with an AI assistant?** Hand it
> **[one page](https://bedrock-python.github.io/mr-review/agents/)** instead of the whole
> site: the smallest compose file that runs, every environment variable and its real
> default, the rules that break a deployment when they are broken, the mistakes models
> make in a compose file, and a map of which page to fetch for the rest. Every docs page is
> also served as raw Markdown at its own URL, and a **Copy page** button at the top of each
> one hands it straight to a chat window.

---

## Quick start

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/all-in-one/docker-compose.yml
docker compose up -d
```

Open **http://localhost:17240**, add an AI provider and a VCS host, then pick an MR to review.

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
# → http://localhost:17240
```

### Standard (separate services)

API and UI run as separate containers — useful if you want more control over networking or scaling.

```bash
mkdir mr-review && cd mr-review
curl -O https://raw.githubusercontent.com/bedrock-python/mr-review/master/deploy/standard/docker-compose.yml
docker compose up -d
# API → http://localhost:17241
# UI  → http://localhost:17242
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

See the [configuration guide](https://bedrock-python.github.io/mr-review/getting-started/configuration/) for environment variables and advanced options.

---

## Documentation

| | |
|---|---|
| [For AI agents](https://bedrock-python.github.io/mr-review/agents/) | The whole tool on one page, written for a coding assistant |
| [Installation](https://bedrock-python.github.io/mr-review/getting-started/installation/) | Docker options, ports, data persistence |
| [Quick start](https://bedrock-python.github.io/mr-review/getting-started/quickstart/) | Get up and running in 2 minutes |
| [Configuration](https://bedrock-python.github.io/mr-review/getting-started/configuration/) | AI providers, VCS hosts, environment variables |
| [Contributing](CONTRIBUTING.md) | Running the services locally, checks, releases |

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
