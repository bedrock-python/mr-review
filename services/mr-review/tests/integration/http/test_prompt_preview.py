"""HTTP tests of the prompt preview, the plain prompt and the excluded-files check.

The VCS host is faked through DI; reviews and presets go through the real YAML repositories.
"""

from __future__ import annotations

import math
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from dishka import Provider, Scope, make_async_container, provide
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.config import Settings
from mr_review.api.routers.v1.review_presets import router as review_presets_router
from mr_review.api.routers.v1.reviews import router as reviews_router
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.core.reviews.entities import DEFAULT_PROMPT_BUDGET_CHARS, BriefConfig
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.di.providers.repositories import RepositoryProvider
from mr_review.infra.di.providers.use_cases import UseCaseProvider
from mr_review.infra.di.providers.vcs import VCSInfraProvider
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.repositories.review_preset import FileReviewPresetRepository
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.list_excluded_files import ListExcludedFilesUseCase

from tests.factories.entities import make_ai_provider, make_host, make_iteration
from tests.fakes import save_review

pytestmark = [pytest.mark.integration, pytest.mark.http]


def _changed(path: str, content: str) -> DiffFile:
    hunk = DiffHunk(
        old_start=0, old_count=0, new_start=1, new_count=1, lines=[DiffLine(type="added", new_line=1, content=content)]
    )
    return DiffFile(path=path, additions=1, deletions=0, hunks=[hunk])


class _VCS:
    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        return [_changed("src/billing.py", "charge(order)"), _changed("uv.lock", "lock-marker")]

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        return None

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        return []


class _Found:
    def __init__(self, entity: object) -> None:
        self._entity = entity

    async def get_by_id(self, _entity_id: UUID) -> object:
        return self._entity


class _FakeVCSProvider(Provider):
    scope = Scope.REQUEST

    @provide(override=True)
    def get_prompt_use_case(
        self, review_repo: FileReviewRepository, preset_repo: FileReviewPresetRepository
    ) -> GetReviewPromptUseCase:
        return GetReviewPromptUseCase(
            review_repo=review_repo,
            host_repo=_Found(make_host()),  # type: ignore[arg-type]
            vcs_factory=lambda _host: _VCS(),  # type: ignore[arg-type,return-value]
            preset_repo=preset_repo,
        )

    @provide(override=True)
    def get_excluded_files_use_case(self, review_repo: FileReviewRepository) -> ListExcludedFilesUseCase:
        return ListExcludedFilesUseCase(
            review_repo=review_repo,
            host_repo=_Found(make_host()),  # type: ignore[arg-type]
            vcs_factory=lambda _host: _VCS(),  # type: ignore[arg-type,return-value]
        )

    @provide(override=True)
    def get_dispatch_use_case(self, review_repo: FileReviewRepository) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(
            review_repo=review_repo,
            host_repo=_Found(make_host()),  # type: ignore[arg-type]
            ai_provider_repo=_Found(make_ai_provider()),  # type: ignore[arg-type]
            vcs_factory=lambda _host: _VCS(),  # type: ignore[arg-type,return-value]
            ai_dispatcher_factory=_never_called,
        )


async def _never_called(*_args: object) -> AsyncIterator[str]:
    raise AssertionError("The model must not be called")


@dataclass
class _Harness:
    client: AsyncClient
    reviews: FileReviewRepository


@pytest_asyncio.fixture
async def harness(tmp_path: Path) -> AsyncGenerator[_Harness, None]:
    app = FastAPI()
    app.include_router(reviews_router)
    app.include_router(review_presets_router)
    container = make_async_container(
        ApiConfigProvider(Settings(data_dir=tmp_path)),
        RepositoryProvider(),
        VCSInfraProvider(),
        UseCaseProvider(),
        _FakeVCSProvider(),
    )
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield _Harness(client=client, reviews=FileReviewRepository(tmp_path))
    await container.close()


async def _seed(reviews: FileReviewRepository, config: BriefConfig | None = None) -> UUID:
    review = await reviews.create_from_source(
        host_id=uuid4(), repo_path="ns/repo", source=BranchDiffSource(base_ref="main", head_ref="feature")
    )
    iteration = make_iteration(brief_config=config or BriefConfig(include_context=False))
    await save_review(reviews, review.model_copy(update={"iterations": [iteration]}))
    return review.id


async def _preview(harness: _Harness, review_id: UUID, brief: dict[str, Any] | None = None) -> dict[str, Any]:
    response = await harness.client.post(f"/api/v1/reviews/{review_id}/prompt/preview", json={"brief_config": brief})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


