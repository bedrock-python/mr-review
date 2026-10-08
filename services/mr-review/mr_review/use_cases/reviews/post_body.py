"""How a comment reads once it is posted to the MR."""

from __future__ import annotations

import re
from typing import Literal

from mr_review.core.reviews.entities import Comment

# bold: "**Major** · body"; tag: "[major] body"; off: the body alone.
SeverityLabel = Literal["bold", "tag", "off"]

# A body opening with a block (fence, heading, quote, list, table) would break if the label were
# glued in front of it on the same line.
_BLOCK_START_RE = re.compile(r"^(```|~~~|#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)")
_BACKTICK_RUN_RE = re.compile(r"`+")
_SEPARATOR = " · "


def severity_label(severity: str, style: SeverityLabel) -> str:
    if style == "off":
        return ""
    if style == "tag":
        return f"[{severity}]"
    return f"**{severity.capitalize()}**"


def _code_span(text: str) -> str:
    """``text`` as inline code, whatever backticks it holds."""
    fence = "`" * (max((len(run) for run in _BACKTICK_RUN_RE.findall(text)), default=0) + 1)
    pad = " " if text.startswith("`") or text.endswith("`") else ""
    return f"{fence}{pad}{text}{pad}{fence}"


def format_post_body(comment: Comment, style: SeverityLabel, location: str | None = None) -> str:
    """The text posted for ``comment``.

    ``location`` (``path`` or ``path:line``) heads a note that is not anchored to that place in the
    diff: a file-level comment, or a line comment posted as a general note.
    """
    label = severity_label(comment.severity, style)
    joiner = " " if style == "tag" else _SEPARATOR
    if location is not None:
        header = joiner.join(part for part in (label, _code_span(location)) if part)
        return f"{header}\n\n{comment.body}"
    if not label:
        return comment.body
    if _BLOCK_START_RE.match(comment.body):
        return f"{label}\n\n{comment.body}"
    return f"{label}{joiner}{comment.body}"
