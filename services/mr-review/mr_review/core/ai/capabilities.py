"""Which request controls a model accepts, decided from its id.

Claude models are recognised by family and version in any id spelling — first-party
(``claude-opus-4-5-20251101``), Bedrock (``us.anthropic.claude-opus-4-5-20251101-v1:0``), Vertex
(``claude-opus-4-5@20251101``) or a gateway alias (``anthropic/claude-sonnet-4.5``). An id the table
does not know, including a newer version of a known family, is treated as a current-generation
model: adaptive thinking tuned by effort, no sampling parameters. OpenAI models are recognised by
prefix. ``openai_compat`` endpoints serve anything, so every control is offered there and sent
as asked.

Structured output is on by default only where it is documented for the model *and* the provider
talks to the vendor's own endpoint: a ``claude`` or ``openai`` provider pointed elsewhere by its
``base_url`` (a gateway, DeepSeek, Groq…) may reject it, so there it is offered but off.
"""

from __future__ import annotations

import re
from dataclasses import replace
from typing import Final, Literal
from urllib.parse import urlsplit

from mr_review.core.ai.entities import ModelCapabilities, ReasoningEffort, ReasoningMode, ThinkingSupport
from mr_review.core.ai_providers.entities import AIProviderType

DEFAULT_MAX_OUTPUT_TOKENS: Final = 32_000
MIN_THINKING_BUDGET: Final = 1024

_CLAUDE_EFFORTS: Final[tuple[ReasoningEffort, ...]] = ("low", "medium", "high", "xhigh", "max")
# xhigh arrived with Opus 4.7.
_CLAUDE_4_6_EFFORTS: Final[tuple[ReasoningEffort, ...]] = ("low", "medium", "high", "max")
_OPENAI_O_SERIES_EFFORTS: Final[tuple[ReasoningEffort, ...]] = ("low", "medium", "high")


_ClaudeThinking = Literal["always", "optional", "budget", "none"]

# How each kind of Claude thinking surfaces as capabilities: support, reasoning modes, minimum budget.
_CLAUDE_THINKING: Final[dict[_ClaudeThinking, tuple[ThinkingSupport, tuple[ReasoningMode, ...], int | None]]] = {
    "always": ("always", ("effort",), None),
    "optional": ("optional", ("effort",), None),
    "budget": ("optional", ("budget",), MIN_THINKING_BUDGET),
    "none": ("none", (), None),
}


def _claude(
    *,
    max_output: int,
    thinking: _ClaudeThinking = "budget",
    efforts: tuple[ReasoningEffort, ...] = (),
    default_effort: ReasoningEffort | None = None,
    temperature: bool = True,
    structured: bool = True,
    structured_default: bool = True,
) -> ModelCapabilities:
    """A Claude profile: ``always``/``optional`` adaptive thinking tuned by effort, a ``budget``, or ``none``."""
    support, modes, min_budget = _CLAUDE_THINKING[thinking]
    return ModelCapabilities(
        provider_type="claude",
        model="",
        known_model=True,
        thinking=support,
        reasoning_modes=modes,
        effort_levels=efforts,
        default_effort=default_effort,
        min_reasoning_budget=min_budget,
        temperature=temperature,
        max_temperature=1.0,
        max_output_tokens=max_output,
        default_max_output_tokens=min(DEFAULT_MAX_OUTPUT_TOKENS, max_output),
        structured_output=structured,
        structured_output_default=structured and structured_default,
    )


# Thinking is always on; effort is the only control and sampling parameters are rejected.
# Fable/Mythos 5.x, Opus 5, Sonnet 5 and 5.5 — and any Claude id this table does not know.
_CLAUDE_CURRENT: Final = _claude(
    max_output=128_000, thinking="always", efforts=_CLAUDE_EFFORTS, default_effort="high", temperature=False
)
# Opus 5.5 defaults to medium effort, one level below the rest of the line.
_CLAUDE_OPUS_5_5: Final = replace(_CLAUDE_CURRENT, default_effort="medium")
# Opus 4.7/4.8: adaptive thinking is opt-in, budgets and sampling parameters are rejected. Structured
# output is documented for 4.8 only, so on 4.7 it is offered but off by default.
_CLAUDE_OPUS_4_8: Final = _claude(
    max_output=128_000, thinking="optional", efforts=_CLAUDE_EFFORTS, default_effort="high", temperature=False
)
_CLAUDE_OPUS_4_7: Final = replace(_CLAUDE_OPUS_4_8, structured_output_default=False)
# Opus/Sonnet 4.6: adaptive thinking (budgets deprecated), no xhigh, temperature still accepted.
_CLAUDE_4_6: Final = _claude(
    max_output=128_000,
    thinking="optional",
    efforts=_CLAUDE_4_6_EFFORTS,
    default_effort="high",
    structured_default=False,
)
# Before 4.6: a fixed thinking budget (``budget_tokens``), no effort.
_CLAUDE_BUDGET_64K: Final = _claude(max_output=64_000)  # Opus 4.5, Haiku 4.5
_CLAUDE_SONNET_4_5: Final = _claude(max_output=64_000, structured_default=False)
_CLAUDE_BUDGET_32K: Final = _claude(max_output=32_000)  # Opus 4.1
# Claude 4.0 predates structured output.
_CLAUDE_SONNET_4: Final = _claude(max_output=64_000, structured=False)
_CLAUDE_OPUS_4: Final = _claude(max_output=32_000, structured=False)
_CLAUDE_SONNET_3_7: Final = _claude(max_output=64_000, structured=False)
_CLAUDE_3_5: Final = _claude(max_output=8192, thinking="none", structured=False)
_CLAUDE_3: Final = _claude(max_output=4096, thinking="none", structured=False)

