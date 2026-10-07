"""The answer format a review dispatch asks for: the built-in system prompts and the JSON schema."""

from __future__ import annotations

from typing import Final, get_args

from mr_review.core.reviews.severity import Severity

DEFAULT_SYSTEM_PROMPT: Final = (
    "You are an expert code reviewer. Your task is to analyse a merge request diff and "
    "produce actionable, precise review comments. You output ONLY a valid JSON array — "
    "no prose, no markdown fences, no explanation before or after the array."
)

# With structured output the answer is constrained to REVIEW_COMMENTS_SCHEMA, an object
# rather than a bare array: both Claude and OpenAI require an object at the root.
STRUCTURED_SYSTEM_PROMPT: Final = (
    "You are an expert code reviewer. Your task is to analyse a merge request diff and "
    'produce actionable, precise review comments. Your answer is a JSON object whose "comments" '
    "array holds the review comments, each in the format the request describes."
)

_NULLABLE_STRING: Final = {"anyOf": [{"type": "string"}, {"type": "null"}]}
_NULLABLE_INTEGER: Final = {"anyOf": [{"type": "integer"}, {"type": "null"}]}

# Within what both Claude's ``output_config.format`` and OpenAI's strict ``json_schema`` accept:
# every property required, ``additionalProperties: false`` on every object, no numeric or length
# constraints. ``file``/``line`` are null for a general comment.
REVIEW_COMMENTS_SCHEMA: Final[dict[str, object]] = {
    "type": "object",
    "properties": {
        "comments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file": _NULLABLE_STRING,
                    "line": _NULLABLE_INTEGER,
                    "severity": {"type": "string", "enum": list(get_args(Severity))},
                    "body": {"type": "string"},
                },
                "required": ["file", "line", "severity", "body"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["comments"],
    "additionalProperties": False,
}

REVIEW_COMMENTS_SCHEMA_NAME: Final = "review_comments"


def system_prompt_for(override: str | None, *, structured_output: bool) -> str:
    """The override when one is given, else the built-in prompt matching the answer format."""
    if override is not None and override.strip():
        return override
    return STRUCTURED_SYSTEM_PROMPT if structured_output else DEFAULT_SYSTEM_PROMPT
