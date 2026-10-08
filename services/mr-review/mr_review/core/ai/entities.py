"""What a dispatch asks of a model, what a model can do, and how its stream ends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

from mr_review.core.ai_providers.entities import AIProviderType

# Every level any backend knows, weakest first. Claude takes low…max, OpenAI none…xhigh;
# a model's own subset is in ``ModelCapabilities.effort_levels``.
ReasoningEffort = Literal["none", "minimal", "low", "medium", "high", "xhigh", "max"]
EFFORT_ORDER: Final[tuple[ReasoningEffort, ...]] = ("none", "minimal", "low", "medium", "high", "xhigh", "max")

ReasoningMode = Literal["effort", "budget"]

# ``always``: the model reasons on every request and cannot be told not to — the request only
# tunes how much. ``optional``: reasoning is off unless the request turns it on. ``none``: the
# model does not reason.
ThinkingSupport = Literal["always", "optional", "none"]

# How a request asks for thinking. ``adaptive``: Claude's adaptive thinking (the effort travels
# separately); ``budget``: a fixed thinking-token budget; ``default``: nothing is sent and the model
# reasons as it does by default.
ThinkingRequest = Literal["adaptive", "budget", "default"]


@dataclass(frozen=True, slots=True)
class DispatchOptions:
    """Per-dispatch generation settings, as the caller asked for them.

    ``None`` everywhere means "the default": the provider's first model, the model's own
    sampling and reasoning defaults, a model-sized output limit, structured output when the
    provider type supports it by default, and the built-in system prompt. Settings the target
    model does not accept are dropped or adapted before the request is sent — see
    ``plan_generation``.
    """

    model: str | None = None
    temperature: float | None = None
    reasoning_effort: ReasoningEffort | None = None
    reasoning_budget: int | None = None
    max_output_tokens: int | None = None
    structured_output: bool | None = None
    system_prompt: str | None = None


@dataclass(frozen=True, slots=True)
class ModelCapabilities:
    """The request controls a model accepts, so a UI can offer only those and a backend sends only those."""

    provider_type: AIProviderType
    model: str
    # False when the id matched no known family: the values are then the provider type's defaults.
    known_model: bool
    thinking: ThinkingSupport
    reasoning_modes: tuple[ReasoningMode, ...] = ()
    effort_levels: tuple[ReasoningEffort, ...] = ()
    # The effort the model uses when the request names none; ``None`` when unknown.
    default_effort: ReasoningEffort | None = None
    min_reasoning_budget: int | None = None
    # Temperature is accepted — and only ever sent while reasoning is off — up to ``max_temperature``.
    temperature: bool = False
    max_temperature: float = 2.0
    # The model's output token cap; ``None`` when unknown.
    max_output_tokens: int | None = None
    # Sent when the request names no limit; ``None`` leaves the limit to the endpoint.
    default_max_output_tokens: int | None = None
    structured_output: bool = False
    structured_output_default: bool = False


@dataclass(frozen=True, slots=True)
class GenerationPlan:
    """The exact settings one request will be sent with: everything here is accepted by the model."""

    model: str
    system_prompt: str
    thinking: ThinkingRequest
    effort: ReasoningEffort | None
    budget_tokens: int | None
    temperature: float | None
    max_output_tokens: int | None
    structured_output: bool


@dataclass(frozen=True, slots=True)
class AIStreamEnd:
    """The last item of a provider stream: how the answer ended.

    ``truncated`` is the provider's own word that it stopped at the output token limit (or the
    context window), independent of whether the text happens to look complete.
    """

    truncated: bool


AIStreamItem = str | AIStreamEnd