# Per family, newest first: the first entry whose version is at or below the model's applies.
_CLAUDE_FAMILIES: Final[dict[str, tuple[tuple[tuple[int, int], ModelCapabilities], ...]]] = {
    "opus": (
        ((5, 5), _CLAUDE_OPUS_5_5),
        ((5, 0), _CLAUDE_CURRENT),
        ((4, 8), _CLAUDE_OPUS_4_8),
        ((4, 7), _CLAUDE_OPUS_4_7),
        ((4, 6), _CLAUDE_4_6),
        ((4, 5), _CLAUDE_BUDGET_64K),
        ((4, 1), _CLAUDE_BUDGET_32K),
        ((4, 0), _CLAUDE_OPUS_4),
        ((0, 0), _CLAUDE_3),
    ),
    "sonnet": (
        ((5, 0), _CLAUDE_CURRENT),
        ((4, 6), _CLAUDE_4_6),
        ((4, 5), _CLAUDE_SONNET_4_5),
        ((4, 0), _CLAUDE_SONNET_4),
        ((3, 7), _CLAUDE_SONNET_3_7),
        ((3, 5), _CLAUDE_3_5),
        ((0, 0), _CLAUDE_3),
    ),
    "haiku": (
        ((4, 5), _CLAUDE_BUDGET_64K),
        ((3, 5), _CLAUDE_3_5),
        ((0, 0), _CLAUDE_3),
    ),
}
# A version above these is newer than the table: current generation, not the newest known profile.
_CLAUDE_NEWEST: Final[dict[str, tuple[int, int]]] = {"opus": (5, 5), "sonnet": (5, 5), "haiku": (4, 5)}

_CLAUDE_ID_RE: Final = re.compile(
    r"claude-(?P<family>opus|sonnet|haiku|fable|mythos)(?:-(?P<major>\d{1,2})(?:[-.](?P<minor>\d{1,2})(?!\d))?)?"
)
_CLAUDE_LEGACY_ID_RE: Final = re.compile(r"claude-(?P<major>\d)(?:[-.](?P<minor>\d))?-(?P<family>opus|sonnet|haiku)")


def _claude_family(model: str) -> tuple[str, tuple[int, int] | None] | None:
    lowered = model.lower()
    match = _CLAUDE_ID_RE.search(lowered) or _CLAUDE_LEGACY_ID_RE.search(lowered)
    if match is None:
        return None
    if match.group("major") is None:
        return match.group("family"), None
    return match.group("family"), (int(match.group("major")), int(match.group("minor") or 0))


def _claude_capabilities(model: str) -> ModelCapabilities:
    recognised = _claude_family(model)
    unknown = replace(_CLAUDE_CURRENT, model=model, known_model=False, default_effort=None)
    if recognised is None:
        return unknown
    family, version = recognised
    profiles = _CLAUDE_FAMILIES.get(family)
    if profiles is None or version is None:  # Fable and Mythos: one current-generation surface
        return replace(_CLAUDE_CURRENT, model=model)
    if version > _CLAUDE_NEWEST[family]:
        return unknown
    profile = next(caps for floor, caps in profiles if version >= floor)
    return replace(profile, model=model)


def _openai(
    *,
    efforts: tuple[ReasoningEffort, ...] | None = None,
    default_effort: ReasoningEffort | None = None,
    max_output: int | None = None,
    structured: bool = True,
    structured_default: bool = True,
) -> ModelCapabilities:
    """An OpenAI profile: ``efforts`` set means a reasoning model, which takes no temperature."""
    reasoning = efforts is not None
    return ModelCapabilities(
        provider_type="openai",
        model="",
        known_model=True,
        thinking="always" if reasoning else "none",
        reasoning_modes=("effort",) if efforts else (),
        effort_levels=efforts or (),
        default_effort=default_effort,
        temperature=not reasoning,
        max_temperature=2.0,
        max_output_tokens=max_output,
        structured_output=structured,
        structured_output_default=structured and structured_default,
    )


