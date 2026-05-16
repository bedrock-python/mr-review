from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
from mr_review.core.mrs.entities import MR, Repo
from mr_review.infra.vcs.cache import VCSCache
from mr_review.use_cases.mrs.list_inbox_mrs import INBOX_REPO_LIMIT, InboxMR, ListInboxMRsUseCase

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit

_NOW = datetime.now(timezone.utc)


def _make_mr(iid: int = 1) -> MR:
    return MR(
        iid=iid,
        title=f"MR {iid}",
        description="",
        author="dev",
        source_branch="feature",
        target_branch="main",
        status="opened",
        draft=False,
        additions=1,
        deletions=0,
        file_count=1,
        created_at=_NOW,
        updated_at=_NOW,
    )


def _make_repo(path: str = "group/repo") -> Repo:
    return Repo(id="1", path=path, name=path)


def _make_use_case(host_repo: AsyncMock, provider: AsyncMock) -> ListInboxMRsUseCase:
    vcs_cache = MagicMock(spec=VCSCache)
    vcs_cache.get_or_create.return_value = provider
    vcs_client = MagicMock(spec=httpx.AsyncClient)
    return ListInboxMRsUseCase(host_repo=host_repo, vcs_cache=vcs_cache, vcs_client=vcs_client)


async def test__list_inbox_mrs__host_not_found__raises_value_error() -> None:
    """ValueError is raised immediately when the host does not exist."""
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    use_case = _make_use_case(host_repo, AsyncMock())
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(missing_id)


async def test__list_inbox_mrs__no_repos__returns_empty_list() -> None:
    """Returns empty list when the host has no repos."""
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = make_host()

    provider = AsyncMock()
    provider.list_repos.return_value = []
    use_case = _make_use_case(host_repo, provider)
    result = await use_case.execute(host_id=make_host().id)

    assert result == []


async def test__list_inbox_mrs__repos_with_mrs__returns_all_inbox_mrs() -> None:
    """Returns one InboxMR per open MR found across all repos."""
    host = make_host()
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    repo1 = _make_repo("group/repo1")
    repo2 = _make_repo("group/repo2")
    mr1 = _make_mr(iid=1)
    mr2 = _make_mr(iid=2)

    provider = AsyncMock()
    provider.list_repos.return_value = [repo1, repo2]
    provider.list_mrs.side_effect = lambda repo_path, state: [mr1] if repo_path == repo1.path else [mr2]
    use_case = _make_use_case(host_repo, provider)
    result = await use_case.execute(host_id=host.id)

    assert len(result) == 2
    paths = {item.repo_path for item in result}
    assert paths == {repo1.path, repo2.path}
    assert all(isinstance(item, InboxMR) for item in result)


async def test__list_inbox_mrs__fetch_fails_for_repo__returns_empty_for_that_repo() -> None:
    """Exceptions in fetch_mrs for one repo are swallowed; other repos succeed."""
    host = make_host()
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    repo1 = _make_repo("group/ok")
    repo2 = _make_repo("group/broken")
    mr_ok = _make_mr(iid=1)

    def _list_mrs_side_effect(repo_path: str, state: str) -> list[MR]:
        if repo_path == repo2.path:
            raise ConnectionError("network down")
        return [mr_ok]

    provider = AsyncMock()
    provider.list_repos.return_value = [repo1, repo2]
    provider.list_mrs.side_effect = _list_mrs_side_effect
    use_case = _make_use_case(host_repo, provider)
    result = await use_case.execute(host_id=host.id)

    assert len(result) == 1
    assert result[0].repo_path == repo1.path


async def test__list_inbox_mrs__fetch_fails_for_repo__logs_warning(caplog: pytest.LogCaptureFixture) -> None:
    """A warning is logged when fetch_mrs raises an exception."""
    import logging

    host = make_host()
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    repo = _make_repo("group/broken")

    provider = AsyncMock()
    provider.list_repos.return_value = [repo]
    provider.list_mrs.side_effect = RuntimeError("boom")
    use_case = _make_use_case(host_repo, provider)

    with caplog.at_level(logging.WARNING, logger="mr_review.use_cases.mrs.list_inbox_mrs"):
        await use_case.execute(host_id=host.id)

    assert any("group/broken" in record.message for record in caplog.records)


async def test__list_inbox_mrs__more_repos_than_limit__only_queries_top_repos() -> None:
    """At most INBOX_REPO_LIMIT repos are queried for MRs."""
    host = make_host()
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    repos = [_make_repo(f"group/repo{i}") for i in range(INBOX_REPO_LIMIT + 5)]

    provider = AsyncMock()
    provider.list_repos.return_value = repos
    provider.list_mrs.return_value = []
    use_case = _make_use_case(host_repo, provider)
    await use_case.execute(host_id=host.id)

    assert provider.list_mrs.await_count == INBOX_REPO_LIMIT


async def test__list_inbox_mrs__inbox_mr_is_pydantic_model() -> None:
    """InboxMR is a Pydantic BaseModel with mr and repo_path fields."""
    mr = _make_mr()
    repo = _make_repo()
    item = InboxMR(mr=mr, repo_path=repo.path)

    assert item.mr == mr
    assert item.repo_path == repo.path
