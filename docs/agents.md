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
| Ports | all-in-one `17240 → 8000` · standard UI `17242 → 8080` (proxies `/api/` to the API), API `17241 → 8000` — all published on `127.0.0.1` |
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
* **dispatch** — `POST /reviews/{id}/dispatch` streams the model's output back over SSE,
  announces each comment as soon as its JSON object is complete, and, when the stream
  closes, parses the whole answer and stores its comments with the raw answer on the
  iteration — unless the answer is unusable, see rule 14. The provider's fence caps how
  many dispatches to that provider can be in flight at once.
* **polish** — `PATCH /reviews/{id}` edits comment bodies, severities, `status`
  (`kept` / `dismissed`) and the anchor: `file` and `line` count only when present, and an
  explicit `"file": null` turns the comment into a general note. `POST` and `DELETE` on
  `/reviews/{id}/iterations/{iteration_id}/comments` add a hand-written comment or remove
  one.
* **post** — `POST /reviews/{id}/post` sends every `kept` comment to the merge request,
  five at a time, and marks the iteration completed.

The model is asked for a bare JSON array of `{file, line, severity, body}` objects,
severity being one of `critical`, `major`, `minor`, `suggestion` — or, with structured output
on, is constrained to the object `{"comments": [...]}` holding them, through Claude's
`output_config.format` or OpenAI's strict `response_format: json_schema`. An endpoint that
rejects structured output fails the dispatch with a hint to turn it off; it is not retried
without. The parser does not rely on any of that: it drops `<think>` reasoning blocks, finds the JSON inside markdown fences or
prose, accepts a wrapper object (`{"comments": [...]}`, also `review`, `issues`,
`findings`, `items` — every such key is read), a single comment object or one object per
line, merges comments split across several fences or arrays, repairs trailing commas,
comments, smart or single quotes, bare keys and raw newlines, and keeps every complete
comment of an answer that was cut off at the token limit. The answer proper — the fences,
or the JSON the answer opens with — always wins over JSON quoted in prose, so an echoed
format example never becomes a comment and a fenced `[]` means "no findings". Common key
aliases (`path`, `line_number`, `message`, `level`, …) and severity synonyms (`blocker`,
`high`, `warning`, `nit`, …) are mapped — a negated one such as `non-blocking` reads as
`minor` — and a line reference such as `"L42"` or `"12-15"` becomes its first number.
Parsing takes linear time whatever the answer holds. The raw answer the iteration's
comments came from stays on it (up to 512 000 characters; a longer one keeps its head and
tail): `GET .../iterations/{iteration_id}/raw-response` returns it as text and
`POST .../iterations/{iteration_id}/reparse` parses it again into fresh comments.

The dispatch stream sends these SSE events, every `data` line being single-line JSON:

| Event | `data` |
|---|---|
| `chunk` | the next piece of model text, as a JSON string |
| `comment` | `{index, file, line, severity, body}` — a comment that just completed; a preview without an id |
| `done` | `{iteration_id, comments, errors, json_error, truncated, kept_previous}` — once, after the iteration is written |
| `error` | `{message}` — the stream ends here and no `done` follows |

`: ping` comment lines may appear in between. `comments` counts what the iteration holds
now. `truncated` is `true` when the provider reports that it stopped at the output limit or the
context window (Claude `max_tokens` / `model_context_window_exceeded`, OpenAI
`finish_reason: length`), or when the answer stops inside the JSON it consists of or inside a
reasoning block. `kept_previous` is `true` when the answer was not used (rule 14): the comments
counted are the ones the iteration already had, and the answer exists only in the streamed
`chunk` text. A refusal — Claude's `stop_reason: refusal`, OpenAI's `refusal` under structured
output, or an endpoint's content filter — ends the stream with `error` instead, saying so, and
is settled like any other failed run.

## Wiring

The smallest compose file that runs, and every line in it is load-bearing:

```yaml
services:
  mr-review:
    image: ghcr.io/bedrock-python/mr-review/all-in-one:latest
    ports:
      - "127.0.0.1:17240:8000"          # the app has no auth — do not publish this
    volumes:
      - ./data:/data                    # the image keeps all state in /data
```

```bash
docker compose up -d          # then open http://localhost:17240
```

