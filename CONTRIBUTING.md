# Contributing to mr-review

Thank you for your interest in contributing! This document covers everything you need to get started.

## Development setup

```bash
git clone https://github.com/bedrock-python/mr-review.git
cd mr-review
uv sync --group dev
uv run pre-commit install --hook-type commit-msg
```

## Running checks

```bash
make fmt          # ruff format + fix
make check        # ruff lint + format check + mypy
make test-unit    # unit tests, no Docker required
make test         # full suite
```

## Code style

- **Type hints** on all functions and methods, including tests
- **Line length** — 120 characters (ruff enforced)
- **Quotes** — double quotes (ruff enforced)
- **No comments** unless the *why* is non-obvious (workaround, subtle invariant)
- **No `datetime.utcnow()`** — use timezone-aware `datetime.now(UTC)`
- **No `Any`** — avoid unless absolutely necessary

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) are enforced by pre-commit:

| Prefix | Use for |
|--------|---------|
| `feat:` | New feature or behaviour |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `test:` | Test additions or changes |
| `refactor:` | Code restructure, no behaviour change |
| `perf:` | Performance improvement |
| `chore:` | Build, tooling, CI |

Breaking changes: add `!` after the type (`feat!:`) or include a `BREAKING CHANGE:` footer.

## Pull requests

1. Fork the repository
2. Create a branch from `main`: `git checkout -b feat/MR-REVIEW-42__my-feature`
3. Make your changes with tests
4. Run `make check && make test-unit` locally
5. Open a PR against `main`

Update `CHANGELOG.md` under `[Unreleased]` for any user-visible change.

## Architecture principles

This project follows Onion Architecture — dependency direction always points inward:
`api` → `use_cases` → `core`.

- **No SQLAlchemy in domain/application**: `core/` and `use_cases/` must not import `sqlalchemy`
- **Repositories return domain entities**: never return ORM models from repositories
- **Use cases accept `AsyncUnitOfWork`**: never accept `AsyncSession` directly

See the `.claude/rules/` directory for detailed architecture and naming conventions.

## Releasing (maintainers only)

1. Move `[Unreleased]` section in `CHANGELOG.md` to `[x.y.z] - YYYY-MM-DD`
2. Commit: `chore(release): v0.x.y`
3. Tag and push:

```bash
git tag v0.x.y
git push origin main --tags
```
