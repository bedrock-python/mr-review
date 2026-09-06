# AI providers

An **AI provider** is one endpoint mr-review sends the diff to. Providers are created in the
app under **Settings → AI Providers**, not in the environment: there is no `AI_PROVIDER`,
`AI_API_KEY` or `AI_MODEL` variable. The form calls `POST /api/v1/ai-providers`, and the
provider is stored in `ai_providers.yaml` in the [data directory](../getting-started/configuration.md),
API key included.

## Types

Three types, two backends:

| Type | Shown as | Backend |
|------|----------|---------|
| `claude` | Claude | Anthropic Messages API, streamed. `base_url` is ignored |
| `openai` | OpenAI | OpenAI chat completions, streamed |
| `openai_compat` | OpenAI-compat | The same client, pointed elsewhere by `base_url` |

`openai` and `openai_compat` behave identically — the distinction is a label for the reader.

## Fields

| Field | Default | What it does |
|-------|---------|--------------|
| `name` | — | Display label |
| `type` | — | One of the three above |
| `api_key` | — | Sent to the endpoint. Stored in plain text in the data directory |
| `base_url` | `""` | Empty means the backend's own default. Ignored by `claude` |
| `models` | `[]` | The models offered in the dispatch form |
| `ssl_verify` | `true` | `false` disables certificate verification entirely |
| `timeout` | `60` | Seconds, for the whole streamed response |
| `max_concurrent` | unset | Dispatches to this provider allowed in flight at once |

The settings form covers all of these except `models`, which is edited on the provider row
once it exists, and `max_concurrent`, which is set through the API or by editing
`ai_providers.yaml`.

For a corporate CA, install it in the system trust store rather than turning `ssl_verify`
off — the HTTP client reads the system store, not a bundled one.

## Pointing at an endpoint

| Endpoint | Type | `base_url` |
|----------|------|-----------|
| Anthropic | `claude` | — |
| OpenAI | `openai` | leave blank |
| Ollama on the same machine | `openai_compat` | `http://localhost:11434/v1` |
| Ollama, with mr-review in Docker | `openai_compat` | `http://host.docker.internal:11434/v1` |
| Groq, Together, LM Studio, a gateway | `openai_compat` | the endpoint's own `/v1` URL |

`localhost` inside the container is the container, not your machine — a local model reached
from a container needs `host.docker.internal` (Docker Desktop) or the host's LAN address.

## Choosing a model

`GET /api/v1/ai-providers/{id}/models` asks the endpoint itself which models it has; the
app offers that list when you edit a provider. The first entry of `models` is used when a
dispatch names no model of its own, and with an empty list the fallback is
`claude-opus-4-5` for `claude` and `gpt-4o` for the OpenAI backends.

For code review, models with large context windows do best. The diff, pinned lines, commit
message and review brief all go into one prompt — large MRs can exceed 20k tokens, and the
optional context toggles add more.

A dispatch may also carry `temperature`, `reasoning_budget` (extended thinking on Claude,
which forces `temperature=1`) and `reasoning_effort` (`low`, `medium` or `high`, for OpenAI
reasoning models).

## Concurrency

Each provider has a cap on how many dispatches to it can be in flight at once:
`max_concurrent`, falling back to `MR_REVIEW__AI_THROTTLE__DEFAULT_MAX_CONCURRENT` (`4`).
It exists to keep a local model from being overwhelmed and to put a coarse ceiling on cloud
usage.

`max_concurrent` has no field in the settings form: set it with
`POST`/`PATCH /api/v1/ai-providers`, or edit `ai_providers.yaml` directly.

The cap is fixed at first use either way. The semaphore is created on the first dispatch to
a provider and kept for the life of the process, so **a changed `max_concurrent` takes
effect on the next restart**, not on the next dispatch.
