"""Unit tests for AsyncioSemaphoreFenceRegistry (Phase 1 AI concurrency fence)."""

from __future__ import annotations

import asyncio

import pytest
from mr_review.infra.ai.fence import AsyncioSemaphoreFenceRegistry

from tests.factories.entities import make_ai_provider

pytestmark = pytest.mark.unit

_TICK = 0.05  # short sleep used to let pending tasks make progress / assert blocking


# ── construction ──────────────────────────────────────────────────────────────


def test__registry__zero_default__raises_value_error() -> None:
    """default_max_concurrent must be >= 1."""
    with pytest.raises(ValueError, match=">= 1"):
        AsyncioSemaphoreFenceRegistry(default_max_concurrent=0)


# ── concurrency-cap semantics ─────────────────────────────────────────────────


async def test__acquire__beyond_cap__blocks_until_slot_freed() -> None:
    """When N callers > max_concurrent, the (N+1)-th must block until a slot is freed."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=2)
    provider = make_ai_provider()
    third_inside = asyncio.Event()
    release = asyncio.Event()

    async def hold() -> None:
        async with registry.acquire(provider):
            await release.wait()

    async def third() -> None:
        async with registry.acquire(provider):
            third_inside.set()

    holder_1 = asyncio.create_task(hold())
    holder_2 = asyncio.create_task(hold())
    waiter = asyncio.create_task(third())

    await asyncio.sleep(_TICK)
    assert not third_inside.is_set(), "third must block — both fence slots are held"

    release.set()
    await asyncio.wait_for(third_inside.wait(), timeout=1.0)
    await asyncio.gather(holder_1, holder_2, waiter)


async def test__acquire__different_providers__do_not_block_each_other() -> None:
    """Per-provider isolation: full provider A does not delay provider B."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=1)
    provider_a = make_ai_provider(name="a")
    provider_b = make_ai_provider(name="b")
    release = asyncio.Event()
    b_inside = asyncio.Event()

    async def hold_a() -> None:
        async with registry.acquire(provider_a):
            await release.wait()

    async def take_b() -> None:
        async with registry.acquire(provider_b):
            b_inside.set()

    holder_a = asyncio.create_task(hold_a())
    waiter_b = asyncio.create_task(take_b())

    await asyncio.wait_for(b_inside.wait(), timeout=1.0)

    release.set()
    await asyncio.gather(holder_a, waiter_b)


# ── per-provider override ─────────────────────────────────────────────────────


async def test__acquire__per_provider_override__caps_below_default() -> None:
    """AIProvider.max_concurrent overrides the registry default."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=10)
    provider = make_ai_provider(max_concurrent=1)
    release = asyncio.Event()
    second_inside = asyncio.Event()

    async def hold() -> None:
        async with registry.acquire(provider):
            await release.wait()

    async def second() -> None:
        async with registry.acquire(provider):
            second_inside.set()

    holder = asyncio.create_task(hold())
    waiter = asyncio.create_task(second())

    await asyncio.sleep(_TICK)
    assert not second_inside.is_set(), "per-provider cap=1 must override default=10"

    release.set()
    await asyncio.wait_for(second_inside.wait(), timeout=1.0)
    await asyncio.gather(holder, waiter)


# ── release semantics ─────────────────────────────────────────────────────────


async def test__acquire__exception_inside_block__releases_slot() -> None:
    """An exception inside the fenced block must still free the slot."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=1)
    provider = make_ai_provider()

    with pytest.raises(RuntimeError, match="boom"):
        async with registry.acquire(provider):
            raise RuntimeError("boom")

    # If the slot leaked, this would hang past the timeout.
    follow_up_inside = asyncio.Event()

    async def follow_up() -> None:
        async with registry.acquire(provider):
            follow_up_inside.set()

    await asyncio.wait_for(follow_up(), timeout=1.0)
    assert follow_up_inside.is_set()


async def test__acquire__cancelled_while_waiting__does_not_leak_slot() -> None:
    """If a waiter is cancelled before entering the fence, the slot is not leaked."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=1)
    provider = make_ai_provider()
    release = asyncio.Event()

    async def hold() -> None:
        async with registry.acquire(provider):
            await release.wait()

    async def waiter() -> None:
        async with registry.acquire(provider):
            pass

    holder = asyncio.create_task(hold())
    cancelled = asyncio.create_task(waiter())
    await asyncio.sleep(_TICK)

    cancelled.cancel()
    with pytest.raises(asyncio.CancelledError, match=""):
        await cancelled

    release.set()
    await holder

    follow_up_inside = asyncio.Event()

    async def follow_up() -> None:
        async with registry.acquire(provider):
            follow_up_inside.set()

    await asyncio.wait_for(follow_up(), timeout=1.0)
    assert follow_up_inside.is_set()


# ── caching ───────────────────────────────────────────────────────────────────


async def test__acquire__same_provider_id_twice__reuses_semaphore() -> None:
    """A second acquire for the same provider id must reuse the existing semaphore."""
    registry = AsyncioSemaphoreFenceRegistry(default_max_concurrent=1)
    provider_first = make_ai_provider(max_concurrent=1)
    # same id, different in-memory entity (simulates a fresh load from the file repo)
    provider_second = provider_first.model_copy(update={"name": "renamed"})

    release = asyncio.Event()
    second_inside = asyncio.Event()

    async def hold() -> None:
        async with registry.acquire(provider_first):
            await release.wait()

    async def take_second() -> None:
        async with registry.acquire(provider_second):
            second_inside.set()

    holder = asyncio.create_task(hold())
    waiter = asyncio.create_task(take_second())

    await asyncio.sleep(_TICK)
    assert not second_inside.is_set(), "same provider.id must share the same semaphore (cap=1)"

    release.set()
    await asyncio.wait_for(second_inside.wait(), timeout=1.0)
    await asyncio.gather(holder, waiter)
