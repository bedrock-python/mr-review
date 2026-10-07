from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CommentPatchDTO(BaseModel):
    """Partial update of one comment: only the fields in ``model_fields_set`` are touched.

    ``file`` and ``line`` tell an omitted field apart from an explicit ``None``: a ``None``
    file clears the anchor (the comment becomes a general note and loses its line too), a
    ``None`` line keeps the file and drops the line. For the other fields ``None`` means
    "leave as is", because none of them can be empty.
    """

    id: UUID
    status: Literal["kept", "dismissed"] | None = None
    body: str | None = None
    severity: Literal["critical", "major", "minor", "suggestion"] | None = None
    resolved: bool | None = None
    file: str | None = None
    line: int | None = None
