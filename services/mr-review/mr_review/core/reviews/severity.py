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
_NEGATIONS: Final = frozenset({"non", "not", "no"})
_NEGATION_PREFIX: Final = "non"
# Fillers allowed between a negation and the word it negates: "not a blocker", "not very important".
_NEGATION_FILLERS: Final = frozenset({"a", "an", "the", "very", "really", "too"})
# "non-blocking", "not critical": whatever is negated, it is not severe. Negating a low level
# ("not minor") says nothing usable, so the caller's default applies.
_NEGATED: Final[dict[Severity, Severity | None]] = {
    "critical": "minor",
    "major": "minor",
    "minor": None,
    "suggestion": None,
}


def _first_known_word(words: list[str]) -> tuple[Severity, bool] | None:
    """The level of the first recognised word and whether a negation applies to it."""
    negated = False
    for word in words:
        if word in _NEGATIONS:
            negated = True
            continue
        level = _SYNONYMS.get(word)
        if level is None and word.startswith(_NEGATION_PREFIX):
            # "noncritical", "nonblocking"
            level = _SYNONYMS.get(word.removeprefix(_NEGATION_PREFIX))
            if level is not None:
                return level, True
        if level is not None:
            return level, negated
        if word not in _NEGATION_FILLERS:
            negated = False
    return None


def normalize_severity(value: object) -> Severity | None:
    """Map a severity spelling onto the four levels; ``None`` when nothing in it is recognised.

    "Critical", "BLOCKER", "high-severity", "**Major**" and "nit: naming" all resolve — the whole
    value first, then its first known word. A negated word ("non-blocking", "not important")
    never raises the level: it reads as ``minor``.
    """
    if not isinstance(value, str):
        return None
    lowered = value.strip().lower()
    exact = _SYNONYMS.get(lowered)
    if exact is not None:
        return exact
    found = _first_known_word(_WORD_RE.findall(lowered))
    if found is None:
        return None
    level, negated = found
    return _NEGATED[level] if negated else level
