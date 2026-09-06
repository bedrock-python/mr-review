# mr-review for AI agents

> One page holding everything a coding assistant needs to deploy, configure and operate
> mr-review correctly, plus a map of where the rest of the documentation keeps the details
> it leaves out. Give an agent this page rather than the whole site.

| | |
|---|---|
| What it is | A self-hosted merge request review tool: it pulls an MR diff from a VCS host, sends it to an AI model, lets you edit the comments, and posts them back |
| Images | `ghcr.io/bedrock-python/mr-review/all-in-one`, `.../api`, `.../web-app` — each tagged with the exact version and `latest` |
| Compose | `deploy/all-in-one/docker-compose.yml` (one container) · `deploy/standard/docker-compose.yml` (API and UI apart) |
| Requires | Docker with the Compose plugin. No Python, no Node, no database, no accounts |
| Ports | all-in-one `17240 → 8000` · standard API `17241 → 8000`, UI `17242 → 8080` |
| State | one host directory mounted at `/data`: `hosts.yaml`, `ai_providers.yaml`, `reviews/<uuid>.yaml` |
| Env prefix | `MR_REVIEW__`, `__` between levels — `MR_REVIEW__SERVER__PORT` |
| AI providers | `claude` (Anthropic Messages API) · `openai` and `openai_compat` (any OpenAI chat-completions endpoint) |
| VCS hosts | `gitlab`, `github`, `gitea`, `forgejo`, `bitbucket` |
| Source | <https://github.com/bedrock-python/mr-review> |

## How to read this page

Every page of this site is also served as raw Markdown at its own URL with `.md` in place
of the trailing slash — this page is `/agents.md`, the configuration guide is
`/getting-started/configuration.md` — so anything the map below points at can be fetched
as plain text rather than scraped out of HTML. The **Copy page** control at the top of a
page does the same thing for a human with a chat window open.

There is no generated API reference on this site. The HTTP API is described by the running
application: `GET /system/openapi.json` is the schema, `/system/docs` and `/system/redoc`
are the two renderings of it. Everything below was read out of `deploy/`, `.github/` and
`services/mr-review/mr_review/`; where a guide page and the source disagree, the source is
what runs.

