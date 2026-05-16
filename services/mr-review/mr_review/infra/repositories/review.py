from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import yaml

from mr_review.core.reviews.entities import (
    BriefConfig,
    Comment,
    Iteration,
    IterationStage,
    Review,
)
from mr_review.infra.utils import now_utc as _now_utc

_log = logging.getLogger(__name__)
_MAX_REVIEWS = 50


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _comment_from_dict(data: object) -> Comment:
    return Comment.model_validate(data)


def _comment_to_dict(comment: Comment) -> dict[str, object]:
    return comment.model_dump(mode="json")


def _iteration_from_dict(data: dict[str, object]) -> Iteration:
    comments_raw = data.get("comments") or []
    if not isinstance(comments_raw, list):
        comments_raw = []
    comments = [_comment_from_dict(c) for c in comments_raw]

    brief_raw = data.get("brief_config") or {}
    brief_config = BriefConfig.model_validate(brief_raw)

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
        stage=IterationStage(str(data["stage"])),
        comments=comments,
        ai_provider_id=ai_provider_id,
        model=model,
        brief_config=brief_config,
        created_at=_aware(datetime.fromisoformat(str(data["created_at"]))),
        completed_at=completed_at,
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
    }


def _review_from_dict(data: dict[str, object]) -> Review:
    iterations_raw = data.get("iterations") or []
    if not isinstance(iterations_raw, list):
        iterations_raw = []
    iterations = [_iteration_from_dict(i) for i in iterations_raw]

    return Review(
        id=UUID(str(data["id"])),
        host_id=UUID(str(data["host_id"])),
        repo_path=str(data["repo_path"]),
        mr_iid=int(str(data["mr_iid"])),
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
        "iterations": [_iteration_to_dict(i) for i in review.iterations],
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat(),
    }


class FileReviewRepository:
    def __init__(self, data_dir: Path) -> None:
        self._reviews_dir = data_dir / "reviews"

    def _review_path(self, review_id: UUID) -> Path:
        return self._reviews_dir / f"{review_id}.yaml"

    def _read_one(self, review_id: UUID) -> Review | None:
        path = self._review_path(review_id)
        if not path.exists():
            return None
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data is None:
            return None
        return _review_from_dict(data)

    def _write_one(self, review: Review) -> None:
        self._reviews_dir.mkdir(parents=True, exist_ok=True)
        path = self._review_path(review.id)
        tmp = path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            yaml.safe_dump(_review_to_dict(review), f, allow_unicode=True, sort_keys=False)
        os.replace(tmp, path)

    def _scan_all(self) -> list[Review]:
        if not self._reviews_dir.exists():
            return []
        reviews: list[Review] = []
        for path in self._reviews_dir.glob("*.yaml"):
            try:
                with path.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data is not None:
                    reviews.append(_review_from_dict(data))
            except Exception:
                _log.warning("Corrupt or unreadable review file %s, skipping", path)
        return reviews

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
            iterations=[],
            created_at=now,
            updated_at=now,
        )
        await asyncio.to_thread(self._write_one, review)
        return review

    async def get_by_id(self, review_id: UUID) -> Review | None:
        return await asyncio.to_thread(self._read_one, review_id)

    async def get_by_mr(self, host_id: UUID, repo_path: str, mr_iid: int) -> Review | None:
        def _sync() -> Review | None:
            for review in self._scan_all():
                if review.host_id == host_id and review.repo_path == repo_path and review.mr_iid == mr_iid:
                    return review
            return None

        return await asyncio.to_thread(_sync)

    async def list_all(self) -> list[Review]:
        def _sync() -> list[Review]:
            reviews = self._scan_all()
            reviews.sort(key=lambda r: r.updated_at, reverse=True)
            return reviews[:_MAX_REVIEWS]

        return await asyncio.to_thread(_sync)

    async def update(self, review: Review) -> Review:
        def _sync() -> Review:
            existing = self._read_one(review.id)
            if existing is None:
                raise ValueError(f"Review {review.id} not found")
            updated = review.model_copy(update={"updated_at": _now_utc()})
            self._write_one(updated)
            return updated

        return await asyncio.to_thread(_sync)

    async def delete(self, review_id: UUID) -> bool:
        def _sync() -> bool:
            path = self._review_path(review_id)
            if not path.exists():
                return False
            path.unlink()
            return True

        return await asyncio.to_thread(_sync)
