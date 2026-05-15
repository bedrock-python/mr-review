import platform
import sys

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from mr_review.api.config import Settings

router = APIRouter(prefix="/api/v1", tags=["system"])


def _get_settings() -> Settings:
    return Settings()


class SystemInfoResponse(BaseModel):
    data_dir: str
    os: str
    os_version: str
    python_version: str
    can_open_explorer: bool


def _build_system_info(settings: Settings) -> SystemInfoResponse:
    visible_data_dir = settings.host_data_dir or settings.data_dir.resolve()
    return SystemInfoResponse(
        data_dir=str(visible_data_dir),
        os=platform.system(),
        os_version=platform.version(),
        python_version=sys.version.split()[0],
        can_open_explorer=settings.host_data_dir is None,
    )


@router.get("/system/info")
async def get_system_info(settings: Settings = Depends(_get_settings)) -> SystemInfoResponse:
    return _build_system_info(settings)