The image already sets `MR_REVIEW__STATIC_DIR=/app/static`, which is what makes it
all-in-one: the same server that answers `/api/v1/...` also serves the built UI, and any
unmatched path falls back to `index.html`. It also sets `MR_REVIEW__DATA_DIR=/data`; tags
built before that default existed keep state in `~/.mr-review` inside the container, so a
pinned older tag needs `MR_REVIEW__DATA_DIR: "/data"` as well — the shipped compose files
always set it. The bind address defaults to `0.0.0.0` and the port to `8000`, so neither
needs setting inside the container; who can reach it is decided by the published port.

The container starts as root, gives `/data` to `PUID:PGID` (`1000:1000` by default) and
runs the application as that user, so a bind-mount directory Docker created as root on
Linux still works — see rule 19.

Everything else — hosts, tokens, providers, models — is added in the UI and written to
`/data`. There are no environment variables for them.

The shipped `deploy/all-in-one/docker-compose.yml` adds `restart: unless-stopped`,
`MR_REVIEW__LOGGING__USE_JSON: "true"`, `PUID`/`PGID`, the `MR_REVIEW_BIND` switch for the
published address, and `MR_REVIEW__HOST_DATA_DIR`, which is display only: the UI shows that
path instead of the container's, and hides the "open in file manager" button when it is
set.

The standard deployment splits the API and the UI. The web container's nginx serves the UI
and forwards every `/api/` request to the API container, so the browser sees one origin —
no CORS, no API URL for the browser to resolve, and the UI works under any hostname:

```yaml
services:
  api:
    image: ghcr.io/bedrock-python/mr-review/api:latest
    volumes: ["./data:/data"]
  web:
    image: ghcr.io/bedrock-python/mr-review/web-app:latest
    ports: ["127.0.0.1:17242:8080"]
    environment:
      API_UPSTREAM: "http://api:8000"   # the default: the api service, resolved on the compose network
    depends_on: [api]
```

The shipped `deploy/standard/docker-compose.yml` also publishes the API itself on
`127.0.0.1:17241`, for scripts and `/system/docs`; the UI does not use it.

## The configuration surface

### Application environment variables

Read by pydantic-settings with prefix `MR_REVIEW__`, `__` between nesting levels, case
insensitive, unknown keys ignored. They belong in the compose file's `environment:` block.

| Variable | Default | What it does |
|---|---|---|
| `MR_REVIEW__DATA_DIR` | `/data` in the images, `~/.mr-review` outside them | Where hosts, providers and reviews are written. Mount `/data` |
| `MR_REVIEW__STATIC_DIR` | unset | Serve the built UI from this directory. The all-in-one image sets `/app/static`; leaving it unset is what makes an API-only container |
| `MR_REVIEW__HOST_DATA_DIR` | unset | Display only — the host path the UI shows in place of the container's |
| `MR_REVIEW__VCS_TIMEOUT` | `60.0` | HTTP timeout in seconds for every VCS call |
| `MR_REVIEW__SERVER__HOST` | `0.0.0.0` | Bind address inside the container. Leave it; limit exposure with the published port instead |
| `MR_REVIEW__SERVER__PORT` | `8000` | Port inside the container |
| `MR_REVIEW__SERVER__WORKERS` | `1` | Leave it at 1 — see rule 4 |
| `MR_REVIEW__SERVER__ACCESS_LOG` | `false` | uvicorn access log |
| `MR_REVIEW__SERVER__PROXY_HEADERS` | `true` | Trust `X-Forwarded-*` |
| `MR_REVIEW__SERVER__FORWARDED_ALLOW_IPS` | `*` | Which proxies are trusted to set them |
| `MR_REVIEW__SERVER__TIMEOUT_KEEP_ALIVE` | `5` | Seconds |
| `MR_REVIEW__SERVER__TIMEOUT_GRACEFUL_SHUTDOWN` | `10` | Seconds |
| `MR_REVIEW__CORS__ALLOW_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | JSON array. The dev defaults. Both shipped deployments are same-origin and never need it; only an `API_BASE_URL` on another origin does |
| `MR_REVIEW__CORS__ALLOW_CREDENTIALS` | `true` | |
| `MR_REVIEW__CORS__ALLOW_METHODS` | `["*"]` | JSON array |
| `MR_REVIEW__CORS__ALLOW_HEADERS` | `["*"]` | JSON array |
| `MR_REVIEW__LOGGING__LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `MR_REVIEW__LOGGING__USE_JSON` | `false` | Both compose files set it to `true` |
| `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` | `4` | In-flight dispatches per provider, unless the provider overrides it |
| `MR_REVIEW__API_BASE_URL` | `""` | All-in-one only, and read straight from the environment rather than from settings: what the served `config.js` tells the browser. Empty means same origin, which is what you want |

