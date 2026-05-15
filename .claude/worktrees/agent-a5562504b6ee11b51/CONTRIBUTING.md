# Contributing Guidelines

## Coding Style

We use **Ruff** for linting and formatting, and **Mypy** for type checking.

- Run linting: `ruff check .`
- Run formatting: `ruff format .`
- Run type checking: `mypy .`

## Naming Conventions

To ensure consistency across the project, follow these naming conventions:

### Entities & Aggregates
- **Files**: `entities.py`
- **Classes**: Singular nouns (e.g., `Host`, `Review`).

### Repositories
- **Files**: `repositories.py`
- **Interfaces (Protocol)**: `NounRepository` (e.g., `HostRepository`).
- **Implementations**: `SQLiteNounRepository`.
- **Property in UoW**: Plural nouns (e.g., `hosts`, `reviews`).

### Use Cases (Application Layer)
- **Files**: `verb_noun.py` (e.g., `create_host.py`).
- **Classes**: `VerbNounUseCase` (e.g., `CreateHostUseCase`).

### Data Transfer Objects (DTOs)
- **Files**: `dto.py`
- **Classes**: `VerbNounDTO` or `NounDTO` (e.g., `CreateHostDTO`, `HostDTO`).
- **Requirement**: Always use **Pydantic models** (`pydantic.BaseModel`) for DTOs.

## Architecture Principles

1. **Clean Architecture**: Dependency direction should always be inwards: `api` -> `use_cases` -> `core`.
2. **No SQLAlchemy in Domain**: `core/` and `use_cases/` must not import `sqlalchemy`.
3. **Repositories return Domain Entities**: Never return ORM models from repositories.
4. **Validation**: Use Pydantic for all data validation at the boundaries.

## Git Workflow

### Branch Naming
`<type>/<SLUG>-<ID>__<short_description>`

Examples:
- `feat/MR-REVIEW-1__initial_setup`
- `fix/MR-REVIEW-12__gitlab_diff_parsing`

### Commits
We use **Conventional Commits** (single-line):
`<type>(scope): <message>`

Examples:
- `feat(backend): add host management use cases`
- `fix(vcs): handle gitlab pagination correctly`

## Testing

- **Unit Tests**: Place in `tests/unit/`. No external dependencies.
- **Integration Tests**: Place in `tests/integration/`. Use SQLite in-memory.
