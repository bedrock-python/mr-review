# AI providers

An **AI provider** is one endpoint mr-review sends the diff to. Providers are created in the
app under **Settings → AI providers**, not in the environment: there is no `AI_PROVIDER`,
`AI_API_KEY` or `AI_MODEL` variable. The form calls `POST /api/v1/ai-providers`, and the
provider is stored in `ai_providers.yaml` in the [data directory](../getting-started/configuration.md),
API key included.

## Types

Three types, two backends:

| Type | Shown as | Backend |
|------|----------|---------|
| `claude` | Claude | Anthropic Messages API, streamed |
| `openai` | OpenAI | OpenAI chat completions, streamed |
| `openai_compat` | OpenAI-compat | The same client, pointed elsewhere by `base_url` |

`openai` and `openai_compat` share a client but not their defaults: `openai` knows OpenAI's
models (which take temperature, which reasoning levels) and turns structured output on, while
`openai_compat` assumes nothing about the server behind it.

## Fields

| Field | Default | What it does |
|-------|---------|--------------|
| `name` | — | Display label |
| `type` | — | One of the three above |
| `api_key` | — | Sent to the endpoint. Stored in plain text in the data directory |
| `base_url` | `""` | Empty means the backend's own default. For `claude` a set URL reaches Claude through a gateway — LiteLLM, a corporate proxy; a trailing `/v1` is dropped, since the client adds `/v1/messages` itself |
| `models` | `[]` | The models offered in the dispatch form. The first is the default for a dispatch that names none |
| `ssl_verify` | `true` | `false` disables certificate verification entirely |
| `timeout` | `60` | Seconds the client waits on the endpoint — to connect, and between pieces of the streamed answer |
| `max_concurrent` | unset | Dispatches to this provider allowed in flight at once |

The settings form covers all of these except `max_concurrent`, which is set through the API or
by editing `ai_providers.yaml`.

For a corporate CA, install it in the system trust store rather than turning `ssl_verify`
off — the HTTP client reads the system store, not a bundled one.

## Pointing at an endpoint

| Endpoint | Type | `base_url` |
|----------|------|-----------|
| Anthropic | `claude` | leave blank |
| A gateway in front of Claude (LiteLLM, a proxy) | `claude` | the gateway's Anthropic-style URL |
| OpenAI | `openai` | leave blank |
| Ollama on the same machine | `openai_compat` | `http://localhost:11434/v1` |
| Ollama, with mr-review in Docker | `openai_compat` | `http://host.docker.internal:11434/v1` |
| Groq, Together, LM Studio, a gateway | `openai_compat` | the endpoint's own `/v1` URL |

Before this version `base_url` was ignored for `claude`, and the add form could keep the URL
of a type it was switched away from. Settings now marks a Claude provider whose base URL is not
Anthropic's with a warning — clear the field unless it is a gateway you meant to use.

`localhost` inside the container is the container, not your machine — a local model reached
from a container needs `host.docker.internal` (Docker Desktop) or the host's LAN address.

## Choosing a model

**Fetch models from API** in the provider form asks the endpoint which models it has, using
the values in the form as they are — a key or base URL you have typed but not saved yet
included (`POST /api/v1/ai-providers/preview/models`; a blank key keeps the saved one, but only
for the saved base URL and type — a changed endpoint needs the key typed in again, so the saved
key is never sent anywhere else). The
answer is offered next to the list, to add one model at a time or all at once; it never
replaces the list, so a hand-picked list survives an endpoint with hundreds of models.
`GET /api/v1/ai-providers/{id}/models` does the same with the saved settings.

The first model in the list is the default — **Make default** moves another one to the top. A
dispatch can also name any model id, listed or not. There is no built-in fallback: a dispatch
that names no model, to a provider with an empty list, is refused with 422.

When the endpoint refuses, the answer says why: **401** when it rejects the key, **504** when
it does not answer within `timeout`, **502** for anything else — an unreachable host, a wrong
URL, an error from the endpoint — with the endpoint's own message.

For code review, models with large context windows do best. The diff, pinned lines, commit
message and review brief all go into one prompt — large MRs can exceed 20k tokens, and the
optional context toggles add more.

## Dispatch settings

Each dispatch can tune the model call; every setting left empty means "the default".

| Setting | Request field | Default |
|---------|---------------|---------|
| Model | `model` | the provider's first model |
| Reasoning depth | `reasoning_effort` — `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` | the model's own |
| Thinking budget | `reasoning_budget` — tokens | off |
| Temperature | `temperature` — 0 to 2 | the model's own |
| Max output tokens | `max_output_tokens` — 256 to 128,000 | 32,000 on Claude (64,000 at `xhigh`/`max` effort, budget + 16,000 with a thinking budget); the endpoint's own otherwise |
| Structured output | `structured_output` | on for `claude` and `openai` models that support it when the provider talks to the vendor's own endpoint; off for `openai_compat`, for unknown OpenAI ids and for any `base_url` pointing elsewhere |
| System prompt | `system_prompt` | the built-in reviewer prompt |

Models differ in what they accept, and a setting a model rejects would fail the whole request
with a 400. So each dispatch is fitted to its model before it is sent, and the app shows only
the controls the selected model takes. `GET /api/v1/ai-providers/{id}/capabilities?model=…`
returns what that is, decided from the model id alone — no call to the provider:

