from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status
from mr_review.core.reviews.entities import Comment, Review
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase
from sse_starlette.sse import EventSourceResponse

from api.schemas.reviews import (
    CommentResponse,
    CreateReviewRequest,
    DispatchReviewRequest,
    PostReviewRequest,
    PostReviewResponse,
    ReviewResponse,
    UpdateReviewRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reviews", tags=["reviews"], route_class=DishkaRoute)


def _comment_to_response(c: Comment) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        file=c.file,
        line=c.line,
        severity=c.severity,
        body=c.body,
        status=c.status,
    )


def _review_to_response(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        host_id=review.host_id,
        repo_path=review.repo_path,
        mr_iid=review.mr_iid,
        stage=review.stage,
        comments=[_comment_to_response(c) for c in review.comments],
        brief_config=review.brief_config,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    body: CreateReviewRequest,
    use_case: FromDishka[CreateReviewUseCase],
) -> ReviewResponse:
    review = await use_case.execute(
        host_id=body.host_id,
        repo_path=body.repo_path,
        mr_iid=body.mr_iid,
        brief_config=body.brief_config,
    )
    return _review_to_response(review)


@router.get("", response_model=list[ReviewResponse])
async def list_reviews(use_case: FromDishka[ListReviewsUseCase]) -> list[ReviewResponse]:
    reviews = await use_case.execute()
    return [_review_to_response(r) for r in reviews]


@router.get("/{review_id}", response_model=ReviewResponse)
async def get_review(
    review_id: UUID,
    use_case: FromDishka[GetReviewUseCase],
) -> ReviewResponse:
    try:
        review = await use_case.execute(review_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _review_to_response(review)


@router.patch("/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: UUID,
    body: UpdateReviewRequest,
    use_case: FromDishka[UpdateReviewUseCase],
    get_use_case: FromDishka[GetReviewUseCase],
) -> ReviewResponse:
    try:
        current = await get_use_case.execute(review_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    # Merge comment updates onto existing comments
    comments: list[Comment] | None = None
    if body.comments is not None:
        update_map = {u.id: u for u in body.comments}
        merged: list[Comment] = []
        for c in current.comments:
            patch = update_map.get(c.id)
            if patch is None:
                merged.append(c)
            else:
                merged.append(
                    c.model_copy(
                        update={
                            k: v
                            for k, v in {
                                "status": patch.status,
                                "body": patch.body,
                                "severity": patch.severity,
                            }.items()
                            if v is not None
                        }
                    )
                )
        comments = merged

    try:
        review = await use_case.execute(
            review_id=review_id,
            stage=body.stage,
            comments=comments,
            brief_config=body.brief_config,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return _review_to_response(review)


@router.post("/{review_id}/dispatch")
async def dispatch_review(
    review_id: UUID,
    body: DispatchReviewRequest,
    use_case: FromDishka[DispatchReviewUseCase],
) -> EventSourceResponse:
    try:
        stream = await use_case.execute(
            review_id=review_id,
            ai_config={
                "provider": body.ai_config.provider,
                "api_key": body.ai_config.api_key,
                "model": body.ai_config.model,
                "base_url": body.ai_config.base_url,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    async def event_generator() -> AsyncIterator[dict[str, Any]]:
        try:
            async for chunk in stream:
                yield {"data": chunk}
        except Exception as exc:
            logger.exception("Error during dispatch stream for review %s", review_id)
            yield {"event": "error", "data": str(exc)}

    return EventSourceResponse(event_generator())


@router.post("/{review_id}/post", response_model=PostReviewResponse)
async def post_review(
    review_id: UUID,
    body: PostReviewRequest,
    use_case: FromDishka[PostReviewUseCase],
) -> PostReviewResponse:
    try:
        posted = await use_case.execute(review_id=review_id, diff_refs=body.diff_refs or None)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to post comments: {exc}",
        ) from exc
    return PostReviewResponse(posted=posted)
