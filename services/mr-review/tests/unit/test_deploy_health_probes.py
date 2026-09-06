"""The health probes in the shipped deployment files must name a route that exists.

A probe on a path the API does not serve is not a probe that fails: in the
all-in-one image the SPA fallback answers any unmatched path with ``index.html``
and a 200, so the container reports healthy whatever state the application is in.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from mr_review.api.routers.health import router as health_router

pytestmark = pytest.mark.unit

_REPO_ROOT = Path(__file__).resolve().parents[4]
_ALL_IN_ONE_DOCKERFILE = _REPO_ROOT / "deploy" / "all-in-one" / "Dockerfile"
_STANDARD_COMPOSE = _REPO_ROOT / "deploy" / "standard" / "docker-compose.yml"

_HEALTH_ROUTES = {route.path for route in health_router.routes if isinstance(route, APIRoute)}
_PROBE_URL = re.compile(r"http://localhost:8000(/[^\s\"']*)")


def _probe_paths(deployment_file: Path) -> list[str]:
    """Every path the deployment file probes on the API's own port."""
    if not deployment_file.is_file():
        pytest.skip(f"{deployment_file} is not part of this checkout")
    paths = _PROBE_URL.findall(deployment_file.read_text(encoding="utf-8"))
    assert paths, f"no probe URL found in {deployment_file}"
    return paths


@pytest.mark.parametrize(
    "deployment_file",
    [_ALL_IN_ONE_DOCKERFILE, _STANDARD_COMPOSE],
    ids=["all-in-one", "standard"],
)
def test__deployment_health_probe__points_at_a_route_the_api_serves(deployment_file: Path) -> None:
    """Each health probe in deploy/ names one of the routes the health router registers."""
    # Arrange / Act
    paths = _probe_paths(deployment_file)

    # Assert
    for path in paths:
        assert path in _HEALTH_ROUTES, f"{deployment_file.name} probes {path}, which the API does not serve"
