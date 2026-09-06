# MR Review

AI-powered merge request review tool that runs entirely on your machine — no cloud infrastructure required.

Browse merge requests on GitLab, GitHub, Gitea, Forgejo or Bitbucket, send the diff to an AI, edit the generated comments, and post them back to the MR in one continuous flow.

## How it works

```
PICK → BRIEF → DISPATCH → POLISH → POST
```

| Stage | What happens |
|-------|-------------|
| **PICK** | Open an MR, browse the diff, pin lines you want the AI to focus on |
| **BRIEF** | Choose a review preset, toggle context sections, add custom instructions |
| **DISPATCH** | Send the diff to the AI — comments stream in as they are generated |
| **POLISH** | Edit, keep, or dismiss each generated comment |
| **POST** | Submit approved comments back to the MR as inline review comments |

## Why mr-review

- **No cloud infrastructure** — runs on your machine with a single `docker compose up`
- **Five host types** — GitLab, GitHub, Gitea, Forgejo and Bitbucket, self-hosted and cloud at the same time
- **Any AI model** — Claude, OpenAI, Ollama, Groq, and any OpenAI-compatible endpoint
- **Streaming output** — comments appear as the AI writes them, no waiting for the full response
- **Local storage** — hosts, providers and review history in YAML files in one directory, nothing leaves your machine except the diff you send

## Get started

1. [Install](getting-started/installation.md) — Docker is the only prerequisite
2. [Quick start](getting-started/quickstart.md) — add an AI provider and a VCS host, run your first review
3. [Configuration](getting-started/configuration.md) — ports, data directory, CORS, log level

## Features

- [Review pipeline](features/pipeline.md) — detailed walkthrough of each stage
- [VCS hosts](features/hosts.md) — connecting a host, base URLs and token scopes
- [AI providers](features/ai-providers.md) — Claude, OpenAI, Ollama, and compatible APIs

## Changelog

See [changelog](changelog.md) for release notes.
