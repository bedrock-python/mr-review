"""Everything between a review's brief and the prompt text, shared by the prompt preview and dispatch:
the source's diff, the path filters, the preset, the context collectors and the previous comments."""

from __future__ import annotations

from dataclasses import dataclass

from mr_review.core.review_presets.entities import BUILTIN_PRESETS
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.path_filter import ExcludedFile, PathFilter
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.use_cases.reviews.context_files import gather_context
from mr_review.use_cases.reviews.prompt_builder import ComposedPrompt, PreviousComments, PromptInputs, compose_prompt
from mr_review.use_cases.reviews.source_resolver import resolve_source


class AllFilesExcludedError(Exception):
    """The brief's path filters leave none of the change's files to review."""

    def __init__(self, total: int) -> None:
        super().__init__(
            f"All {total} changed files are excluded by the path filters, so there is nothing to review. "
            "Loosen the include or exclude patterns in the brief."
        )
        self.total = total


@dataclass(frozen=True, slots=True)
class ResolvedIntent:
    instructions: str
    # The saved preset whose instructions are used, if any.
    preset_name: str | None = None
    # The brief points at a saved preset that no longer exists; the built-in one stands in.
    preset_missing: bool = False


@dataclass(frozen=True, slots=True)
class AssembledPrompt:
    prompt: ComposedPrompt
    # Changed files in the source, before the path filters.
    files_total: int
    excluded: tuple[ExcludedFile, ...]
    intent: ResolvedIntent


async def resolve_intent(config: BriefConfig, presets: ReviewPresetRepository | None) -> ResolvedIntent:
    """The review intent: the saved preset's instructions when it has some, else the built-in preset's."""
    builtin = BUILTIN_PRESETS[config.preset].instructions
    if config.custom_preset_id is None or presets is None:
        return ResolvedIntent(builtin)
    preset = await presets.get_by_id(config.custom_preset_id)
    if preset is None:
        return ResolvedIntent(builtin, preset_missing=True)
    return ResolvedIntent(preset.instructions.strip() or builtin, preset_name=preset.name)


def dispatch_target_number(review: Review, iteration: Iteration | None = None) -> int:
    """The number of the iteration a dispatch would run as: the given one, the last one while it is
    still open, or the next one."""
    if iteration is not None:
        return iteration.number
    last = review.iterations[-1] if review.iterations else None
    if last is not None and last.completed_at is None and last.stage != IterationStage.post:
        return last.number
    return max((it.number for it in review.iterations), default=0) + 1


def previous_comments(review: Review, iteration_number: int) -> PreviousComments | None:
    """The kept comments of the latest iteration before ``iteration_number``, if it has any."""
    earlier = [it for it in review.iterations if it.number < iteration_number]
    if not earlier:
        return None
    previous = max(earlier, key=lambda it: it.number)
    kept = tuple(c for c in previous.comments if c.status == "kept")
    return PreviousComments(iteration_number=previous.number, comments=kept) if kept else None


async def assemble_prompt(
    review: Review,
    provider: VCSProvider,
    config: BriefConfig,
    *,
    iteration_number: int,
    presets: ReviewPresetRepository | None = None,
) -> AssembledPrompt:
    """Fetch what ``config`` asks for and compose the prompt the model gets for ``review``.

    Raises ``AllFilesExcludedError`` when the change has files but the path filters leave none.
    """
    resolved = await resolve_source(review, provider)
    path_filter = PathFilter.from_brief(config)
    diff_files, excluded = path_filter.split(resolved.diff_files)
    if resolved.diff_files and not diff_files:
        raise AllFilesExcludedError(len(resolved.diff_files))
    intent = await resolve_intent(config, presets)
    context = await gather_context(provider, review.repo_path, diff_files, config, resolved.ref, path_filter.allows)
    previous = previous_comments(review, iteration_number) if config.include_previous_comments else None
    prompt = compose_prompt(
        config,
        PromptInputs(
            intent=intent.instructions,
            diff_files=diff_files,
            title=resolved.title,
            description=resolved.description,
            context=context,
            previous=previous,
        ),
    )
    return AssembledPrompt(prompt=prompt, files_total=len(resolved.diff_files), excluded=tuple(excluded), intent=intent)
