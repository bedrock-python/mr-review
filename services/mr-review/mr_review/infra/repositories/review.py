from __future__ import annotations

import asyncio
import logging
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4

from pydantic import ValidationError

from mr_review.core.reviews.entities import (
    BriefConfig,
    Comment,
    CommentPost,
    Iteration,
    IterationStage,
    Review,
)
from mr_review.core.reviews.severity import DEFAULT_SEVERITY, normalize_severity
from mr_review.core.reviews.sources import BranchDiffSource, MRSource, ReviewSource
from mr_review.infra.repositories.file_store import KeyedLock, dump_yaml, load_yaml, write_file_atomically
from mr_review.infra.utils import now_utc as _now_utc

_log = logging.getLogger(__name__)
_MAX_REVIEWS = 50
_COMMENT_STATUSES = frozenset({"kept", "dismissed"})


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _comment_from_dict(data: object) -> Comment | None:
    """A stored comment, or ``None`` (logged) when it cannot be read even leniently.

    Files written by older versions or edited by hand may spell a severity any way, or hold a
    status that no longer exists; one such comment must not make the whole review unreadable.
    """
    if not isinstance(data, dict):
        _log.warning("Skipping a stored comment that is not a mapping: %r", data)
        return None
    fields = dict(data)
    fields["severity"] = normalize_severity(fields.get("severity")) or DEFAULT_SEVERITY
    if fields.get("status") not in _COMMENT_STATUSES:
        fields.pop("status", None)
    post = fields.get("post")
    if post is not None and not _is_valid_post(post):
        # Losing the record of an earlier post is better than losing the comment.
        _log.warning("Dropping an unreadable post record of stored comment %r", fields.get("id"))
        fields.pop("post")
    try:
        return Comment.model_validate(fields)
    except ValidationError:
        _log.warning("Skipping an unreadable stored comment %r", fields.get("id"))
        return None


def _is_valid_post(data: object) -> bool:
    try:
        CommentPost.model_validate(data)
    except ValidationError:
        return False
    return True


def _comment_to_dict(comment: Comment) -> dict[str, object]:
    return comment.model_dump(mode="json")


def _comments_from_list(raw: object) -> list[Comment]:
    if not isinstance(raw, list):
        return []
    return [comment for comment in (_comment_from_dict(item) for item in raw) if comment is not None]


def _brief_config_from_dict(raw: object) -> BriefConfig:
    """A stored brief; a field that no longer validates (an unknown preset, a value out of range)
    falls back to its default instead of making the whole review unreadable."""
    if not isinstance(raw, dict):
        return BriefConfig()
    fields = {str(key): value for key, value in raw.items()}
    try:
        return BriefConfig.model_validate(fields)
    except ValidationError as exc:
        bad = {str(error["loc"][0]) for error in exc.errors() if error["loc"]}
        _log.warning("Stored brief has unreadable fields %s; using their defaults", sorted(bad))
    try:
        return BriefConfig.model_validate({key: value for key, value in fields.items() if key not in bad})
    except ValidationError:
        return BriefConfig()


def _iteration_from_dict(data: dict[str, object]) -> Iteration:
    comments = _comments_from_list(data.get("comments"))
    raw_response = data.get("raw_response")

    brief_config = _brief_config_from_dict(data.get("brief_config"))

    completed_at: datetime | None = None
    if data.get("completed_at"):
        completed_at = _aware(datetime.fromisoformat(str(data["completed_at"])))

    ai_provider_id: UUID | None = None
    if data.get("ai_provider_id"):
        ai_provider_id = UUID(str(data["ai_provider_id"]))

    model: str | None = str(data["model"]) if data.get("model") else None

    return Iteration(
        id=UUID(str(data["id"])),
        number=int(str(data["number"])),
        stage=IterationStage(str(data.get("stage") or IterationStage.brief.value)),
        comments=comments,
        ai_provider_id=ai_provider_id,
        model=model,
        brief_config=brief_config,
        created_at=_aware(datetime.fromisoformat(str(data["created_at"]))),
        completed_at=completed_at,
        raw_response=raw_response if isinstance(raw_response, str) else None,
    )


def _iteration_to_dict(iteration: Iteration) -> dict[str, object]:
    return {
        "id": str(iteration.id),
        "number": iteration.number,
        "stage": iteration.stage.value,
        "comments": [_comment_to_dict(c) for c in iteration.comments],
        "ai_provider_id": str(iteration.ai_provider_id) if iteration.ai_provider_id else None,
        "model": iteration.model,
        "brief_config": iteration.brief_config.model_dump(mode="json"),
        "created_at": iteration.created_at.isoformat(),
        "completed_at": iteration.completed_at.isoformat() if iteration.completed_at else None,
        "raw_response": iteration.raw_response,
    }


