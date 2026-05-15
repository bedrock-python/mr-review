"""Polyfactory factories for domain entities."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, Comment, Review, ReviewStage


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


def make_review(**kwargs: object) -> Review:
    """Build a Review domain entity with sensible defaults."""
    now = datetime.now(timezone.utc)
    raw_comments = kwargs.get("comments", [])
    comments: list[Comment] = list(raw_comments) if isinstance(raw_comments, list) else []
    return Review(
        id=kwargs.get("id", uuid4()),
        host_id=kwargs.get("host_id", uuid4()),
        repo_path=str(kwargs.get("repo_path", "team/service")),
        mr_iid=int(str(kwargs.get("mr_iid", 1))),
        stage=kwargs.get("stage", ReviewStage.pick),
        comments=comments,
        brief_config=kwargs.get("brief_config", BriefConfig()),
        created_at=kwargs.get("created_at", now),
        updated_at=kwargs.get("updated_at", now),
    )


def make_ai_provider(**kwargs: object) -> AIProvider:
    """Build an AIProvider domain entity with sensible defaults."""
    now = datetime.now(timezone.utc)
    raw_models = kwargs.get("models", ["claude-haiku-4-5"])
    models: list[str] = list(raw_models) if isinstance(raw_models, list) else ["claude-haiku-4-5"]
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
    )


def make_brief_config(**kwargs: object) -> BriefConfig:
    """Build a BriefConfig with sensible defaults."""
    return BriefConfig(
        preset=kwargs.get("preset", BriefPreset.thorough),
        custom_instructions=str(kwargs.get("custom_instructions", "")),
        include_diff=bool(kwargs.get("include_diff", True)),
    )