Top to bottom before writing a compose file.
[Rules that break a deployment](#rules-that-break-a-deployment) is the section correctness
lives in — those are the things the application will not save you from.

## Scope

**It does** run on one machine as one or two containers, connect to any number of VCS
hosts with a personal access token each, list repositories and open merge requests, fetch
a diff (or an arbitrary two-ref diff), build a prompt out of the diff plus whatever
context you enable, stream a review back from a model, let you edit and dismiss individual
comments, and post the survivors to the merge request as inline notes. It keeps hosts,
providers and review history in YAML files under one directory, and can export and import
that state as a single JSON file with the tokens optionally encrypted under a password.

**It does not** authenticate anyone — there is no login, no user model and no token on any
route. It has no scheduler, no webhook receiver and no CI mode: a review starts because a
person clicked. It runs no model of its own; the diff goes to whatever endpoint the
provider points at. It has no database, no migrations and no multi-process story. It does
not create the access tokens, and it does not merge, approve or close anything.

## Mental model

Four nouns, and each of them is a row in a YAML file under the data directory.

* A **host** is one VCS instance: a name, a `type` (`gitlab`, `github`, `gitea`, `forgejo`,
  `bitbucket`), a `base_url` and a token. Adding one and testing it are two separate calls;
  the test hits the host's "who am I" endpoint and returns username, name and email.
* An **AI provider** is one endpoint: a `type` (`claude`, or `openai` / `openai_compat`,
  which are the same backend), an API key, an optional `base_url`, a list of models, an SSL
  toggle, a timeout and an optional per-provider concurrency cap.
* A **review** binds a host, a `repo_path` and a **source** — either `MRSource(mr_iid=…)`
  or `BranchDiffSource(base_ref=…, head_ref=…)`. A review is created empty.
* An **iteration** is one pass over that source: a `brief_config`, the provider and model it
  was dispatched to, and the comments that came back. A review is a list of them.

The pipeline is the iteration's `stage`, and it only moves forward:

`brief` → `dispatch` → `polish` → `post`

* **brief** — `BriefConfig` decides what goes into the prompt: a preset (`thorough`,
  `security`, `style`, `performance`), the toggles below, and free-text
  `custom_instructions`. `POST /reviews/{id}/prompt` returns the exact prompt as text
  without calling anything.
* **dispatch** — `POST /reviews/{id}/dispatch` streams the model's output back over SSE
  and, when the stream closes, parses it and stores the comments. The provider's fence caps
  how many dispatches to that provider can be in flight at once.
* **polish** — `PATCH /reviews/{id}` edits comment bodies, severities and `status`
  (`kept` / `dismissed`).
* **post** — `POST /reviews/{id}/post` sends every `kept` comment to the merge request,
  five at a time, and marks the iteration completed.

The model is asked for a bare JSON array of `{file, line, severity, body}` objects,
severity being one of `critical`, `major`, `minor`, `suggestion`. If it answers with
anything that is not JSON, the whole raw answer is kept as one `suggestion` comment rather
than thrown away, and `import_response` reports the parse error.

## Wiring

The smallest compose file that runs, and every line in it is load-bearing:

```yaml
services:
  mr-review:
    image: ghcr.io/bedrock-python/mr-review/all-in-one:latest
    ports:
      - "127.0.0.1:17240:8000"          # the app has no auth — do not publish this
    environment:
      MR_REVIEW__DATA_DIR: "/data"      # without it, state lands inside the container
    volumes:
      - ./data:/data                    # and dies with it
```

```bash
docker compose up -d          # then open http://localhost:17240
```

The image already sets `MR_REVIEW__STATIC_DIR=/app/static`, which is what makes it
all-in-one: the same server that answers `/api/v1/...` also serves the built UI, and any
unmatched path falls back to `index.html`. The bind address defaults to `0.0.0.0` and the
port to `8000`, so neither needs setting inside the container.

Everything else — hosts, tokens, providers, models — is added in the UI and written to
`/data`. There are no environment variables for them.

The shipped `deploy/all-in-one/docker-compose.yml` adds `restart: unless-stopped`,
`MR_REVIEW__LOGGING__USE_JSON: "true"`, and `MR_REVIEW__HOST_DATA_DIR`, which is display
only: the UI shows that path instead of the container's, and hides the "open in file
manager" button when it is set.

The standard deployment splits the API and the UI, and pays for it with two settings that
have to agree with each other and with the browser:

```yaml
services:
  api:
    image: ghcr.io/bedrock-python/mr-review/api:latest
    ports: ["127.0.0.1:17241:8000"]
    environment:
      MR_REVIEW__DATA_DIR: "/data"
      MR_REVIEW__CORS__ALLOW_ORIGINS: '["http://localhost:17242"]'   # the UI's origin
    volumes: ["./data:/data"]
  web:
    image: ghcr.io/bedrock-python/mr-review/web-app:latest
    ports: ["127.0.0.1:17242:8080"]
    environment:
      API_BASE_URL: "http://localhost:17241"   # resolved by the browser, not by Docker
```

## The configuration surface

### Application environment variables

Read by pydantic-settings with prefix `MR_REVIEW__`, `__` between nesting levels, case
insensitive, unknown keys ignored. They belong in the compose file's `environment:` block.

| Variable | Default | What it does |
|---|---|---|
| `MR_REVIEW__DATA_DIR` | `~/.mr-review` | Where hosts, providers and reviews are written. Set it to `/data` and mount `/data` |
| `MR_REVIEW__STATIC_DIR` | unset | Serve the built UI from this directory. The all-in-one image sets `/app/static`; leaving it unset is what makes an API-only container |
| `MR_REVIEW__HOST_DATA_DIR` | unset | Display only — the host path the UI shows in place of the container's |
| `MR_REVIEW__VCS_TIMEOUT` | `60.0` | HTTP timeout in seconds for every VCS call |
| `MR_REVIEW__SERVER__HOST` | `0.0.0.0` | Bind address inside the container |
| `MR_REVIEW__SERVER__PORT` | `8000` | Port inside the container |
| `MR_REVIEW__SERVER__WORKERS` | `1` | Leave it at 1 — see rule 4 |
| `MR_REVIEW__SERVER__ACCESS_LOG` | `false` | uvicorn access log |
| `MR_REVIEW__SERVER__PROXY_HEADERS` | `true` | Trust `X-Forwarded-*` |
| `MR_REVIEW__SERVER__FORWARDED_ALLOW_IPS` | `*` | Which proxies are trusted to set them |
| `MR_REVIEW__SERVER__TIMEOUT_KEEP_ALIVE` | `5` | Seconds |
| `MR_REVIEW__SERVER__TIMEOUT_GRACEFUL_SHUTDOWN` | `10` | Seconds |
| `MR_REVIEW__CORS__ALLOW_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | JSON array. The dev defaults — a split deployment must override it |
| `MR_REVIEW__CORS__ALLOW_CREDENTIALS` | `true` | |
| `MR_REVIEW__CORS__ALLOW_METHODS` | `["*"]` | JSON array |
| `MR_REVIEW__CORS__ALLOW_HEADERS` | `["*"]` | JSON array |
| `MR_REVIEW__LOGGING__LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `MR_REVIEW__LOGGING__USE_JSON` | `false` | Both compose files set it to `true` |
| `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` | `4` | In-flight dispatches per provider, unless the provider overrides it |
| `MR_REVIEW__API_BASE_URL` | `""` | All-in-one only, and read straight from the environment rather than from settings: what the served `config.js` tells the browser. Empty means same origin, which is what you want |

### Web-app container environment variables

The UI image is nginx on port 8080 with an entrypoint that writes `config.js` and the nginx
config at start-up. These have no `MR_REVIEW__` prefix.

| Variable | Default | What it does |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8000` | The API URL the **browser** will call |
| `API_URL` | `$API_BASE_URL` | The API origin allowed by the CSP |
| `APP_ENV` | `production` | `production`, `staging` and `pre` also turn on an HSTS header |
| `APP_VERSION` | `unknown` | Shown in the UI |
| `VITE_USE_MOCKS` | `false` | |

### Compose-level variables

Substituted by Docker Compose into the shipped files. These do belong in a `.env` next to
the compose file.

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `17240` | all-in-one — host port mapped to container `8000` |
| `API_PORT` | `17241` | standard — host port for the API |
| `WEB_PORT` | `17242` | standard — host port for the UI |
| `DATA_DIR` | `./data` | both — host path bound to `/data` |

### VCS hosts

`base_url` is the instance's **web** URL. Each provider appends its own API path.

| Type | API base derived from `base_url` | Token |
|---|---|---|
| `gitlab` | `<base_url>/api/v4` | Personal access token, `api` scope |
| `github` | `https://github.com` or empty → `https://api.github.com`; anything else → `<base_url>/api/v3` | Classic token, `repo` scope |
| `gitea`, `forgejo` | `<base_url>/api/v1` | Personal access token |
| `bitbucket` | `base_url` is ignored — always `https://api.bitbucket.org/2.0` | `username:app_password` for Basic auth; a token with no colon is sent as Bearer |

A repo is identified by its `repo_path`. `POST /api/v1/hosts/{id}/repos/add-by-url` accepts
a full URL, a `host/owner/repo` string or a plain `owner/repo` slug, strips a trailing
`.git`, validates it against the host and pins it as a favourite — which is how a public
repository the token is not a member of becomes visible, since GitLab is listed with
`membership=true` and GitHub through the user's own repositories. Only GitLab accepts more
than two path segments.

### AI providers

| Field | Default | Notes |
|---|---|---|
| `type` | — | `claude` uses the Anthropic Messages API; `openai` and `openai_compat` both use the OpenAI chat-completions client |
| `api_key` | — | Stored in the data directory |
| `base_url` | `""` | Ignored by `claude`. Empty means the OpenAI default; set it for Ollama (`http://host.docker.internal:11434/v1`), Groq, LM Studio, a gateway |
| `models` | `[]` | The first entry is the model used when a dispatch names none. With an empty list the fallback is `claude-opus-4-5` or `gpt-4o` |
| `ssl_verify` | `true` | `false` disables verification entirely — for a corporate CA, install it in the system trust store instead, which is what the client already reads |
| `timeout` | `60` | Seconds, for the whole streamed response |
| `max_concurrent` | unset | Per-provider in-flight dispatch cap; unset falls back to `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` |

`GET /api/v1/ai-providers/{id}/models` asks the endpoint itself for its model list.
Per-dispatch, the request may also carry `temperature`, `reasoning_budget` (extended
thinking on Claude, which forces `temperature=1`) and `reasoning_effort` (`low`, `medium`,
`high`, OpenAI reasoning models only).

### HTTP API

Prefix `/api/v1` unless shown otherwise. There is no trailing-slash redirect.

| Route | Method | What it does |
|---|---|---|
| `/system/health/livez`, `/system/health/readyz` | GET | Liveness and readiness. Note the `/system` prefix — not `/health` |
| `/system/openapi.json`, `/system/docs`, `/system/redoc` | GET | The schema and its two renderings |
| `/api/v1/system/info` | GET | Data directory, versions, `deployment_mode` (`all-in-one` or `standard`) |
| `/api/v1/hosts` | GET, POST | List, create |
| `/api/v1/hosts/{id}` | PATCH, DELETE | Update, delete |
| `/api/v1/hosts/{id}/test` | GET | Verify the token against the host |
| `/api/v1/hosts/{id}/repos/add-by-url` | POST | Resolve a URL or slug, verify it, pin it |
| `/api/v1/hosts/{id}/favourite-repos/{repo_path}` | POST | Toggle a pin |
| `/api/v1/hosts/{id}/repos` | GET | List repositories, optional `query` |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs` | GET | Open merge requests |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs/{iid}` | GET | One merge request |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs/{iid}/diff` | GET | Its parsed diff |
| `/api/v1/hosts/{id}/inbox` | GET | Open MRs across the first 20 repositories |
| `/api/v1/reviews` | GET, POST | List, create from an MR |
| `/api/v1/reviews/code` | POST | Create from a `base_ref`/`head_ref` diff |
| `/api/v1/reviews/{id}` | GET, PATCH, DELETE | Read, edit brief and comments, delete |
| `/api/v1/reviews/{id}/iterations` | POST | Start another pass |
| `/api/v1/reviews/{id}/diff`, `/api/v1/reviews/{id}/context` | GET | The diff and the collected context as text |
| `/api/v1/reviews/{id}/prompt` | POST | The exact prompt, without calling the model |
| `/api/v1/reviews/{id}/dispatch` | POST | Run the review, streamed as SSE |
| `/api/v1/reviews/{id}/import-response` | POST | Paste a model's answer in by hand |
| `/api/v1/reviews/{id}/post` | POST | Post `kept` comments to the merge request |
| `/api/v1/data/export`, `/api/v1/data/import` | POST | The whole store as one JSON file |

### What goes into the prompt

The `BriefConfig` fields, with the caps the collectors enforce:

| Field | Default | Cost |
|---|---|---|
| `preset` | `thorough` | also `security`, `style`, `performance` |
| `include_diff` | `true` | the diff itself |
| `include_description` | `true` | title and description |
| `include_context` | `true` | the files named in `context_files`, at most 20 |
| `include_full_files` | `false` | whole contents of the first 15 changed files, 50 000 characters each |
| `include_test_context` | `false` | test files found beside the changed ones, at most 20 |
| `include_related_code` | `false` | files the changed ones import, at most 20 |
| `include_commit_history` | `false` | the last 8 commits touching each of the first 50 changed files |
| `custom_instructions` | `""` | appended verbatim |

Context fetches run five at a time with a pause between batches, to stay under host rate
limits. Every one of them is an API call against the VCS host, so the optional toggles cost
wall-clock time before the model is called at all.

## Rules that break a deployment

1. **There is no authentication.** Not one route requires a credential. Anyone who can
   reach the port can read every host token and every API key through
   `POST /api/v1/data/export`, and can post comments to your repositories under your token.
   Bind the published port to `127.0.0.1`, or put an authenticating proxy in front. Never
   expose it to a network you do not control.
2. **Set `MR_REVIEW__DATA_DIR` and mount it.** The default is `~/.mr-review`, which inside
   a container is neither a volume nor reliably writable — the state goes when the
   container is recreated, if it can be written at all.
3. **The data directory is a secret.** Host tokens and provider API keys are stored in
   plain text in `hosts.yaml` and `ai_providers.yaml`. The password on export/import
   encrypts the export file, not the store.
4. **Run one worker.** `MR_REVIEW__SERVER__WORKERS` above 1 gives each process its own VCS
   cache and its own AI concurrency fence, so the cap becomes workers × cap, and the YAML
   store gets concurrent writers with no lock between them.
5. **A provider's concurrency cap is fixed at first use.** The semaphore is created on the
   first dispatch to that provider and kept for the life of the process; changing
   `max_concurrent` afterwards takes effect on restart.
6. **`MR_REVIEW__*` in a compose `.env` does nothing on its own.** Compose reads `.env` to
   substitute `${...}` in the compose file; it does not pass those names into the container.
   The shipped compose files substitute only `PORT`, `API_PORT`, `WEB_PORT` and `DATA_DIR`.
   To change an application setting, add it to the `environment:` block or point
   `env_file:` at the file.
7. **`API_BASE_URL` is resolved by the browser.** The web container writes it verbatim into
   `config.js`. `http://api:8000` resolves inside the Docker network and nowhere else; it
   must be a URL the user's browser can reach. In all-in-one mode leave
   `MR_REVIEW__API_BASE_URL` empty so the UI calls its own origin.
8. **Split the API and the UI and you own CORS.** The default `allow_origins` is the two
   dev-server ports. Change `WEB_PORT`, or serve the UI from a hostname,
   and `MR_REVIEW__CORS__ALLOW_ORIGINS` has to be changed to match or every request fails
   in the browser and succeeds in `curl`.
9. **The all-in-one image is `linux/amd64` only.** The `api` and `web-app` images are built
   for `amd64` and `arm64`; the combined one is not. On Apple Silicon it runs emulated —
   use the standard deployment if that matters.
10. **`base_url` is the web URL, not the API URL.** GitHub Enterprise gets `/api/v3`
    appended for you, GitLab `/api/v4`, Gitea and Forgejo `/api/v1`. Only the GitHub
    provider notices that its suffix is already there; give GitLab, Gitea or Forgejo an API
    URL and the suffix is appended a second time.
11. **Bitbucket is Bitbucket Cloud.** `base_url` is ignored, and the token field must hold
    `username:app_password` — a value with no colon is sent as a Bearer token instead.
12. **Only GitLab has nested groups.** For the other host types a repo path must be exactly
    `owner/repo`; anything deeper is rejected before a request is made.
13. **A branch-diff review cannot be posted.** `POST /reviews/{id}/post` answers 409 for a
    review whose source kind is `branch_diff` — there is no merge request to comment on.
14. **Re-dispatching an iteration discards its comments.** Dispatch clears the iteration's
    comments before streaming. An iteration that is completed, or already in `post`, refuses
    to be re-dispatched at all — start a new iteration instead.
15. **Only `kept` comments are posted**, and posting completes the iteration. An inline
    comment the host rejects is retried as a general note unless
    `fallback_to_general_note` is `false`.
16. **Local storage is not local inference.** The diff, whatever context you enabled and
    your custom instructions go to whatever endpoint the provider names. Only a provider
    pointed at a model on your own machine keeps the code on it.
17. **Pin the tag on a server.** `latest` moves whenever a release is published;
    `docker compose pull` will then change the application under you.
18. **Health checks live under `/system`.** `livez` and `readyz` are
    `/system/health/livez` and `/system/health/readyz`. A probe on `/health` is answered by
    the SPA fallback in the all-in-one image, so it returns 200 whatever the state of the
    application, and 404s in the API-only image.

## Common mistakes

```yaml
# WRONG — reachable by anyone who can route to the host, with no login in front of it
ports:
  - "8000:8000"

# RIGHT — loopback only, or a proxy that authenticates
ports:
  - "127.0.0.1:17240:8000"
```

```yaml
# WRONG — the app never sees these; .env only feeds ${...} substitution
# .env
MR_REVIEW__LOGGING__LEVEL=DEBUG
MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT=1

# RIGHT — in the compose file's environment block
environment:
  MR_REVIEW__LOGGING__LEVEL: "DEBUG"
  MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT: "1"
```

```yaml
# WRONG — a service name the browser cannot resolve
web:
  environment:
    API_BASE_URL: "http://api:8000"

# RIGHT — the URL the user's browser will use, and the API told to accept that origin
web:
  environment:
    API_BASE_URL: "https://mr-review.example.com/api"
api:
  environment:
    MR_REVIEW__CORS__ALLOW_ORIGINS: '["https://mr-review.example.com"]'
```

```yaml
# WRONG — state written inside the container, gone on the next pull
services:
  mr-review:
    image: ghcr.io/bedrock-python/mr-review/all-in-one:latest
    ports: ["127.0.0.1:17240:8000"]

# RIGHT
services:
  mr-review:
    image: ghcr.io/bedrock-python/mr-review/all-in-one:0.2.1
    ports: ["127.0.0.1:17240:8000"]
    environment:
      MR_REVIEW__DATA_DIR: "/data"
    volumes: ["/opt/mr-review/data:/data"]
```

```text
# WRONG — a GitLab host given its API URL, which becomes .../api/v4/api/v4/...
base_url: https://gitlab.example.com/api/v4
# WRONG — Ollama on the host, addressed as if the container were the host
base_url: http://localhost:11434/v1

# RIGHT
base_url: https://gitlab.example.com
base_url: http://host.docker.internal:11434/v1
```

## What failure looks like

The API answers with a status and a `detail` string; the UI shows it as-is.

| Status | When |
|---|---|
| 400 | `Repo path must include at least 'owner/repo'`, or a host type given a nested path |
| 401 | `VCS authentication failed — check your token` — the host rejected the token |
| 403 | `Host token cannot access repository` — the token is valid but not entitled |
| 404 | A host, review or iteration id that does not exist, or a repository the host does not have |
| 409 | Posting a review whose source is a branch diff |
| 502 | `VCS request failed (<status>)` or `Failed to post comments` — the host answered, badly |

Two failures do not surface as a status code:

* **The dispatch stream fails mid-flight.** SSE has already answered 200, so the error
  arrives as an `event: error` frame on the stream. Whatever text arrived before it is
  still parsed and saved.
* **The model did not answer with JSON.** The raw answer is stored as a single
  `suggestion` comment with no file or line, and `import-response` returns it in
  `json_error`. Nothing is lost, but nothing is anchored either.

A review file that cannot be parsed is skipped with a warning and does not appear in the
list — the rest of the store keeps working.

## Documentation map

Fetch a page when the task is the one named beside it.

| Page | Read it when |
|---|---|
| [Home](index.md) | a one-screen description of what the tool is for |
| [Installation](getting-started/installation.md) | picking all-in-one or standard, the `docker run` one-liner, updating, data persistence |
| [Quick start](getting-started/quickstart.md) | adding the first provider and host through the UI |
| [Configuration](getting-started/configuration.md) | the environment variables as a user meets them, reverse proxy and TLS notes |
| [Review pipeline](features/pipeline.md) | what each stage does from the UI's side |
| [VCS hosts](features/hosts.md) | creating a token with the right scope, verifying a connection |
| [AI providers](features/ai-providers.md) | choosing a model, pointing at Ollama or another compatible endpoint |
| [Roadmap](ROADMAP.md) | what is planned and what is deliberately not — in Russian |
| [Inline fix suggestions](specs/inline-fix-suggestions.md) | the design of the patch-suggestion feature — in Russian |
| [vitest and expect-type](troubleshooting/vitest-expect-type.md) | the frontend test suite refuses to start |
| [Changelog](changelog.md) | what changed between versions |
