from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(tags=["system"])


@router.get("/system/health/livez", include_in_schema=False)
async def liveness() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@router.get("/system/health/readyz", include_in_schema=False)
async def readiness() -> JSONResponse:
    return JSONResponse({"status": "ok"})
