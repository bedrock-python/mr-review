from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import yaml

from mr_review.core.reviews.entities import BriefConfig, Comment, Review, ReviewStage


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _review_from_dict(data: dict[str, object]) -> Review:
    comments_raw = data.get("comments") or []
    if not isinstance(comments_raw, list):
        comments_raw = []
    comments = [Comment.model_validate(c) for c in comments_raw]

    brief_raw = data.get("brief_config") or {}
    brief_config = BriefConfig.model_validate(brief_raw)

    return Review(
        id=UUID(str(data["id"])),
        host_id=UUID(str(data["host_id"])),
        repo_path=str(data["repo_path"]),
        mr_iid=int(str(data["mr_iid"])),
        stage=ReviewStage(str(data["stage"])),
        comments=comments,
        brief_config=brief_config,
        created_at=_aware(datetime.fromisoformat(str(data["created_at"]))),
        updated_at=_aware(datetime.fromisoformat(str(data["updated_at"]))),
    )


def _review_to_dict(review: Review) -> dict[str, object]:
    return {
        "id": str(review.id),
        "host_id": str(review.host_id),
        "repo_path": review.repo_path,
        "mr_iid": review.mr_iid,
        "stage": review.stage.value,
        "comments": [c.model_dump(mode="json") for c in review.comments],
        "brief_config": review.brief_config.model_dump(mode="json"),
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
        path = self._review_path(review.id)
        tmp = path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            yaml.safe_dump(_review_to_dict(review), f, allow_unicode=True, sort_keys=False)
        os.replace(tmp, path)

    async def create(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        now = _now_utc()
        review = Review(
            id=uuid4(),
            host_id=host_id,
            repo_path=repo_path,
            mr_iid=mr_iid,
            stage=ReviewStage.pick,
            comments=[],
            brief_config=brief_config or BriefConfig(),
            created_at=now,
            updated_at=now,
        )
        await asyncio.to_thread(self._write_one, review)
        return review

    async def get_by_id(self, review_id: UUID) -> Review | None:
        return await asyncio.to_thread(self._read_one, review_id)

    async def list_all(self) -> list[Review]:
        def _sync() -> list[Review]:
            if not self._reviews_dir.exists():
                return []
            reviews: list[Review] = []
            for path in self._reviews_dir.glob("*.yaml"):
                with path.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data is not None:
                    reviews.append(_review_from_dict(data))
            reviews.sort(key=lambda r: r.updated_at, reverse=True)
            return reviews[:50]

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
