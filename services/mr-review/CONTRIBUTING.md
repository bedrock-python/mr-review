# Contributing to MR Review Backend

## Development Setup

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv)

### Install dependencies

```bash
make install
```

### Run the API

```bash
make run-api
```

`make dev` from the repository root starts this and the frontend dev server together.

## Code Style

We use **Ruff** for linting and formatting, and **Mypy** for type checking.

```bash
make fmt    # format with pre-commit (ruff + mypy)
make check  # ruff check + mypy
```

## Testing

```bash
make test       # all tests
make test-unit  # unit tests only
```

## Commit Messages

We use **Conventional Commits** (single-line only):

```
feat(backend): add host management
fix(vcs): handle gitlab pagination
```

## Architecture

- `mr_review/core/` — Domain entities and protocols (no external deps)
- `mr_review/use_cases/` — Application business logic
- `mr_review/infra/` — YAML-file repositories, VCS clients, AI providers, DI
- `mr_review/api/` — FastAPI routers and schemas
