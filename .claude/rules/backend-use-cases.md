# Use Case Layer Standards

Use cases orchestrate business logic and MUST follow these patterns.

## Core Principles

1. **Use cases MUST accept `AsyncUnitOfWork`, NEVER `AsyncSession`**
2. **Use cases MUST NOT import from `infra/` (except for DI registration)**
3. **Use cases MUST work with domain entities and protocols**
4. **Use cases return DTOs or domain entities**

## ✅ Correct Use Case Pattern

```python
# use_cases/users/create_user.py
from uuid import UUID
from core.uow import AsyncUnitOfWork
from core.users.entities import User

class CreateUserUseCase:
    """Create a new user."""

    def __init__(self, uow: AsyncUnitOfWork) -> None:
        self._uow = uow

    async def execute(self, email: str, name: str) -> User:
        """Create user and return domain entity."""
        async with self._uow.transaction() as tx:
            # All DB operations within transaction
            existing_user = await tx.users.get_by_email(email)
            if existing_user:
                raise UserAlreadyExistsError(email)

            user = await tx.users.create(email=email, name=name)

            # Outbox events in same transaction
            await tx.outbox.create(
                UserCreatedEvent(user_id=user.id, email=email)
            )

        return user
```

## ✅ Use Case with Multiple Repositories

```python
class LinkSocialAccountUseCase:
    def __init__(self, uow: AsyncUnitOfWork) -> None:
        self._uow = uow

    async def execute(
        self,
        user_id: UUID,
        provider: str,
        provider_user_id: str
    ) -> SocialAccount:
        async with self._uow.transaction() as tx:
            # Access multiple repositories via tx
            user = await tx.users.get_by_id(user_id)
            if not user:
                raise UserNotFoundError(user_id)

            existing_account = await tx.social_accounts.get_by_provider_user_id(
                provider=provider,
                provider_user_id=provider_user_id
            )
            if existing_account:
                raise AccountAlreadyLinkedError()

            account = await tx.social_accounts.create(
                user_id=user_id,
                provider=provider,
                provider_user_id=provider_user_id,
            )

            await tx.outbox.create(
                SocialAccountLinkedEvent(
                    user_id=user_id,
                    account_id=account.id
                )
            )

        return account
```

## ✅ Use Case with Domain Service

```python
from core.users.services import UserDomainService

class UpdateUserProfileUseCase:
    def __init__(
        self,
        uow: AsyncUnitOfWork,
        domain_service: UserDomainService,
    ) -> None:
        self._uow = uow
        self._domain_service = domain_service

    async def execute(self, user_id: UUID, name: str) -> User:
        async with self._uow.transaction() as tx:
            user = await tx.users.get_by_id(user_id)
            if not user:
                raise UserNotFoundError(user_id)

            # Domain logic in domain service
            updated_user = self._domain_service.update_profile(user, name)

            await tx.users.update(updated_user)

        return updated_user
```

## ✅ Read-Only Use Case

```python
class ListUserAccountsUseCase:
    def __init__(self, uow: AsyncUnitOfWork) -> None:
        self._uow = uow

    async def execute(self, user_id: UUID) -> list[SocialAccount]:
        async with self._uow.transaction() as tx:
            accounts = await tx.social_accounts.list_by_user(user_id)
        return accounts
```

## ❌ Incorrect Patterns

### ❌ NEVER accept AsyncSession
```python
# ❌ WRONG
class CreateUserUseCase:
    def __init__(self, session: AsyncSession) -> None:  # ❌ WRONG
        self._session = session
```

### ❌ NEVER instantiate repositories directly
```python
# ❌ WRONG
class CreateUserUseCase:
    def __init__(self, uow: AsyncUnitOfWork) -> None:
        self._uow = uow
        self._user_repo = PostgresUserRepository(...)  # ❌ WRONG
```

### ❌ NEVER call session.commit() manually
```python
# ❌ WRONG
async def execute(self, email: str) -> User:
    async with self._uow.transaction() as tx:
        user = await tx.users.create(email=email)
        await tx.session.commit()  # ❌ WRONG - UoW handles this
```

### ❌ NEVER import from infra in use cases
```python
# ❌ WRONG
from infra.repositories.user import PostgresUserRepository  # ❌ WRONG
from infra.clients.google import GoogleOAuthClient  # ❌ WRONG
```

### ❌ NEVER work with ORM models
```python
# ❌ WRONG
async def execute(self, email: str) -> UserDB:  # ❌ Returns ORM
    async with self._uow.transaction() as tx:
        user_db = UserDB(email=email)  # ❌ ORM in use case
        tx.session.add(user_db)  # ❌ Direct session access
```

## Use Case Composition

Use cases can compose other use cases:

```python
class LinkSocialAccountUseCase:
    def __init__(
        self,
        uow: AsyncUnitOfWork,
        oauth_callback_use_case: HandleOAuthCallbackUseCase,
    ) -> None:
        self._uow = uow
        self._oauth_callback_use_case = oauth_callback_use_case

    async def execute(self, user_id: UUID, code: str) -> SocialAccount:
        # Reuse existing use case
        account = await self._oauth_callback_use_case.execute(
            user_id=user_id,
            code=code,
        )
        return account
```

## DI Registration

Use cases are registered in `infra/di/providers/use_cases.py`:

```python
from dishka import Provider, Scope, provide
from core.uow import AsyncUnitOfWork
from use_cases.users.create_user import CreateUserUseCase

class UseCaseProvider(Provider):
    scope = Scope.REQUEST

    @provide
    def get_create_user_use_case(
        self,
        uow: AsyncUnitOfWork
    ) -> CreateUserUseCase:
        return CreateUserUseCase(uow)
```

## Summary Checklist

When creating use cases:
- [ ] Accept `AsyncUnitOfWork` in `__init__`, NOT `AsyncSession`
- [ ] Access repositories via `async with self._uow.transaction() as tx:`
- [ ] Return domain entities or DTOs, NOT ORM models
- [ ] Do NOT import from `infra/` (repositories, ORM, clients)
- [ ] Do NOT call `session.commit()` manually
- [ ] Register in `infra/di/providers/use_cases.py`
- [ ] All database operations within `async with uow.transaction()` block
