"""BriefConfig validation and the partial briefs saved presets carry."""

from __future__ import annotations

import pytest
from mr_review.core.reviews.entities import BriefConfig, normalize_brief_overrides
from pydantic import ValidationError

pytestmark = pytest.mark.unit


def test__list_fields__trimmed_deduplicated_and_blank_lines_dropped() -> None:
    config = BriefConfig(
        context_files=[" docs/ ", "", "docs/", "README.md"],
        focus_areas=["  error   handling ", "error handling", ""],
        exclude_paths=["*.snap", " *.snap"],
    )

    assert config.context_files == ["docs/", "README.md"]
    assert config.focus_areas == ["error handling"]
    assert config.exclude_paths == ["*.snap"]


def test__output_language__collapsed_to_one_line() -> None:
    assert BriefConfig(output_language="  Brazilian\n Portuguese ").output_language == "Brazilian Portuguese"


@pytest.mark.parametrize(
    "fields",
    [
        {"max_comments": 0},
        {"min_severity": "blocker"},
        {"prompt_budget_chars": 10},
        {"output_language": "x" * 65},
        {"focus_areas": ["x" * 201]},
        {"focus_areas": [f"area {i}" for i in range(31)]},
    ],
)
def test__out_of_range_values__rejected(fields: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        BriefConfig.model_validate(fields)


def test__overrides_strict__known_fields_normalised() -> None:
    overrides = normalize_brief_overrides(
        {"min_severity": "major", "focus_areas": [" auth ", "auth"], "include_full_files": True}, strict=True
    )

    assert overrides == {"min_severity": "major", "focus_areas": ["auth"], "include_full_files": True}


@pytest.mark.parametrize(
    "data",
    [{"no_such_field": 1}, {"custom_preset_id": None}, {"max_comments": 0}, {"min_severity": "loud"}],
)
def test__overrides_strict__unknown_selection_or_invalid_fields_rejected(data: dict[str, object]) -> None:
    with pytest.raises(ValueError, match="brief fields"):
        normalize_brief_overrides(data, strict=True)


def test__overrides_lenient__bad_fields_dropped_the_rest_kept() -> None:
    overrides = normalize_brief_overrides(
        {"no_such_field": 1, "custom_preset_id": None, "max_comments": 0, "output_language": "German"}, strict=False
    )

    assert overrides == {"output_language": "German"}
