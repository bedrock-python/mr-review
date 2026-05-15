# MR Review — Backend

FastAPI backend for the MR Review tool. Stores host configuration and review history in SQLite. Integrates with GitLab/GitHub via REST and dispatches AI reviews via Anthropic/OpenAI-compatible APIs.

## Architecture

- **`mr_review/core/`**: Entities (`Host`, `Review`, `MR`), repository protocols, VCS/AI protocols.
- **`mr_review/use_cases/`**: Business logic for host management, MR browsing, and review lifecycle.
- **`mr_review/infra/`**: SQLite (SQLAlchemy), VCS clients (GitLab/GitHub), AI providers (Claude/OpenAI), Dishka DI.
- **`api/`**: FastAPI routers and Pydantic schemas.

## Quick Start

```bash
make install  # uv sync
make dev      # uvicorn on :8000
```

## Testing

```bash
make test       # all tests
make test-unit  # unit tests only
```
