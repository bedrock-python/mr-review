# Configuration

mr-review has two levels of configuration:

- **Environment variables** — infrastructure settings (ports, data directory). Set once in a `.env` file next to your `docker-compose.yml`. Require a container restart to take effect.
- **UI settings** — AI providers and VCS hosts. Configured in the app, stored in SQLite. No restart needed.

## Environment variables

Create a `.env` file next to your `docker-compose.yml` to override defaults.

### All-in-one

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `17240` | Port the app listens on |
| `DATA_DIR` | `./data` | Host path for the data volume |
| `MR_REVIEW__LOGGING__LEVEL` | `INFO` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `MR_REVIEW__LOGGING__USE_JSON` | `true` | `true` = JSON logs, `false` = human-readable |

### Standard deployment

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `17241` | Port for the API container |
| `WEB_PORT` | `17242` | Port for the web UI container |
| `DATA_DIR` | `./data` | Host path for the data volume |
| `MR_REVIEW__LOGGING__LEVEL` | `INFO` | Log level: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `MR_REVIEW__LOGGING__USE_JSON` | `true` | `true` = JSON logs, `false` = human-readable |

Example `.env` for standard deployment:

```env
API_PORT=9000
WEB_PORT=9080
DATA_DIR=/opt/mr-review/data
```

## AI providers

Configured in the app at **Settings → AI Providers**. No environment variables needed.

Supported types:

- **Anthropic** — Claude models (claude-sonnet-4-6, claude-opus-4, etc.)
- **OpenAI-compatible** — any provider with an OpenAI-compatible API: OpenAI, Ollama, Groq, Azure OpenAI, LM Studio, and others

Settings are stored in the SQLite database and persist across restarts and updates.

## VCS hosts

Configured in the app at **Settings → Hosts**. Supported types:

- **GitLab** — gitlab.com or self-hosted GitLab instances
- **GitHub** — github.com or GitHub Enterprise

You can add multiple hosts of different types. Each host stores its own token securely in the local database.

## Self-hosted server

When deploying on a server rather than a local machine:

- Use an **absolute path** for `DATA_DIR` (e.g. `/opt/mr-review/data`) to avoid path resolution issues.
- Put **nginx or Caddy** in front for HTTPS termination.
- If the UI and API are served from different origins, set `MR_REVIEW__CORS__ALLOW_ORIGINS` in the compose file to a JSON array of allowed origins:

  ```yaml
  environment:
    MR_REVIEW__CORS__ALLOW_ORIGINS: '["https://mr-review.example.com"]'
  ```
