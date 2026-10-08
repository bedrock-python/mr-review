"""Unit tests for the DI-built dispatcher factory: options are planned against the provider's model."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, DispatchOptions, GenerationPlan
from mr_review.infra.ai.fence import AsyncioSemaphoreFenceRegistry
from mr_review.infra.di.providers import use_cases

from tests.factories.entities import make_ai_provider

pytestmark = pytest.mark.unit


class _Backend:
    """Stands in for a backend client and keeps the plan it was asked to dispatch."""

    plans: list[GenerationPlan] = []

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        pass

    def dispatch(self, _prompt: str, plan: GenerationPlan) -> AsyncIterator[AIStreamItem]:
        _Backend.plans.append(plan)
        return self._answer()

    async def _answer(self) -> AsyncIterator[AIStreamItem]:
        yield "[]"
        yield AIStreamEnd(truncated=False)


@pytest.fixture(autouse=True)
def _fake_backends(monkeypatch: pytest.MonkeyPatch) -> None:
    _Backend.plans = []
    monkeypatch.setattr(use_cases, "ClaudeProvider", _Backend)
    monkeypatch.setattr(use_cases, "OpenAICompatProvider", _Backend)


async def _plan_for(base_url: str, model: str, provider_type: str = "openai") -> GenerationPlan:
    factory = use_cases._make_ai_dispatcher_factory(AsyncioSemaphoreFenceRegistry(1))  # noqa: SLF001
    provider = make_ai_provider(type=provider_type, base_url=base_url, models=[model])
    stream = await factory(provider, "prompt", DispatchOptions(model=model))
    _ = [item async for item in stream]
    return _Backend.plans[-1]


async def test__factory__provider_behind_another_vendor__structured_output_off() -> None:
    """Regression: an openai provider pointed at DeepSeek or Groq got strict json_schema on every dispatch."""
    plan = await _plan_for("https://api.deepseek.com/v1", "gpt-4o")

    assert not plan.structured_output


async def test__factory__vendor_endpoint__structured_output_on() -> None:
    assert (await _plan_for("", "gpt-4o")).structured_output
    assert (await _plan_for("", "claude-opus-5-5", "claude")).structured_output
