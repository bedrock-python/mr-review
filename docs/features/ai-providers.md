# AI providers

mr-review supports two AI backends: **Anthropic (Claude)** and any **OpenAI-compatible** API.

## Anthropic (Claude)

The default provider. Uses the Anthropic Messages API with streaming.

**Recommended models:**

| Model | Notes |
|-------|-------|
| `claude-sonnet-4-6` | Best balance of quality and speed (default) |
| `claude-opus-4-7` | Highest quality, slower |
| `claude-haiku-4-5-20251001` | Fastest, good for short diffs |

**Configuration:**

```dotenv
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-6
```

Get an API key at [console.anthropic.com](https://console.anthropic.com).

## OpenAI-compatible

Any endpoint that implements the OpenAI chat completions API with streaming.

**OpenAI:**

```dotenv
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
```

**Self-hosted (Ollama):**

```dotenv
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=qwen2.5-coder:32b
```

**Other compatible services** (Groq, Together AI, etc.) — set `AI_BASE_URL` to their API endpoint.

## Choosing a model

For code review, models with large context windows perform best. The diff, pinned lines, commit message, and review brief are all included in the prompt — large MRs can exceed 20k tokens.
