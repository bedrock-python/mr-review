"""HTTP tests of saved review presets and the built-in preset texts."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from httpx import AsyncClient

pytestmark = [pytest.mark.integration, pytest.mark.http]

_URL = "/api/v1/review-presets"


def _name() -> str:
    return f"Preset {uuid4().hex[:8]}"


async def _create(client: AsyncClient, **fields: Any) -> dict[str, Any]:
    response = await client.post(_URL, json={"name": _name(), **fields})
    assert response.status_code == 201, response.text
    created: dict[str, Any] = response.json()
    return created


async def test__builtin__four_presets_with_their_instructions(client: AsyncClient) -> None:
    response = await client.get(f"{_URL}/builtin")

    assert response.status_code == 200
    presets = response.json()
    assert [p["id"] for p in presets] == ["thorough", "security", "style", "performance"]
    assert all(p["instructions"] and p["name"] and p["description"] for p in presets)


async def test__create__stored_with_normalised_overrides_and_listed(client: AsyncClient) -> None:
    created = await _create(
        client,
        description="Public API only",
        instructions="Look at exported functions.",
        brief_config={"min_severity": "major", "focus_areas": [" docs ", "docs"]},
    )

    listed = (await client.get(_URL)).json()
    fetched = (await client.get(f"{_URL}/{created['id']}")).json()

    assert created["brief_config"] == {"min_severity": "major", "focus_areas": ["docs"]}
    assert fetched == created
    assert created["id"] in [p["id"] for p in listed]


@pytest.mark.parametrize(
    "body",
    [
        {"name": "  "},
        {"name": "x" * 81},
        {"name": "ok", "brief_config": {"no_such_field": True}},
        {"name": "ok", "brief_config": {"custom_preset_id": None}},
        {"name": "ok", "brief_config": {"max_comments": 0}},
    ],
)
async def test__create__invalid__422(client: AsyncClient, body: dict[str, Any]) -> None:
    response = await client.post(_URL, json=body)

    assert response.status_code == 422


async def test__create__name_taken_ignoring_case__409(client: AsyncClient) -> None:
    created = await _create(client)

    response = await client.post(_URL, json={"name": created["name"].upper()})

    assert response.status_code == 409


async def test__update__given_fields_change_the_rest_stay(client: AsyncClient) -> None:
    created = await _create(
        client, description="before", instructions="keep me", brief_config={"output_language": "German"}
    )

    response = await client.patch(
        f"{_URL}/{created['id']}", json={"description": "after", "brief_config": {"max_comments": 5}}
    )

    assert response.status_code == 200
    updated = response.json()
    assert (updated["description"], updated["instructions"], updated["name"]) == ("after", "keep me", created["name"])
    assert updated["brief_config"] == {"max_comments": 5}
    assert updated["updated_at"] >= created["updated_at"]


async def test__update__rename_to_another_presets_name__409(client: AsyncClient) -> None:
    first = await _create(client)
    second = await _create(client)

    response = await client.patch(f"{_URL}/{second['id']}", json={"name": first["name"]})

    assert response.status_code == 409


async def test__update_get_delete__unknown_id__404(client: AsyncClient) -> None:
    missing = uuid4()

    assert (await client.get(f"{_URL}/{missing}")).status_code == 404
    assert (await client.patch(f"{_URL}/{missing}", json={"description": "x"})).status_code == 404
    assert (await client.delete(f"{_URL}/{missing}")).status_code == 404


async def test__delete__gone_from_the_list(client: AsyncClient) -> None:
    created = await _create(client)

    response = await client.delete(f"{_URL}/{created['id']}")

    assert response.status_code == 204
    assert created["id"] not in [p["id"] for p in (await client.get(_URL)).json()]