async def test__preview__prompt_with_size_breakdown_and_excluded_files(harness: _Harness) -> None:
    review_id = await _seed(harness.reviews)

    preview = await _preview(harness, review_id)

    assert "+1 | charge(order)" in preview["prompt"]
    assert "lock-marker" not in preview["prompt"]
    assert preview["total_chars"] == len(preview["prompt"])
    assert preview["estimated_tokens"] == math.ceil(preview["total_chars"] / 4)
    assert preview["budget_chars"] == DEFAULT_PROMPT_BUDGET_CHARS
    assert [s["key"] for s in preview["sections"]] == ["instructions", "diff", "description"]
    assert preview["files_total"] == 2
    assert preview["excluded_files"] == [{"path": "uv.lock", "reason": "*.lock"}]
    assert (preview["preset_name"], preview["preset_missing"]) == (None, False)


async def test__preview__unsaved_brief__used_instead_of_the_stored_one(harness: _Harness) -> None:
    review_id = await _seed(harness.reviews)
    brief = BriefConfig(include_context=False, output_language="German", use_default_excludes=False)

    preview = await _preview(harness, review_id, brief.model_dump(mode="json"))

    assert 'Write every "body" in German' in preview["prompt"]
    assert "lock-marker" in preview["prompt"]
    assert preview["excluded_files"] == []


async def test__plain_prompt__same_text_as_the_preview(harness: _Harness) -> None:
    review_id = await _seed(harness.reviews)

    response = await harness.client.post(f"/api/v1/reviews/{review_id}/prompt", json={})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert response.text == (await _preview(harness, review_id))["prompt"]


async def test__preview__saved_preset__used_then_reported_missing_once_deleted(harness: _Harness) -> None:
    created = await harness.client.post(
        "/api/v1/review-presets", json={"name": "Public API", "instructions": "Only review exported names."}
    )
    preset_id = created.json()["id"]
    review_id = await _seed(harness.reviews)
    brief = BriefConfig(include_context=False, custom_preset_id=preset_id).model_dump(mode="json")

    with_preset = await _preview(harness, review_id, brief)
    await harness.client.delete(f"/api/v1/review-presets/{preset_id}")
    without_preset = await _preview(harness, review_id, brief)

    assert with_preset["prompt"].startswith("# Code Review Task\n\nOnly review exported names.")
    assert (with_preset["preset_name"], with_preset["preset_missing"]) == ("Public API", False)
    assert without_preset["prompt"].startswith("# Code Review Task\n\nPerform a thorough code review.")
    assert without_preset["preset_missing"] is True


async def test__excluded_files__counts_against_the_given_brief(harness: _Harness) -> None:
    review_id = await _seed(harness.reviews)

    default = await harness.client.post(f"/api/v1/reviews/{review_id}/excluded-files", json={})
    narrowed = await harness.client.post(
        f"/api/v1/reviews/{review_id}/excluded-files",
        json={"brief_config": {"include_paths": ["docs/**"], "use_default_excludes": False}},
    )

    assert default.json() == {"total": 2, "excluded": [{"path": "uv.lock", "reason": "*.lock"}]}
    assert narrowed.json()["total"] == 2
    assert [e["path"] for e in narrowed.json()["excluded"]] == ["src/billing.py", "uv.lock"]


async def test__preview__unknown_review__404(harness: _Harness) -> None:
    response = await harness.client.post(f"/api/v1/reviews/{uuid4()}/prompt/preview", json={})

    assert response.status_code == 404


_NOTHING_LEFT = {"include_context": False, "include_paths": ["docs/**"]}


@pytest.mark.parametrize("route", ["prompt", "prompt/preview"])
async def test__prompt__path_filters_leave_no_file__422_saying_so(harness: _Harness, route: str) -> None:
    review_id = await _seed(harness.reviews)

    response = await harness.client.post(f"/api/v1/reviews/{review_id}/{route}", json={"brief_config": _NOTHING_LEFT})

    assert response.status_code == 422
    assert response.json()["detail"].startswith("All 2 changed files are excluded by the path filters")


async def test__dispatch__path_filters_leave_no_file__422_and_the_iteration_untouched(harness: _Harness) -> None:
    review_id = await _seed(harness.reviews, BriefConfig.model_validate(_NOTHING_LEFT))
    before = await harness.reviews.get_by_id(review_id)

    response = await harness.client.post(f"/api/v1/reviews/{review_id}/dispatch", json={"ai_provider_id": str(uuid4())})

    assert response.status_code == 422
    assert "excluded by the path filters" in response.json()["detail"]
    assert await harness.reviews.get_by_id(review_id) == before
