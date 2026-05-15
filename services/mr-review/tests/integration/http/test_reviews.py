from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.integration, pytest.mark.http]

_TOKEN = "secret-token"  # noqa: S105


async def _create_host(client: AsyncClient, *, name: str = "Test Host") -> str:
    """Helper: create a host and return its ID string."""
    resp = await client.post(
        "/api/v1/hosts",
        json={"name": name, "type": "gitlab", "base_url": "https://gl.example.com", "token": _TOKEN},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test__list_reviews__no_reviews_exist__returns_empty_list(client: AsyncClient) -> None:
    """GET /api/v1/reviews returns an empty JSON array when no reviews have been created."""
    # Arrange / Act
    response = await client.get("/api/v1/reviews")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


async def test__create_review__valid_payload__returns_201_with_review_data(
    client: AsyncClient,
) -> None:
    """POST /api/v1/reviews with valid body returns 201 and the created review entity."""
    # Arrange
    host_id = await _create_host(client, name="GL for Create Review")
    payload = {"host_id": host_id, "repo_path": "team/service", "mr_iid": 42}

    # Act
    response = await client.post("/api/v1/reviews", json=payload)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["host_id"] == host_id
    assert body["repo_path"] == "team/service"
    assert body["mr_iid"] == 42
    assert body["stage"] == "pick"
    assert body["comments"] == []
    assert "id" in body


async def test__get_review__review_exists__returns_200_with_review_data(
    client: AsyncClient,
) -> None:
    """GET /api/v1/reviews/{id} returns 200 and the review entity when it exists."""
    # Arrange
    host_id = await _create_host(client, name="GL for Get Review")
    create_resp = await client.post("/api/v1/reviews", json={"host_id": host_id, "repo_path": "ns/repo", "mr_iid": 1})
    review_id = create_resp.json()["id"]

    # Act
    response = await client.get(f"/api/v1/reviews/{review_id}")

    # Assert
    assert response.status_code == 200
    assert response.json()["id"] == review_id


async def test__get_review__review_not_found__returns_404(client: AsyncClient) -> None:
    """GET /api/v1/reviews/{id} returns 404 when the review does not exist."""
    # Arrange
    missing_id = uuid.uuid4()

    # Act
    response = await client.get(f"/api/v1/reviews/{missing_id}")

    # Assert
    assert response.status_code == 404


async def test__list_reviews__after_create__returns_created_review(client: AsyncClient) -> None:
    """GET /api/v1/reviews lists the review that was just created."""
    # Arrange
    host_id = await _create_host(client, name="GL for List Reviews")
    await client.post("/api/v1/reviews", json={"host_id": host_id, "repo_path": "owner/listed", "mr_iid": 99})

    # Act
    response = await client.get("/api/v1/reviews")

    # Assert
    assert response.status_code == 200
    repo_paths = [r["repo_path"] for r in response.json()]
    assert "owner/listed" in repo_paths


async def test__update_review__valid_stage__returns_200_with_updated_stage(
    client: AsyncClient,
) -> None:
    """PATCH /api/v1/reviews/{id} with a new stage returns 200 and the updated entity."""
    # Arrange
    host_id = await _create_host(client, name="GL for Update Stage")
    create_resp = await client.post("/api/v1/reviews", json={"host_id": host_id, "repo_path": "ns/repo", "mr_iid": 2})
    review_id = create_resp.json()["id"]

    # Act
    response = await client.patch(f"/api/v1/reviews/{review_id}", json={"stage": "polish"})

    # Assert
    assert response.status_code == 200
    assert response.json()["stage"] == "polish"


async def test__update_review__review_not_found__returns_404(client: AsyncClient) -> None:
    """PATCH /api/v1/reviews/{id} returns 404 when the review does not exist."""
    # Arrange
    missing_id = uuid.uuid4()

    # Act
    response = await client.patch(f"/api/v1/reviews/{missing_id}", json={"stage": "polish"})

    # Assert
    assert response.status_code == 404
