"""YAML storage of the raw model answer kept on an iteration."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.infra.repositories.review import FileReviewRepository

from tests.factories.entities import make_comment, make_iteration
from tests.fakes import save_review

pytestmark = pytest.mark.integration

_TRICKY = (
    "<think>\nreasoning: [a] {b}\n</think>\n"
    '```json\n[{"file": "a.py", "body": "Use:\\n```python\\nx = 1\\n```"}]\n```\n'
    "--- yaml: looking # text\r\n\ttab, trailing spaces   \n  \x85 Кириллица 🙂\n"
)


async def test__review_repo__raw_response__round_trips_exactly(review_repo: FileReviewRepository) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)
    iteration = make_iteration(comments=[make_comment()]).model_copy(update={"raw_response": _TRICKY})

    await save_review(review_repo, review.model_copy(update={"iterations": [iteration]}))
    loaded = await review_repo.get_by_id(review.id)

    assert loaded is not None
    assert loaded.iterations[0].raw_response == _TRICKY


async def test__review_repo__no_raw_response__loads_as_none(review_repo: FileReviewRepository) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)

    await save_review(review_repo, review.model_copy(update={"iterations": [make_iteration()]}))
    loaded = await review_repo.get_by_id(review.id)

    assert loaded is not None
    assert loaded.iterations[0].raw_response is None


async def test__review_repo__file_from_before_raw_response__still_loads(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)
    iteration = make_iteration(comments=[make_comment(body="One")])
    await save_review(review_repo, review.model_copy(update={"iterations": [iteration]}))
    path = data_dir / "reviews" / f"{review.id}.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    del data["iterations"][0]["raw_response"]
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")

    loaded = await review_repo.get_by_id(review.id)

    assert loaded is not None
    assert loaded.iterations[0].raw_response is None
    assert [c.body for c in loaded.iterations[0].comments] == ["One"]
