from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.integration, pytest.mark.http]

_TOKEN = "secret-token"  # noqa: S105


async def test__list_hosts__no_hosts_exist__returns_empty_list(client: AsyncClient) -> None:
    """GET /api/v1/hosts returns an empty JSON array when no hosts have been created."""
    # Arrange / Act
    response = await client.get("/api/v1/hosts")

    # Assert
    assert response.status_code == 200
    assert response.json() == []


async def test__create_host__valid_payload__returns_201_with_host_data(client: AsyncClient) -> None:
    """POST /api/v1/hosts with valid body returns 201 and the created host entity."""
    # Arrange
    payload = {
        "name": "My GitLab",
        "type": "gitlab",
        "base_url": "https://gitlab.example.com",
        "token": _TOKEN,
    }

    # Act
    response = await client.post("/api/v1/hosts", json=payload)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "My GitLab"
    assert body["type"] == "gitlab"
    assert body["base_url"] == "https://gitlab.example.com"
    assert "id" in body
    assert "created_at" in body


async def test__create_host__trailing_slash_in_base_url__is_stripped(client: AsyncClient) -> None:
    """POST /api/v1/hosts strips a trailing slash from base_url before persisting."""
    # Arrange
    payload = {
        "name": "Slash Host",
        "type": "github",
        "base_url": "https://api.github.com/",
        "token": _TOKEN,
    }

    # Act
    response = await client.post("/api/v1/hosts", json=payload)

    # Assert
    assert response.status_code == 201
    assert response.json()["base_url"] == "https://api.github.com"


async def test__list_hosts__after_create__returns_created_host(client: AsyncClient) -> None:
    """GET /api/v1/hosts lists the host that was just created."""
    # Arrange
    payload = {
        "name": "Listed Host",
        "type": "gitlab",
        "base_url": "https://gl.listed.com",
        "token": _TOKEN,
    }
    await client.post("/api/v1/hosts", json=payload)

    # Act
    response = await client.get("/api/v1/hosts")

    # Assert
    assert response.status_code == 200
    names = [h["name"] for h in response.json()]
    assert "Listed Host" in names


async def test__delete_host__host_exists__returns_204(client: AsyncClient) -> None:
    """DELETE /api/v1/hosts/{id} returns 204 No Content when the host exists."""
    # Arrange
    create_resp = await client.post(
        "/api/v1/hosts",
        json={"name": "ToDelete", "type": "gitlab", "base_url": "https://del.com", "token": _TOKEN},
    )
    host_id = create_resp.json()["id"]

    # Act
    response = await client.delete(f"/api/v1/hosts/{host_id}")

    # Assert
    assert response.status_code == 204


async def test__delete_host__host_not_found__returns_404(client: AsyncClient) -> None:
    """DELETE /api/v1/hosts/{id} returns 404 when the host does not exist."""
    # Arrange
    import uuid

    missing_id = uuid.uuid4()

    # Act
    response = await client.delete(f"/api/v1/hosts/{missing_id}")

    # Assert
    assert response.status_code == 404
