from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from mr_review.core.hosts.entities import Host


class HostRepository(Protocol):
    async def create(
        self, name: str, type_: str, base_url: str, token: str, color: str | None = None, timeout: int = 30
    ) -> Host: ...

    async def get_by_id(self, host_id: UUID) -> Host | None: ...

    async def list_all(self) -> list[Host]: ...

    async def update(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
        color: str | None = None,
        timeout: int | None = None,
    ) -> Host | None: ...

    async def set_favourite_repos(self, host_id: UUID, repo_paths: list[str]) -> Host | None: ...

    async def update_with(self, host_id: UUID, change: Callable[[Host], Host]) -> Host | None:
        """Atomically read the host, apply ``change`` and store the result.

        Concurrent changes are serialised, so none of them is lost. Returning the very
        object ``change`` was given writes nothing. ``None`` when no host has that id.
        """
        ...

    async def upsert_with(self, host_id: UUID, change: Callable[[Host | None], Host | None]) -> Host | None:
        """Like :meth:`update_with`, but ``change`` gets ``None`` for a missing host and may create it.

        Returning ``None`` or the object it was given writes nothing. The stored host is
        returned as-is, ``id`` and ``created_at`` included.
        """
        ...

    async def delete(self, host_id: UUID) -> bool: ...
