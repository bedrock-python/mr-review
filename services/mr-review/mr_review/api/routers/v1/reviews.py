import json
from collections.abc import AsyncIterator
from uuid import UUID

import structlog
from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sse_starlette import ServerSentEvent
from sse_starlette.sse import EventSourceResponse

from mr_review.api.schemas.reviews import (
    CommentParseErrorResponse,
    CommentResponse,
    CreateCodeReviewRequest,
    CreateCommentRequest,
    CreateIterationRequest,
    CreateReviewRequest,
    DispatchCommentEvent,
    DispatchDoneEvent,
    DispatchErrorEvent,
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
from mr_review.use_cases.reviews.ai_response_parser import ParseResult
from mr_review.use_cases.reviews.create_code_review import CreateCodeReviewUseCase
from mr_review.use_cases.reviews.create_comment import CreateCommentUseCase
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.delete_comment import DeleteCommentUseCase
from mr_review.use_cases.reviews.delete_review import DeleteReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import (
    DispatchChunk,
    DispatchCommentPreview,
    DispatchEvent,
    DispatchReviewUseCase,
)
from mr_review.use_cases.reviews.get_iteration_raw_response import GetIterationRawResponseUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.get_review_context import GetReviewContextUseCase
from mr_review.use_cases.reviews.get_review_diff import GetReviewDiffUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.iteration_comments import InvalidCommentPatchError, IterationLockedError
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostNotSupportedForSourceError, PostReviewUseCase
from mr_review.use_cases.reviews.reparse_iteration import ReparseIterationUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

logger = structlog.get_logger(__name__)

_PREVIEW_CHARS = 500

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
) -> ReviewResponse:
    try:
        review = await use_case.execute(
            review_id=review_id,
            brief_config=body.brief_config,
            iteration_id=body.iteration_id,
            iteration_stage=body.iteration_stage,
            comment_patches=body.iteration_comments,
        )
    except InvalidCommentPatchError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
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


def _dispatch_event_to_sse(event: DispatchEvent) -> ServerSentEvent:
    # Every payload is single-line JSON, so splitting the SSE frame into lines can never cut it.
    if isinstance(event, DispatchChunk):
        return ServerSentEvent(event="chunk", data=json.dumps(event.text, ensure_ascii=False))
    if isinstance(event, DispatchCommentPreview):
        comment = DispatchCommentEvent(
            index=event.index,
            file=event.comment.file,
            line=event.comment.line,
            severity=event.comment.severity,
            body=event.comment.body,
        )
        return ServerSentEvent(event="comment", data=comment.model_dump_json())
    done = DispatchDoneEvent(
        iteration_id=event.iteration_id,
        comments=event.comments,
        errors=event.errors,
        json_error=event.json_error,
        truncated=event.truncated,
        kept_previous=event.kept_previous,
    )
    return ServerSentEvent(event="done", data=done.model_dump_json())


@router.post("/{review_id}/dispatch", response_class=EventSourceResponse)
async def dispatch_review(
    review_id: UUID,
    body: DispatchReviewRequest,
    use_case: FromDishka[DispatchReviewUseCase],
) -> Response:
    """Stream the review as SSE: ``chunk`` events with the raw text, a ``comment`` event per
    completed comment, then ``done`` once the iteration is stored — or ``error``, which ends
    the stream without ``done``."""
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
    except IterationLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    async def event_generator() -> AsyncIterator[ServerSentEvent]:
        try:
            async for event in stream:
                yield _dispatch_event_to_sse(event)
        except Exception as exc:
            logger.exception("Error during dispatch stream", review_id=str(review_id))
            error = DispatchErrorEvent(message=str(exc) or type(exc).__name__)
            yield ServerSentEvent(event="error", data=error.model_dump_json())

    return EventSourceResponse(event_generator())


def _preview(raw: object) -> str:
    """The start of an item that could not be parsed, as text — however deeply it nests."""
    try:
        return str(raw)[:_PREVIEW_CHARS]
    except RecursionError:
        return f"<a {type(raw).__name__} nested too deeply to show>"


def _parse_result_to_response(result: ParseResult, imported: int) -> ImportResponseResponse:
    return ImportResponseResponse(
        imported=imported,
        errors=[
            CommentParseErrorResponse(
                index=e.index,
                reason=e.reason,
                raw=_preview(e.raw),
            )
            for e in result.errors
        ],
        json_error=result.json_error,
        truncated=result.truncated,
    )


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

    return _parse_result_to_response(result, imported=len(result.comments))


@router.get("/{review_id}/iterations/{iteration_id}/raw-response", response_class=Response)
async def get_iteration_raw_response(
    review_id: UUID,
    iteration_id: UUID,
    use_case: FromDishka[GetIterationRawResponseUseCase],
) -> Response:
    """The model's answer stored on the iteration, exactly as it was received."""
    try:
        raw = await use_case.execute(review_id, iteration_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return Response(content=raw, media_type="text/plain")


@router.post("/{review_id}/iterations/{iteration_id}/reparse", response_model=ImportResponseResponse)
async def reparse_iteration(
    review_id: UUID,
    iteration_id: UUID,
    use_case: FromDishka[ReparseIterationUseCase],
) -> ImportResponseResponse:
    """Parse the stored answer again and replace the iteration's comments with the result."""
    try:
        outcome = await use_case.execute(review_id, iteration_id)
    except IterationLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _parse_result_to_response(outcome.result, imported=outcome.stored)


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


@router.post(
    "/{review_id}/iterations/{iteration_id}/comments",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    review_id: UUID,
    iteration_id: UUID,
    body: CreateCommentRequest,
    use_case: FromDishka[CreateCommentUseCase],
) -> ReviewResponse:
    """Add a hand-written comment to an iteration; the server assigns its id."""
    try:
        review = await use_case.execute(
            review_id=review_id,
            iteration_id=iteration_id,
            severity=body.severity,
            body=body.body,
            file=body.file,
            line=body.line,
        )
    except IterationLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _review_to_response(review)


@router.delete(
    "/{review_id}/iterations/{iteration_id}/comments/{comment_id}",
    response_model=ReviewResponse,
)
async def delete_comment(
    review_id: UUID,
    iteration_id: UUID,
    comment_id: UUID,
    use_case: FromDishka[DeleteCommentUseCase],
) -> ReviewResponse:
    """Remove one comment from an iteration that has not been posted yet."""
    try:
        review = await use_case.execute(review_id=review_id, iteration_id=iteration_id, comment_id=comment_id)
    except IterationLockedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _review_to_response(review)
