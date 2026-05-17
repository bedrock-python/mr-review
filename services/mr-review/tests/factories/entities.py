"""Polyfactory factories for domain entities."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, Comment, Iteration, IterationStage, Review
from mr_review.core.reviews.sources import BranchDiffSource, MRSource, ReviewSource


def make_host(**kwargs: object) -> Host:
    """Build a Host domain entity with sensible defaults."""
    now = datetime.now(timezone.utc)
    return Host(
        id=kwargs.get("id", uuid4()),
        name=str(kwargs.get("name", "test-host")),
        type=kwargs.get("type", "gitlab"),
        base_url=str(kwargs.get("base_url", "https://gitlab.example.com")),
        token=str(kwargs.get("token", "secret-token")),
        created_at=kwargs.get("created_at", now),
    )


def make_comment(**kwargs: object) -> Comment:
    """Build a Comment domain entity with sensible defaults."""
    return Comment(
        id=kwargs.get("id", uuid4()),
        file=kwargs.get("file", "src/main.py"),
        line=kwargs.get("line", 10),
        severity=kwargs.get("severity", "minor"),
        body=str(kwargs.get("body", "Review comment body")),
        status=kwargs.get("status", "kept"),
    )


def make_iteration(**kwargs: object) -> Iteration:
    """Build an Iteration domain entity with sensible defaults."""
    now = datetime.now(timezone.utc)
    raw_comments = kwargs.get("comments", [])
    comments: list[Comment] = list(raw_comments) if isinstance(raw_comments, list) else []
    return Iteration(
        id=kwargs.get("id", uuid4()),
        number=int(str(kwargs.get("number", 1))),
        stage=kwargs.get("stage", IterationStage.dispatch),
        comments=comments,
        ai_provider_id=kwargs.get("ai_provider_id"),
        model=kwargs.get("model"),
        brief_config=kwargs.get("brief_config", BriefConfig()),
        created_at=kwargs.get("created_at", now),
        completed_at=kwargs.get("completed_at"),
    )


def make_review(**kwargs: object) -> Review:
    """Build a Review domain entity with sensible defaults.

    When no ``iterations`` are provided but a ``brief_config`` is given, a
    single default iteration carrying that config is created automatically so
    that ``review.brief_config`` (a computed field derived from the last
    iteration) reflects the supplied config.
    """
    now = datetime.now(timezone.utc)
    raw_iterations = kwargs.get("iterations")
    if raw_iterations is not None:
        iterations: list[Iteration] = list(raw_iterations) if isinstance(raw_iterations, list) else []
    else:
        brief_config = kwargs.get("brief_config", BriefConfig())
        if not isinstance(brief_config, BriefConfig):
            brief_config = BriefConfig()
        iterations = [make_iteration(brief_config=brief_config)]
    mr_iid = int(str(kwargs.get("mr_iid", 1)))
    raw_source = kwargs.get("source")
    source: ReviewSource = raw_source if isinstance(raw_source, (MRSource, BranchDiffSource)) else MRSource(mr_iid=mr_iid)
    return Review(
        id=kwargs.get("id", uuid4()),
        host_id=kwargs.get("host_id", uuid4()),
        repo_path=str(kwargs.get("repo_path", "team/service")),
        mr_iid=mr_iid,
        source=source,
        iterations=iterations,
        created_at=kwargs.get("created_at", now),
        updated_at=kwargs.get("updated_at", now),
    )


def make_branch_diff_source(**kwargs: object) -> BranchDiffSource:
    """Build a ``BranchDiffSource`` value object with sensible defaults."""
    return BranchDiffSource(
        base_ref=str(kwargs.get("base_ref", "main")),
        head_ref=str(kwargs.get("head_ref", "feature/x")),
        title=str(kwargs.get("title", "")),
    )


def make_ai_provider(**kwargs: object) -> AIProvider:
    """Build an AIProvider domain entity with sensible defaults."""
    now = datetime.now(timezone.utc)
    raw_models = kwargs.get("models", ["claude-haiku-4-5"])
    models: list[str] = list(raw_models) if isinstance(raw_models, list) else ["claude-haiku-4-5"]
    raw_max_concurrent = kwargs.get("max_concurrent")
    max_concurrent: int | None = int(str(raw_max_concurrent)) if raw_max_concurrent is not None else None
    return AIProvider(
        id=kwargs.get("id", uuid4()),
        name=str(kwargs.get("name", "test-provider")),
        type=kwargs.get("type", "claude"),
        api_key=str(kwargs.get("api_key", "sk-test")),
        base_url=str(kwargs.get("base_url", "")),
        models=models,
        ssl_verify=bool(kwargs.get("ssl_verify", True)),
        timeout=int(str(kwargs.get("timeout", 60))),
        created_at=kwargs.get("created_at", now),
        max_concurrent=max_concurrent,
    )


def make_brief_config(**kwargs: object) -> BriefConfig:
    """Build a BriefConfig with sensible defaults."""
    return BriefConfig(
        preset=kwargs.get("preset", BriefPreset.thorough),
        custom_instructions=str(kwargs.get("custom_instructions", "")),
        include_diff=bool(kwargs.get("include_diff", True)),
    )
