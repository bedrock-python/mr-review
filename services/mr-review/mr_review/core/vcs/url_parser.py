from __future__ import annotations

from urllib.parse import urlparse

_HOST_TYPES_WITH_NESTED_PATHS = {"gitlab"}


class InvalidRepoUrlError(ValueError):
    """Raised when a repo URL or path cannot be parsed into a repo path."""


def parse_repo_url(value: str, host_type: str) -> str:
    """Normalize a user-supplied repo URL or path to a canonical ``repo_path``.

    Accepts a full URL (``https://gitlab.com/group/project``), a path-with-host
    (``gitlab.com/group/project``) or a plain ``owner/repo`` slug. Strips a
    trailing ``.git`` suffix when present. For host types that do not support
    nested groups (GitHub, Gitea, Bitbucket) the result is restricted to
    exactly two segments; GitLab additionally supports nested groups such as
    ``group/subgroup/project``.
    """
    if value is None:
        raise InvalidRepoUrlError("Repo URL must be a non-empty string")

    text = value.strip()
    if not text:
        raise InvalidRepoUrlError("Repo URL must be a non-empty string")

    path = _extract_path(text)
    if not path:
        raise InvalidRepoUrlError(f"Could not extract a repository path from {value!r}")

    path = _strip_git_suffix(path)
    segments = [s for s in path.split("/") if s]
    _validate_segments(segments, value, host_type)
    return "/".join(segments)


def _extract_path(text: str) -> str:
    if "://" in text:
        parsed = urlparse(text)
        return parsed.path.strip("/")

    # Bare ``host.tld/owner/repo`` strings (no scheme): parse with a synthetic
    # scheme so urlparse splits host vs path cleanly.
    if "/" in text and "." in text.split("/", 1)[0]:
        parsed = urlparse(f"//{text}", scheme="https")
        return parsed.path.strip("/")

    return text.strip("/")


def _strip_git_suffix(path: str) -> str:
    if path.endswith(".git"):
        return path[: -len(".git")]
    return path


def _validate_segments(segments: list[str], original: str, host_type: str) -> None:
    if len(segments) < 2:
        raise InvalidRepoUrlError(
            f"Repo path must include at least 'owner/repo', got {original!r}"
        )
    if host_type not in _HOST_TYPES_WITH_NESTED_PATHS and len(segments) > 2:
        raise InvalidRepoUrlError(
            f"Host type {host_type!r} does not support nested groups; got {original!r}"
        )
