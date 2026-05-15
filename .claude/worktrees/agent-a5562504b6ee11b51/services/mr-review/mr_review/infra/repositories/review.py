from __future__ import annotations

import json
from datetime import timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from mr_review.core.reviews.entities import BriefConfig, Comment, Review, ReviewStage
from mr_review.infra.db.orm.review import ReviewDB


class SQLiteReviewRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _to_entity(self, db: ReviewDB) -> Review:
        created_at = db.created_at
        updated_at = db.updated_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)

        raw_comments: list[dict[str, object]] = json.loads(db.comments_json or "[]")
        comments = [Comment.model_validate(c) for c in raw_comments]

        raw_config: dict[str, object] = json.loads(db.brief_config_json or "{}")
        brief_config = BriefConfig.model_validate(raw_config)

        return Review(
            id=UUID(db.id),
            host_id=UUID(db.host_id),
            repo_path=db.repo_path,
            mr_iid=db.mr_iid,
            stage=ReviewStage(db.stage),
            comments=comments,
            brief_config=brief_config,
            created_at=created_at,
            updated_at=updated_at,
        )

    async def create(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        config = brief_config or BriefConfig()
        db = ReviewDB(
            host_id=str(host_id),
            repo_path=repo_path,
            mr_iid=mr_iid,
            stage=ReviewStage.pick.value,
            comments_json="[]",
            brief_config_json=config.model_dump_json(),
        )
        self._session.add(db)
        await self._session.flush()
        await self._session.refresh(db)
        return self._to_entity(db)

    async def get_by_id(self, review_id: UUID) -> Review | None:
        result = await self._session.execute(select(ReviewDB).where(ReviewDB.id == str(review_id)))
        db = result.scalar_one_or_none()
        return self._to_entity(db) if db else None

    async def list_all(self) -> list[Review]:
        result = await self._session.execute(select(ReviewDB).order_by(ReviewDB.created_at.desc()))
        return [self._to_entity(db) for db in result.scalars().all()]

    async def update(self, review: Review) -> Review:
        result = await self._session.execute(select(ReviewDB).where(ReviewDB.id == str(review.id)))
        db = result.scalar_one_or_none()
        if db is None:
            raise ValueError(f"Review {review.id} not found")

        db.stage = review.stage.value
        db.comments_json = json.dumps([c.model_dump(mode="json") for c in review.comments])
        db.brief_config_json = review.brief_config.model_dump_json()

        await self._session.flush()
        await self._session.refresh(db)
        return self._to_entity(db)

    async def delete(self, review_id: UUID) -> bool:
        result = await self._session.execute(select(ReviewDB).where(ReviewDB.id == str(review_id)))
        db = result.scalar_one_or_none()
        if db is None:
            return False
        await self._session.delete(db)
        await self._session.flush()
        return True
