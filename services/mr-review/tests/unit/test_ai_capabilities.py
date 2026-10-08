"""Unit tests for the model capability table."""

from __future__ import annotations

import pytest
from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai_providers.entities import AIProviderType

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "model",
    [
        "claude-opus-5-5",
        "claude-opus-5",
        "claude-sonnet-5-5",
        "claude-sonnet-5",
        "claude-fable-5-1",
        "claude-mythos-preview",
    ],
)
def test__claude_current_generation__effort_only_thinking_always_on_no_temperature(model: str) -> None:
    caps = resolve_capabilities("claude", model)

    assert caps.known_model
    assert caps.thinking == "always"
    assert caps.reasoning_modes == ("effort",)
    assert caps.effort_levels == ("low", "medium", "high", "xhigh", "max")
    assert not caps.temperature
    assert caps.max_output_tokens == 128_000
    assert caps.structured_output
    assert caps.structured_output_default


def test__claude_opus_5_5__defaults_to_medium_effort() -> None:
    assert resolve_capabilities("claude", "claude-opus-5-5").default_effort == "medium"
    assert resolve_capabilities("claude", "claude-opus-5").default_effort == "high"


@pytest.mark.parametrize("model", ["claude-opus-4-8", "claude-opus-4-7"])
def test__claude_opus_4_7_and_4_8__optional_adaptive_thinking_without_temperature(model: str) -> None:
    caps = resolve_capabilities("claude", model)

    assert caps.thinking == "optional"
    assert caps.reasoning_modes == ("effort",)
    assert "xhigh" in caps.effort_levels
    assert not caps.temperature


def test__claude_4_6__no_xhigh_and_temperature_accepted() -> None:
    for model in ("claude-opus-4-6", "claude-sonnet-4-6"):
        caps = resolve_capabilities("claude", model)

        assert caps.reasoning_modes == ("effort",)
        assert caps.effort_levels == ("low", "medium", "high", "max")
        assert caps.temperature


@pytest.mark.parametrize(
    ("model", "max_output"),
    [
        ("claude-haiku-4-5", 64_000),
        ("claude-haiku-4-5-20251001", 64_000),
        ("claude-sonnet-4-5", 64_000),
        ("claude-opus-4-5-20251101", 64_000),
        ("claude-opus-4-1-20250805", 32_000),
        ("claude-opus-4-20250514", 32_000),
        ("claude-sonnet-4-20250514", 64_000),
    ],
)
def test__claude_before_4_6__thinking_budget_and_temperature(model: str, max_output: int) -> None:
    caps = resolve_capabilities("claude", model)

    assert caps.thinking == "optional"
    assert caps.reasoning_modes == ("budget",)
    assert caps.effort_levels == ()
    assert caps.min_reasoning_budget == 1024
    assert caps.temperature
    assert caps.max_temperature == 1.0
    assert caps.max_output_tokens == max_output
    assert caps.default_max_output_tokens == min(32_000, max_output)


@pytest.mark.parametrize(
    "model",
    [
        "us.anthropic.claude-opus-4-5-20251101-v1:0",  # Bedrock
        "claude-opus-4-5@20251101",  # Vertex
        "anthropic/claude-opus-4.5",  # gateway alias
        "CLAUDE-OPUS-4-5",
    ],
)
def test__claude_id_spellings__resolve_to_the_same_family(model: str) -> None:
    assert resolve_capabilities("claude", model).reasoning_modes == ("budget",)


def test__claude_3__no_reasoning() -> None:
    caps = resolve_capabilities("claude", "claude-3-5-sonnet-20241022")

    assert caps.thinking == "none"
    assert caps.reasoning_modes == ()
    assert caps.max_output_tokens == 8192
    assert not caps.structured_output


@pytest.mark.parametrize("model", ["claude-opus-7", "claude-haiku-5", "my-gateway-model", "claude-sonnet-6-1"])
def test__claude_unknown_or_newer__treated_as_current_generation(model: str) -> None:
    caps = resolve_capabilities("claude", model)

    assert not caps.known_model
    assert caps.thinking == "always"
    assert caps.reasoning_modes == ("effort",)
    assert not caps.temperature
    assert caps.default_effort is None


def test__claude_structured_output__offered_but_off_by_default_where_not_documented() -> None:
    caps = resolve_capabilities("claude", "claude-opus-4-7")

    assert caps.structured_output
    assert not caps.structured_output_default


@pytest.mark.parametrize(
    ("model", "efforts"),
    [
        ("o3", ("low", "medium", "high")),
        ("o4-mini", ("low", "medium", "high")),
        ("gpt-5", ("minimal", "low", "medium", "high")),
        ("gpt-5-mini-2025-08-07", ("minimal", "low", "medium", "high")),
        ("gpt-5.1", ("none", "low", "medium", "high")),
        ("gpt-5.2", ("none", "low", "medium", "high", "xhigh")),
    ],
)
def test__openai_reasoning_models__effort_levels_and_no_temperature(model: str, efforts: tuple[str, ...]) -> None:
    caps = resolve_capabilities("openai", model)

    assert caps.thinking == "always"
    assert caps.effort_levels == efforts
    assert not caps.temperature
    assert caps.structured_output_default


