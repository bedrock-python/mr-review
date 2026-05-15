# Quick start

Once mr-review is running ([see installation](installation.md)), open the app in your browser:

- **All-in-one:** http://localhost:17240
- **Standard deployment:** http://localhost:17242

## 1. Add an AI provider

Go to **Settings → AI Providers → Add**.

Fill in:

- **Name** — a label for this provider (e.g. "Claude Sonnet")
- **Type** — `anthropic` or `openai-compatible`
- **API Key** — your provider's API key
- **Model** — the model identifier

Examples:

| Provider | Type | Model |
|----------|------|-------|
| Anthropic Claude | `anthropic` | `claude-sonnet-4-6` |
| OpenAI | `openai-compatible` | `gpt-4o` |
| Ollama (local) | `openai-compatible` | `qwen2.5-coder:32b` |
| Groq | `openai-compatible` | `llama-3.3-70b-versatile` |

For OpenAI-compatible providers, you also need to set the **Base URL** (e.g. `http://localhost:11434/v1` for Ollama).

## 2. Add a VCS host

Go to **Settings → Hosts → Add**.

Fill in:

- **Name** — a label for this host (e.g. "My GitLab")
- **Type** — `gitlab` or `github`
- **URL** — base URL of the instance (e.g. `https://gitlab.com` or `https://github.com`)
- **Token** — personal access token with `api` scope (GitLab) or `repo` scope (GitHub)

## 3. Pick an MR

Browse the left panel: select a host, then a project, then click an open MR to load its diff.

## 4. Run the review pipeline

Work through the pipeline stages at the top of the page:

1. **BRIEF** — choose a review preset, add any custom instructions for the AI
2. **DISPATCH** — start the AI review; comments stream in as they are generated
3. **POLISH** — edit, keep, or dismiss individual comments
4. **POST** — send approved comments back to the MR in GitLab or GitHub

Comments will appear directly on the MR for your team to see.
