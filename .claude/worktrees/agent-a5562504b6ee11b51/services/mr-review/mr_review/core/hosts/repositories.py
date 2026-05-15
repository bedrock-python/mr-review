from __future__ import annotations

from typing import Protocol
from uuid import UUID

from mr_review.core.hosts.entities import Host


class HostRepository(Protocol):
    async def create(self, name: str, type_: str, base_url: str, token: str) -> Host: ...

    async def get_by_id(self, host_id: UUID) -> Host | None: ...

    async def list_all(self) -> list[Host]: ...

    async def delete(self, host_id: UUID) -> bool: ...
