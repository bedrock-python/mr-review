from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from mr_review.infra.db.orm.base import Base


class ReviewDB(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid.uuid4()))
    host_id: Mapped[str]
    repo_path: Mapped[str]
    mr_iid: Mapped[int]
    stage: Mapped[str] = mapped_column(default="pick")
    comments_json: Mapped[str] = mapped_column(Text, default="[]")
    brief_config_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
