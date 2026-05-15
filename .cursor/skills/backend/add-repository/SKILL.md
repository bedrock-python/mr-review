# Skill: Add Repository

Procedure for adding a new repository for a domain entity.

## Procedure

1. **Define Protocol**:
   In `core/<entity>/repositories.py`:
   ```python
   class NounRepository(Protocol):
       async def create(self, entity: Noun) -> Noun: ...
       async def get_by_id(self, id: UUID) -> Noun | None: ...
   ```

2. **Define ORM Model**:
   In `infra/db/orm/<entity>.py`:
   ```python
   class NounDB(BaseTable):
       __tablename__ = "nouns"
       id: Mapped[UUID] = mapped_column(primary_key=True)
       ...
   ```

3. **Implement Repository**:
   In `infra/repositories/<entity>.py`:
   ```python
   class PostgresNounRepository(NounRepository):
       def __init__(self, session: AsyncSession) -> None:
           self._session = session

       async def create(self, entity: Noun) -> Noun:
           db_obj = NounDB(...)
           self._session.add(db_obj)
           return self._to_entity(db_obj)
   ```

4. **Register in UoW**:
   Update the `UowTransaction` implementation in `infra/uow.py` to include the new repository as a lazy property.

5. **Generate Migration**:
   Use `make alembic-new-migration` to create the table.

6. **Add Tests**:
   Unit tests for the repository implementation in `tests/unit/repositories/`.
