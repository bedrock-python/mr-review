from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
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
from mr_review.infra.repositories.file_store import KeyedLock, dump_yaml, write_file_atomically
from mr_review.infra.repositories.review_cache import MRKey, ReviewFileCache
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


class FileReviewRepository:
    """One YAML file per review under ``reviews/``.

    Reads go through :class:`ReviewFileCache`: unchanged files are not parsed again, the
    history list is sorted from cached metadata, and ``get_by_mr`` uses an index over
    (host, repository, MR). Every read builds a fresh entity, so no caller can change what
    is cached.

    Writes to one review are serialised per review id, and finding-or-creating the review
    of an MR is serialised per MR.
    """

    def __init__(self, data_dir: Path) -> None:
        self._reviews_dir = data_dir / "reviews"
        self._review_locks: KeyedLock[UUID] = KeyedLock()
        self._mr_locks: KeyedLock[MRKey] = KeyedLock()
        self._files = ReviewFileCache(self._reviews_dir, _review_from_dict)

    def _review_path(self, review_id: UUID) -> Path:
        return self._reviews_dir / f"{review_id}.yaml"

    # -- synchronous file access; run in worker threads -----------------------------------

    def _read_review(self, review_id: UUID) -> Review | None:
        loaded = self._files.load(self._review_path(review_id), with_data=True)
        if loaded is None or loaded[1] is None:
            return None
        return _review_from_dict(loaded[1])

    def _write_review(self, review: Review) -> None:
        path = self._review_path(review.id)
        data = _review_to_dict(review)
        dir_before = self._files.directory_mtime()
        written = write_file_atomically(path, dump_yaml(data))
        self._files.record_write(path, data, review, written, dir_before)

    def _delete_file(self, review_id: UUID) -> bool:
        path = self._review_path(review_id)
        dir_before = self._files.directory_mtime()
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        self._files.record_delete(path, dir_before)
        return True

    def _load_reviews(self, names: list[str]) -> list[Review]:
        """Parse the named files, skipping any deleted or damaged since they were listed."""
        reviews = []
        for name in names:
            loaded = self._files.load_or_skip(self._reviews_dir / name, with_data=True)
            if loaded is not None and loaded[1] is not None:
                reviews.append(_review_from_dict(loaded[1]))
        return reviews

    def _find_by_mr(self, key: MRKey) -> Review | None:
        # Re-check each hit against its file: it may have been deleted or rewritten since.
        candidates: list[tuple[datetime, str]] = []
        for name in self._files.names_for(key):
            loaded = self._files.load_or_skip(self._reviews_dir / name, with_data=False)
            if loaded is not None and loaded[0].mr_key == key:
                candidates.append((loaded[0].updated_at, name))
        # Duplicates can exist from older versions or imports; the latest one is the live one.
        candidates.sort(reverse=True)
        found = self._load_reviews([name for _, name in candidates[:1]])
        return found[0] if found else None

    def _list_sorted(self, limit: int | None) -> list[Review]:
        metas = self._files.scan()
        names = sorted(metas, key=lambda name: metas[name].updated_at, reverse=True)
        return self._load_reviews(names if limit is None else names[:limit])

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
        key: MRKey = (host_id, repo_path, mr_iid)

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
