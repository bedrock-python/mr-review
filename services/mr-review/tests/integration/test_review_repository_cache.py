"""The review store's parse cache and its (host, repository, MR) index."""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.infra.repositories import review_cache
from mr_review.infra.repositories.review import FileReviewRepository

from tests.factories.entities import make_comment, make_iteration, make_review
from tests.fakes import save_review

pytestmark = pytest.mark.integration


def _forbid_yaml_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    def _no_parsing(*args: object, **kwargs: object) -> object:
        raise AssertionError("an unchanged review file was parsed again")

    monkeypatch.setattr(yaml, "load", _no_parsing)
    monkeypatch.setattr(yaml, "safe_load", _no_parsing)


async def _seed(repo: FileReviewRepository, count: int) -> list[str]:
    host_id = uuid4()
    paths = []
    for n in range(count):
        review = await repo.create(host_id=host_id, repo_path="g/p", mr_iid=n + 1)
        iteration = make_iteration(comments=[make_comment(body="b" * 200) for _ in range(5)])
        await save_review(repo, review.model_copy(update={"iterations": [iteration]}))
        paths.append(str(review.id))
    return paths


async def test__list_all__files_unchanged__are_not_parsed_again(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _seed(FileReviewRepository(data_dir), 12)
    repo = FileReviewRepository(data_dir)  # a fresh process: nothing cached yet
    first = await repo.list_all()
    _forbid_yaml_parsing(monkeypatch)

    second = await repo.list_all()

    assert [r.id for r in second] == [r.id for r in first]
    assert second == first


async def test__get_by_mr__after_warm_up__answers_from_the_index(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    writer = FileReviewRepository(data_dir)
    host_id = uuid4()
    for n in range(10):
        await writer.create(host_id=host_id, repo_path="g/p", mr_iid=n)
    target = await writer.create(host_id=host_id, repo_path="g/p", mr_iid=42)
    repo = FileReviewRepository(data_dir)
    await repo.list_all()
    _forbid_yaml_parsing(monkeypatch)

    found = await repo.get_by_mr(host_id, "g/p", 42)

    assert found is not None
    assert found.id == target.id
    assert await repo.get_by_mr(host_id, "g/p", 999) is None


async def test__get_by_mr__review_created_by_another_process__is_found(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    host_id = uuid4()
    assert await repo.get_by_mr(host_id, "g/p", 1) is None  # builds the index

    created = await FileReviewRepository(data_dir).create(host_id=host_id, repo_path="g/p", mr_iid=1)

    found = await repo.get_by_mr(host_id, "g/p", 1)
    assert found is not None
    assert found.id == created.id


async def test__get_by_mr__review_deleted_by_another_process__is_gone(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    review = await repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    assert await repo.get_by_mr(review.host_id, "g/p", 1) is not None

    (data_dir / "reviews" / f"{review.id}.yaml").unlink()

    assert await repo.get_by_mr(review.host_id, "g/p", 1) is None
    assert await repo.list_all() == []


async def test__get_by_id__file_rewritten_by_another_process__returns_the_new_content(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    review = await repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    assert await repo.get_by_id(review.id) is not None

    other = FileReviewRepository(data_dir)
    await save_review(other, review.model_copy(update={"iterations": [make_iteration(comments=[make_comment()])]}))

    fresh = await repo.get_by_id(review.id)
    assert fresh is not None
    assert len(fresh.iterations) == 1
    listed = await repo.list_all()
    assert len(listed[0].iterations) == 1


async def test__get_by_mr__duplicates_from_older_versions__returns_the_latest(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    host_id = uuid4()
    now = datetime.now(timezone.utc)
    older = make_review(host_id=host_id, repo_path="g/p", mr_iid=3, updated_at=now - timedelta(days=1))
    newer = make_review(host_id=host_id, repo_path="g/p", mr_iid=3, updated_at=now)
    for review in (newer, older):
        await repo.upsert_with(review.id, lambda current, review=review: review)

    found = await FileReviewRepository(data_dir).get_by_mr(host_id, "g/p", 3)

    assert found is not None
    assert found.id == newer.id


async def test__get_by_mr__branch_diff_review__is_not_an_mr_match(review_repo: FileReviewRepository) -> None:
    host_id = uuid4()
    await review_repo.create_from_source(
        host_id=host_id, repo_path="g/p", source=BranchDiffSource(base_ref="main", head_ref="x")
    )

    assert await review_repo.get_by_mr(host_id, "g/p", 0) is None


async def test__list_all__returns_the_newest_fifty__uncapped_returns_all(review_repo: FileReviewRepository) -> None:
    await _seed(review_repo, 55)

    capped = await review_repo.list_all()
    everything = await review_repo.list_all_uncapped()

    assert len(capped) == 50
    assert len(everything) == 55
    assert [r.id for r in capped] == [r.id for r in everything[:50]]
    assert all(a.updated_at >= b.updated_at for a, b in zip(everything, everything[1:], strict=False))


async def test__returned_reviews__are_independent_of_the_cache(review_repo: FileReviewRepository) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    await save_review(
        review_repo, review.model_copy(update={"iterations": [make_iteration(comments=[make_comment()])]})
    )

    fetched = await review_repo.get_by_id(review.id)
    assert fetched is not None
    fetched.iterations[0].comments.clear()
    fetched.iterations.append(make_iteration())

    again = await review_repo.get_by_id(review.id)
    assert again is not None
    assert len(again.iterations) == 1
    assert len(again.iterations[0].comments) == 1


async def test__corrupt_review_file__is_skipped_by_listings(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    good = await repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    (data_dir / "reviews" / f"{uuid4()}.yaml").write_text("id: [unterminated\n")

    listed = await repo.list_all()

    assert [r.id for r in listed] == [good.id]
    assert await repo.get_by_mr(good.host_id, "g/p", 1) is not None


async def test__review_file_corrupted_after_caching__is_dropped(data_dir: Path) -> None:
    repo = FileReviewRepository(data_dir)
    review = await repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    assert len(await repo.list_all()) == 1

    (data_dir / "reviews" / f"{review.id}.yaml").write_text("id: [unterminated\n")

    assert await repo.list_all() == []
    assert await repo.get_by_mr(review.host_id, "g/p", 1) is None


async def test__read_overtaken_by_writes__never_puts_old_content_back_in_the_cache(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A read that parsed an old version must not land in the cache after newer writes.

    Stat signatures are forced equal: the worst case of a filesystem that reuses the freed
    inode for the next file and has a coarse clock (ext4, NFS, SMB, FAT).
    """
    monkeypatch.setattr(review_cache, "_signature", lambda st: (0, 0, 0, 0, 0))
    review = make_review(repo_path="aaa", iterations=[])
    await FileReviewRepository(data_dir).upsert_with(review.id, lambda _current: review)
    repo = FileReviewRepository(data_dir)  # a fresh process: nothing cached yet
    real_load = review_cache.load_yaml
    reader_ids: list[int] = []
    parsing, release = threading.Event(), threading.Event()

    def pausing_load(content: str | bytes) -> object:
        if threading.get_ident() in reader_ids:
            parsing.set()
            release.wait(5)
        return real_load(content)

    def read_old_version() -> None:
        reader_ids.append(threading.get_ident())
        repo._read_review(review.id)

    monkeypatch.setattr(review_cache, "load_yaml", pausing_load)
    reader = threading.Thread(target=read_old_version)
    reader.start()
    assert parsing.wait(5)
    await repo.update_with(review.id, lambda r: r.model_copy(update={"repo_path": "bbb"}))
    await repo.update_with(review.id, lambda r: r.model_copy(update={"repo_path": "ccc"}))
    release.set()
    reader.join(5)

    fetched = await repo.get_by_id(review.id)
    await repo.update_with(review.id, lambda r: r.model_copy(update={"iterations": [make_iteration()]}))
    stored = await FileReviewRepository(data_dir).get_by_id(review.id)

    assert fetched is not None
    assert fetched.repo_path == "ccc"
    assert stored is not None
    assert (stored.repo_path, len(stored.iterations)) == ("ccc", 1)


async def test__parsed_reviews__are_bounded_in_memory__metadata_covers_every_review(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    limit = 20_000
    monkeypatch.setattr(review_cache, "PARSED_CACHE_MAX_BYTES", limit)
    writer = FileReviewRepository(data_dir)
    await _seed(writer, 30)
    repo = FileReviewRepository(data_dir)

    everything = await repo.list_all_uncapped()
    page = await repo.list_all()
    found = await repo.get_by_mr(everything[-1].host_id, "g/p", everything[-1].mr_iid)

    assert len(everything) == 30
    assert [r.id for r in page] == [r.id for r in everything]
    assert found == everything[-1]
    cache = repo._files
    assert len(cache._meta) == 30
    assert 0 < len(cache._parsed) < 30
    assert cache._parsed_bytes <= limit
    assert cache._parsed_bytes == sum(entry.size for entry in cache._parsed.values())
