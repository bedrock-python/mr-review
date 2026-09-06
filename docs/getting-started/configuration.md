# Configuration

mr-review has two levels of configuration:

- **Environment variables** — infrastructure settings (ports, data directory, logging). They
  live in the compose file and need a container restart to take effect.
- **UI settings** — AI providers and VCS hosts. Configured in the app and written to YAML
  files in the data directory. No restart needed.

## Compose variables

These are the ones a `.env` file next to your `docker-compose.yml` can change: Compose reads
`.env` to substitute `${...}` in the compose file, and the shipped files substitute exactly
these names.

### All-in-one

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `17240` | Host port mapped to the container's `8000` |
| `DATA_DIR` | `./data` | Host path for the data volume |

### Standard deployment

| Variable | Default | Description |
|----------|---------|-------------|
| `API_PORT` | `17241` | Host port for the API container |
| `WEB_PORT` | `17242` | Host port for the web UI container |
| `DATA_DIR` | `./data` | Host path for the data volume |

Example `.env` for the standard deployment:

```env
API_PORT=9000
WEB_PORT=9080
DATA_DIR=/opt/mr-review/data
```

## Application settings

Everything the application itself reads is prefixed `MR_REVIEW__`, with `__` between nesting
levels. **These do not work from `.env`** — Compose does not pass unknown names from `.env`
into a container. Put them in the compose file's `environment:` block:

```yaml
services:
  mr-review:
    environment:
      MR_REVIEW__LOGGING__LEVEL: "DEBUG"
      MR_REVIEW__LOGGING__USE_JSON: "false"
```

The ones worth knowing:

| Variable | Default | Description |
|----------|---------|-------------|
| `MR_REVIEW__LOGGING__LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `MR_REVIEW__LOGGING__USE_JSON` | `false` | Both shipped compose files set it to `true` |
| `MR_REVIEW__DATA_DIR` | `~/.mr-review` | Path *inside* the container; both compose files set `/data` |
| `MR_REVIEW__VCS_TIMEOUT` | `60.0` | HTTP timeout in seconds for calls to a VCS host |
| `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` | `4` | Dispatches in flight per AI provider |
| `MR_REVIEW__CORS__ALLOW_ORIGINS` | dev ports | JSON array — see below |

The complete list, with the server and CORS settings, is on the
[For AI agents](../agents.md) page.

## Where data is stored

Everything is files under the data directory, mounted from `DATA_DIR` on the host:

```
hosts.yaml            VCS hosts and their tokens
ai_providers.yaml     AI providers and their API keys
reviews/<uuid>.yaml   one file per review
```

There is no database and nothing to migrate; the directory survives container restarts and
image updates. Tokens and API keys are stored in plain text, so treat it as a secret — the
password on export/import encrypts the export file, not the store.

## AI providers

Configured in the app at **Settings → AI Providers**. No environment variables needed.

Supported types:

- **Claude** (`claude`) — the Anthropic Messages API
- **OpenAI** (`openai`) and **OpenAI-compat** (`openai_compat`) — any endpoint speaking the
  OpenAI chat-completions API: OpenAI, Ollama, Groq, Azure OpenAI, LM Studio, and others

See [AI providers](../features/ai-providers.md) for the fields and their defaults.

## VCS hosts

Configured in the app at **Settings → Hosts**. Supported types:

- **GitLab** — gitlab.com or self-hosted
- **GitHub** — github.com or GitHub Enterprise
- **Gitea** and **Forgejo** — self-hosted
- **Bitbucket** — Bitbucket Cloud; `base_url` is ignored and the token field takes
  `username:app_password`

You can add multiple hosts of different types. See [VCS hosts](../features/hosts.md) for
the base URL and token each type expects.

## Self-hosted server

When deploying on a server rather than a local machine:

- Use an **absolute path** for `DATA_DIR` (e.g. `/opt/mr-review/data`) to avoid path
  resolution issues.
- Put **nginx or Caddy** in front for HTTPS termination. There is no authentication in
  mr-review itself, so the port must not be reachable by anyone you would not hand the
  tokens to.
- If the UI and API are served from different origins, set `MR_REVIEW__CORS__ALLOW_ORIGINS`
  in the compose file to a JSON array of allowed origins:

  ```yaml
  environment:
    MR_REVIEW__CORS__ALLOW_ORIGINS: '["https://mr-review.example.com"]'
  ```