@pytest.mark.parametrize(("model", "max_output"), [("gpt-4o", 16_384), ("gpt-4.1-mini", 32_768)])
def test__openai_chat_models__temperature_and_no_reasoning(model: str, max_output: int) -> None:
    caps = resolve_capabilities("openai", model)

    assert caps.thinking == "none"
    assert caps.temperature
    assert caps.max_temperature == 2.0
    assert caps.max_output_tokens == max_output
    assert caps.default_max_output_tokens is None


def test__openai_legacy__no_structured_output() -> None:
    assert not resolve_capabilities("openai", "gpt-4-turbo").structured_output
    assert not resolve_capabilities("openai", "gpt-3.5-turbo").structured_output


@pytest.mark.parametrize("model", ["chatgpt-4o-latest", "gpt-4o-2024-05-13"])
def test__openai_gpt_4o_variants_without_json_schema__structured_output_not_offered(model: str) -> None:
    """Regression: the gpt-4o rule turned structured output on for ids that reject json_schema."""
    caps = resolve_capabilities("openai", model)

    assert not caps.structured_output
    assert not caps.structured_output_default


def test__openai_unknown_id__structured_output_offered_but_off() -> None:
    """Regression: an unknown id (often another vendor behind the openai type) got strict json_schema."""
    caps = resolve_capabilities("openai", "gpt-oss-120b")

    assert caps.structured_output
    assert not caps.structured_output_default


@pytest.mark.parametrize(
    ("provider_type", "model", "base_url"),
    [
        ("openai", "gpt-4o", "https://api.deepseek.com/v1"),
        ("openai", "gpt-5", "http://litellm:4000"),
        ("claude", "claude-opus-5-5", "https://llm-gateway.example.com/anthropic"),
    ],
)
def test__non_vendor_base_url__structured_output_off_by_default(
    provider_type: AIProviderType, model: str, base_url: str
) -> None:
    """Regression: a provider pointed at another endpoint got structured output on every dispatch."""
    caps = resolve_capabilities(provider_type, model, base_url=base_url)

    assert caps.structured_output
    assert not caps.structured_output_default


@pytest.mark.parametrize(
    ("provider_type", "model", "base_url"),
    [
        ("openai", "gpt-4o", ""),
        ("openai", "gpt-4o", "https://api.openai.com/v1/"),
        ("claude", "claude-opus-5-5", "https://api.anthropic.com"),
    ],
)
def test__vendor_base_url__structured_output_stays_on(provider_type: AIProviderType, model: str, base_url: str) -> None:
    assert resolve_capabilities(provider_type, model, base_url=base_url).structured_output_default


@pytest.mark.parametrize(
    ("model", "efforts", "default"),
    [
        ("gpt-5.1-chat-latest", ("medium",), "medium"),
        ("gpt-5.2-chat-latest", ("medium",), "medium"),
        ("gpt-5.2-pro", ("medium", "high", "xhigh"), None),
        ("gpt-5.5", ("none", "low", "medium", "high", "xhigh"), "medium"),
        ("gpt-5.2", ("none", "low", "medium", "high", "xhigh"), "none"),
    ],
)
def test__openai_gpt_5_variants__their_own_effort_levels(
    model: str, efforts: tuple[str, ...], default: str | None
) -> None:
    """Regression: chat and pro snapshots fell under the generic gpt-5.x levels they reject."""
    caps = resolve_capabilities("openai", model)

    assert caps.effort_levels == efforts
    assert caps.default_effort == default


@pytest.mark.parametrize("model", ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-sonnet-4-0"])
def test__claude_4_0__structured_output_not_offered(model: str) -> None:
    """Regression: Sonnet 4 and Opus 4 were offered structured output they do not support."""
    caps = resolve_capabilities("claude", model)

    assert not caps.structured_output
    assert not caps.structured_output_default


def test__claude_sonnet_4_5__structured_output_offered_off_by_default() -> None:
    caps = resolve_capabilities("claude", "claude-sonnet-4-5")

    assert caps.structured_output
    assert not caps.structured_output_default


def test__openai_fine_tune__resolved_by_its_base_model() -> None:
    assert resolve_capabilities("openai", "ft:gpt-4o-mini:org::abc").temperature


def test__openai_compat__every_control_offered_structured_output_off_by_default() -> None:
    caps = resolve_capabilities("openai_compat", "llama3.1:70b")

    assert not caps.known_model
    assert caps.thinking == "optional"
    assert caps.reasoning_modes == ("effort", "budget")
    assert caps.temperature
    assert caps.max_output_tokens is None
    assert caps.structured_output
    assert not caps.structured_output_default