# First match wins; ids are matched from the start, after a fine-tune's ``ft:`` prefix.
_OPENAI_MODELS: Final[tuple[tuple[re.Pattern[str], ModelCapabilities], ...]] = (
    (re.compile(r"o1-(mini|preview)"), _openai(efforts=(), structured=False)),
    (re.compile(r"o\d"), _openai(efforts=_OPENAI_O_SERIES_EFFORTS, default_effort="medium", max_output=100_000)),
    (re.compile(r"gpt-5-chat"), _openai(max_output=16_384)),
    # The chat snapshots of 5.1+ document no effort levels: offer only the default, medium.
    (re.compile(r"gpt-5\.\d+-chat"), _openai(efforts=("medium",), default_effort="medium", max_output=16_384)),
    (re.compile(r"gpt-5-pro"), _openai(efforts=("high",), default_effort="high", max_output=128_000)),
    # Responses API only, and no word on structured output: offered, off.
    (
        re.compile(r"gpt-5\.\d+-pro"),
        _openai(efforts=("medium", "high", "xhigh"), max_output=128_000, structured_default=False),
    ),
    (
        re.compile(r"gpt-5\.1"),
        _openai(efforts=("none", "low", "medium", "high"), default_effort="none", max_output=128_000),
    ),
    (
        re.compile(r"gpt-5\.5"),
        _openai(efforts=("none", "low", "medium", "high", "xhigh"), default_effort="medium", max_output=128_000),
    ),
    (
        re.compile(r"gpt-5\.\d"),
        _openai(efforts=("none", "low", "medium", "high", "xhigh"), default_effort="none", max_output=128_000),
    ),
    (
        re.compile(r"gpt-5"),
        _openai(efforts=("minimal", "low", "medium", "high"), default_effort="medium", max_output=128_000),
    ),
    (re.compile(r"gpt-4\.1"), _openai(max_output=32_768)),
    # The first gpt-4o snapshot and the ChatGPT alias reject json_schema response formats.
    (re.compile(r"chatgpt-4o"), _openai(max_output=16_384, structured=False)),
    (re.compile(r"gpt-4o-2024-05-13"), _openai(max_output=4096, structured=False)),
    (re.compile(r"gpt-4o"), _openai(max_output=16_384)),
    (re.compile(r"gpt-4|gpt-3\.5"), _openai(max_output=4096, structured=False)),
)
# An unknown OpenAI id is taken for a current reasoning model; low/medium/high is what every one accepts.
# It may as well be another vendor's model behind the OpenAI type, so structured output starts off.
_OPENAI_CURRENT: Final = _openai(efforts=_OPENAI_O_SERIES_EFFORTS, structured_default=False)

# The vendors' own API hosts; any other ``base_url`` is a gateway or another vendor.
_VENDOR_HOSTS: Final[dict[str, str]] = {"claude": "api.anthropic.com", "openai": "api.openai.com"}


def _openai_capabilities(model: str) -> ModelCapabilities:
    lowered = model.lower().removeprefix("openai/").removeprefix("ft:")
    for pattern, caps in _OPENAI_MODELS:
        if pattern.match(lowered):
            return replace(caps, model=model)
    return replace(_OPENAI_CURRENT, model=model, known_model=False)


def _compat_capabilities(model: str) -> ModelCapabilities:
    # Servers differ too much to know anything: offer every control and send what is asked.
    return ModelCapabilities(
        provider_type="openai_compat",
        model=model,
        known_model=False,
        thinking="optional",
        reasoning_modes=("effort", "budget"),
        effort_levels=_OPENAI_O_SERIES_EFFORTS,
        min_reasoning_budget=MIN_THINKING_BUDGET,
        temperature=True,
        max_temperature=2.0,
        structured_output=True,
        structured_output_default=False,
    )


def is_vendor_endpoint(provider_type: AIProviderType, base_url: str) -> bool:
    """Whether ``base_url`` is the vendor's own API: blank, or the vendor's host."""
    url = base_url.strip()
    if not url:
        return True
    host = urlsplit(url if "://" in url else f"https://{url}").hostname
    return host is not None and host == _VENDOR_HOSTS.get(provider_type)


def resolve_capabilities(provider_type: AIProviderType, model: str, *, base_url: str = "") -> ModelCapabilities:
    """The controls ``model`` accepts on a provider of ``provider_type`` reached at ``base_url``."""
    if provider_type == "claude":
        caps = _claude_capabilities(model)
    elif provider_type == "openai":
        caps = _openai_capabilities(model)
    else:
        return _compat_capabilities(model)
    if caps.structured_output_default and not is_vendor_endpoint(provider_type, base_url):
        return replace(caps, structured_output_default=False)
    return caps