| Model family | Reasoning | Temperature | Max output | Structured output |
|--------------|-----------|-------------|------------|-------------------|
| Claude Opus 5.5 / 5, Sonnet 5.5 / 5, Fable, Mythos — and any Claude id not listed here | always on, tuned by effort `low`…`max` | no | 128K | on |
| Claude Opus 4.8 | adaptive thinking, off unless asked for; effort `low`…`max` | no | 128K | on |
| Claude Opus 4.7 | as Opus 4.8 | no | 128K | offered, off by default |
| Claude Opus 4.6, Sonnet 4.6 | adaptive thinking, off unless asked for; effort `low`, `medium`, `high`, `max` | yes, up to 1 | 128K | offered, off by default |
| Claude Opus 4.5, Haiku 4.5 | thinking budget, off unless asked for | yes, up to 1 | 64K | on |
| Claude Sonnet 4.5 | thinking budget | yes, up to 1 | 64K | offered, off by default |
| Claude Sonnet 4 | thinking budget | yes, up to 1 | 64K | no |
| Claude Opus 4.1 / Opus 4 | thinking budget | yes, up to 1 | 32K | on (4.1) / no (4) |
| Claude Sonnet 3.7 | thinking budget | yes, up to 1 | 64K | no |
| Claude 3.5 and 3 | none | yes, up to 1 | 8K / 4K | no |
| OpenAI o-series (`o1`, `o3`, `o4-mini`…) | always on, effort `low`…`high` | no | 100K | on |
| OpenAI `gpt-5`, `gpt-5.1`, `gpt-5.2`…, `gpt-5.5` | always on; `minimal`…`high`, `none`…`high`, `none`…`xhigh` (5.5 defaults to `medium`) | no | 128K | on |
| OpenAI `gpt-5.x-chat-latest` | always on; `medium` only | no | 16K | on |
| OpenAI `gpt-5-pro` / `gpt-5.x-pro` | always on; `high` / `medium`…`xhigh` | no | 128K | on / offered, off |
| OpenAI `gpt-4.1`, `gpt-4o` | none | yes, up to 2 | 32K / 16K | on |
| OpenAI `chatgpt-4o-latest`, `gpt-4o-2024-05-13` | none | yes, up to 2 | 16K / 4K | no |
| OpenAI `gpt-4`, `gpt-4-turbo`, `gpt-3.5` | none | yes | 4K | no |
| Any other OpenAI id | always on, effort `low`…`high` | no | unknown | offered, off by default |
| `openai_compat` — any model | effort or budget, off unless asked for | yes, up to 2 | unknown | offered, off by default |

Claude ids are recognised in any spelling — first-party, Bedrock
(`us.anthropic.claude-opus-4-5-20251101-v1:0`), Vertex (`claude-opus-4-5@20251101`) or a
gateway alias. An id the table does not know, including a newer version of a known family, is
treated as a current-generation model.

How a dispatch is fitted to its model:

- **Reasoning.** On current Claude models it is adaptive thinking with `output_config.effort`;
  `budget_tokens` goes only to the models before 4.6, which accept nothing else. An effort the
  model does not have becomes the nearest level below it, a budget becomes an effort on an
  effort-only model and the other way round, and a model that does not reason gets neither.
  OpenAI gets `reasoning_effort`; an `openai_compat` endpoint gets `reasoning_effort` or, for a
  budget, a `reasoning_budget` field for the servers that read one.
- **Temperature** is sent only to models that take it and only while reasoning is off —
  thinking models reject it — and is capped at the model's range (1 on Claude).
- **Max output tokens** is the limit for the whole answer, thinking included, and is capped at
  the model's maximum. A thinking budget always leaves at least 4,096 tokens for the answer
  below it, or thinking is turned off. It goes out as `max_tokens` to Claude, as
  `max_completion_tokens` to OpenAI (which requires it for reasoning models) and as `max_tokens`
  to `openai_compat` endpoints — the one name every compatible server understands.

### Structured output

With structured output on, the answer is constrained to a JSON schema —
`{"comments": [{"file", "line", "severity", "body"}]}`, `file` and `line` nullable, `severity`
one of `critical`, `major`, `minor`, `suggestion` — through `output_config.format` on Claude
and `response_format: json_schema` (strict) on OpenAI. The model can then only answer with
parseable comments, and they still stream in as they are written. The built-in system prompt
describes the object instead of a bare array while it is on.

Servers differ, so it is off by default for `openai_compat`, for OpenAI ids the table does not
know, and for a `claude` or `openai` provider whose `base_url` is not the vendor's own API (a
gateway, or another vendor such as DeepSeek or Groq behind the `openai` type). A refusal — Claude's
`stop_reason: refusal`, or OpenAI's `refusal` field under strict structured output — ends the
dispatch with an error carrying the model's message. When an endpoint rejects it, the
dispatch fails with the endpoint's message and a hint to turn **Structured output** off — it
is not silently retried without.

### How an answer can end

- **Truncated.** The provider stopped at the output limit (Claude `max_tokens`, or the context
  window; OpenAI `finish_reason: length`). The answer counts as cut off even when its text
  happens to parse, so it never replaces existing comments; on an iteration without comments
  the ones completed before the cut are saved. The run is marked truncated — raise **Max output
  tokens** or narrow the context.
- **Refused.** Claude declined to answer (`stop_reason: refusal`, with its category when it
  gives one), OpenAI returned a `refusal` under structured output, or an endpoint's content
  filter stopped the answer. The dispatch ends with an error saying so and is settled like any
  failed run: existing comments stay as they were.

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
