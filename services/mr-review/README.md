# MR Review — Backend

FastAPI backend for the MR Review tool. Stores hosts, AI providers and review history as YAML files under the data directory — there is no database. Integrates with GitLab, GitHub, Gitea, Forgejo and Bitbucket via REST, and dispatches AI reviews to the Anthropic Messages API or any OpenAI-compatible endpoint.

## Architecture

- **`mr_review/core/`**: Entities (`Host`, `Review`, `MR`), repository protocols, VCS/AI protocols.
- **`mr_review/use_cases/`**: Business logic for host management, MR browsing, and review lifecycle.
- **`mr_review/infra/`**: YAML-file repositories, VCS clients, AI providers (Claude/OpenAI), Dishka DI.
- **`mr_review/api/`**: FastAPI routers and Pydantic schemas.

## Quick Start

```bash
make install  # uv sync --all-extras
make run-api  # uvicorn on :8000
```

## Testing

```bash
make test       # all tests
make test-unit  # unit tests only
```
