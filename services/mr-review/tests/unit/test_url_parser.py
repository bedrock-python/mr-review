"""Unit tests for the repo URL/path parser."""

from __future__ import annotations

import pytest
from mr_review.core.vcs.url_parser import InvalidRepoUrlError, parse_repo_url

pytestmark = pytest.mark.unit


class TestParseRepoUrl:
    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("https://github.com/torvalds/linux", "torvalds/linux"),
            ("http://github.com/torvalds/linux", "torvalds/linux"),
            ("https://github.com/torvalds/linux.git", "torvalds/linux"),
            ("https://github.com/torvalds/linux/", "torvalds/linux"),
            ("github.com/torvalds/linux", "torvalds/linux"),
            ("torvalds/linux", "torvalds/linux"),
            ("torvalds/linux.git", "torvalds/linux"),
            ("  torvalds/linux  ", "torvalds/linux"),
        ],
    )
    def test__parse_repo_url__github_inputs__returns_owner_repo(
        self, value: str, expected: str
    ) -> None:
        assert parse_repo_url(value, host_type="github") == expected

    @pytest.mark.parametrize(
        ("value", "expected"),
        [
            ("https://gitlab.com/group/project", "group/project"),
            ("https://gitlab.com/group/subgroup/project", "group/subgroup/project"),
            ("https://gitlab.com/group/subgroup/project.git", "group/subgroup/project"),
            ("group/subgroup/deep/project", "group/subgroup/deep/project"),
        ],
    )
    def test__parse_repo_url__gitlab_nested_groups__preserved(
        self, value: str, expected: str
    ) -> None:
        assert parse_repo_url(value, host_type="gitlab") == expected

    @pytest.mark.parametrize(
        ("value", "host_type"),
        [
            ("", "github"),
            ("   ", "github"),
            ("just-one-segment", "github"),
            ("https://example.com/single", "github"),
            ("a/b/c", "github"),  # nested not allowed for non-gitlab
            ("a/b/c", "gitea"),
            ("a/b/c", "bitbucket"),
        ],
    )
    def test__parse_repo_url__invalid_inputs__raises(self, value: str, host_type: str) -> None:
        with pytest.raises(InvalidRepoUrlError):
            parse_repo_url(value, host_type=host_type)