def _source_from_dict(data: dict[str, object], legacy_mr_iid: int) -> ReviewSource:
    """Build a ``ReviewSource`` from YAML, falling back to ``MRSource`` for legacy rows."""
    raw = data.get("source")
    if raw is None:
        return MRSource(mr_iid=legacy_mr_iid)
    if not isinstance(raw, dict):
        raise TypeError(f"Invalid review source payload: {raw!r}")
    kind = raw.get("kind")
    if kind == "mr":
        return MRSource(mr_iid=int(str(raw.get("mr_iid", legacy_mr_iid))))
    if kind == "branch_diff":
        return BranchDiffSource(
            base_ref=str(raw["base_ref"]),
            head_ref=str(raw["head_ref"]),
            title=str(raw.get("title", "") or ""),
        )
    raise ValueError(f"Unknown review source kind: {kind!r}")


def _source_to_dict(source: ReviewSource) -> dict[str, object]:
    return cast("dict[str, object]", source.model_dump(mode="json"))


def _review_from_dict(data: dict[str, object]) -> Review:
    iterations_raw = data.get("iterations") or []
    if not isinstance(iterations_raw, list):
        iterations_raw = []
    iterations = [_iteration_from_dict(i) for i in iterations_raw]

    legacy_mr_iid = int(str(data.get("mr_iid", 0)))
    source = _source_from_dict(data, legacy_mr_iid)
    mr_iid = source.mr_iid if isinstance(source, MRSource) else 0

    return Review(
        id=UUID(str(data["id"])),
        host_id=UUID(str(data["host_id"])),
        repo_path=str(data["repo_path"]),
        mr_iid=mr_iid,
        source=source,
        iterations=iterations,
        created_at=_aware(datetime.fromisoformat(str(data["created_at"]))),
        updated_at=_aware(datetime.fromisoformat(str(data["updated_at"]))),
    )


def _review_to_dict(review: Review) -> dict[str, object]:
    return {
        "id": str(review.id),
        "host_id": str(review.host_id),
        "repo_path": review.repo_path,
        "mr_iid": review.mr_iid,
        "source": _source_to_dict(review.source),
        "iterations": [_iteration_to_dict(i) for i in review.iterations],
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat(),
    }


_MRKey = tuple[UUID, str, int]
_Signature = tuple[int, int, int]


@dataclass(slots=True)
class _CachedReview:
    """A parsed review file. ``data`` is never handed out: every read builds a fresh entity."""

    signature: _Signature
    data: dict[str, object]
    updated_at: datetime
    mr_key: _MRKey | None


def _signature(st: os.stat_result) -> _Signature:
    # The inode changes on every atomic write (a new file is renamed into place), so a
    # coarse mtime on some filesystems cannot hide a change.
    return st.st_ino, st.st_mtime_ns, st.st_size


def _mr_key(review: Review) -> _MRKey | None:
    if isinstance(review.source, MRSource):
        return review.host_id, review.repo_path, review.source.mr_iid
    return None


def _mtime_ns(path: Path) -> int | None:
    try:
        return path.stat().st_mtime_ns
    except FileNotFoundError:
        return None


