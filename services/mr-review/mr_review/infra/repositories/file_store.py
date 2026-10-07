"""Building blocks shared by the YAML-file repositories.

Every repository in this package keeps its state in YAML files under the data directory,
and they all rely on the same guarantees from this module:

* a write is atomic and durable: the content goes to a uniquely named temporary file in the
  target directory, is flushed and fsynced, and is then renamed over the target, so a reader
  sees either the old file or the new one and never a torn mix of two writers;
* files are created readable by the owner only (0600) and directories are created 0700 —
  best effort on platforms without POSIX permissions;
* read-modify-write cycles are serialised per record with :class:`KeyedLock`, and a write
  that has started runs to completion even when the request awaiting it is cancelled.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import stat
import tempfile
import time
from collections.abc import AsyncIterator, Awaitable, Callable, Hashable
from pathlib import Path
from typing import Generic, TypeVar

import yaml

_log = logging.getLogger(__name__)

# libyaml-backed loader and dumper are ~7x faster than the pure-Python ones; PyYAML only
# exposes them when it was built against libyaml, hence the fallback.
_YAML_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
_YAML_DUMPER = getattr(yaml, "CSafeDumper", yaml.SafeDumper)

_PRIVATE_DIR_MODE = 0o700
_PRIVATE_FILE_MODE = 0o600
_GROUP_OTHER_BITS = stat.S_IRWXG | stat.S_IRWXO

# Windows refuses to replace a file another handle has open; readers hold files for
# milliseconds, so a short retry is enough.
_REPLACE_ATTEMPTS = 10
_REPLACE_RETRY_DELAY_S = 0.02

K = TypeVar("K", bound=Hashable)
T = TypeVar("T")


def load_yaml(content: str | bytes) -> object:
    """Parse YAML with the safe loader, using libyaml when it is available."""
    return yaml.load(content, Loader=_YAML_LOADER)  # noqa: S506 - a safe loader, C or pure Python


def dump_yaml(data: object) -> str:
    """Serialise ``data`` to YAML with the safe dumper, using libyaml when it is available."""
    return str(yaml.dump(data, Dumper=_YAML_DUMPER, allow_unicode=True, sort_keys=False))


def ensure_private_dir(path: Path) -> None:
    """Create ``path`` (owner-only) if it does not exist yet. Existing directories are left alone."""
    if path.is_dir():
        return
    path.mkdir(mode=_PRIVATE_DIR_MODE, parents=True, exist_ok=True)


def restrict_file_permissions(path: Path) -> None:
    """Make an existing file owner-only when group or others can access it. Best effort."""
    try:
        mode = stat.S_IMODE(path.stat().st_mode)
        if mode & _GROUP_OTHER_BITS:
            path.chmod(_PRIVATE_FILE_MODE)
            _log.info("Restricted permissions of %s to owner-only", path)
    except FileNotFoundError:
        return
    except OSError as exc:
        _log.warning("Could not restrict permissions of %s: %s", path, exc)


def write_file_atomically(path: Path, content: str) -> os.stat_result:
    """Replace ``path`` with ``content`` atomically and durably; return the new file's stat.

    The temporary file is created by :mod:`tempfile`, so it is owner-only (0600) and the
    target inherits that mode when it is renamed into place.
    """
    ensure_private_dir(path.parent)
    tmp = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed below, then renamed into place
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    )
    tmp_path = Path(tmp.name)
    try:
        with tmp:
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
            written = os.fstat(tmp.fileno())
        _replace(tmp_path, path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
    _fsync_directory(path.parent)
    return written


def _replace(source: Path, target: Path) -> None:
    if os.name != "nt":
        os.replace(source, target)
        return
    for attempt in range(_REPLACE_ATTEMPTS):
        try:
            os.replace(source, target)
        except PermissionError:
            if attempt == _REPLACE_ATTEMPTS - 1:
                raise
            time.sleep(_REPLACE_RETRY_DELAY_S)
        else:
            return


def _fsync_directory(path: Path) -> None:
    """Persist the rename itself. Not possible on Windows, where directories cannot be opened."""
    if os.name == "nt":
        return
    with contextlib.suppress(OSError):
        fd = os.open(path, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


class KeyedLock(Generic[K]):
    """Per-key asyncio locks, dropped as soon as nobody holds or waits for them.

    Locks are created lazily and removed on release, so the registry never grows with the
    number of records and no lock outlives the event loop it was first used on.
    """

    def __init__(self) -> None:
        self._locks: dict[K, asyncio.Lock] = {}
        self._users: dict[K, int] = {}
        self._detached: set[Awaitable[object]] = set()

    @contextlib.asynccontextmanager
    async def hold(self, key: K) -> AsyncIterator[None]:
        """Hold the lock for ``key`` for the duration of the ``async with`` block."""
        lock = self._locks.get(key)
        if lock is None:
            lock = self._locks[key] = asyncio.Lock()
        self._users[key] = self._users.get(key, 0) + 1
        try:
            async with lock:
                yield
        finally:
            remaining = self._users[key] - 1
            if remaining:
                self._users[key] = remaining
            else:
                del self._users[key]
                del self._locks[key]

    async def run(self, key: K, operation: Callable[[], Awaitable[T]]) -> T:
        """Run ``operation`` while holding the lock for ``key``.

        The operation runs in its own task shielded from the caller's cancellation: a
        cancelled request still gets ``CancelledError``, but a write it already started is
        finished and the lock is released only afterwards, so the next writer can never
        overtake it.
        """

        async def _locked() -> T:
            async with self.hold(key):
                return await operation()

        task = asyncio.create_task(_locked())
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            # Keep the operation referenced until it finishes, and report its failure
            # since the cancelled caller will never see it.
            self._detached.add(task)
            task.add_done_callback(self._finish_detached)
            raise

    def _finish_detached(self, task: asyncio.Task[T]) -> None:
        self._detached.discard(task)
        if task.cancelled():
            return
        exc = task.exception()
        if exc is not None:
            _log.error("A write finished after its request was cancelled, and failed", exc_info=exc)
