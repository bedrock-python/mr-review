# Skill: Add Use Case

How to implement a new application-layer Use Case.

## Pattern

1. **Create File**: `use_cases/<verb>_<noun>.py`.
2. **Define Class**: `<Verb><Noun>UseCase`.
3. **Dependencies**: Inject needed components via `__init__` (e.g., `UnitOfWork`, `DomainService`).

## Example Template

```python
from __future__ import annotations
from identity_service.core.uow import UnitOfWork
from identity_service.core.users.dto import CreateUserDTO, UserDTO
from identity_service.core.users.services import UserDomainService

class CreateUserUseCase:
    def __init__(
        self,
        uow: UnitOfWork,
        user_domain_service: UserDomainService,
    ) -> None:
        self._uow = uow
        self._user_domain_service = user_domain_service

    async def execute(self, dto: CreateUserDTO) -> UserDTO:
        async with self._uow.transaction() as tx:
            # Domain logic via domain service
            user = self._user_domain_service.create_new_user(dto.username)
            # Persistence via repository
            created_user = await tx.users.create(user)

            return UserDTO.model_validate(created_user)
```

## Rules
- **No Infrastructure in Use Case**: Do not import from `infra/` or `api/`.
- **Atomic Operations**: Always use `async with self._uow.transaction() as tx`.
- **Return DTOs**: Prefer returning DTOs rather than Domain Entities to the API layer.
- **Pydantic DTOs**: All DTOs MUST be implemented using **Pydantic models**.
