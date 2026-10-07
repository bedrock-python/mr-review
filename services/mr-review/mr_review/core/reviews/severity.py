"""Comment severities and the many ways models and older data spell them."""

from __future__ import annotations

import re
from typing import Final, Literal

Severity = Literal["critical", "major", "minor", "suggestion"]

DEFAULT_SEVERITY: Final[Severity] = "suggestion"

# Matched case-insensitively. high/medium/low line up with major/minor/suggestion.
_SYNONYMS: Final[dict[str, Severity]] = {
    "critical": "critical",
    "blocker": "critical",
    "blocking": "critical",
    "severe": "critical",
    "fatal": "critical",
    "urgent": "critical",
    "major": "major",
    "high": "major",
    "error": "major",
    "bug": "major",
    "important": "major",
    "minor": "minor",
    "medium": "minor",
    "moderate": "minor",
    "warning": "minor",
    "warn": "minor",
    "suggestion": "suggestion",
    "low": "suggestion",
    "nit": "suggestion",
    "nitpick": "suggestion",
    "info": "suggestion",
    "informational": "suggestion",
    "style": "suggestion",
    "note": "suggestion",
    "trivial": "suggestion",
    "optional": "suggestion",
}
_WORD_RE: Final = re.compile(r"[a-z]+")


def normalize_severity(value: object) -> Severity | None:
    """Map a severity spelling onto the four levels; ``None`` when nothing in it is recognised.

    "Critical", "BLOCKER", "high-severity", "**Major**" and "nit: naming" all resolve — the whole
    value first, then its first known word.
    """
    if not isinstance(value, str):
        return None
    lowered = value.strip().lower()
    exact = _SYNONYMS.get(lowered)
    if exact is not None:
        return exact
    return next((_SYNONYMS[word] for word in _WORD_RE.findall(lowered) if word in _SYNONYMS), None)
