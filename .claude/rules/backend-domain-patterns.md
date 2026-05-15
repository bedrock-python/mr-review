# Domain Patterns

Core patterns used across all services.

## Unit of Work (UoW)
All database operations MUST be performed within a UoW transaction to ensure atomicity.

### ✅ Correct Pattern:
```python
# Use cases MUST accept AsyncUnitOfWork, NOT AsyncSession
class CreateUserUseCase:
    def __init__(self, uow: AsyncUnitOfWork) -> None:
        self._uow = uow

    async def execute(self, user_data: UserDTO) -> User:
        async with self._uow.transaction() as tx:
            user = await tx.users.create(**user_data.dict())
            await tx.outbox.create(UserCreatedEvent(user_id=user.id))
        return user
```

### ❌ Incorrect Pattern:
```python
# NEVER accept AsyncSession directly in use cases
class CreateUserUseCase:
    def __init__(self, session: AsyncSession) -> None:  # ❌ WRONG
        self._session = session
        self._repo = UserRepository(session)  # ❌ WRONG
```

### UoW Transaction Protocol
All repositories are accessed through the transaction context:
```python
async with uow.transaction() as tx:
    # Access repositories via tx
    user = await tx.users.get_by_id(user_id)
    accounts = await tx.social_accounts.list_by_user(user_id)
    profile = await tx.profiles.get_by_user_id(user_id)
```

## Repository Pattern
Repositories handle data persistence and MUST return Domain Entities, NOT ORM models.

### ✅ Correct Repository Implementation:
```python
# infra/repositories/user.py
from core.users.entities import User  # Domain Entity
from infra.db.orm.user import UserDB  # ORM model

class PostgresUserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _to_entity(self, db_model: UserDB) -> User:
        """Convert ORM model to domain entity."""
        return User(
            id=db_model.id,
            email=db_model.email,
            created_at=db_model.created_at,
        )

    async def create(self, email: str) -> User:
        user_db = UserDB(email=email)
        self._session.add(user_db)
        await self._session.flush()
        return self._to_entity(user_db)  # ✅ Return entity

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self._session.execute(
            select(UserDB).where(UserDB.id == user_id)
        )
        db_model = result.scalar_one_or_none()
        return self._to_entity(db_model) if db_model else None
```

### ❌ Incorrect Repository:
```python
# ❌ WRONG: returning ORM models
async def create(self, email: str) -> UserDB:  # ❌ returns ORM
    user_db = UserDB(email=email)
    self._session.add(user_db)
    return user_db  # ❌ WRONG
```

### Repository Protocol (core/)
```python
# core/users/repositories.py
from typing import Protocol
from uuid import UUID
from core.users.entities import User

class UserRepository(Protocol):
    async def create(self, email: str) -> User: ...
    async def get_by_id(self, user_id: UUID) -> User | None: ...
```

### Repository Naming Convention
- Repository implementations MUST be prefixed with the database type
- Examples: `PostgresUserRepository`, `PostgresSocialAccountRepository`
- NOT: `UserRepository` (this is the protocol name in core/)

## Transactional Outbox
Ensures at-least-once delivery of events to Kafka.
1. Business logic writes an event to the `outbox_events` table in the same DB transaction.
2. Background worker polls `outbox_events` and publishes to Kafka.
3. Event is marked as `PUBLISHED` upon success.

## Dependency Injection (DI)
We use `Dishka` for DI.
- **Scope**:
  - `APP`: Long-lived (DB pool, Redis client, HTTP clients).
  - `REQUEST`: Per-request/transaction (Session, UoW, Use Cases).
- **Providers**: Located in `infra/di/providers/`.

### Use Case Providers
```python
# infra/di/providers/use_cases.py
class UseCaseProvider(Provider):
    scope = Scope.REQUEST

    @provide
    def get_create_user_use_case(
        self,
        uow: AsyncUnitOfWork
    ) -> CreateUserUseCase:
        return CreateUserUseCase(uow)
```

## Shared Infrastructure Libraries
Always prefer using shared libs:
- `sqlalchemy-postgres-kit`: Base models and session management.
- `unit-of-work-kit`: Base UoW classes.
- `omni-box`: Outbox/Inbox implementation.
- `dishka-providers`: Common providers.
- `rest-client-kit`: HTTP client factory with observability.
