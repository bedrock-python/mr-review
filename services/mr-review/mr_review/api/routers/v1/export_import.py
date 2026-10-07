"""Export/Import API endpoints."""

from __future__ import annotations

from collections.abc import Callable, Coroutine, Sequence
from typing import Any

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from mr_review.api.schemas.export_import import (
    ExportRequestSchema,
    ImportPreviewResponseSchema,
    ImportRequestSchema,
    ImportResponseSchema,
)
from mr_review.core.export_import.entities import ExportData, ExportRequest, ImportRequest
from mr_review.core.export_import.errors import PackageSecretsError
from mr_review.use_cases.export_data import ExportDataUseCase
from mr_review.use_cases.import_data import ImportDataUseCase
from mr_review.use_cases.preview_import import PreviewImportUseCase


class _RedactedValidationRoute(DishkaRoute):
    """Answers request validation errors without echoing the request back.

    Export files carry tokens and API keys. FastAPI's default 422 body repeats the offending
    input — for a missing field, the whole record, token included — which would put secrets
    into responses, browser consoles and anything that logs them.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def _handler(request: Request) -> Response:
            try:
                return await handler(request)
            except RequestValidationError as exc:
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    content={"detail": _redact(exc.errors())},
                )

        return _handler


def _redact(errors: Sequence[Any]) -> list[dict[str, object]]:
    return [{"type": error.get("type"), "loc": list(error.get("loc", ())), "msg": error.get("msg")} for error in errors]


router = APIRouter(prefix="/api/v1/data", tags=["export-import"], route_class=_RedactedValidationRoute)


def _package_to_json(package: ExportData) -> dict[str, Any]:
    """The export file: the package as JSON with its secrets written out as they are.

    Depending on how the export was requested a secret is a ciphertext, the plain value
    (explicit opt-in) or ``null``.
    """
    content = package.model_dump(mode="json")
    for host_json, host in zip(content["hosts"], package.hosts, strict=True):
        host_json["token"] = host.token.get_secret_value() if host.token is not None else None
    for provider_json, provider in zip(content["ai_providers"], package.ai_providers, strict=True):
        provider_json["api_key"] = provider.api_key.get_secret_value() if provider.api_key is not None else None
    return content


@router.post("/export", response_model=ExportData)
async def export_data(
    body: ExportRequestSchema,
    use_case: FromDishka[ExportDataUseCase],
) -> JSONResponse:
    """Export hosts, AI providers and reviews as one JSON file.

    Secrets are encrypted with ``encryption_password``, written in plain text only when
    ``include_plain_secrets`` is true, and left out otherwise.
    """
    request = ExportRequest(
        include_hosts=body.include_hosts,
        include_ai_providers=body.include_ai_providers,
        include_reviews=body.include_reviews,
        encryption_password=body.encryption_password,
        include_plain_secrets=body.include_plain_secrets,
    )
    package = await use_case.execute(request)
    stamp = package.exported_at.strftime("%Y%m%dT%H%M%SZ")
    return JSONResponse(
        content=_package_to_json(package),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="mr-review-export-{stamp}.json"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/import/preview", response_model=ImportPreviewResponseSchema)
async def preview_import(
    body: ExportData,
    use_case: FromDishka[PreviewImportUseCase],
) -> ImportPreviewResponseSchema:
    """Validate an export file and report what it holds and what already exists here.

    Writes nothing and needs no passphrase.
    """
    preview = await use_case.execute(body)
    return ImportPreviewResponseSchema.model_validate(preview.model_dump())


@router.post("/import", response_model=ImportResponseSchema, status_code=status.HTTP_201_CREATED)
async def import_data(
    body: ImportRequestSchema,
    use_case: FromDishka[ImportDataUseCase],
) -> ImportResponseSchema:
    """Import an export file; see ``ImportDataUseCase`` for the merge strategies.

    400 when the file is encrypted and the passphrase is missing or wrong — nothing is
    written then; 422 when the file is not a valid export.
    """
    request = ImportRequest(
        data=body.package(),
        merge_strategy=body.merge_strategy,
        decryption_password=body.decryption_password,
    )
    try:
        result = await use_case.execute(request)
    except PackageSecretsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return ImportResponseSchema.model_validate(result.model_dump())
