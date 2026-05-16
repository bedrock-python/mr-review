import json
import platform
import sys
from pathlib import Path
from typing import Literal

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter
from pydantic import BaseModel

from mr_review.api.config import Settings

router = APIRouter(prefix="/api/v1", tags=["system"], route_class=DishkaRoute)

DeploymentMode = Literal["all-in-one", "standard"]


def _read_frontend_version(static_dir: Path) -> str | None:
    try:
        data = json.loads((static_dir / "version.json").read_text())
        return str(data["version"])
    except (OSError, KeyError, ValueError, json.JSONDecodeError):
        return None


class SystemInfoResponse(BaseModel):
    data_dir: str
    os: str
    os_version: str
    python_version: str
    can_open_explorer: bool
    backend_version: str
    frontend_version: str | None
    deployment_mode: DeploymentMode


def _build_system_info(settings: Settings) -> SystemInfoResponse:
    visible_data_dir = settings.host_data_dir or settings.data_dir.resolve()
    deployment_mode: DeploymentMode = "all-in-one" if settings.static_dir is not None else "standard"
    frontend_version = _read_frontend_version(settings.static_dir) if settings.static_dir is not None else None
    return SystemInfoResponse(
        data_dir=str(visible_data_dir),
        os=platform.system(),
        os_version=platform.version(),
        python_version=sys.version.split()[0],
        can_open_explorer=settings.host_data_dir is None,
        backend_version=settings.get_app_version(),
        frontend_version=frontend_version,
        deployment_mode=deployment_mode,
    )


@router.get("/system/info")
async def get_system_info(settings: Settings = Depends(_get_settings)) -> SystemInfoResponse:
    return _build_system_info(settings)
