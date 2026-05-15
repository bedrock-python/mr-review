# Naming Conventions

Follow these strict naming conventions to ensure consistency across the monorepo.

## Summary Table

| Category | File Pattern | Class Pattern | UoW Property |
| :--- | :--- | :--- | :--- |
| **Entity** | `entities.py` | `SingularNoun` (e.g., `User`) | - |
| **Repository Protocol** | `repositories.py` | `NounRepository` (e.g., `UserRepository`) | `plural_nouns` (e.g., `users`) |
| **Repository Impl** | `{entity}.py` | `PostgresNounRepository` | - |
| **Domain Service** | `services.py` | `NounDomainService` | - |
| **Use Case** | `{verb}_{noun}.py` | `VerbNounUseCase` | - |
| **DTO** | `dto.py` | `VerbNounDTO`, `NounDTO` (Pydantic models) | - |
| **ORM Model** | `{entity}.py` | `NounDB` (e.g., `UserDB`) | - |

## Detailed Rules

### Domain (core/)
- **Entities**: Always in `entities.py`. Classes use `PascalCase` singular nouns.
- **Protocols**: Always in `repositories.py`. Names end with `Repository`.
- **Domain Services**: Always in `services.py`. Names end with `DomainService`.

### Application (use_cases/)
- **Files**: Named as `<verb>_<noun>.py` (e.g., `create_user.py`, `get_user_by_id.py`).
- **Classes**: Named as `<Verb><Noun>UseCase` (e.g., `CreateUserUseCase`).

### Infrastructure (infra/)
- **ORM Models**: In `infra/db/orm/`. Classes must have `DB` suffix.
- **Repository Implementations**: In `infra/repositories/`. Classes prefixed with `Postgres` or `Redis`.

### API (api/)
- **Servicers**: Named as `<Noun>ServiceServicer` (following gRPC naming).
- **Converters**: In `converters.py`. Functions named as `<from>_to_<to>` (e.g., `user_dto_to_proto`).

## Package Naming
- Use underscores for package names.
- Python libraries: underscore names, e.g. `service_context`, `unit_of_work_kit`, `dishka_providers`, `omni_box`.
- Services: `identity_service`, `credential_service`.