### API and all-in-one container entrypoint

Read by the entrypoint of the `api` and `all-in-one` images before the application starts.

| Variable | Default | What it does |
|---|---|---|
| `PUID` | `1000` | User the application runs as. Started as root, the entrypoint gives the data directory to `PUID:PGID` and drops to that user |
| `PGID` | `1000` | Its group |

Started as a non-root user instead (`user:`, `--user`, `runAsUser`), the entrypoint ignores
both, changes no ownership, and exits with a message if any file or directory in the data
directory (`lost+found` aside) is not readable and writable by that user. Whatever the
application writes there is created mode `600`.

Starting as root needs the `CHOWN`, `SETUID` and `SETGID` capabilities, which Docker grants
by default. With `cap_drop: [ALL]`, add those three back with `cap_add`, or set `user:`.
Without `SETUID`/`SETGID` the container exits with a message instead of running the
application as root; without only `CHOWN` it skips the ownership fix.

### Web-app container environment variables

The UI image is nginx on port 8080 with an entrypoint that writes `config.js` and the nginx
config at start-up. These have no `MR_REVIEW__` prefix.

| Variable | Default | What it does |
|---|---|---|
| `API_UPSTREAM` | `http://api:8000` | Where nginx forwards `/api/`. Resolved inside the container network per request, so the API may start later or move. `scheme://host:port`, no path |
| `API_BASE_URL` | `""` | Where the **browser** sends API calls. Empty is the UI's own origin, through `API_UPSTREAM`. An origin, without `/api` — the UI appends `/api/v1/...` |
| `API_URL` | the origin of `API_BASE_URL` | Extra origin allowed by the CSP `connect-src`; empty when `API_BASE_URL` is |
| `NGINX_RESOLVER` | the container's nameservers | DNS server nginx resolves `API_UPSTREAM` through — Docker's `127.0.0.11` on a compose network |
| `HSTS_MAX_AGE` | `""` | Seconds for a `Strict-Transport-Security` header; empty sends none. HSTS belongs to the proxy that terminates TLS |
| `HSTS_INCLUDE_SUBDOMAINS` | `false` | `true` adds `includeSubDomains` to it |
| `APP_ENV` | `production` | Written into `config.js` for the UI. It no longer turns on HSTS |
| `APP_VERSION` | `unknown` | Shown in the UI |
| `VITE_USE_MOCKS` | `false` | |

### Compose-level variables

Substituted by Docker Compose into the shipped files. These do belong in a `.env` next to
the compose file.

| Variable | Default | Used by |
|---|---|---|
| `MR_REVIEW_BIND` | `127.0.0.1` | both — host address every port is published on. `0.0.0.0` exposes it to the network; see rule 1 |
| `PORT` | `17240` | all-in-one — host port mapped to container `8000` |
| `WEB_PORT` | `17242` | standard — host port for the UI, which also carries the API under `/api/` |
| `API_PORT` | `17241` | standard — host port for the API itself |
| `DATA_DIR` | `./data` | both — host path bound to `/data` |
| `PUID` / `PGID` | `1000` / `1000` | both — passed to the API container's entrypoint |

### VCS hosts

`base_url` is the instance's **web** URL. Each provider appends its own API path.

| Type | API base derived from `base_url` | Token |
|---|---|---|
| `gitlab` | `<base_url>/api/v4` | Personal access token, `api` scope |
| `github` | `github.com`, `www.github.com`, `api.github.com` (any path) or empty → `https://api.github.com`; anything else → `<base_url>/api/v3` | Classic token, `repo` scope |
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
| `base_url` | `""` | Empty means the backend's default endpoint. For `claude`, a gateway in front of Anthropic (LiteLLM, a proxy); for the OpenAI types, Ollama (`http://host.docker.internal:11434/v1`), Groq, LM Studio, a gateway |
| `models` | `[]` | The first entry is the model used when a dispatch names none. There is no built-in fallback: with an empty list such a dispatch answers 422 |
| `ssl_verify` | `true` | `false` disables verification entirely — for a corporate CA, install it in the system trust store instead, which is what the client already reads |
| `timeout` | `60` | Seconds the client waits on the endpoint — to connect, and between pieces of the streamed answer |
| `max_concurrent` | unset | Per-provider in-flight dispatch cap; unset falls back to `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` |

