"""GitHub base URL → REST API base URL."""

from __future__ import annotations

import pytest
from mr_review.infra.vcs.github import _resolve_api_base_url

pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    "base_url",
    [
        "",
        "   ",
        "https://github.com",
        "https://github.com/",
        "https://GitHub.com/my-org",
        "http://github.com",
        "github.com",
        "https://www.github.com",
        "https://www.github.com/",
        "https://api.github.com",
        "https://api.github.com/",
        "api.github.com",
    ],
)
def test__resolve_api_base_url__public_github__uses_public_api(base_url: str) -> None:
    assert _resolve_api_base_url(base_url) == "https://api.github.com"


@pytest.mark.parametrize(
    ("base_url", "expected"),
    [
        ("https://ghe.example.com", "https://ghe.example.com/api/v3"),
        ("https://ghe.example.com/", "https://ghe.example.com/api/v3"),
        ("https://ghe.example.com/api/v3", "https://ghe.example.com/api/v3"),
        ("https://ghe.example.com/api/v3/", "https://ghe.example.com/api/v3"),
        ("ghe.example.com", "https://ghe.example.com/api/v3"),
        ("https://github.example.com", "https://github.example.com/api/v3"),
    ],
)
def test__resolve_api_base_url__enterprise__appends_api_v3_once(base_url: str, expected: str) -> None:
    assert _resolve_api_base_url(base_url) == expected
