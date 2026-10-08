from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.mrs.entities import MR, InboxMR, InboxScope, MRStateFilter, Repo
from mr_review.core.pagination import Page
from mr_review.use_cases.mrs.list_inbox_mrs import (
    INBOX_FETCH_CONCURRENCY,
    INBOX_MRS_PER_REPO,
    INBOX_REPO_BATCH,
    ListInboxMRsUseCase,
)

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit

_NOW = datetime.now(timezone.utc)


def _make_mr(iid: int = 1, age_minutes: int = 0) -> MR:
    return MR(
        iid=iid,
        title=f"MR {iid}",
        description="",
        author="dev",
        source_branch="feature",
        target_branch="main",
        status="opened",
        draft=False,
        created_at=_NOW,
        updated_at=_NOW - timedelta(minutes=age_minutes),
    )


def _repos(paths: list[str], *, has_more: bool = False, page: int = 1) -> Page[Repo]:
    return Page(
        items=[Repo(id=p, path=p, name=p) for p in paths], page=page, per_page=INBOX_REPO_BATCH, has_more=has_more
    )


def _mrs(mrs: list[MR]) -> Page[MR]:
    return Page(items=mrs, page=1, per_page=30, has_more=False)


def _make_use_case(provider: AsyncMock, favourites: list[str] | None = None) -> ListInboxMRsUseCase:
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = make_host(favourite_repos=favourites or [])
    return ListInboxMRsUseCase(host_repo=host_repo, vcs_factory=lambda _host: provider)


async def test__list_inbox_mrs__host_not_found__raises_value_error() -> None:
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    use_case = ListInboxMRsUseCase(host_repo=host_repo, vcs_factory=lambda _host: AsyncMock())
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(missing_id)


async def test__list_inbox_mrs__all__no_repos__returns_empty_page() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _repos([])

    result = await _make_use_case(provider).execute(host_id=uuid4())

    assert (result.items, result.has_more) == ([], False)
    provider.list_mrs.assert_not_called()


async def test__list_inbox_mrs__all__fetches_one_repo_batch_and_first_mr_page_of_each() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _repos(["g/r1", "g/r2"], has_more=True, page=2)

    def list_mrs(repo_path: str, state: MRStateFilter, page: int, per_page: int) -> Page[MR]:
        return _mrs([_make_mr(iid=1, age_minutes=5)] if repo_path == "g/r1" else [_make_mr(iid=2, age_minutes=1)])

    provider.list_mrs.side_effect = list_mrs

    result = await _make_use_case(provider).execute(host_id=uuid4(), page=2, per_page=7)

    provider.list_repos.assert_awaited_once_with(page=2, per_page=INBOX_REPO_BATCH)
    assert {call.kwargs["per_page"] for call in provider.list_mrs.await_args_list} == {7}
    assert {call.kwargs["page"] for call in provider.list_mrs.await_args_list} == {1}
    # Newest update first, across repositories.
    assert [(item.repo_path, item.mr.iid) for item in result.items] == [("g/r2", 2), ("g/r1", 1)]
    assert (result.page, result.per_page, result.has_more) == (2, 7, True)


async def test__list_inbox_mrs__all__page_one_includes_unlisted_favourites_once() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _repos(["g/r1", "pinned/listed"])
    provider.list_mrs.return_value = _mrs([])

    await _make_use_case(provider, favourites=["pinned/extra", "pinned/listed"]).execute(host_id=uuid4())

    queried = [call.kwargs["repo_path"] for call in provider.list_mrs.await_args_list]
    assert sorted(queried) == ["g/r1", "pinned/extra", "pinned/listed"]


async def test__list_inbox_mrs__all__later_pages_skip_favourites() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _repos(["g/r9", "pinned/listed"], page=2)
    provider.list_mrs.return_value = _mrs([])

    await _make_use_case(provider, favourites=["pinned/listed", "pinned/extra"]).execute(host_id=uuid4(), page=2)

    assert [call.kwargs["repo_path"] for call in provider.list_mrs.await_args_list] == ["g/r9"]


