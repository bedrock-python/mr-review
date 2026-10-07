"""The brief's minimum severity and comment cap, enforced on parsed comments before they are stored.

The prompt asks the model to respect both; models do not always listen, so whatever is stored —
by dispatch, import or re-parse — goes through ``limit_comments`` as well.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from mr_review.core.reviews.entities import Comment
from mr_review.core.reviews.severity import Severity, severity_rank


@dataclass(frozen=True, slots=True)
class LimitedComments:
    comments: list[Comment]
    # Parsed comments dropped for being below the minimum severity or over the cap.
    filtered: int


def limit_comments(comments: Sequence[Comment], min_severity: Severity, max_comments: int | None) -> LimitedComments:
    """Drop comments below ``min_severity``, then keep the ``max_comments`` most severe — the earlier
    one on a tie — in the order the model gave them."""
    floor = severity_rank(min_severity)
    eligible = [(index, c) for index, c in enumerate(comments) if severity_rank(c.severity) <= floor]
    if max_comments is not None and len(eligible) > max_comments:
        chosen = sorted(eligible, key=lambda pair: (severity_rank(pair[1].severity), pair[0]))[:max_comments]
        eligible = sorted(chosen, key=lambda pair: pair[0])
    kept = [comment for _, comment in eligible]
    return LimitedComments(comments=kept, filtered=len(comments) - len(kept))
