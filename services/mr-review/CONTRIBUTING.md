# Contributing to MR Review Backend

## Development Setup

### Prerequisites

- Python 3.12+
- [uv](https://github.com/astral-sh/uv)

### Install dependencies

```bash
make install
```

### Run development server

```bash
make dev
```

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
- `mr_review/infra/` — SQLite, VCS clients, AI providers, DI
- `api/` — FastAPI routers and schemas
