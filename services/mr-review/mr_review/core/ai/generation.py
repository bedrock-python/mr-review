"""Turning what a dispatch asked for into settings the target model accepts.

Nothing a model rejects is ever sent. Each rule below drops or adapts a setting rather than
letting the provider answer 400:

* reasoning the model cannot do is dropped; an effort level it does not have becomes the nearest
  level below (or its lowest); a budget becomes an effort on effort-only models and vice versa;
* temperature is sent only to models that take it, only while reasoning is off, and within the
  model's range;
* the output limit is capped at the model's maximum; when none is asked for, a Claude request
  gets 32k tokens — 64k at ``xhigh``/``max`` effort, room for the budget plus an answer with a
  thinking budget — and an OpenAI-style request leaves it to the endpoint;
* a thinking budget always leaves room for the answer below the output limit, or thinking is off;
* structured output follows the request, else the model's default, and only where supported.
"""

from __future__ import annotations

from typing import Final

from mr_review.core.ai.capabilities import MIN_THINKING_BUDGET
from mr_review.core.ai.entities import (
    EFFORT_ORDER,
    DispatchOptions,
    GenerationPlan,
    ModelCapabilities,
    ReasoningEffort,
    ThinkingRequest,
)
from mr_review.core.ai.review_format import system_prompt_for

DEEP_EFFORT_MAX_OUTPUT_TOKENS: Final = 64_000
# A thinking budget is kept this far below the output limit so the answer itself has room.
MIN_ANSWER_TOKENS: Final = 4096
# The answer room added on top of a thinking budget when the request names no output limit.
DEFAULT_ANSWER_TOKENS: Final = 16_000

_DEEP_EFFORTS: Final[frozenset[ReasoningEffort]] = frozenset({"xhigh", "max"})
# Rough equivalents between the two ways of asking for reasoning, for models that only take one.
_BUDGET_FOR_EFFORT: Final[dict[ReasoningEffort, int]] = {
    "minimal": MIN_THINKING_BUDGET,
    "low": 2048,
    "medium": 8192,
    "high": 16_384,
    "xhigh": 32_000,
    "max": 48_000,
}
_EFFORT_BUDGET_CEILINGS: Final[tuple[tuple[int, ReasoningEffort], ...]] = (
    (2048, "low"),
    (8192, "medium"),
    (16_384, "high"),
    (32_000, "xhigh"),
)


def _rank(effort: ReasoningEffort) -> int:
    return EFFORT_ORDER.index(effort)


def _nearest_effort(requested: ReasoningEffort, levels: tuple[ReasoningEffort, ...]) -> ReasoningEffort | None:
    """``requested`` when the model has it, else the nearest level below it, else the model's lowest."""
    if not levels:
        return None
    if requested in levels:
        return requested
    below = [level for level in levels if _rank(level) < _rank(requested)]
    candidates = below or list(levels)
    ranked = sorted(candidates, key=_rank)
    return ranked[-1] if below else ranked[0]


def _effort_for_budget(budget: int) -> ReasoningEffort:
    return next((effort for ceiling, effort in _EFFORT_BUDGET_CEILINGS if budget <= ceiling), "max")


def _from_effort(caps: ModelCapabilities, effort: ReasoningEffort) -> tuple[ReasoningEffort | None, int | None]:
    if effort == "none" and "none" not in caps.effort_levels and caps.thinking == "optional":
        return None, None  # "no reasoning" is simply reasoning off on such a model
    if "effort" in caps.reasoning_modes:
        return _nearest_effort(effort, caps.effort_levels), None
    if "budget" in caps.reasoning_modes:
        return None, _BUDGET_FOR_EFFORT.get(effort)
    return None, None


def _from_budget(caps: ModelCapabilities, budget: int) -> tuple[ReasoningEffort | None, int | None]:
    if "budget" in caps.reasoning_modes:
        return None, max(budget, caps.min_reasoning_budget or 1)
    if "effort" in caps.reasoning_modes:
        return _nearest_effort(_effort_for_budget(budget), caps.effort_levels), None
    return None, None


def _reasoning(caps: ModelCapabilities, options: DispatchOptions) -> tuple[ReasoningEffort | None, int | None]:
    """The effort or thinking budget to send — at most one of them."""
    if caps.thinking == "none":
        return None, None
    if options.reasoning_effort is not None:
        return _from_effort(caps, options.reasoning_effort)
    if options.reasoning_budget is not None:
        return _from_budget(caps, options.reasoning_budget)
    return None, None


def _max_output_tokens(
    caps: ModelCapabilities, requested: int | None, effort: ReasoningEffort | None, budget: int | None
) -> int | None:
    if requested is not None:
        wanted = requested
    elif caps.default_max_output_tokens is None:
        return None
    else:
        wanted = caps.default_max_output_tokens
        if effort in _DEEP_EFFORTS:
            wanted = max(wanted, DEEP_EFFORT_MAX_OUTPUT_TOKENS)
        if budget is not None:
            wanted = max(wanted, budget + DEFAULT_ANSWER_TOKENS)
    return min(wanted, caps.max_output_tokens) if caps.max_output_tokens is not None else wanted


def _fit_budget(budget: int | None, max_output_tokens: int | None) -> int | None:
    """A budget below the output limit that leaves the answer room; ``None`` (no thinking) when none fits."""
    if budget is None or max_output_tokens is None:
        return budget
    fitted = min(budget, max(MIN_THINKING_BUDGET, max_output_tokens - MIN_ANSWER_TOKENS))
    return fitted if fitted < max_output_tokens else None


def _temperature(caps: ModelCapabilities, options: DispatchOptions, *, reasoning: bool) -> float | None:
    if options.temperature is None or not caps.temperature or reasoning:
        return None
    return min(max(options.temperature, 0.0), caps.max_temperature)


def _structured_output(caps: ModelCapabilities, requested: bool | None) -> bool:
    if requested is None:
        return caps.structured_output_default
    return requested and caps.structured_output


def plan_generation(caps: ModelCapabilities, options: DispatchOptions) -> GenerationPlan:
    """The settings to send ``caps.model`` for a dispatch that asked for ``options``."""
    effort, budget = _reasoning(caps, options)
    max_output_tokens = _max_output_tokens(caps, options.max_output_tokens, effort, budget)
    budget = _fit_budget(budget, max_output_tokens)
    structured_output = _structured_output(caps, options.structured_output)
    thinking: ThinkingRequest = "budget" if budget is not None else "adaptive" if effort is not None else "default"
    return GenerationPlan(
        model=caps.model,
        system_prompt=system_prompt_for(options.system_prompt, structured_output=structured_output),
        thinking=thinking,
        effort=effort,
        budget_tokens=budget,
        temperature=_temperature(caps, options, reasoning=effort is not None or budget is not None),
        max_output_tokens=max_output_tokens,
        structured_output=structured_output,
    )
