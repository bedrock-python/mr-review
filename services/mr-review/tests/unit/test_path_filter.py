"""Include/exclude glob patterns over changed-file paths."""

from __future__ import annotations

import pytest
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig
from mr_review.core.reviews.path_filter import DEFAULT_EXCLUDE_PATTERNS, NOT_INCLUDED, PathFilter

pytestmark = pytest.mark.unit


def _file(path: str) -> DiffFile:
    return DiffFile(path=path, additions=1, deletions=0, hunks=[])


# What real git answers for each .gitignore (git 2.54, core.ignorecase=false, files created in a
# scratch repository, ignored ones listed by `git ls-files --others --ignored --exclude-standard`).
# The two places this filter departs from git on purpose are tested separately below.
GIT_IGNORES: list[tuple[list[str], str, bool]] = [
    (["docs"], "docs/a.md", True),
    (["docs"], "x/docs/b.md", True),
    (["docs"], "docsx/c.md", False),
    (["docs"], "src/docs.py", False),
    (["/docs"], "docs/a.md", True),
    (["/docs"], "x/docs/b.md", False),
    (["docs/"], "docs/a.md", True),
    (["docs/"], "x/docs/b.md", True),
    (["docs/"], "src/docs", False),
    (["docs/**"], "docs/a.md", True),
    (["docs/**"], "docs/x/y.md", True),
    (["docs/**"], "x/docs/a.md", False),
    (["migrations"], "app/migrations/0001_initial.py", True),
    (["migrations"], "migrations.py", False),
    (["src/generated/"], "src/generated/a.py", True),
    (["src/generated/"], "tools/src/generated/b.py", False),
    (["src/generated"], "src/generated/a.py", True),
    (["src/generated"], "tools/src/generated/b.py", False),
    (["src/generated"], "src/generated.py", False),
    (["*.PNG"], "docs/shot.png", False),
    (["*.PNG"], "img/shot.PNG", True),
    (["**/test_*.py"], "test_a.py", True),
    (["**/test_*.py"], "a/b/test_c.py", True),
    (["**/test_*.py"], "a/test_c.txt", False),
    (["a/**/b"], "a/b", True),
    (["a/**/b"], "a/x/b", True),
    (["a/**/b"], "a/x/y/b", True),
    (["a/**/b"], "c/a/b", False),
    (["*.lock"], "uv.lock", True),
    (["*.lock"], "web/yarn.lock", True),
    (["*.lock"], "lock", False),
    (["*.py"], "src/A.PY", False),
    (["*.py"], "lib/b.py", True),
    (["a[!b]c"], "a/c", False),
    (["a[!b]c"], "axc", True),
    (["a[!b]c"], "abc", False),
    (["a?c"], "a/c", False),
    (["a?c"], "abc", True),
    (["*.lock", "!uv.lock"], "uv.lock", False),
    (["*.lock", "!uv.lock"], "a/poetry.lock", True),
    (["!*.lock", "uv.lock"], "uv.lock", True),
    (["!*.lock", "uv.lock"], "a/poetry.lock", False),
    (["build/", "!build/"], "build/out.js", False),
    (["\\#notes.md"], "#notes.md", True),
    (["#comment"], "#comment", False),
    (["app/\\[slug\\]/page.tsx"], "app/[slug]/page.tsx", True),
    (["app/\\[slug\\]/page.tsx"], "app/s/page.tsx", False),
    (["trailing.txt   "], "trailing.txt", True),
    (["*.min.js"], "static/app.min.js", True),
    (["*.min.js"], "static/app.js", False),
    (["foo/*"], "foo/a.txt", True),
    (["foo/*"], "foo/b/c.txt", True),
    (["foo/*"], "x/foo/a.txt", False),
    (["**/foo"], "foo/a.txt", True),
    (["**/foo"], "x/foo", True),
    (["**/foo"], "x/y/foo/z.txt", True),
]


@pytest.mark.parametrize(("patterns", "path", "ignored"), GIT_IGNORES)
def test__exclude_patterns__match_what_git_ignores(patterns: list[str], path: str, ignored: bool) -> None:
    assert (PathFilter(exclude=patterns).exclusion_reason(path) is not None) is ignored


@pytest.mark.parametrize(
    ("include", "path"),
    [(["src"], "src/a.py"), (["services/api"], "services/api/main.py"), (["src/"], "src/x/y.py")],
)
def test__include_directory_pattern__keeps_everything_below_it(include: list[str], path: str) -> None:
    assert PathFilter(include=include).exclusion_reason(path) is None


def test__include_patterns__negation_carves_out_part_of_an_included_directory() -> None:
    path_filter = PathFilter(include=["src/", "!src/legacy/"])

    assert path_filter.exclusion_reason("src/app.py") is None
    assert path_filter.exclusion_reason("src/legacy/old.py") == NOT_INCLUDED


def test__leading_dot_slash__means_the_repository_root() -> None:
    """Unlike git, which matches nothing for ``./legacy/``."""
    path_filter = PathFilter(exclude=["./legacy/"])

    assert path_filter.exclusion_reason("legacy/a.py") == "./legacy/"
    assert path_filter.exclusion_reason("x/legacy/a.py") is None


def test__negation__takes_a_file_back_in_from_an_excluded_directory() -> None:
    """Unlike git, which cannot re-include a file whose directory is excluded."""
    path_filter = PathFilter(exclude=["vendor/", "!/vendor/keep.go"])

    assert path_filter.exclusion_reason("vendor/keep.go") is None
    assert path_filter.exclusion_reason("vendor/other.go") == "vendor/"


def test__escaped_path__review_anyway_for_a_name_with_glob_characters() -> None:
    path_filter = PathFilter(exclude=["*.tsx", "!/app/\\[slug\\]/page.tsx"])

    assert path_filter.exclusion_reason("app/[slug]/page.tsx") is None
    assert path_filter.exclusion_reason("app/s/page.tsx") == "*.tsx"


@pytest.mark.parametrize("path", ["docs/Screenshot.PNG", "IMG_1.JPG", "Fonts/X.WOFF2", "web/App.MIN.JS"])
def test__default_excludes__ignore_case(path: str) -> None:
    assert PathFilter.from_brief(BriefConfig()).exclusion_reason(path) is not None


def test__user_patterns__case_sensitive_like_git() -> None:
    path_filter = PathFilter.from_brief(BriefConfig(exclude_paths=["*.snap"], use_default_excludes=False))

    assert path_filter.exclusion_reason("a/b.SNAP") is None
    assert path_filter.exclusion_reason("a/b.snap") == "*.snap"


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


def test__negated_exclude__one_default_overridden_the_rest_still_apply() -> None:
    path_filter = PathFilter.from_brief(BriefConfig(exclude_paths=["!/go.sum"]))

    assert path_filter.exclusion_reason("go.sum") is None
    assert path_filter.exclusion_reason("tools/go.sum") == "go.sum"
    assert path_filter.exclusion_reason("uv.lock") == "*.lock"


def test__negated_exclude__last_matching_pattern_decides() -> None:
    path_filter = PathFilter(exclude=["docs/", "!docs/api/", "docs/api/internal/"])

    assert path_filter.exclusion_reason("docs/guide.md") == "docs/"
    assert path_filter.exclusion_reason("docs/api/users.md") is None
    assert path_filter.exclusion_reason("docs/api/internal/x.md") == "docs/api/internal/"


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