async def test__list_inbox_mrs__all__concurrency_is_bounded() -> None:
    in_flight = 0
    peak = 0

    async def list_mrs(**_: object) -> Page[MR]:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0.01)
        in_flight -= 1
        return _mrs([])

    provider = AsyncMock()
    provider.list_repos.return_value = _repos([f"g/r{i}" for i in range(INBOX_REPO_BATCH)])
    provider.list_mrs.side_effect = list_mrs

    await _make_use_case(provider).execute(host_id=uuid4())

    assert provider.list_mrs.await_count == INBOX_REPO_BATCH
    assert peak == INBOX_FETCH_CONCURRENCY


async def test__list_inbox_mrs__all__failing_repo__is_skipped_and_logged(caplog: pytest.LogCaptureFixture) -> None:
    def list_mrs(repo_path: str, **_: object) -> Page[MR]:
        if repo_path == "g/broken":
            raise ConnectionError("network down")
        return _mrs([_make_mr()])

    provider = AsyncMock()
    provider.list_repos.return_value = _repos(["g/ok", "g/broken"])
    provider.list_mrs.side_effect = list_mrs

    with caplog.at_level(logging.WARNING, logger="mr_review.use_cases.mrs.list_inbox_mrs"):
        result = await _make_use_case(provider).execute(host_id=uuid4())

    assert [item.repo_path for item in result.items] == ["g/ok"]
    assert any("g/broken" in record.message for record in caplog.records)


@pytest.mark.parametrize("scope", ["authored", "assigned", "review_requested"])
async def test__list_inbox_mrs__personal_scope__delegates_to_host_listing(scope: InboxScope) -> None:
    older = InboxMR(mr=_make_mr(iid=1, age_minutes=10), repo_path="a/b")
    newer = InboxMR(mr=_make_mr(iid=2, age_minutes=1), repo_path="c/d")
    provider = AsyncMock()
    provider.list_my_mrs.return_value = Page(items=[older, newer], page=3, per_page=5, has_more=True)

    result = await _make_use_case(provider).execute(host_id=uuid4(), scope=scope, page=3, per_page=5)

    provider.list_my_mrs.assert_awaited_once_with(scope, page=3, per_page=5)
    provider.list_repos.assert_not_called()
    assert [item.mr.iid for item in result.items] == [2, 1]
    assert (result.page, result.per_page, result.has_more) == (3, 5, True)


async def test__list_inbox_mrs__all__caps_mrs_per_repo_and_reports_truncated_repos() -> None:
    """Each repository contributes its newest few open MRs; the page says which ones had more."""
    provider = AsyncMock()
    provider.list_repos.return_value = _repos(["g/busy", "g/quiet"])

    def list_mrs(repo_path: str, state: MRStateFilter, page: int, per_page: int) -> Page[MR]:
        mrs = [_make_mr(iid=i) for i in range(per_page)]
        return Page(items=mrs, page=1, per_page=per_page, has_more=repo_path == "g/busy")

    provider.list_mrs.side_effect = list_mrs

    result = await _make_use_case(provider).execute(host_id=uuid4(), per_page=30)

    assert {call.kwargs["per_page"] for call in provider.list_mrs.await_args_list} == {INBOX_MRS_PER_REPO}
    assert result.truncated_repos == ["g/busy"]
    assert len(result.items) == 2 * INBOX_MRS_PER_REPO


async def test__list_inbox_mrs__personal_scope__reports_no_truncated_repos() -> None:
    provider = AsyncMock()
    provider.list_my_mrs.return_value = Page(items=[], page=1, per_page=30, has_more=True)

    result = await _make_use_case(provider).execute(host_id=uuid4(), scope="authored")

    assert result.truncated_repos == []
