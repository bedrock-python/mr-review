"""Export/Import API endpoints."""

from __future__ import annotations

from typing import Any

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from mr_review.api.schemas.export_import import (
    ExportRequestSchema,
    ExportResponseSchema,
    ImportRequestSchema,
    ImportResponseSchema,
)
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.export_import.entities import ExportData, ExportRequest, ImportRequest
from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import Review
from mr_review.use_cases.export_data import ExportDataUseCase
from mr_review.use_cases.import_data import ImportDataUseCase

router = APIRouter(prefix="/api/v1/data", tags=["export-import"], route_class=DishkaRoute)


@router.post("/export", response_model=ExportResponseSchema)
async def export_data(
    body: ExportRequestSchema,
    use_case: FromDishka[ExportDataUseCase],
) -> JSONResponse:
    """Export selected data (hosts, AI providers, reviews).

    Args:
        body: Export request with selection flags
        use_case: Export use case from DI

    Returns:
        JSON with exported data
    """
    request = ExportRequest(
        include_hosts=body.include_hosts,
        include_ai_providers=body.include_ai_providers,
        include_reviews=body.include_reviews,
        encryption_password=body.encryption_password,
    )

    export_data_result: ExportData = await use_case.execute(request)

    # Convert to JSON-serializable format
    # For plain export, we need to expose SecretStr values
    # For encrypted export, SecretStr contains encrypted tokens
    def serialize_with_secrets(obj: Host | AIProvider) -> dict[str, Any]:
        """Serialize entity with exposed secret fields."""
        data = obj.model_dump(mode="json")
        # For plain export, expose the secret values
        if not export_data_result.encrypted:
            if isinstance(obj, Host):
                data["token"] = obj.token.get_secret_value()
            elif isinstance(obj, AIProvider):
                data["api_key"] = obj.api_key.get_secret_value()
        # For encrypted export, SecretStr already contains encrypted string
        elif isinstance(obj, Host):
            data["token"] = obj.token.get_secret_value()
        elif isinstance(obj, AIProvider):
            data["api_key"] = obj.api_key.get_secret_value()
        return data

    response_data = ExportResponseSchema(
        version=export_data_result.version,
        exported_at=export_data_result.exported_at,
        encrypted=export_data_result.encrypted,
        hosts=[serialize_with_secrets(h) for h in export_data_result.hosts],
        ai_providers=[serialize_with_secrets(p) for p in export_data_result.ai_providers],
        reviews=[r.model_dump(mode="json") for r in export_data_result.reviews],
    )

    filename = f"mr-review-export-{export_data_result.exported_at.isoformat()}.json"
    return JSONResponse(
        content=response_data.model_dump(mode="json"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportResponseSchema, status_code=status.HTTP_201_CREATED)
async def import_data(
    body: ImportRequestSchema,
    use_case: FromDishka[ImportDataUseCase],
) -> ImportResponseSchema:
    """Import data package (hosts, AI providers, reviews).

    Args:
        body: Import request with data and merge strategy
        use_case: Import use case from DI

    Returns:
        Import result with counts and errors
    """
    # Convert request to internal format
    export_data = ExportData(
        version=body.version,
        exported_at=body.exported_at,
        encrypted=body.encrypted,
        hosts=[],
        ai_providers=[],
        reviews=[],
    )

    # Parse hosts, ai_providers, reviews from dicts (validated by Pydantic)
    export_data.hosts = [Host.model_validate(h) for h in body.hosts]
    export_data.ai_providers = [AIProvider.model_validate(p) for p in body.ai_providers]
    export_data.reviews = [Review.model_validate(r) for r in body.reviews]

    request = ImportRequest(
        data=export_data,
        merge_strategy=body.merge_strategy,
        decryption_password=body.decryption_password,
    )

    result = await use_case.execute(request)

    return ImportResponseSchema(
        hosts_imported=result.hosts_imported,
        hosts_skipped=result.hosts_skipped,
        ai_providers_imported=result.ai_providers_imported,
        ai_providers_skipped=result.ai_providers_skipped,
        reviews_imported=result.reviews_imported,
        reviews_skipped=result.reviews_skipped,
        errors=result.errors,
    )
