from __future__ import annotations

from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from mr_review.api.schemas.ai_providers import (
    AIProviderResponse,
    CreateAIProviderRequest,
    UpdateAIProviderRequest,
)
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.use_cases.ai_providers.create_ai_provider import CreateAIProviderUseCase
from mr_review.use_cases.ai_providers.delete_ai_provider import DeleteAIProviderUseCase
from mr_review.use_cases.ai_providers.list_ai_providers import ListAIProvidersUseCase
from mr_review.use_cases.ai_providers.list_provider_models import ListProviderModelsUseCase
from mr_review.use_cases.ai_providers.update_ai_provider import UpdateAIProviderUseCase

router = APIRouter(prefix="/api/v1/ai-providers", tags=["ai-providers"], route_class=DishkaRoute)


def _provider_to_response(provider: AIProvider) -> AIProviderResponse:
    return AIProviderResponse(
        id=provider.id,
        name=provider.name,
        type=provider.type,
        base_url=provider.base_url,
        models=provider.models,
        ssl_verify=provider.ssl_verify,
        timeout=provider.timeout,
        created_at=provider.created_at,
    )


@router.get("", response_model=list[AIProviderResponse])
async def list_ai_providers(use_case: FromDishka[ListAIProvidersUseCase]) -> list[AIProviderResponse]:
    providers = await use_case.execute()
    return [_provider_to_response(p) for p in providers]


@router.post("", response_model=AIProviderResponse, status_code=status.HTTP_201_CREATED)
async def create_ai_provider(
    body: CreateAIProviderRequest,
    use_case: FromDishka[CreateAIProviderUseCase],
) -> AIProviderResponse:
    provider = await use_case.execute(
        name=body.name,
        type_=body.type,
        api_key=body.api_key,
        base_url=body.base_url,
        models=body.models,
        ssl_verify=body.ssl_verify,
        timeout=body.timeout,
    )
    return _provider_to_response(provider)


@router.patch("/{provider_id}", response_model=AIProviderResponse)
async def update_ai_provider(
    provider_id: UUID,
    body: UpdateAIProviderRequest,
    use_case: FromDishka[UpdateAIProviderUseCase],
) -> AIProviderResponse:
    provider = await use_case.execute(
        provider_id,
        name=body.name,
        api_key=body.api_key,
        base_url=body.base_url,
        models=body.models,
        ssl_verify=body.ssl_verify,
        timeout=body.timeout,
    )
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found")
    return _provider_to_response(provider)


@router.get("/{provider_id}/models", response_model=list[str])
async def list_provider_models(
    provider_id: UUID,
    use_case: FromDishka[ListProviderModelsUseCase],
) -> list[str]:
    try:
        return await use_case.execute(provider_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_provider(
    provider_id: UUID,
    use_case: FromDishka[DeleteAIProviderUseCase],
) -> None:
    deleted = await use_case.execute(provider_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found")
