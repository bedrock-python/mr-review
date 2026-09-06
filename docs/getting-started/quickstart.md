# Quick start

Once mr-review is running ([see installation](installation.md)), open the app in your browser:

- **All-in-one:** http://localhost:17240
- **Standard deployment:** http://localhost:17242

## 1. Add an AI provider

Go to **Settings → AI Providers → Add**.

Fill in:

- **Name** — a label for this provider (e.g. "Claude Sonnet")
- **Type** — `Claude`, `OpenAI` or `OpenAI-compat`
- **API Key** — your provider's API key
- **Base URL** — shown for the OpenAI types; leave blank for the backend's own default

Examples:

| Provider | Type | Base URL |
|----------|------|----------|
| Anthropic Claude | `Claude` | — (ignored) |
| OpenAI | `OpenAI` | — |
| Ollama (local) | `OpenAI-compat` | `http://localhost:11434/v1` |
| Groq | `OpenAI-compat` | `https://api.groq.com/openai/v1` |

Save it, then open the provider you just created and pick its **Models** — the list is
fetched from the endpoint itself. See [AI providers](../features/ai-providers.md) for the
full field list.

## 2. Add a VCS host

Go to **Settings → Hosts → Add**.

Fill in:

- **Name** — a label for this host (e.g. "My GitLab")
- **Type** — `GitLab`, `GitHub`, `Gitea`, `Forgejo` or `Bitbucket`
- **Base URL** — the instance's web URL (e.g. `https://gitlab.com`). Bitbucket ignores it
- **Access Token** — a personal access token; for Bitbucket, `username:app_password`

Token scopes per host type are on the [VCS hosts](../features/hosts.md) page.

## 3. Pick an MR

Browse the left panel: select a host, then a project, then click an open MR to load its diff.

## 4. Run the review pipeline

Work through the pipeline stages at the top of the page:

1. **BRIEF** — choose a review preset, add any custom instructions for the AI
2. **DISPATCH** — start the AI review; comments stream in as they are generated
3. **POLISH** — edit, keep, or dismiss individual comments
4. **POST** — send approved comments back to the merge request on its host

Comments will appear directly on the MR for your team to see.
