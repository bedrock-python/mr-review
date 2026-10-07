"""Include/exclude glob patterns over changed-file paths."""

from __future__ import annotations

import pytest
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig
from mr_review.core.reviews.path_filter import DEFAULT_EXCLUDE_PATTERNS, NOT_INCLUDED, PathFilter

pytestmark = pytest.mark.unit


def _file(path: str) -> DiffFile:
    return DiffFile(path=path, additions=1, deletions=0, hunks=[])


@pytest.mark.parametrize(
    ("pattern", "path", "excluded"),
    [
        # no slash: the file name at any depth
        ("*.lock", "uv.lock", True),
        ("*.lock", "services/api/poetry.lock", True),
        ("*.lock", "src/lockfile.py", False),
        ("go.sum", "cmd/go.sum", True),
        ("*.min.js", "static/app.min.js", True),
        ("*.min.js", "static/app.js", False),
        # trailing slash: a directory at any depth, never a prefix of a name
        ("vendor/", "vendor/github.com/x/y.go", True),
        ("vendor/", "third/vendor/a.go", True),
        ("vendor/", "myvendor/a.go", False),
        ("vendor/", "src/vendor.go", False),
        ("/dist/", "dist/app.js", True),
        ("/dist/", "web/dist/app.js", False),
        # any other slash: the whole path from the root
        ("docs/*.md", "docs/a.md", True),
        ("docs/*.md", "docs/sub/a.md", False),
        ("docs/**/*.md", "docs/sub/deep/a.md", True),
        ("docs/**/*.md", "docs/a.md", True),
        ("/build/out.txt", "build/out.txt", True),
        ("src/gen_?.py", "src/gen_a.py", True),
        ("src/gen_[ab].py", "src/gen_b.py", True),
        ("src/gen_[!ab].py", "src/gen_b.py", False),
        ("src/gen_[!ab].py", "src/gen_c.py", True),
        # regex metacharacters are literal
        ("a+b(c).txt", "x/a+b(c).txt", True),
    ],
)
def test__exclude_pattern__matches_like_gitignore(pattern: str, path: str, excluded: bool) -> None:
    path_filter = PathFilter(exclude=[pattern])

    assert (path_filter.exclusion_reason(path) == pattern) is excluded


def test__include_patterns__other_files_left_out_with_a_reason() -> None:
    path_filter = PathFilter(include=["src/**"])

    assert path_filter.exclusion_reason("src/app/main.py") is None
    assert path_filter.exclusion_reason("README.md") == NOT_INCLUDED


def test__include_and_exclude__exclude_wins_inside_the_included_set() -> None:
    path_filter = PathFilter(include=["src/**"], exclude=["*_pb2.py"])

    assert path_filter.exclusion_reason("src/api/service_pb2.py") == "*_pb2.py"
    assert path_filter.exclusion_reason("src/api/service.py") is None


@pytest.mark.parametrize(
    "path",
    [
        "uv.lock",
        "poetry.lock",
        "Cargo.lock",
        "web/package-lock.json",
        "web/pnpm-lock.yaml",
        "go.sum",
        "static/app.min.js",
        "static/app.min.css",
        "static/app.js.map",
        "vendor/lib/x.go",
        "web/node_modules/react/index.js",
        "web/dist/bundle.js",
        "api/service_pb2.py",
        "api/service_pb2_grpc.py",
        "api/service.pb.go",
        "assets/logo.png",
        "fonts/inter.woff2",
        "docs/manual.pdf",
    ],
)
def test__default_excludes__generated_lock_and_binary_files(path: str) -> None:
    assert PathFilter.from_brief(BriefConfig()).exclusion_reason(path) is not None


@pytest.mark.parametrize("path", ["src/main.py", "web/src/App.tsx", "README.md", "Dockerfile", "go.mod", "x.svg"])
def test__default_excludes__source_files_reviewed(path: str) -> None:
    assert PathFilter.from_brief(BriefConfig()).exclusion_reason(path) is None


def test__default_excludes_off__only_the_users_patterns_apply() -> None:
    config = BriefConfig(use_default_excludes=False, exclude_paths=["*.snap"])
    path_filter = PathFilter.from_brief(config)

    assert path_filter.exclusion_reason("uv.lock") is None
    assert path_filter.exclusion_reason("tests/__snapshots__/a.snap") == "*.snap"


def test__split__keeps_order_and_reports_each_excluded_file() -> None:
    files = [_file("src/a.py"), _file("uv.lock"), _file("src/b.py"), _file("vendor/x.go")]

    kept, excluded = PathFilter.from_brief(BriefConfig()).split(files)

    assert [f.path for f in kept] == ["src/a.py", "src/b.py"]
    assert [(e.path, e.reason) for e in excluded] == [("uv.lock", "*.lock"), ("vendor/x.go", "vendor/")]


def test__blank_patterns__ignored() -> None:
    path_filter = PathFilter(include=["", "  "], exclude=["/", ""])

    assert path_filter.exclusion_reason("anything.py") is None


def test__default_patterns__all_compile() -> None:
    path_filter = PathFilter(exclude=DEFAULT_EXCLUDE_PATTERNS)

    assert path_filter.exclusion_reason("src/main.py") is None
