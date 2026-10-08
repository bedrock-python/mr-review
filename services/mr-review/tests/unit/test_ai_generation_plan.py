"""Unit tests for planning a dispatch against a model's capabilities."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai.entities import DispatchOptions, GenerationPlan
from mr_review.core.ai.generation import plan_generation
from mr_review.core.ai.review_format import DEFAULT_SYSTEM_PROMPT, STRUCTURED_SYSTEM_PROMPT
from mr_review.core.ai_providers.entities import AIProviderType

pytestmark = pytest.mark.unit


def _plan(provider_type: AIProviderType, model: str, **options: Any) -> GenerationPlan:
    return plan_generation(resolve_capabilities(provider_type, model), DispatchOptions(model=model, **options))


def test__current_claude__budget_becomes_effort_never_budget_tokens() -> None:
    plan = _plan("claude", "claude-opus-5-5", reasoning_budget=16_000)

    assert plan.thinking == "adaptive"
    assert plan.budget_tokens is None
    assert plan.effort == "high"


def test__current_claude__temperature_dropped() -> None:
    plan = _plan("claude", "claude-sonnet-5-5", temperature=0.2)

    assert plan.temperature is None
    assert plan.thinking == "default"


def test__current_claude__no_reasoning_asked__nothing_sent() -> None:
    plan = _plan("claude", "claude-opus-5-5")

    assert plan.thinking == "default"
    assert plan.effort is None
    assert plan.max_output_tokens == 32_000


@pytest.mark.parametrize("effort", ["xhigh", "max"])
def test__deep_effort__default_output_limit_raised_to_64k(effort: str) -> None:
    plan = _plan("claude", "claude-opus-5-5", reasoning_effort=effort)

    assert plan.effort == effort
    assert plan.max_output_tokens == 64_000


def test__effort_the_model_lacks__nearest_level_below() -> None:
    assert _plan("claude", "claude-opus-4-6", reasoning_effort="xhigh").effort == "high"
    assert _plan("claude", "claude-opus-5-5", reasoning_effort="minimal").effort == "low"
    assert _plan("openai", "o3", reasoning_effort="xhigh").effort == "high"
    assert _plan("openai", "gpt-5", reasoning_effort="none").effort == "minimal"


def test__effort_none_on_optional_reasoning_model__reasoning_off() -> None:
    plan = _plan("claude", "claude-opus-4-8", reasoning_effort="none", temperature=0.5)

    assert plan.thinking == "default"
    assert plan.effort is None


def test__legacy_claude__budget_kept_below_max_tokens_with_room_for_the_answer() -> None:
    plan = _plan("claude", "claude-haiku-4-5", reasoning_budget=16_000)

    assert plan.thinking == "budget"
    assert plan.budget_tokens == 16_000
    assert plan.max_output_tokens is not None
    assert plan.max_output_tokens >= 16_000 + 4096


def test__legacy_claude__budget_shrunk_to_fit_explicit_output_limit() -> None:
    plan = _plan("claude", "claude-haiku-4-5", reasoning_budget=32_000, max_output_tokens=10_000)

    assert plan.max_output_tokens == 10_000
    assert plan.budget_tokens == 10_000 - 4096


def test__legacy_claude__budget_that_cannot_fit__thinking_off() -> None:
    plan = _plan("claude", "claude-haiku-4-5", reasoning_budget=4000, max_output_tokens=1000)

    assert plan.budget_tokens is None
    assert plan.thinking == "default"


def test__legacy_claude__budget_raised_to_minimum() -> None:
    assert _plan("claude", "claude-haiku-4-5", reasoning_budget=500).budget_tokens == 1024


def test__legacy_claude__effort_becomes_budget() -> None:
    plan = _plan("claude", "claude-sonnet-4-5", reasoning_effort="high")

    assert plan.thinking == "budget"
    assert plan.effort is None
    assert plan.budget_tokens == 16_384


def test__temperature__only_while_reasoning_is_off() -> None:
    assert _plan("claude", "claude-haiku-4-5", temperature=0.3).temperature == 0.3
    assert _plan("claude", "claude-haiku-4-5", temperature=0.3, reasoning_budget=4000).temperature is None
    assert _plan("openai_compat", "qwen", temperature=0.3, reasoning_effort="low").temperature is None


def test__temperature__capped_at_the_model_range() -> None:
    assert _plan("claude", "claude-haiku-4-5", temperature=1.6).temperature == 1.0
    assert _plan("openai", "gpt-4o", temperature=1.6).temperature == 1.6


def test__output_limit__capped_at_the_model_maximum() -> None:
    assert _plan("claude", "claude-opus-4-1", max_output_tokens=100_000).max_output_tokens == 32_000
    assert _plan("openai", "gpt-4o", max_output_tokens=100_000).max_output_tokens == 16_384


def test__openai__no_output_limit_unless_asked() -> None:
    assert _plan("openai", "gpt-4o").max_output_tokens is None
    assert _plan("openai_compat", "llama3").max_output_tokens is None
    assert _plan("openai_compat", "llama3", max_output_tokens=9000).max_output_tokens == 9000


def test__compat__budget_passed_through_without_touching_the_output_limit() -> None:
    plan = _plan("openai_compat", "deepseek-r1", reasoning_budget=8000)

    assert plan.budget_tokens == 8000
    assert plan.max_output_tokens is None


def test__structured_output__default_per_provider_type() -> None:
    assert _plan("claude", "claude-opus-5-5").structured_output
    assert _plan("openai", "gpt-4o").structured_output
    assert not _plan("openai_compat", "llama3").structured_output


def test__structured_output__explicit_choice_honoured_only_where_supported() -> None:
    assert not _plan("claude", "claude-opus-5-5", structured_output=False).structured_output
    assert _plan("openai_compat", "llama3", structured_output=True).structured_output
    assert not _plan("openai", "gpt-3.5-turbo", structured_output=True).structured_output


def test__system_prompt__built_in_matches_the_answer_format_and_override_wins() -> None:
    assert _plan("claude", "claude-opus-5-5").system_prompt == STRUCTURED_SYSTEM_PROMPT
    assert _plan("openai_compat", "llama3").system_prompt == DEFAULT_SYSTEM_PROMPT
    assert _plan("claude", "claude-opus-5-5", system_prompt="Be terse.").system_prompt == "Be terse."
    assert _plan("claude", "claude-opus-5-5", system_prompt="  ").system_prompt == STRUCTURED_SYSTEM_PROMPT