`GET /api/v1/ai-providers/{id}/models` asks the endpoint itself for its model list with the
saved settings; `POST /api/v1/ai-providers/preview/models` does the same with settings that are
not saved yet (`provider_id` fills in what is left out, a blank `api_key` keeps the saved key —
for the saved base URL and type only; a changed endpoint without a key answers 422) —
it is what the settings form's "Fetch models" calls. An endpoint that rejects the key answers
401, one that times out 504, anything else upstream 502, each with the endpoint's message.

A dispatch may also carry, all optional: `model`, `temperature` (0–2), `reasoning_effort`
(`none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`), `reasoning_budget` (thinking
tokens), `max_output_tokens` (256–128 000, thinking included), `structured_output` (`null`:
off for unknown OpenAI ids and whenever `base_url` is not the vendor's own API, otherwise
on for `claude` and `openai` models that support it, off for `openai_compat`) and
`system_prompt` (replaces the built-in one). Before the call each setting is fitted to the
model, because a rejected parameter fails the whole request with a 400:

* current Claude models (Opus 4.6+, Sonnet 4.6+, Fable, Mythos, and any Claude id the table
  does not know) get adaptive thinking with `output_config.effort`; only the models before 4.6
  get a `budget_tokens` thinking budget, kept at least 4 096 tokens below `max_tokens`;
* an effort level the model lacks becomes the nearest one below it; a budget becomes an effort
  on effort-only models and the other way round;
* `temperature` goes only to models that take it (none from Opus 4.7 / Sonnet 5 on, no OpenAI
  reasoning model), only while reasoning is off, capped at 1 on Claude;
* the output limit is capped at the model's maximum; unset, Claude gets 32 000 tokens (64 000
  at `xhigh`/`max`, budget + 16 000 with a budget), the OpenAI types the endpoint's default. It
  is sent as `max_tokens` to Claude and to `openai_compat`, as `max_completion_tokens` to OpenAI.

