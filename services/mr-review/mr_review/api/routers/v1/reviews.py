from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

import structlog
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sse_starlette.sse import EventSourceResponse

from mr_review.api.schemas.reviews import (
    CommentParseErrorResponse,
    CommentResponse,
    CreateCodeReviewRequest,
    CreateIterationRequest,
    CreateReviewRequest,
    DispatchReviewRequest,
    GetPromptRequest,
    ImportResponseRequest,
    ImportResponseResponse,
    IterationResponse,
    PostReviewRequest,
    PostReviewResponse,
    ReviewResponse,
    UpdateReviewRequest,
)
from mr_review.core.reviews.entities import Comment, Iteration, Review
from mr_review.use_cases.reviews.create_code_review import CreateCodeReviewUseCase
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.delete_review import DeleteReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.get_review_context import GetReviewContextUseCase
from mr_review.use_cases.reviews.get_review_diff import GetReviewDiffUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostNotSupportedForSourceError, PostReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"], route_class=DishkaRoute)


def _comment_to_response(c: Comment) -> CommentResponse:
    return CommentResponse(
        id=c.id,
        file=c.file,
        line=c.line,
        severity=c.severity,
        body=c.body,
        status=c.status,
        resolved=c.resolved,
    )


def _iteration_to_response(it: Iteration) -> IterationResponse:
    return IterationResponse(
        id=it.id,
        number=it.number,
        stage=it.stage,
        comments=[_comment_to_response(c) for c in it.comments],
        ai_provider_id=it.ai_provider_id,
        model=it.model,
        brief_config=it.brief_config,
        created_at=it.created_at,
        completed_at=it.completed_at,
    )


def _review_to_response(review: Review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id,
        host_id=review.host_id,
        repo_path=review.repo_path,
        mr_iid=review.mr_iid,
        source=review.source,
        iterations=[_iteration_to_response(it) for it in review.iterations],
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


@router.post("/code", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_code_review(
    body: CreateCodeReviewRequest,
    use_case: FromDishka[CreateCodeReviewUseCase],
) -> ReviewResponse:
    """Create a review backed by an ad-hoc branch/commit diff (no MR required).

    Phase 1: in-app review only. Comments cannot be posted back to the VCS for
    this review kind — ``POST /reviews/{id}/post`` will return 409.
    """
    review = await use_case.execute(
        host_id=body.host_id,
        repo_path=body.repo_path,
        base_ref=body.base_ref,
        head_ref=body.head_ref,
        title=body.title,
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

    # Resolve iteration comment patches against the iteration's existing comments
    iteration_comments: list[Comment] | None = None
    if body.iteration_comments is not None and body.iteration_id is not None:
        target_iteration = next((it for it in current.iterations if it.id == body.iteration_id), None)
        if target_iteration is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Iteration {body.iteration_id} not found",
            )
        update_map = {u.id: u for u in body.iteration_comments}
        merged: list[Comment] = []
        for c in target_iteration.comments:
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
                                "resolved": patch.resolved,
                            }.items()
                            if v is not None
                        }
                    )
                )
        iteration_comments = merged

    try:
        review = await use_case.execute(
            review_id=review_id,
            brief_config=body.brief_config,
            iteration_id=body.iteration_id,
            iteration_stage=body.iteration_stage,
            iteration_comments=iteration_comments,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return _review_to_response(review)


@router.delete("/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: UUID,
    use_case: FromDishka[DeleteReviewUseCase],
) -> None:
    try:
        await use_case.execute(review_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{review_id}/iterations", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_iteration(
    review_id: UUID,
    body: CreateIterationRequest,
    use_case: FromDishka[CreateIterationUseCase],
) -> ReviewResponse:
    try:
        review = await use_case.execute(review_id=review_id, brief_config=body.brief_config)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _review_to_response(review)


@router.get("/{review_id}/diff", response_class=Response)
async def get_review_diff(
    review_id: UUID,
    use_case: FromDishka[GetReviewDiffUseCase],
) -> Response:
    try:
        diff = await use_case.execute(review_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=diff, media_type="text/plain")


@router.get("/{review_id}/context", response_class=Response)
async def get_review_context(
    review_id: UUID,
    use_case: FromDishka[GetReviewContextUseCase],
) -> Response:
    try:
        merged, _ = await use_case.execute(review_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=merged, media_type="text/plain")


@router.post("/{review_id}/prompt", response_class=Response)
async def get_review_prompt(
    review_id: UUID,
    body: GetPromptRequest,
    use_case: FromDishka[GetReviewPromptUseCase],
) -> Response:
    try:
        prompt = await use_case.execute(
            review_id,
            brief_config=body.brief_config,
            iteration_id=body.iteration_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=prompt, media_type="text/plain")


@router.post("/{review_id}/dispatch", response_class=EventSourceResponse)
async def dispatch_review(
    review_id: UUID,
    body: DispatchReviewRequest,
    use_case: FromDishka[DispatchReviewUseCase],
) -> Response:
    try:
        stream = await use_case.execute(
            review_id=review_id,
            ai_provider_id=body.ai_provider_id,
            model=body.model,
            temperature=body.temperature,
            reasoning_budget=body.reasoning_budget,
            reasoning_effort=body.reasoning_effort,
            iteration_id=body.iteration_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    async def event_generator() -> AsyncIterator[dict[str, Any]]:
        try:
            async for chunk in stream:
                yield {"data": chunk}
        except Exception as exc:
            logger.exception("Error during dispatch stream", review_id=str(review_id))
            yield {"event": "error", "data": str(exc)}

    return EventSourceResponse(event_generator())


@router.post("/{review_id}/import-response", response_model=ImportResponseResponse)
async def import_response(
    review_id: UUID,
    body: ImportResponseRequest,
    use_case: FromDishka[ImportResponseUseCase],
) -> ImportResponseResponse:
    try:
        result = await use_case.execute(
            review_id=review_id,
            raw=body.raw,
            iteration_id=body.iteration_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return ImportResponseResponse(
        imported=len(result.comments),
        errors=[
            CommentParseErrorResponse(
                index=e.index,
                reason=e.reason,
                raw=str(e.raw)[:500],
            )
            for e in result.errors
        ],
        json_error=result.json_error,
    )


@router.post("/{review_id}/post", response_model=PostReviewResponse)
async def post_review(
    review_id: UUID,
    body: PostReviewRequest,
    use_case: FromDishka[PostReviewUseCase],
) -> PostReviewResponse:
    try:
        posted = await use_case.execute(
            review_id=review_id,
            diff_refs=body.diff_refs or None,
            iteration_id=body.iteration_id,
            fallback_to_general_note=body.fallback_to_general_note,
        )
    except PostNotSupportedForSourceError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to post comments: {exc}",
        ) from exc
    return PostReviewResponse(posted=posted)
