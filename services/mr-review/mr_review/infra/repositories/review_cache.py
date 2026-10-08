"""In-memory cache of the review files, for :class:`FileReviewRepository`.

Two layers, both validated against the file on disk before use:

* **metadata** — ``updated_at`` and the (host, repository, MR) key of *every* review file,
  plus an index from that key to file names. It is small, and is what lets the history list
  be sorted and ``get_by_mr`` be answered without parsing every file;
* **parsed files** — the YAML of recently used reviews, bounded by source size and evicted
  least recently used first. Only what is actually returned gets parsed.

A cache entry is identified by the file's device, inode, size, mtime and ctime, taken with
``fstat`` on the open file, and is stored while that file is still open, so its inode
cannot have been freed and reused by a newer file in the meantime. A read that started
before this repository wrote the file never stores its (older) result.
"""

from __future__ import annotations

import logging
import os
import threading
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.sources import MRSource
from mr_review.infra.repositories.file_store import load_yaml

_log = logging.getLogger(__name__)

MRKey = tuple[UUID, str, int]
_Signature = tuple[int, int, int, int, int]

# YAML source kept parsed in memory. Parsed objects take a few times the source size, so
# this bounds the cache to some tens of megabytes; the history page is far below it.
PARSED_CACHE_MAX_BYTES = 16 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class ReviewMeta:
    """What the listing and the MR index need from a review file; kept for every file."""

    signature: _Signature
    updated_at: datetime
    mr_key: MRKey | None


@dataclass(frozen=True, slots=True)
class _Parsed:
    signature: _Signature
    data: dict[str, object]
    size: int


Loaded = tuple[ReviewMeta, dict[str, object] | None]


def _signature(st: os.stat_result) -> _Signature:
    return st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns


def mr_key_of(review: Review) -> MRKey | None:
    if isinstance(review.source, MRSource):
        return review.host_id, review.repo_path, review.source.mr_iid
    return None


def _mtime_ns(path: Path) -> int | None:
    try:
        return path.stat().st_mtime_ns
    except FileNotFoundError:
        return None


