from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import pytest
import pytest_asyncio
from httpx import AsyncClient
from mr_review.api.config import Settings
from mr_review.core.reviews.entities import IterationStage
from mr_review.infra.repositories.review import FileReviewRepository

pytestmark = [pytest.mark.integration, pytest.mark.http]

_TOKEN = "secret-token"  # noqa: S105


@pytest_asyncio.fixture
async def open_iteration(client: AsyncClient) -> AsyncGenerator[tuple[str, str], None]:
    """Create a review with an open iteration; yield (review_id, iteration_id), then delete the review.

    The HTTP data directory is shared by the whole session, and other modules expect it to hold
    no reviews, so the review must not outlive the test.
    """
    host = await client.post(
        "/api/v1/hosts",
        json={"name": "GL comments", "type": "gitlab", "base_url": "https://gl.example.com", "token": _TOKEN},
    )
    assert host.status_code == 201
    review = await client.post(
        "/api/v1/reviews", json={"host_id": host.json()["id"], "repo_path": "team/svc", "mr_iid": 5}
    )
    assert review.status_code == 201
    review_id = review.json()["id"]
    with_iteration = await client.post(f"/api/v1/reviews/{review_id}/iterations", json={})
    assert with_iteration.status_code == 201
    yield review_id, with_iteration.json()["iterations"][-1]["id"]
    await client.delete(f"/api/v1/reviews/{review_id}")


