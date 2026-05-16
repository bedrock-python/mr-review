from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from uuid import uuid4

from mr_review.core.reviews.entities import Comment

_VALID_SEVERITIES = frozenset({"critical", "major", "minor", "suggestion"})

# Matches ```json ... ``` or ``` ... ``` fences (dotall)
_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
# Fallback: find first '[' … last ']' in the string
_ARRAY_RE = re.compile(r"(\[[\s\S]*\])")


@dataclass
class CommentParseError:
    index: int
    raw: object
    reason: str


@dataclass
class ParseResult:
    comments: list[Comment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    json_error: str | None = None


def _extract_json(raw: str) -> str:
    """Strip markdown fences and return the best JSON candidate from the LLM output."""
    stripped = raw.strip()

    # Try to unwrap ```json ... ``` or ``` ... ```
    fence_match = _FENCE_RE.search(stripped)
    if fence_match:
        return fence_match.group(1).strip()

    # Try to find a bare JSON array anywhere in the text
    array_match = _ARRAY_RE.search(stripped)
    if array_match:
        return array_match.group(1).strip()

    return stripped


def _parse_comment(index: int, item: object) -> tuple[Comment | None, CommentParseError | None]:
    """Validate and convert a single raw dict to a Comment, returning (comment, None) or (None, error)."""
    if not isinstance(item, dict):
        return None, CommentParseError(index=index, raw=item, reason=f"Expected object, got {type(item).__name__}")

    body = item.get("body")
    if not isinstance(body, str) or not body.strip():
        return None, CommentParseError(index=index, raw=item, reason="Missing or empty 'body' field")

    severity_raw = item.get("severity", "suggestion")
    if not isinstance(severity_raw, str) or severity_raw not in _VALID_SEVERITIES:
        severity = "suggestion"
    else:
        severity = severity_raw

    file_raw = item.get("file")
    file_val: str | None = str(file_raw).strip() if isinstance(file_raw, str) and file_raw.strip() else None

    line_raw = item.get("line")
    line_val: int | None = None
    if line_raw is not None:
        try:
            digits = "".join(c for c in str(line_raw) if c.isdigit())
            line_val = int(digits) if digits else None
        except (ValueError, TypeError):
            line_val = None

    return (
        Comment(id=uuid4(), file=file_val, line=line_val, severity=severity, body=body.strip()),
        None,
    )


def parse_ai_response(raw: str) -> ParseResult:
    """
    Parse a raw LLM response into Comments.

    Handles:
    - Markdown code fences (```json ... ```)
    - Partial JSON recovery — imports valid items, records per-item errors
    - Returns ParseResult with comments, per-item errors, and optional top-level json_error
    """
    result = ParseResult()
    candidate = _extract_json(raw)

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as exc:
        result.json_error = f"Invalid JSON: {exc}"
        return result

    if not isinstance(data, list):
        result.json_error = f"Expected a JSON array, got {type(data).__name__}"
        return result

    for i, item in enumerate(data):
        comment, error = _parse_comment(i, item)
        if comment is not None:
            result.comments.append(comment)
        else:
            result.errors.append(error)  # type: ignore[arg-type]

    return result
