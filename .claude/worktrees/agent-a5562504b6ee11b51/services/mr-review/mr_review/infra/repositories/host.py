from __future__ import annotations

from datetime import timezone
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from mr_review.core.hosts.entities import Host
from mr_review.infra.db.orm.host import HostDB


class SQLiteHostRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _to_entity(self, db: HostDB) -> Host:
        created_at = db.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return Host(
            id=UUID(db.id),
            name=db.name,
            type=db.type,
            base_url=db.base_url,
            token=db.token,
            created_at=created_at,
        )

    async def create(self, name: str, type_: str, base_url: str, token: str) -> Host:
        db = HostDB(name=name, type=type_, base_url=base_url, token=token)
        self._session.add(db)
        await self._session.flush()
        await self._session.refresh(db)
        return self._to_entity(db)

    async def get_by_id(self, host_id: UUID) -> Host | None:
        result = await self._session.execute(select(HostDB).where(HostDB.id == str(host_id)))
        db = result.scalar_one_or_none()
        return self._to_entity(db) if db else None

    async def list_all(self) -> list[Host]:
        result = await self._session.execute(select(HostDB).order_by(HostDB.created_at))
        return [self._to_entity(db) for db in result.scalars().all()]

    async def delete(self, host_id: UUID) -> bool:
        result = await self._session.execute(delete(HostDB).where(HostDB.id == str(host_id)))
        await self._session.flush()
        return (result.rowcount or 0) > 0  # type: ignore[attr-defined]
