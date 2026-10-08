"""Values exchanged with a VCS host when comments are posted to a merge request."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

# Why a comment did not land, which decides what may be done about it:
# * position_rejected — the host refused the comment's place in the diff; nothing was posted, and
#   a general note can stand in for it.
# * rejected — refused for another reason (token, permissions, validation) or never sent (no
#   connection); nothing was posted, a plain retry is safe.
# * ambiguous — no definitive answer (timeout, 5xx, dropped connection): the host may have posted
#   it, so neither a general note nor a blind retry is safe.
# * blocked — not sent on purpose, because sending would have side effects (Gitea would publish the
#   user's own pending review with it).
PostFailureKind = Literal["position_rejected", "rejected", "ambiguous", "blocked"]


@dataclass(frozen=True, slots=True)
class LineAnchor:
    """A line of the MR diff an inline comment is attached to.

    Comments always point at the new version of a file, so ``new_line`` is set. ``old_line`` is set
    as well for an unchanged (context) line: GitLab anchors such a line by both sides and rejects a
    position that names only one.
    """

    path: str
    # The file's path before the change; the same as ``path`` unless the file was renamed.
    old_path: str
    new_line: int
    old_line: int | None = None


@dataclass(frozen=True, slots=True)
class InlineComment:
    anchor: LineAnchor
    body: str


@dataclass(frozen=True, slots=True)
class PostedNote:
    """A comment the host accepted: its id there and, when known, a link to it."""

    note_id: str
    url: str | None = None


@dataclass(frozen=True, slots=True)
class PostFailure:
    """A comment that did not land, with a human-readable reason and what kind of failure it was."""

    reason: str
    kind: PostFailureKind = "rejected"


PostResult = PostedNote | PostFailure