class ReviewFileCache:
    """Thread-safe: every method may be called from worker threads concurrently."""

    def __init__(self, reviews_dir: Path, decode: Callable[[dict[str, object]], Review]) -> None:
        self._dir = reviews_dir
        self._decode = decode
        self._lock = threading.Lock()  # guards every field below
        self._meta: dict[str, ReviewMeta] = {}
        self._by_mr: dict[MRKey, set[str]] = {}
        self._parsed: OrderedDict[str, _Parsed] = OrderedDict()
        self._parsed_bytes = 0
        # Bumped on every write or delete this repository makes; _last_write remembers the
        # generation of the latest one per file name (a few dozen bytes per review ever
        # written by this process), so a read can tell that a write overtook it.
        self._generation = 0
        self._last_write: dict[str, int] = {}
        self._indexed_dir_mtime_ns: int | None = None

    # -- bookkeeping; callers hold _lock -------------------------------------------------

    def _forget(self, name: str) -> None:
        meta = self._meta.pop(name, None)
        if meta is not None and meta.mr_key is not None:
            names = self._by_mr.get(meta.mr_key)
            if names is not None:
                names.discard(name)
                if not names:
                    del self._by_mr[meta.mr_key]
        parsed = self._parsed.pop(name, None)
        if parsed is not None:
            self._parsed_bytes -= parsed.size

    def _remember(self, name: str, meta: ReviewMeta, parsed: _Parsed) -> None:
        self._forget(name)
        self._meta[name] = meta
        if meta.mr_key is not None:
            self._by_mr.setdefault(meta.mr_key, set()).add(name)
        self._parsed[name] = parsed
        self._parsed_bytes += parsed.size
        while self._parsed_bytes > PARSED_CACHE_MAX_BYTES and len(self._parsed) > 1:
            _, evicted = self._parsed.popitem(last=False)
            self._parsed_bytes -= evicted.size

    def _parsed_data(self, name: str, signature: _Signature) -> dict[str, object] | None:
        parsed = self._parsed.get(name)
        if parsed is None or parsed.signature != signature:
            return None
        self._parsed.move_to_end(name)
        return parsed.data

    def _overtaken(self, name: str, started: int) -> bool:
        return self._last_write.get(name, 0) > started

    def _forget_unless_overtaken(self, name: str, started: int) -> None:
        with self._lock:
            if not self._overtaken(name, started):
                self._forget(name)

    def _cached(self, name: str, signature: _Signature, *, with_data: bool) -> Loaded | None:
        with self._lock:
            meta = self._meta.get(name)
            if meta is None or meta.signature != signature:
                return None
            if not with_data:
                return meta, None
            data = self._parsed_data(name, signature)
            return (meta, data) if data is not None else None

    def _decode_file(self, path: Path, content: bytes) -> tuple[dict[str, object], Review] | None:
        raw = load_yaml(content)
        if raw is None:  # an empty file holds no review
            return None
        if not isinstance(raw, dict):
            raise TypeError(f"Expected a mapping in {path}, got {type(raw).__name__}")
        return raw, self._decode(raw)

    # -- reads ---------------------------------------------------------------------------

    def load(self, path: Path, *, with_data: bool) -> Loaded | None:
        """The file's metadata and, with ``with_data``, its parsed content; ``None`` if absent.

        Parses only when the file changed since it was last seen or its parse was evicted.
        Raises if the file is not a valid review.
        """
        name = path.name
        with self._lock:
            started = self._generation
        try:
            handle = path.open("rb")
        except FileNotFoundError:
            self._forget_unless_overtaken(name, started)
            return None
        with handle:
            signature = _signature(os.fstat(handle.fileno()))
            cached = self._cached(name, signature, with_data=with_data)
            if cached is not None:
                return cached
            content = handle.read()
            # Parsed and stored while the file is still open, so its inode cannot have been
            # reused by a newer file by the time the entry is in place.
            try:
                decoded = self._decode_file(path, content)
            except Exception:
                self._forget_unless_overtaken(name, started)
                raise
            if decoded is None:
                self._forget_unless_overtaken(name, started)
                return None
            raw, review = decoded
            meta = ReviewMeta(signature, review.updated_at, mr_key_of(review))
            with self._lock:
                # A write by this repository after the read began has stored newer content.
                if not self._overtaken(name, started):
                    self._remember(name, meta, _Parsed(signature, raw, len(content)))
        return meta, raw

    def load_or_skip(self, path: Path, *, with_data: bool) -> Loaded | None:
        try:
            return self.load(path, with_data=with_data)
        except Exception:
            _log.warning("Corrupt or unreadable review file %s, skipping", path)
            return None

    def files(self) -> list[Path]:
        try:
            with os.scandir(self._dir) as listing:
                # Dot-files are temporary files of writes in progress.
                return [
                    Path(item.path)
                    for item in listing
                    if not item.name.startswith(".") and item.name.endswith(".yaml") and item.is_file()
                ]
        except FileNotFoundError:
            return []

    def scan(self) -> dict[str, ReviewMeta]:
        """Metadata of every review file, parsing only changed ones, and refresh the MR index."""
        with self._lock:
            generation = self._generation
        dir_mtime = _mtime_ns(self._dir)
        paths = self.files()
        metas: dict[str, ReviewMeta] = {}
        for path in paths:
            loaded = self.load_or_skip(path, with_data=False)
            if loaded is not None:
                metas[path.name] = loaded[0]
        seen = {path.name for path in paths}
        with self._lock:
            if self._generation != generation:
                # A write raced the scan; the next lookup rescans rather than trust an
                # index that may have missed it.
                self._indexed_dir_mtime_ns = None
                return metas
            for name in [name for name in self._meta if name not in seen]:
                self._forget(name)
            self._indexed_dir_mtime_ns = dir_mtime
        return metas

    def names_for(self, key: MRKey) -> list[str]:
        """Files the index holds for an MR, rebuilding the index if the directory changed."""
        with self._lock:
            indexed = self._indexed_dir_mtime_ns
        if indexed is None or indexed != _mtime_ns(self._dir):
            self.scan()
        with self._lock:
            return list(self._by_mr.get(key, ()))

    # -- writes made by the repository ---------------------------------------------------

    def directory_mtime(self) -> int | None:
        return _mtime_ns(self._dir)

    def record_write(
        self,
        path: Path,
        data: dict[str, object],
        review: Review,
        written: os.stat_result,
        dir_before: int | None,
    ) -> None:
        """Remember a file the repository has just renamed into place, ``written`` being the
        stat of the file it wrote and ``dir_before`` the directory's mtime before the write."""
        try:
            current: os.stat_result | None = os.stat(path)
        except FileNotFoundError:
            current = None
        dir_after = _mtime_ns(self._dir)
        with self._lock:
            self._bump(path.name, dir_before, dir_after)
            if current is None or (current.st_dev, current.st_ino) != (written.st_dev, written.st_ino):
                self._forget(path.name)  # replaced meanwhile by someone else: read it afresh
                return
            # The stat after the rename: the rename itself may have changed the ctime.
            signature = _signature(current)
            meta = ReviewMeta(signature, review.updated_at, mr_key_of(review))
            self._remember(path.name, meta, _Parsed(signature, data, current.st_size))

    def record_delete(self, path: Path, dir_before: int | None) -> None:
        dir_after = _mtime_ns(self._dir)
        with self._lock:
            self._bump(path.name, dir_before, dir_after)
            self._forget(path.name)

    def _bump(self, name: str, dir_before: int | None, dir_after: int | None) -> None:
        self._generation += 1
        self._last_write[name] = self._generation
        # The index stays complete only if nothing else touched the directory meanwhile.
        if self._indexed_dir_mtime_ns is not None and self._indexed_dir_mtime_ns == dir_before:
            self._indexed_dir_mtime_ns = dir_after
