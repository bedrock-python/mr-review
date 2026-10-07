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
| `MR_REVIEW_BIND` | `127.0.0.1` | Host address the port is published on — `0.0.0.0` for every interface; read the warning in [Installation](installation.md#opening-it-from-another-machine) first |
| `PORT` | `17240` | Host port mapped to the container's `8000` |
| `DATA_DIR` | `./data` | Host path for the data volume |
| `PUID` / `PGID` | `1000` / `1000` | User and group the application runs as and owns `DATA_DIR` |

### Standard deployment

| Variable | Default | Description |
|----------|---------|-------------|
| `MR_REVIEW_BIND` | `127.0.0.1` | Host address both ports are published on |
| `WEB_PORT` | `17242` | Host port for the web UI container — the only one a browser needs |
| `API_PORT` | `17241` | Host port the API is published on directly, for scripts and `/system/docs` |
| `DATA_DIR` | `./data` | Host path for the data volume |
| `PUID` / `PGID` | `1000` / `1000` | User and group the API runs as and owns `DATA_DIR` |

Example `.env` for the standard deployment:

```env
WEB_PORT=9080
API_PORT=9000
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
| `MR_REVIEW__DATA_DIR` | `/data` in the images | Path *inside* the container (`~/.mr-review` when run outside Docker) |
| `MR_REVIEW__VCS_TIMEOUT` | `60.0` | HTTP timeout in seconds for calls to a VCS host |
| `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` | `4` | Dispatches in flight per AI provider |
| `MR_REVIEW__ALLOWED_HOSTS` | `localhost,127.0.0.1,::1,api` | Host names the server answers — see [Host names](#host-names) |
| `MR_REVIEW__CORS__ALLOW_ORIGINS` | dev ports | JSON array; needed only when the UI calls the API on another origin — see below |

The complete list, with the server and CORS settings, is on the
[For AI agents](../agents.md) page.

### Web container (standard deployment)

The `web` container is nginx. It serves the UI and forwards every `/api/` request to the
API container, so the UI and the API share one origin and CORS never comes into it.

| Variable | Default | Description |
|----------|---------|-------------|
| `API_UPSTREAM` | `http://api:8000` | Where nginx forwards `/api/`, resolved inside the Docker network. `scheme://host:port`, no path |
| `API_BASE_URL` | empty | Where the **browser** sends API calls. Empty means the UI's own origin, through the proxy above. Set it only to serve the API from another origin, which must then allow the UI's origin in `MR_REVIEW__CORS__ALLOW_ORIGINS` |
| `HSTS_MAX_AGE` | empty | Seconds for a `Strict-Transport-Security` header; empty sends none. Better set by the proxy that terminates TLS |
| `HSTS_INCLUDE_SUBDOMAINS` | `false` | `true` adds `includeSubDomains` — only when every subdomain of the host is HTTPS |

### Host names

The server answers only requests whose `Host` header names it the way it expects:
`localhost`, `127.0.0.1`, `::1` and `api` (the API's service name in the standard compose
file), on any port. Anything else gets `400 Invalid host header`, naming the host it
refused. This is what stops a web page from re-pointing its own domain at `127.0.0.1` (DNS
rebinding) and reading the API — the data export with every stored token included — from
your browser.

Opening mr-review by any other name means adding that name, without a port, to
`MR_REVIEW__ALLOWED_HOSTS` on the API container (all-in-one: the only container). Two cases
need it:

- **Another machine on the LAN.** The compose files publish the port on `127.0.0.1` only, so
  this takes both settings: `MR_REVIEW_BIND=0.0.0.0` (or the LAN address) in the `.env` —
  see [Opening it from another machine](installation.md#opening-it-from-another-machine) —
  and the address or name the other machines use in `MR_REVIEW__ALLOWED_HOSTS`.
- **A reverse proxy in front.** Add the domain it serves when it forwards the browser's
  `Host` (nginx: `proxy_set_header Host $host;`, Caddy does by default). A proxy that does
  not forward it sends the name of its upstream instead — `proxy_pass http://mr-review:8000`
  arrives as `mr-review` — so either forward `Host` or allow that name. The standard
  deployment's web container forwards the browser's `Host`.

```yaml
environment:
  MR_REVIEW__ALLOWED_HOSTS: "localhost,192.168.1.10,mr-review.example.com"
```

It takes a comma-separated list or a JSON array; `*.example.com` matches every subdomain,
and `*` switches the check off. The value replaces the default list, but `localhost`,
`127.0.0.1` and `::1` are always accepted, so the container health check keeps working.

## Where data is stored

Everything is files under the data directory, mounted from `DATA_DIR` on the host:

```
hosts.yaml            VCS hosts and their tokens
ai_providers.yaml     AI providers and their API keys
review_presets.yaml   review presets saved from the Brief
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
- Put **nginx or Caddy** in front for HTTPS termination, and let it send HSTS — it knows
  which hosts are HTTPS; the containers send none by default. Leave `MR_REVIEW_BIND` at
  `127.0.0.1` so the proxy is the only way in. There is no authentication in mr-review
  itself, so the port must not be reachable by anyone you would not hand the tokens to.
  Point the proxy at the all-in-one port or at the standard deployment's web port; the
  API needs no separate route. Add the domain the proxy serves to
  `MR_REVIEW__ALLOWED_HOSTS` ([Host names](#host-names)).
- A review is streamed back as Server-Sent Events. The API marks the stream
  `X-Accel-Buffering: no`, which nginx honours, and sends a keep-alive every 15 seconds; a
  proxy that ignores that header must be told not to buffer `text/event-stream`, or the
  comments arrive all at once at the end.
- If the UI and API are served from different origins (`API_BASE_URL` set on the web
  container), set `MR_REVIEW__CORS__ALLOW_ORIGINS` in the compose file to a JSON array of
  allowed origins:

  ```yaml
  environment:
    MR_REVIEW__CORS__ALLOW_ORIGINS: '["https://mr-review.example.com"]'
  ```
