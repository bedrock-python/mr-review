"""Unit tests for the YAML file-store primitives shared by the repositories."""

from __future__ import annotations

import asyncio
import os
import stat
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
import yaml
from mr_review.infra.repositories import file_store
from mr_review.infra.repositories.file_store import (
    KeyedLock,
    dump_yaml,
    ensure_private_dir,
    load_yaml,
    restrict_file_permissions,
    write_file_atomically,
)

pytestmark = pytest.mark.unit

posix_only = pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits")


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _write_repeatedly(target: Path, content: str, times: int) -> None:
    for _ in range(times):
        write_file_atomically(target, content)


@pytest.mark.skipif(not yaml.__with_libyaml__, reason="PyYAML built without libyaml")
def test__yaml_codec__libyaml_available__uses_the_c_loader_and_dumper() -> None:
    assert file_store._YAML_LOADER is yaml.CSafeLoader
    assert file_store._YAML_DUMPER is yaml.CSafeDumper


def test__yaml_codec__round_trip__keeps_unicode_order_and_timestamp_strings() -> None:
    data = {"z": "ключ", "a": "2026-10-07T12:00:00+00:00", "list": [1, None, True]}

    text = dump_yaml(data)

    assert list(load_yaml(text)) == ["z", "a", "list"]  # type: ignore[arg-type]
    assert load_yaml(text) == data
    assert "ключ" in text


def test__yaml_codec__unsafe_tag__is_refused() -> None:
    with pytest.raises(yaml.YAMLError):
        load_yaml("!!python/object/apply:os.system ['true']")


def test__write_file_atomically__concurrent_writers__never_leave_a_torn_or_missing_file(tmp_path: Path) -> None:
    """Many threads replacing one file: every read sees one complete version, no write fails."""
    target = tmp_path / "store.yaml"
    variants = [dump_yaml({"writer": i, "payload": ["x" * 500] * 200}) for i in range(6)]
    write_file_atomically(target, variants[0])
    stop = threading.Event()
    torn_reads: list[str] = []

    def read_until_stopped() -> None:
        while not stop.is_set():
            content = target.read_text(encoding="utf-8")
            if content not in variants:
                torn_reads.append(content)

    with ThreadPoolExecutor(max_workers=len(variants) + 1) as pool:
        reader = pool.submit(read_until_stopped)
        writers = [pool.submit(_write_repeatedly, target, content, 40) for content in variants]
        for writer in writers:
            writer.result()  # re-raises a failed write
        stop.set()
        reader.result()

    assert torn_reads == []
    assert target.read_text(encoding="utf-8") in variants
    assert [p.name for p in tmp_path.iterdir()] == ["store.yaml"]  # no temporary files left behind


@posix_only
def test__write_file_atomically__new_file__is_owner_only(tmp_path: Path) -> None:
    target = tmp_path / "secrets.yaml"

    write_file_atomically(target, "token: x\n")

    assert _mode(target) == 0o600


@posix_only
def test__write_file_atomically__missing_directory__is_created_owner_only(tmp_path: Path) -> None:
    target = tmp_path / "data" / "hosts.yaml"

    write_file_atomically(target, "[]\n")

    assert _mode(tmp_path / "data") == 0o700


def test__write_file_atomically__write_fails__keeps_old_content_and_cleans_up(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "store.yaml"
    write_file_atomically(target, "old\n")

    def failing_fsync(fd: int) -> None:
        raise OSError("disk full")

    monkeypatch.setattr(file_store.os, "fsync", failing_fsync)

    with pytest.raises(OSError, match="disk full"):
        write_file_atomically(target, "new\n")

    assert target.read_text(encoding="utf-8") == "old\n"
    assert [p.name for p in tmp_path.iterdir()] == ["store.yaml"]


@posix_only
def test__ensure_private_dir__existing_directory__is_left_alone(tmp_path: Path) -> None:
    existing = tmp_path / "shared"
    existing.mkdir()
    existing.chmod(0o755)

    ensure_private_dir(existing)

    assert _mode(existing) == 0o755


@posix_only
def test__restrict_file_permissions__group_readable_file__becomes_owner_only(tmp_path: Path) -> None:
    target = tmp_path / "hosts.yaml"
    target.write_text("[]\n")
    target.chmod(0o644)

    restrict_file_permissions(target)

    assert _mode(target) == 0o600


def test__restrict_file_permissions__missing_file__does_nothing(tmp_path: Path) -> None:
    restrict_file_permissions(tmp_path / "absent.yaml")

    assert not (tmp_path / "absent.yaml").exists()


async def test__keyed_lock__same_key__runs_one_at_a_time() -> None:
    lock: KeyedLock[str] = KeyedLock()
    active = 0
    peak = 0

    async def operation() -> None:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.001)
        active -= 1

    await asyncio.gather(*(lock.run("k", operation) for _ in range(10)))

    assert peak == 1
    assert lock._locks == {}  # released locks are dropped


async def test__keyed_lock__different_keys__run_concurrently() -> None:
    lock: KeyedLock[int] = KeyedLock()
    both_started = asyncio.Event()
    started: set[int] = set()

    async def operation(key: int) -> None:
        started.add(key)
        if len(started) == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)

    await asyncio.gather(lock.run(1, lambda: operation(1)), lock.run(2, lambda: operation(2)))

    assert started == {1, 2}


async def test__keyed_lock__caller_cancelled__operation_finishes_before_the_next_one_starts() -> None:
    """A cancelled request does not abandon a write half-way, nor let the next writer overtake it."""
    lock: KeyedLock[str] = KeyedLock()
    release = asyncio.Event()
    order: list[str] = []

    async def slow_write() -> None:
        order.append("first:start")
        await release.wait()
        order.append("first:end")

    async def next_write() -> None:
        order.append("second")

    first = asyncio.create_task(lock.run("k", slow_write))
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    second = asyncio.create_task(lock.run("k", next_write))
    await asyncio.sleep(0.01)
    assert order == ["first:start"]  # the second write waits for the first

    release.set()
    await second

    assert order == ["first:start", "first:end", "second"]
