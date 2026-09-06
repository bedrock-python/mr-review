# Contributing to mr-review

Thank you for your interest in contributing! This document covers everything you need to get started.

## Development setup

The repository holds two services, each with its own toolchain. The repository root only
builds the documentation site.

```bash
git clone https://github.com/bedrock-python/mr-review.git
cd mr-review
```

Backend — Python 3.12+ and [uv](https://docs.astral.sh/uv/):

```bash
cd services/mr-review
uv sync --all-extras
uv run pre-commit install --hook-type pre-commit --hook-type commit-msg
```

Frontend — Node 22 and pnpm:

```bash
cd services/web-app
pnpm install --frozen-lockfile
```

## Running checks

Backend, from `services/mr-review`:

```bash
make fmt          # pre-commit over the tree: ruff fix, ruff format, mypy
make check        # ruff lint + format check + mypy, as CI runs them
make test-unit    # unit tests
make test         # unit and integration tests; neither needs Docker
```

Frontend, from `services/web-app`:

```bash
make fmt          # eslint --fix + prettier
make lint
make typecheck
make test         # vitest with coverage
```

From the repository root:

```bash
make dev             # backend and frontend dev servers, no Docker
make run-services    # both services in Docker
make fmt-services    # format both services
make docs-serve      # the documentation site on http://localhost:8080
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

The default branch is `master`.

1. Fork the repository
2. Create a branch from `master`: `git checkout -b feat/MR-REVIEW-42__my-feature`
3. Make your changes with tests
4. Run the checks for the service you touched (`make check && make test-unit` in
   `services/mr-review`, `make lint && make typecheck && make test` in `services/web-app`)
5. Open a PR against `master`

Update `CHANGELOG.md` under `[Unreleased]` for any user-visible change.

## The agents page

`docs/agents.md` is the whole tool on one page, written for a coding assistant: the
configuration surface, the rules that break a deployment when they are broken, the
mistakes models make in a compose file, and a map of which page to fetch for the rest.
People hand it to an assistant instead of the site, which is what makes a stale one worse
than none — it teaches a model a deployment that no longer works.

It is part of the public surface, so it changes in the same pull request that surface
does: an environment variable added, renamed or removed, a changed default, a new port,
image, volume, host type or route, a new rule an operator has to obey. A new docs page
means a new row in the documentation map. The review check is mechanical — if the diff
changes what an operator has to configure and `docs/agents.md` is untouched, the pull
request is not finished.

## Architecture principles

The backend follows Onion Architecture — dependency direction always points inward:
`api` → `use_cases` → `core`.

- **`core/` depends on nothing**: entities and protocols only, no infrastructure imports
- **`use_cases/` depends on protocols**: never on `infra/`
- **Repositories return domain entities**: the three of them are file-backed
  (`hosts.yaml`, `ai_providers.yaml`, `reviews/<uuid>.yaml`) — there is no database and no
  ORM in this project

The frontend follows Feature-Sliced Design. The `.claude/rules/` directory holds the
organisation-wide conventions; the persistence rules there assume a SQL service and do not
apply here.

## Releasing (maintainers only)

Releases are automated. release-please watches `master` and keeps a release pull request per
service; merging it writes `services/<service>/CHANGELOG.md`, bumps the version and pushes a
`mr-review-v*` or `web-app-v*` tag. That tag triggers `publish.yml`, which builds and pushes
the `api`, `web-app` and `all-in-one` images to ghcr.io.
