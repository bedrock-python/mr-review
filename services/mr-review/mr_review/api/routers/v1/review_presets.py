from __future__ import annotations

from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from mr_review.api.schemas.review_presets import (
    BuiltinPresetResponse,
    CreateReviewPresetRequest,
    ReviewPresetResponse,
    UpdateReviewPresetRequest,
)
from mr_review.core.review_presets.entities import (
    BUILTIN_PRESETS,
    ReviewPreset,
    ReviewPresetNameTakenError,
    ReviewPresetNotFoundError,
)
from mr_review.use_cases.review_presets.create_review_preset import CreateReviewPresetUseCase
from mr_review.use_cases.review_presets.delete_review_preset import DeleteReviewPresetUseCase
from mr_review.use_cases.review_presets.get_review_preset import GetReviewPresetUseCase
from mr_review.use_cases.review_presets.list_review_presets import ListReviewPresetsUseCase
from mr_review.use_cases.review_presets.update_review_preset import UpdateReviewPresetUseCase

router = APIRouter(prefix="/api/v1/review-presets", tags=["review-presets"], route_class=DishkaRoute)


def _preset_to_response(preset: ReviewPreset) -> ReviewPresetResponse:
    return ReviewPresetResponse(
        id=preset.id,
        name=preset.name,
        description=preset.description,
        instructions=preset.instructions,
        brief_config=dict(preset.brief_config),
        created_at=preset.created_at,
        updated_at=preset.updated_at,
    )


@router.get("", response_model=list[ReviewPresetResponse])
async def list_review_presets(use_case: FromDishka[ListReviewPresetsUseCase]) -> list[ReviewPresetResponse]:
    """Saved presets, oldest first."""
    return [_preset_to_response(p) for p in await use_case.execute()]


@router.get("/builtin", response_model=list[BuiltinPresetResponse])
async def list_builtin_presets() -> list[BuiltinPresetResponse]:
    """The four built-in review intents and the instructions each puts in the prompt (read-only)."""
    return [
        BuiltinPresetResponse(id=p.key, name=p.name, description=p.description, instructions=p.instructions)
        for p in BUILTIN_PRESETS.values()
    ]


@router.post("", response_model=ReviewPresetResponse, status_code=status.HTTP_201_CREATED)
async def create_review_preset(
    body: CreateReviewPresetRequest,
    use_case: FromDishka[CreateReviewPresetUseCase],
) -> ReviewPresetResponse:
    try:
        preset = await use_case.execute(
            name=body.name,
            description=body.description,
            instructions=body.instructions,
            brief_config=body.brief_config,
        )
    except ReviewPresetNameTakenError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _preset_to_response(preset)


@router.get("/{preset_id}", response_model=ReviewPresetResponse)
async def get_review_preset(preset_id: UUID, use_case: FromDishka[GetReviewPresetUseCase]) -> ReviewPresetResponse:
    try:
        return _preset_to_response(await use_case.execute(preset_id))
    except ReviewPresetNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{preset_id}", response_model=ReviewPresetResponse)
async def update_review_preset(
    preset_id: UUID,
    body: UpdateReviewPresetRequest,
    use_case: FromDishka[UpdateReviewPresetUseCase],
) -> ReviewPresetResponse:
    try:
        preset = await use_case.execute(
            preset_id,
            name=body.name,
            description=body.description,
            instructions=body.instructions,
            brief_config=body.brief_config,
        )
    except ReviewPresetNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ReviewPresetNameTakenError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _preset_to_response(preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review_preset(preset_id: UUID, use_case: FromDishka[DeleteReviewPresetUseCase]) -> None:
    """Delete a saved preset; briefs that use it fall back to their built-in preset."""
    try:
        await use_case.execute(preset_id)
    except ReviewPresetNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