async def _add_comment(client: AsyncClient, review_id: str, iteration_id: str, **fields: Any) -> dict[str, Any]:
    payload = {"severity": "major", "body": "Check the bounds", **fields}
    response = await client.post(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments", json=payload)
    assert response.status_code == 201, response.text
    return response.json()["iterations"][-1]["comments"][-1]


async def test__create_comment__anchored__returns_201_and_persists(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """POST .../comments stores the comment with a server id and returns the whole review."""
    review_id, iteration_id = open_iteration

    response = await client.post(
        f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments",
        json={"file": "src/app.py", "line": 7, "severity": "critical", "body": "Off by one"},
    )

    assert response.status_code == 201
    comments = response.json()["iterations"][-1]["comments"]
    assert len(comments) == 1
    created = comments[0]
    assert UUID(created["id"])
    assert created["file"] == "src/app.py"
    assert created["line"] == 7
    assert created["severity"] == "critical"
    assert created["status"] == "kept"
    stored = await client.get(f"/api/v1/reviews/{review_id}")
    assert stored.json()["iterations"][-1]["comments"] == comments


async def test__create_comment__general__has_no_anchor(client: AsyncClient, open_iteration: tuple[str, str]) -> None:
    """Without file/line the comment is a general note."""
    review_id, iteration_id = open_iteration

    created = await _add_comment(client, review_id, iteration_id, body="Nice cleanup overall")

    assert created["file"] is None
    assert created["line"] is None


@pytest.mark.parametrize(
    "payload",
    [
        {"severity": "major", "body": "   "},
        {"severity": "major", "body": "x", "file": "a.py", "line": 0},
        {"severity": "major", "body": "x", "line": 3},
        {"severity": "urgent", "body": "x"},
    ],
)
async def test__create_comment__invalid_body__returns_422(
    client: AsyncClient, open_iteration: tuple[str, str], payload: dict[str, Any]
) -> None:
    """Blank bodies, non-positive lines, a line without a file and unknown severities are rejected."""
    review_id, iteration_id = open_iteration

    response = await client.post(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments", json=payload)

    assert response.status_code == 422


async def test__create_comment__unknown_review_or_iteration__returns_404(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """Missing review and missing iteration both answer 404."""
    review_id, _ = open_iteration
    payload = {"severity": "minor", "body": "x"}

    missing_review = await client.post(
        f"/api/v1/reviews/{uuid.uuid4()}/iterations/{uuid.uuid4()}/comments", json=payload
    )
    missing_iteration = await client.post(
        f"/api/v1/reviews/{review_id}/iterations/{uuid.uuid4()}/comments", json=payload
    )

    assert missing_review.status_code == 404
    assert missing_iteration.status_code == 404


async def test__delete_comment__existing__returns_200_without_it(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """DELETE .../comments/{id} removes the comment and returns the updated review."""
    review_id, iteration_id = open_iteration
    first = await _add_comment(client, review_id, iteration_id, body="first")
    second = await _add_comment(client, review_id, iteration_id, body="second")

    response = await client.delete(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments/{first['id']}")

    assert response.status_code == 200
    assert [c["id"] for c in response.json()["iterations"][-1]["comments"]] == [second["id"]]


async def test__delete_comment__unknown_comment__returns_404(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """Deleting a comment that is not on the iteration answers 404."""
    review_id, iteration_id = open_iteration

    response = await client.delete(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments/{uuid.uuid4()}")

    assert response.status_code == 404


async def test__comments__posted_iteration__return_409(
    client: AsyncClient, open_iteration: tuple[str, str], http_settings: Settings
) -> None:
    """Once an iteration is posted, adding and deleting comments answer 409."""
    review_id, iteration_id = open_iteration
    created = await _add_comment(client, review_id, iteration_id)
    repo = FileReviewRepository(http_settings.data_dir)
    review = await repo.get_by_id(UUID(review_id))
    assert review is not None
    posted = review.iterations[-1].model_copy(
        update={"stage": IterationStage.post, "completed_at": datetime.now(timezone.utc)}
    )
    await repo.update(review.model_copy(update={"iterations": [*review.iterations[:-1], posted]}))

    add = await client.post(
        f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments", json={"severity": "minor", "body": "late"}
    )
    delete = await client.delete(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments/{created['id']}")

    assert add.status_code == 409
    assert delete.status_code == 409


async def test__update_review__brief_on_posted_iteration__returns_409_until_a_new_iteration_starts(
    client: AsyncClient, open_iteration: tuple[str, str], http_settings: Settings
) -> None:
    """A brief PATCH against a posted iteration answers 409; a new iteration then takes the brief."""
    review_id, _ = open_iteration
    repo = FileReviewRepository(http_settings.data_dir)
    review = await repo.get_by_id(UUID(review_id))
    assert review is not None
    posted = review.iterations[-1].model_copy(
        update={"stage": IterationStage.post, "completed_at": datetime.now(timezone.utc)}
    )
    await repo.update(review.model_copy(update={"iterations": [*review.iterations[:-1], posted]}))

    refused = await client.patch(f"/api/v1/reviews/{review_id}", json={"brief_config": {"preset": "security"}})
    stored = await client.get(f"/api/v1/reviews/{review_id}")
    new_round = await client.post(f"/api/v1/reviews/{review_id}/iterations", json={})
    accepted = await client.patch(f"/api/v1/reviews/{review_id}", json={"brief_config": {"preset": "security"}})

    assert refused.status_code == 409
    assert stored.json()["iterations"][-1]["brief_config"]["preset"] != "security"
    assert len(new_round.json()["iterations"]) == 2
    assert accepted.status_code == 200
    assert accepted.json()["iterations"][-1]["brief_config"]["preset"] == "security"
    assert accepted.json()["iterations"][0]["brief_config"]["preset"] != "security"


async def test__update_review__anchor_fields__move_and_clear_anchor(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """PATCH comment patches re-anchor with file/line and clear the anchor with an explicit null."""
    review_id, iteration_id = open_iteration
    moved = await _add_comment(client, review_id, iteration_id, file="src/a.py", line=3)
    cleared = await _add_comment(client, review_id, iteration_id, file="src/a.py", line=9)
    untouched = await _add_comment(client, review_id, iteration_id, file="src/c.py", line=1)

    response = await client.patch(
        f"/api/v1/reviews/{review_id}",
        json={
            "iteration_id": iteration_id,
            "iteration_comments": [
                {"id": moved["id"], "file": "src/b.py", "line": 20},
                {"id": cleared["id"], "file": None},
                {"id": untouched["id"], "status": "dismissed"},
            ],
        },
    )

    assert response.status_code == 200
    by_id = {c["id"]: c for c in response.json()["iterations"][-1]["comments"]}
    assert (by_id[moved["id"]]["file"], by_id[moved["id"]]["line"]) == ("src/b.py", 20)
    assert (by_id[cleared["id"]]["file"], by_id[cleared["id"]]["line"]) == (None, None)
    assert (by_id[untouched["id"]]["file"], by_id[untouched["id"]]["line"]) == ("src/c.py", 1)
    assert by_id[untouched["id"]]["status"] == "dismissed"


async def test__update_review__line_on_general_comment__returns_422(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """A line patch on a general comment would leave a line without a file."""
    review_id, iteration_id = open_iteration
    general = await _add_comment(client, review_id, iteration_id)

    response = await client.patch(
        f"/api/v1/reviews/{review_id}",
        json={"iteration_id": iteration_id, "iteration_comments": [{"id": general["id"], "line": 4}]},
    )

    assert response.status_code == 422
    stored = await client.get(f"/api/v1/reviews/{review_id}")
    assert stored.json()["iterations"][-1]["comments"][0]["line"] is None


async def test__update_review__non_positive_line__returns_422(
    client: AsyncClient, open_iteration: tuple[str, str]
) -> None:
    """``line`` must be at least 1."""
    review_id, iteration_id = open_iteration
    anchored = await _add_comment(client, review_id, iteration_id, file="src/a.py", line=2)

    response = await client.patch(
        f"/api/v1/reviews/{review_id}",
        json={"iteration_id": iteration_id, "iteration_comments": [{"id": anchored["id"], "line": 0}]},
    )

    assert response.status_code == 422
