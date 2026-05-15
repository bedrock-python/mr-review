from __future__ import annotations

from pathlib import Path

import pytest
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    """Temporary data directory with required subdirs."""
    (tmp_path / "reviews").mkdir()
    return tmp_path


@pytest.fixture
def host_repo(data_dir: Path) -> FileHostRepository:
    return FileHostRepository(data_dir)


@pytest.fixture
def review_repo(data_dir: Path) -> FileReviewRepository:
    return FileReviewRepository(data_dir)