`GET /api/v1/ai-providers/{id}/capabilities?model=…` returns what a model accepts — thinking
(`always`, `optional`, `none`), reasoning modes, effort levels, whether it takes a temperature,
its output cap, structured output support and default — decided from the id, without calling
the provider. The full table is in [AI providers](features/ai-providers.md#dispatch-settings).

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
| `/api/v1/hosts/{id}/cache/invalidate` | POST | Forget cached VCS responses: the whole host, or with `repo_path` only that repository's MRs, diffs, files, directories and commits, plus the personal inbox scopes (`authored`, `assigned`, `review_requested`) that list its MRs. 204 |
| `/api/v1/hosts/{id}/repos` | GET | One page of repositories, most recently active first — `q`, `page`, `per_page` (default 50) |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs` | GET | One page of merge requests, most recently updated first — `state` (`opened` by default, `merged`, `closed`, `all`), `q` (title), `page`, `per_page` (default 30) |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs/{iid}` | GET | One merge request |
| `/api/v1/hosts/{id}/repos/{repo_path}/mrs/{iid}/diff` | GET | Its parsed diff |
| `/api/v1/hosts/{id}/inbox` | GET | One page of open MRs — `scope` (`all` by default, `authored`, `assigned`, `review_requested`), `page`, `per_page` (default 30) |
| `/api/v1/ai-providers` | GET, POST | List, create |
| `/api/v1/ai-providers/{id}` | PATCH, DELETE | Update, delete |
| `/api/v1/ai-providers/{id}/models` | GET | The endpoint's model list, with the saved settings |
| `/api/v1/ai-providers/preview/models` | POST | The same with unsaved settings — the settings form's "Fetch models" |
| `/api/v1/ai-providers/{id}/capabilities` | GET | What `model` (default: the provider's first) accepts in a dispatch |
| `/api/v1/reviews` | GET, POST | List, create from an MR |
| `/api/v1/reviews/code` | POST | Create from a `base_ref`/`head_ref` diff |
| `/api/v1/reviews/{id}` | GET, PATCH, DELETE | Read, edit brief and comments, delete |
| `/api/v1/reviews/{id}/iterations` | POST | Start another pass |
| `/api/v1/reviews/{id}/diff`, `/api/v1/reviews/{id}/context` | GET | The diff and the collected context as text |
| `/api/v1/reviews/{id}/prompt` | POST | The exact prompt, without calling the model |
| `/api/v1/reviews/{id}/dispatch` | POST | Run the review, streamed as SSE (`chunk`, `comment`, `done` or `error`); 409 once posted |
| `/api/v1/reviews/{id}/import-response` | POST | Paste a model's answer in by hand |
| `/api/v1/reviews/{id}/iterations/{iteration_id}/raw-response` | GET | The stored model answer as text; 404 if none |
| `/api/v1/reviews/{id}/iterations/{iteration_id}/reparse` | POST | Parse the stored answer again, replacing the comments; 409 once posted |
| `/api/v1/reviews/{id}/post` | POST | Post `kept` comments to the merge request |
| `/api/v1/reviews/{id}/iterations/{iteration_id}/comments` | POST | Add a comment (`file`, `line`, `severity`, `body`); the server assigns the id and answers 201 with the review |
| `/api/v1/reviews/{id}/iterations/{iteration_id}/comments/{comment_id}` | DELETE | Remove one comment and return the review |
| `/api/v1/data/export`, `/api/v1/data/import` | POST | The whole store as one JSON file |

### Pagination

The three list routes above answer one page at a time, and every page costs a single request to
the host (the `all` inbox scope costs one per repository in its batch, see below) — nothing is
fetched ahead.

```json
{"items": [...], "page": 1, "per_page": 50, "has_more": true}
```

* `page` is 1-based; `per_page` is 1–100. Anything outside those bounds, an unknown `state` or an
  unknown `scope` is a 422 before the host is called.
* `has_more` is the host's own next-page signal — GitHub's `Link: rel="next"`, GitLab's
  `X-Next-Page`, Gitea's `X-HasMore` or `Link`, Bitbucket's `next` — and only when a host sends
  none of them, "the page came back full". Keep paging while it is `true`: a page can be shorter
  than `per_page`, even empty, and still have more after it.
* Hosts cap the page size on their side — Gitea at its `MAX_RESPONSE_ITEMS` (50 by default),
  Bitbucket at 50 pull requests or 100 repositories — so a larger `per_page` gives shorter pages,
  never skipped items.
* In MR listings `additions`, `deletions` and `file_count` are `null` when the host does not
  report them in that view (GitHub, GitLab and Bitbucket lists never do). The single-MR route fills
  what the host provides — GitLab only ever reports `file_count`. GitLab's list items also leave
  `pipeline` `null`.

Repositories: pinned favourites the host's listing does not return are fetched and put in front of
page 1 (filtered by `q` when one is given), and left out of later pages, so each appears once.
On GitHub, `q` goes through repository search scoped to the token's user and the organisations
listed by `/user/orgs` (`user:<login> org:<org> …`), not all of GitHub. A token that may not list
organisations searches the user's own repositories only; repositories the user merely collaborates
on in someone else's account are not searched. On Gitea and Forgejo the listing (and so the `all`
inbox) covers the repositories the token's user owns or contributes to (`uid=<their id>`), not every
repository the instance shows — which on Codeberg would be all of it.

Merge requests per host:

| Host | `opened` / `all` | `merged` / `closed` | `q` |
|---|---|---|---|
| GitLab | merge request listing | same, by state | host-side title search |
| GitHub | pulls API | issue search (`is:merged`; `is:closed is:unmerged`) | issue search, `in:title` |
| Gitea, Forgejo | pulls API | pulls API `closed`, split per item | issue search (`/issues?type=pulls&q=`): titles, bodies and comments, in Gitea's order |
| Bitbucket | pull request listing | same (`closed` is `DECLINED` + `SUPERSEDED`) | host-side title search |

GitHub's issue search returns no branch names, so those items have empty `source_branch` and
`target_branch`, and it allows 30 requests a minute per user. Gitea's issue search has no branch
names either. Gitea has no merged filter on any endpoint, so its merged/closed split is made on each
fetched page — the one case where pages can come back short, or empty, while more remain.

The inbox (all scopes list open MRs only, newest update first within a page):

| Scope | GitLab | GitHub | Gitea, Forgejo | Bitbucket |
|---|---|---|---|---|
| `authored` | `scope=created_by_me` | `author:@me` | `created=true` | `/pullrequests/{user}` |
| `assigned` | `scope=assigned_to_me` | `assignee:@me` | `assigned=true` | always empty — no assignees |
| `review_requested` | `reviewer_username=<you>` | `review-requested:@me` | `review_requested=true` | always empty — no such listing |

`authored`, `assigned` and `review_requested` are each one host request per page. GitHub and Gitea
answer them from issue search, so those items have no branch names either. `all` walks the
repositories the token sees, most recently active first: page N takes the N-th batch of 10
repositories and the newest `min(per_page, 10)` open MRs of each (five repositories at a time), merged
newest-first; `has_more` means more repositories remain. Pinned favourites join page 1. A
repository whose MRs cannot be fetched is skipped with a warning rather than failing the page.
The inbox envelope has one more key, `truncated_repos`: the repositories on that page that had more
open MRs than it took — their own MR list has the rest. It is always `[]` for the personal scopes.
Order is newest-first within a page only; a later page can hold a more recently updated MR.

```json
{"items": [...], "page": 1, "per_page": 30, "has_more": true, "truncated_repos": ["group/busy-repo"]}
```

### VCS connections and caching

Every VCS call goes through one pooled HTTP client that lives as long as the process, with
keep-alive connections reused across requests and hosts; `MR_REVIEW__VCS_TIMEOUT` is its timeout.
Read-only responses are cached in memory per host: repository list pages for 15 minutes, everything
else — repository searches, MR pages, single MRs, diffs, files — for 5 minutes, in bounded
least-recently-used stores. Diffs, trees and file bodies are also capped by size, about 128 MB per
host; a single response larger than that is served but not kept.

Lists are sorted by activity, so a push moves an item from a later page to page 1, and pages fetched
at different times can each miss it. A later page is therefore only cached together with the page 1
it was fetched with — within 10 seconds of it, and only if none of page 1's items turn up on it again
(which is what a move to the top looks like). Otherwise the cached page 1 is dropped, so the next
load of the list starts from a fresh one.

Concurrent identical requests share one call to the host, and errors are never cached. Editing or
deleting a host drops its cache, and `POST /api/v1/hosts/{id}/cache/invalidate` drops it on demand
— for one repository with `?repo_path=`, which is what to call after a push the cache has not seen
yet. GitHub and Gitea can only list a directory by returning the repository's whole tree, so that
tree is fetched once per repository and commit and every directory the context collectors ask for is
answered from it. Gitea hands the tree out 1000 entries a page; up to 100 pages are read.

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

For a merge request, files are read at its head commit, which the target repository has even
when the MR comes from a fork or its source branch has been deleted. The branch name is used only
when the host does not report the commit.

## Rules that break a deployment

1. **There is no authentication.** Not one route requires a credential. Anyone who can
   reach the port can read every host token and every API key through
   `POST /api/v1/data/export`, and can post comments to your repositories under your token.
   Bind the published port to `127.0.0.1` — the shipped compose files do, unless
   `MR_REVIEW_BIND` says otherwise — or put an authenticating proxy in front. Never
   expose it to a network you do not control.
2. **Mount `/data`.** The images keep all state there (`MR_REVIEW__DATA_DIR=/data`);
   without a volume it goes when the container is recreated. Older tags default to
   `~/.mr-review` instead — set `MR_REVIEW__DATA_DIR` explicitly when pinning one.
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
   The shipped compose files substitute only `MR_REVIEW_BIND`, `PORT`, `API_PORT`,
   `WEB_PORT`, `DATA_DIR`, `PUID` and `PGID`.
   To change an application setting, add it to the `environment:` block or point
   `env_file:` at the file.
7. **Leave `API_BASE_URL` empty.** The UI then calls its own origin and the web
   container's nginx forwards `/api/` to `API_UPSTREAM`, which is resolved inside the
   Docker network. `API_BASE_URL` is the opposite: written verbatim into `config.js` and
   resolved by the browser, so `http://api:8000` there resolves nowhere the user is. It is
   an origin — the UI appends `/api/v1/...` — and it is only for an API served from
   another origin. In all-in-one mode leave `MR_REVIEW__API_BASE_URL` empty for the same
   reason.
8. **Point the UI at another origin and you own CORS.** With `API_BASE_URL` set, the API's
   default `allow_origins` (the two dev-server ports) rejects the UI, and
   `MR_REVIEW__CORS__ALLOW_ORIGINS` has to list the UI's origin or every request fails in
   the browser and succeeds in `curl`. Neither shipped deployment needs it.
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
14. **Only a complete, readable answer replaces comments.** Re-dispatching keeps the
    iteration's comments until the new answer is stored, and replaces them only when the
    stream finished and the answer parsed in full — `[]` included, as "no findings". An
    answer that is unreadable, empty or cut off at the token limit, and a dispatch that
    fails or whose client disconnects, leave the comments, stage, provider and raw answer as
    they were (`done` says `kept_previous`). Only an iteration without comments takes such
    an answer: its complete comments, or, for an unreadable answer, the text as one general
    comment. An iteration that is completed, or already in `post`, refuses to be
    re-dispatched or re-parsed at all — start a new iteration instead.
15. **Only `kept` comments are posted**, and posting completes the iteration. An inline
    comment the host rejects is retried as a general note unless
    `fallback_to_general_note` is `false`. After that the iteration's comment list is
    frozen: adding or deleting a comment answers 409, though `PATCH` still edits them.
16. **Local storage is not local inference.** The diff, whatever context you enabled and
    your custom instructions go to whatever endpoint the provider names. Only a provider
    pointed at a model on your own machine keeps the code on it.
17. **Pin the tag on a server.** `latest` moves whenever a release is published;
    `docker compose pull` will then change the application under you.
18. **Health checks live under `/system`.** `livez` and `readyz` are
    `/system/health/livez` and `/system/health/readyz`. A probe on `/health` is answered by
    the SPA fallback in the all-in-one image, so it returns 200 whatever the state of the
    application, and 404s in the API-only image.
19. **The API containers start as root and drop to `PUID:PGID`.** That is how a
    root-owned bind mount becomes writable, and it needs the `CHOWN`, `SETUID` and
    `SETGID` capabilities: a compose file with `cap_drop: [ALL]` must `cap_add` those
    three or set `user:`, or the container exits at start. With `user:` everything in the
    data directory must already belong to that user — the container exits with a `chown`
    hint if it does not. `PUID=0` keeps the application running as root: do not, except
    under rootless Docker or Podman, where container root is the invoking user on the
    host and `PUID=0`/`PGID=0` is what keeps the files owned by that user.
20. **`API_UPSTREAM` must resolve as written.** nginx looks it up per request through
    `NGINX_RESOLVER` and applies no `resolv.conf` search domains: a compose service name
    works, a Kubernetes short name does not — use
    `http://<service>.<namespace>.svc.cluster.local:8000` there.

## Upgrading from earlier images

What changed after api 0.2.1 / web-app 0.2.2 that an existing deployment can notice, and
the setting that brings the old behaviour back:

| Change | Symptom after upgrading | Old behaviour back |
|---|---|---|
| Compose ports publish on `127.0.0.1` | Unreachable from other machines | `MR_REVIEW_BIND=0.0.0.0` in `.env` (rule 1 first) |
| web-app `API_BASE_URL` defaults to `""` and nginx proxies `/api/` to `http://api:8000` | A web-app container run alone next to an API on host port 8000 answers `/api/` with 502 | `API_BASE_URL=http://localhost:8000` (the API's CORS must list the UI's origin), or `API_UPSTREAM` set to an address the container can reach |
| API images start as root, `chown` the data directory, drop to `1000:1000` | `cap_drop: [ALL]` → exits at start; `user:` with files it cannot read → exits at start | `cap_add: [CHOWN, SETUID, SETGID]`, or `user:` with `chown -R` on the host directory |
| HSTS is opt-in | No `Strict-Transport-Security` from the web container | `HSTS_MAX_AGE=31536000`, plus `HSTS_INCLUDE_SUBDOMAINS=true` for the old `includeSubDomains` |

The data written by older images (uid 100) is taken over automatically on the first
start as root.

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

# RIGHT — leave it out: the browser calls the UI's own origin and nginx forwards /api/
# to API_UPSTREAM (default http://api:8000), which Docker resolves
web:
  image: ghcr.io/bedrock-python/mr-review/web-app:latest

# RIGHT, only when the API really lives on another origin — an origin, no /api suffix,
# and the API told to accept the UI's origin
web:
  environment:
    API_BASE_URL: "https://api.mr-review.example.com"
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

The API answers with a status and a `detail` string; the UI shows it as-is. A failed call to a
VCS host is translated the same way on every route — listings, diffs, context, prompt, and
dispatch before its stream starts — so a host problem never surfaces as a bare 500.

| Status | When |
|---|---|
| 400 | `Repo path must include at least 'owner/repo'`, or a host type given a nested path |
| 400, 422 | `VCS rejected the request (<status>): <host's message>` — the host refused what was asked (a bad ref, an unsupported search); retrying will not help |
| 401 | `VCS authentication failed — check your token` — the host rejected the token |
| 403 | `VCS access denied — insufficient permissions`, or `Host token cannot access repository` when adding one by URL — the token is valid but not entitled |
| 404 | A host, review, iteration or comment id that does not exist, or `Not found on the VCS host: <path>` — no such repository, merge request or ref there |
| 401 | `Claude rejected the API key (401): …` — listing or previewing an AI provider's models with a key the endpoint refuses |
| 409 | Posting a review whose source is a branch diff, or dispatching, re-parsing, adding or deleting comments on an iteration that was posted |
| 422 | A blank comment body, a `line` below 1, or a `line` without a `file`; a dispatch setting out of range; a dispatch with no `model` to a provider with no models; previewing models at a changed endpoint without the key |
| 429 | `VCS rate limit reached — try again shortly` — the host is throttling the token: a 429, or GitHub's 403 for a spent quota or a secondary rate limit. GitHub's issue search allows 30 requests a minute. `Retry-After` carries the host's wait when it gave one |
| 502 | `VCS returned <status>`, `VCS request failed (<status>)` or `Failed to post comments` — the host answered, badly |
| 502 | `VCS host unreachable (<error>)` — no answer at all: DNS, refused connection, TLS |
| 504 | `VCS host timed out (<error>)` — the host took longer than `MR_REVIEW__VCS_TIMEOUT` |
| 502, 504 | `Could not reach …`, `… answered <status>: …`, `… did not answer in time` — an AI provider's endpoint failing while its models are listed |

Two failures do not surface as a status code:

* **The dispatch stream fails mid-flight.** SSE has already answered 200, so the error
  arrives as an `event: error` frame on the stream, with no `done` after it. The iteration
  keeps its comments; one that had none takes the complete comments that arrived. The same
  happens when the client disconnects — the server writes this once it notices, so a client
  that stopped the stream should re-read the review until no iteration is in `dispatch`.
* **The model did not answer with JSON.** `done` reports it in `json_error`. An iteration
  that already had comments keeps them (`kept_previous`); one without gets the answer as a
  single `suggestion` comment with no file or line. Either way nothing is lost, and once
  the cause is fixed, `reparse` reads the stored answer again. `import-response` stores
  nothing in that case and reports the error.

A review file that cannot be parsed is skipped with a warning and does not appear in the
list — the rest of the store keeps working.

## Documentation map

Fetch a page when the task is the one named beside it.

| Page | Read it when |
|---|---|
| [Home](index.md) | a one-screen description of what the tool is for |
| [Installation](getting-started/installation.md) | picking all-in-one or standard, the `docker run` one-liner, opening it to a network, updating and what an upgrade changes, data persistence and file ownership |
| [Quick start](getting-started/quickstart.md) | adding the first provider and host through the UI |
| [Configuration](getting-started/configuration.md) | the environment variables as a user meets them, reverse proxy and TLS notes |
| [Review pipeline](features/pipeline.md) | what each stage does from the UI's side |
| [VCS hosts](features/hosts.md) | creating a token with the right scope, verifying a connection |
| [AI providers](features/ai-providers.md) | choosing a model, pointing at Ollama or another compatible endpoint |
| [vitest and expect-type](troubleshooting/vitest-expect-type.md) | the frontend test suite refuses to start |
| [Changelog](changelog.md) | what changed between versions |

Two planning documents are not part of this site: `ROADMAP.md` and
`specs/inline-fix-suggestions.md` in the repository. They are drafts, they are written in
Russian, and they describe intent rather than what is deployed — read the pages above for
the tool as it is.