class FileReviewRepository:
    """One YAML file per review under ``reviews/``.

    Parsed files are cached in memory and keyed by inode, mtime and size, so an unchanged
    file is parsed once; every read still builds a fresh entity, so no caller can mutate the
    cache. An index over (host, repository, MR) answers ``get_by_mr`` without scanning; it
    is rebuilt when the directory changed other than through this repository.

    Writes to one review are serialised per review id, and finding-or-creating the review
    of an MR is serialised per MR.
    """

    def __init__(self, data_dir: Path) -> None:
        self._reviews_dir = data_dir / "reviews"
        self._review_locks: KeyedLock[UUID] = KeyedLock()
        self._mr_locks: KeyedLock[_MRKey] = KeyedLock()
        # The cache is used from worker threads; this lock guards every field below it.
        self._cache_lock = threading.Lock()
        self._cache: dict[str, _CachedReview] = {}
        self._by_mr: dict[_MRKey, set[str]] = {}
        self._generation = 0
        self._indexed_dir_mtime_ns: int | None = None

    def _review_path(self, review_id: UUID) -> Path:
        return self._reviews_dir / f"{review_id}.yaml"

    # -- cache bookkeeping; callers hold _cache_lock --------------------------------------

    def _store_entry(self, name: str, entry: _CachedReview) -> None:
        self._drop_entry(name)
        self._cache[name] = entry
        if entry.mr_key is not None:
            self._by_mr.setdefault(entry.mr_key, set()).add(name)

    def _drop_entry(self, name: str) -> None:
        entry = self._cache.pop(name, None)
        if entry is None or entry.mr_key is None:
            return
        names = self._by_mr.get(entry.mr_key)
        if names is not None:
            names.discard(name)
            if not names:
                del self._by_mr[entry.mr_key]

    def _record_own_change(self, name: str, entry: _CachedReview | None, dir_before: int | None) -> None:
        """Apply a write or delete made by this repository to the cache and the index."""
        dir_after = _mtime_ns(self._reviews_dir)
        with self._cache_lock:
            if entry is None:
                self._drop_entry(name)
            else:
                self._store_entry(name, entry)
            self._generation += 1
            # The index stays fresh only if nothing else touched the directory meanwhile.
            if self._indexed_dir_mtime_ns is not None and self._indexed_dir_mtime_ns == dir_before:
                self._indexed_dir_mtime_ns = dir_after

    # -- synchronous file access; run in worker threads -----------------------------------

    def _load_entry(self, path: Path) -> _CachedReview | None:
        """Return the parsed file, parsing it only when it changed since the last read."""
        try:
            handle = path.open("rb")
        except FileNotFoundError:
            with self._cache_lock:
                self._drop_entry(path.name)
            return None
        with handle:
            signature = _signature(os.fstat(handle.fileno()))
            with self._cache_lock:
                cached = self._cache.get(path.name)
            if cached is not None and cached.signature == signature:
                return cached
            content = handle.read()
        try:
            data = load_yaml(content)
            if data is not None and not isinstance(data, dict):
                raise TypeError(f"Expected a mapping in {path}, got {type(data).__name__}")
            review = _review_from_dict(data) if data is not None else None
        except Exception:
            with self._cache_lock:
                self._drop_entry(path.name)
            raise
        if data is None or review is None:  # an empty file holds no review
            with self._cache_lock:
                self._drop_entry(path.name)
            return None
        entry = _CachedReview(signature, data, review.updated_at, _mr_key(review))
        with self._cache_lock:
            self._store_entry(path.name, entry)
        return entry

    def _read_review(self, review_id: UUID) -> Review | None:
        entry = self._load_entry(self._review_path(review_id))
        return _review_from_dict(entry.data) if entry is not None else None

    def _write_review(self, review: Review) -> None:
        path = self._review_path(review.id)
        data = _review_to_dict(review)
        dir_before = _mtime_ns(self._reviews_dir)
        written = write_file_atomically(path, dump_yaml(data))
        entry = _CachedReview(_signature(written), data, review.updated_at, _mr_key(review))
        self._record_own_change(path.name, entry, dir_before)

    def _delete_file(self, review_id: UUID) -> bool:
        path = self._review_path(review_id)
        dir_before = _mtime_ns(self._reviews_dir)
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        self._record_own_change(path.name, None, dir_before)
        return True

    def _load_or_skip(self, path: Path) -> _CachedReview | None:
        try:
            return self._load_entry(path)
        except Exception:
            _log.warning("Corrupt or unreadable review file %s, skipping", path)
            return None

    def _review_files(self) -> list[Path]:
        try:
            with os.scandir(self._reviews_dir) as listing:
                # Dot-files are temporary files of writes in progress.
                return [
                    Path(item.path)
                    for item in listing
                    if not item.name.startswith(".") and item.name.endswith(".yaml") and item.is_file()
                ]
        except FileNotFoundError:
            return []

    def _scan(self) -> list[_CachedReview]:
        """Load every review file, reusing cached parses, and refresh the MR index."""
        with self._cache_lock:
            generation = self._generation
        dir_mtime = _mtime_ns(self._reviews_dir)
        paths = self._review_files()
        entries = [entry for entry in map(self._load_or_skip, paths) if entry is not None]
        seen = {path.name for path in paths}
        with self._cache_lock:
            if self._generation != generation:
                # A write raced the scan; what the scan missed is in the cache already, and
                # the next lookup rescans rather than trust a possibly incomplete index.
                self._indexed_dir_mtime_ns = None
                return entries
            for name in [name for name in self._cache if name not in seen]:
                self._drop_entry(name)
            self._indexed_dir_mtime_ns = dir_mtime
        return entries

    def _index_is_fresh(self) -> bool:
        with self._cache_lock:
            indexed = self._indexed_dir_mtime_ns
        return indexed is not None and indexed == _mtime_ns(self._reviews_dir)

    def _find_by_mr(self, key: _MRKey) -> Review | None:
        if not self._index_is_fresh():
            self._scan()
        with self._cache_lock:
            names = list(self._by_mr.get(key, ()))
        # Re-check each hit against its file: it may have been deleted or rewritten since.
        loaded = (self._load_or_skip(self._reviews_dir / name) for name in names)
        candidates = [entry for entry in loaded if entry is not None and entry.mr_key == key]
        if not candidates:
            return None
        # Duplicates can exist from older versions or imports; the latest one is the live one.
        newest = max(candidates, key=lambda entry: entry.updated_at)
        return _review_from_dict(newest.data)

    def _list_sorted(self, limit: int | None) -> list[Review]:
        entries = sorted(self._scan(), key=lambda entry: entry.updated_at, reverse=True)
        if limit is not None:
            entries = entries[:limit]
        return [_review_from_dict(entry.data) for entry in entries]

    # -- public API -----------------------------------------------------------------------

    async def _save(self, review: Review) -> Review:
        await self._review_locks.run(review.id, lambda: asyncio.to_thread(self._write_review, review))
        return review

    async def create(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,  # stored in first iteration created by dispatch
    ) -> Review:
        now = _now_utc()
        review = Review(
            id=uuid4(),
            host_id=host_id,
            repo_path=repo_path,
            mr_iid=mr_iid,
            source=MRSource(mr_iid=mr_iid),
            iterations=[],
            created_at=now,
            updated_at=now,
        )
        return await self._save(review)

    async def create_from_source(
        self,
        host_id: UUID,
        repo_path: str,
        source: ReviewSource,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        now = _now_utc()
        mr_iid = source.mr_iid if isinstance(source, MRSource) else 0
        review = Review(
            id=uuid4(),
            host_id=host_id,
            repo_path=repo_path,
            mr_iid=mr_iid,
            source=source,
            iterations=[],
            created_at=now,
            updated_at=now,
        )
        return await self._save(review)

    async def get_or_create_by_mr(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        key: _MRKey = (host_id, repo_path, mr_iid)

        async def _operation() -> Review:
            existing = await asyncio.to_thread(self._find_by_mr, key)
            if existing is not None:
                return existing
            return await self.create(host_id, repo_path, mr_iid, brief_config)

        return await self._mr_locks.run(key, _operation)

    async def get_by_id(self, review_id: UUID) -> Review | None:
        return await asyncio.to_thread(self._read_review, review_id)

    async def get_by_mr(self, host_id: UUID, repo_path: str, mr_iid: int) -> Review | None:
        return await asyncio.to_thread(self._find_by_mr, (host_id, repo_path, mr_iid))

    async def list_all(self) -> list[Review]:
        return await asyncio.to_thread(self._list_sorted, _MAX_REVIEWS)

    async def list_all_uncapped(self) -> list[Review]:
        return await asyncio.to_thread(self._list_sorted, None)

    async def update(self, review: Review) -> Review:
        def _sync() -> Review:
            if not self._review_path(review.id).is_file():
                raise ValueError(f"Review {review.id} not found")
            updated = review.model_copy(update={"updated_at": _now_utc()})
            self._write_review(updated)
            return updated

        return await self._review_locks.run(review.id, lambda: asyncio.to_thread(_sync))

    async def update_with(self, review_id: UUID, change: Callable[[Review], Review]) -> Review | None:
        def _existing_only(current: Review | None) -> Review | None:
            return change(current) if current is not None else None

        return await self._apply_change(review_id, _existing_only, touch=True)

    async def upsert_with(self, review_id: UUID, change: Callable[[Review | None], Review | None]) -> Review | None:
        return await self._apply_change(review_id, change, touch=False)

    async def _apply_change(
        self,
        review_id: UUID,
        change: Callable[[Review | None], Review | None],
        *,
        touch: bool,
    ) -> Review | None:
        async def _operation() -> Review | None:
            current = await asyncio.to_thread(self._read_review, review_id)
            updated = change(current)
            if updated is None or updated is current:
                return current
            if updated.id != review_id:
                raise ValueError(f"A change to review {review_id} must not alter its id")
            if touch:
                updated = updated.model_copy(update={"updated_at": _now_utc()})
            await asyncio.to_thread(self._write_review, updated)
            return updated

        return await self._review_locks.run(review_id, _operation)

    async def delete(self, review_id: UUID) -> bool:
        return await self._review_locks.run(review_id, lambda: asyncio.to_thread(self._delete_file, review_id))
