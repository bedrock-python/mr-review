from __future__ import annotations

from uuid import UUID

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, status

from mr_review.api.schemas.ai_providers import (
    AIProviderResponse,
    CreateAIProviderRequest,
    ModelCapabilitiesResponse,
    PreviewModelsRequest,
    UpdateAIProviderRequest,
)
from mr_review.core.ai.entities import ModelCapabilities
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.use_cases.ai_providers.create_ai_provider import CreateAIProviderUseCase
from mr_review.use_cases.ai_providers.delete_ai_provider import DeleteAIProviderUseCase
from mr_review.use_cases.ai_providers.get_model_capabilities import GetModelCapabilitiesUseCase, ModelNotSpecifiedError
from mr_review.use_cases.ai_providers.list_ai_providers import ListAIProvidersUseCase
from mr_review.use_cases.ai_providers.list_provider_models import ListProviderModelsUseCase
from mr_review.use_cases.ai_providers.preview_provider_models import (
    PreviewProviderModelsUseCase,
    ProviderSettingsIncompleteError,
)
from mr_review.use_cases.ai_providers.update_ai_provider import UpdateAIProviderUseCase

router = APIRouter(prefix="/api/v1/ai-providers", tags=["ai-providers"], route_class=DishkaRoute)


def _capabilities_to_response(caps: ModelCapabilities) -> ModelCapabilitiesResponse:
    return ModelCapabilitiesResponse(
        provider_type=caps.provider_type,
        model=caps.model,
        known_model=caps.known_model,
        thinking=caps.thinking,
        reasoning_modes=list(caps.reasoning_modes),
        effort_levels=list(caps.effort_levels),
        default_effort=caps.default_effort,
        min_reasoning_budget=caps.min_reasoning_budget,
        temperature=caps.temperature,
        max_temperature=caps.max_temperature,
        max_output_tokens=caps.max_output_tokens,
        default_max_output_tokens=caps.default_max_output_tokens,
        structured_output=caps.structured_output,
        structured_output_default=caps.structured_output_default,
    )


def _provider_to_response(provider: AIProvider) -> AIProviderResponse:
    return AIProviderResponse(
        id=provider.id,
        name=provider.name,
        type=provider.type,
        base_url=provider.base_url,
        models=provider.models,
        ssl_verify=provider.ssl_verify,
        timeout=provider.timeout,
        max_concurrent=provider.max_concurrent,
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
        max_concurrent=body.max_concurrent,
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
        max_concurrent=body.max_concurrent,
        clear_max_concurrent=body.clear_max_concurrent,
    )
    if provider is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found")
    return _provider_to_response(provider)


@router.get("/{provider_id}/models", response_model=list[str])
async def list_provider_models(
    provider_id: UUID,
    use_case: FromDishka[ListProviderModelsUseCase],
) -> list[str]:
    """The models the saved provider's endpoint offers. A failing endpoint answers 401, 502 or 504."""
    try:
        return await use_case.execute(provider_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.post("/preview/models", response_model=list[str])
async def preview_provider_models(
    body: PreviewModelsRequest,
    use_case: FromDishka[PreviewProviderModelsUseCase],
) -> list[str]:
    """The models an endpoint offers with unsaved settings — the settings form's "Fetch models"."""
    try:
        return await use_case.execute(
            provider_id=body.provider_id,
            type_=body.type,
            api_key=body.api_key,
            base_url=body.base_url,
            ssl_verify=body.ssl_verify,
            timeout=body.timeout,
        )
    except ProviderSettingsIncompleteError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e


@router.get("/{provider_id}/capabilities", response_model=ModelCapabilitiesResponse)
async def get_model_capabilities(
    provider_id: UUID,
    use_case: FromDishka[GetModelCapabilitiesUseCase],
    model: str | None = None,
) -> ModelCapabilitiesResponse:
    """Which dispatch settings ``model`` (default: the provider's first) accepts. No call to the provider."""
    try:
        caps = await use_case.execute(provider_id, model)
    except ModelNotSpecifiedError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    return _capabilities_to_response(caps)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ai_provider(
    provider_id: UUID,
    use_case: FromDishka[DeleteAIProviderUseCase],
) -> None:
    deleted = await use_case.execute(provider_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="AI provider not found")
