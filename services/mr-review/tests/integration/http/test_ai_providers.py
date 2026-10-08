"""HTTP tests of the AI provider model listing, the unsaved-settings preview and model capabilities."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from pathlib import Path

import pytest
import pytest_asyncio
from dishka import Provider, Scope, make_async_container, provide
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.ai_errors import register_ai_error_handlers
from mr_review.api.config import Settings
from mr_review.api.routers.v1.ai_providers import router as ai_providers_router
from mr_review.core.ai.errors import AIProviderAuthError, AIProviderError, AIProviderTimeoutError
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.di.providers.repositories import RepositoryProvider
from mr_review.infra.di.providers.use_cases import UseCaseProvider
from mr_review.infra.di.providers.vcs import VCSInfraProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.use_cases.ai_providers.preview_provider_models import PreviewProviderModelsUseCase

pytestmark = [pytest.mark.integration, pytest.mark.http]


@dataclass
class _Lister:
    """A model lister that records which settings it was called with."""

    models: list[str] = field(default_factory=lambda: ["model-b", "model-a"])
    error: Exception | None = None
    calls: list[AIProvider] = field(default_factory=list)

    async def __call__(self, provider: AIProvider) -> list[str]:
        self.calls.append(provider)
        if self.error is not None:
            raise self.error
        return self.models


class _FakeListerProvider(Provider):
    scope = Scope.REQUEST

    def __init__(self, lister: _Lister) -> None:
        super().__init__()
        self.lister = lister

    @provide(override=True)
    def get_preview_provider_models_use_case(self, repo: FileAIProviderRepository) -> PreviewProviderModelsUseCase:
        return PreviewProviderModelsUseCase(repo=repo, model_lister=self.lister)


@dataclass
class _Harness:
    client: AsyncClient
    providers: FileAIProviderRepository
    lister: _Lister


@pytest_asyncio.fixture
async def harness(tmp_path: Path) -> AsyncGenerator[_Harness, None]:
    lister = _Lister()
    app = FastAPI()
    app.include_router(ai_providers_router)
    register_ai_error_handlers(app)
    container = make_async_container(
        ApiConfigProvider(Settings(data_dir=tmp_path)),
        RepositoryProvider(),
        VCSInfraProvider(),
        UseCaseProvider(),
        _FakeListerProvider(lister),
    )
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield _Harness(client=client, providers=FileAIProviderRepository(tmp_path), lister=lister)
    await container.close()


async def _saved(harness: _Harness, **overrides: object) -> AIProvider:
    values: dict[str, object] = {
        "name": "Saved",
        "type_": "openai_compat",
        "api_key": "sk-saved",
        "base_url": "https://saved.example.com/v1",
        "models": ["model-a"],
        "ssl_verify": True,
        "timeout": 30,
    } | overrides
    return await harness.providers.create(**values)  # type: ignore[arg-type]


async def test__list_models__unreachable_endpoint__502_with_the_cause_not_500(harness: _Harness) -> None:
    """Regression: an SDK connection or auth error escaped the route as a bare 500."""
    provider = await _saved(harness, base_url="http://127.0.0.1:1/v1", timeout=5)

    response = await harness.client.get(f"/api/v1/ai-providers/{provider.id}/models")

    assert response.status_code == 502
    assert "Could not reach" in response.json()["detail"]


async def test__preview__unsaved_values_override_the_saved_ones(harness: _Harness) -> None:
    """Regression: "Fetch models" listed with the saved key and base URL, not the ones being edited."""
    provider = await _saved(harness)

    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models",
        json={"provider_id": str(provider.id), "api_key": "sk-new", "base_url": "https://new.example.com/v1"},
    )

    assert response.status_code == 200
    assert response.json() == ["model-b", "model-a"]
    used = harness.lister.calls[0]
    assert used.api_key.get_secret_value() == "sk-new"
    assert (used.base_url, used.timeout) == ("https://new.example.com/v1", 30)


async def test__preview__blank_key__the_saved_key_is_used(harness: _Harness) -> None:
    provider = await _saved(harness)

    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models", json={"provider_id": str(provider.id), "api_key": ""}
    )

    assert response.status_code == 200
    assert harness.lister.calls[0].api_key.get_secret_value() == "sk-saved"


@pytest.mark.parametrize(
    "changes",
    [
        {"base_url": "https://evil.example.com/v1"},
        {"type": "openai"},
        {"base_url": "https://evil.example.com/v1", "api_key": ""},
    ],
)
async def test__preview__changed_endpoint_without_a_key__422_and_the_saved_key_stays(
    harness: _Harness, changes: dict[str, str]
) -> None:
    """Regression: a changed base URL with no key sent the saved secret to that URL."""
    provider = await _saved(harness)

    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models", json={"provider_id": str(provider.id), **changes}
    )

    assert response.status_code == 422
    assert "Enter the API key" in response.json()["detail"]
    assert harness.lister.calls == []


async def test__preview__same_endpoint_spelled_differently__saved_key_used(harness: _Harness) -> None:
    provider = await _saved(harness)

    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models",
        json={"provider_id": str(provider.id), "type": "openai_compat", "base_url": "https://saved.example.com/v1/ "},
    )

    assert response.status_code == 200
    assert harness.lister.calls[0].api_key.get_secret_value() == "sk-saved"


async def test__preview__new_provider__needs_type_and_key(harness: _Harness) -> None:
    response = await harness.client.post("/api/v1/ai-providers/preview/models", json={"type": "claude"})

    assert response.status_code == 422
    assert harness.lister.calls == []


async def test__preview__new_provider__listed_with_the_form_values(harness: _Harness) -> None:
    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models",
        json={"type": "claude", "api_key": "sk-ant", "base_url": "https://gw.example.com", "ssl_verify": False},
    )

    assert response.status_code == 200
    used = harness.lister.calls[0]
    assert (used.type, used.base_url, used.ssl_verify) == ("claude", "https://gw.example.com", False)


async def test__preview__unknown_provider__404(harness: _Harness) -> None:
    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models",
        json={"provider_id": "00000000-0000-4000-8000-000000000000", "api_key": "sk"},
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (AIProviderAuthError("Claude rejected the API key (401): invalid x-api-key"), 401),
        (AIProviderTimeoutError("Claude did not answer in time"), 504),
        (AIProviderError("Claude answered 529: Overloaded"), 502),
    ],
)
async def test__preview__provider_errors__mapped_with_their_message(
    harness: _Harness, error: AIProviderError, status: int
) -> None:
    harness.lister.error = error

    response = await harness.client.post(
        "/api/v1/ai-providers/preview/models", json={"type": "claude", "api_key": "sk"}
    )

    assert response.status_code == status
    assert response.json() == {"detail": str(error)}


async def test__capabilities__named_model(harness: _Harness) -> None:
    provider = await _saved(harness, type_="claude", models=["claude-opus-5-5"])

    response = await harness.client.get(
        f"/api/v1/ai-providers/{provider.id}/capabilities", params={"model": "claude-haiku-4-5"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["model"] == "claude-haiku-4-5"
    assert body["reasoning_modes"] == ["budget"]
    assert body["temperature"] is True
    assert body["max_output_tokens"] == 64_000


async def test__capabilities__gateway_base_url__structured_output_off_by_default(harness: _Harness) -> None:
    """Regression: a provider pointed at another endpoint got strict structured output by default."""
    provider = await _saved(harness, type_="openai", models=["gpt-4o"], base_url="https://api.deepseek.com/v1")

    response = await harness.client.get(f"/api/v1/ai-providers/{provider.id}/capabilities")

    body = response.json()
    assert (body["structured_output"], body["structured_output_default"]) == (True, False)


async def test__capabilities__defaults_to_the_first_model(harness: _Harness) -> None:
    provider = await _saved(harness, type_="claude", models=["claude-opus-5-5"], base_url="")

    response = await harness.client.get(f"/api/v1/ai-providers/{provider.id}/capabilities")

    body = response.json()
    assert body["model"] == "claude-opus-5-5"
    assert body["thinking"] == "always"
    assert body["effort_levels"] == ["low", "medium", "high", "xhigh", "max"]
    assert body["default_effort"] == "medium"
    assert body["temperature"] is False
    assert body["structured_output_default"] is True


async def test__capabilities__no_model_anywhere__422(harness: _Harness) -> None:
    provider = await _saved(harness, models=[])

    response = await harness.client.get(f"/api/v1/ai-providers/{provider.id}/capabilities")

    assert response.status_code == 422


async def test__capabilities__unknown_provider__404(harness: _Harness) -> None:
    response = await harness.client.get(
        "/api/v1/ai-providers/00000000-0000-4000-8000-000000000000/capabilities", params={"model": "x"}
    )

    assert response.status_code == 404
