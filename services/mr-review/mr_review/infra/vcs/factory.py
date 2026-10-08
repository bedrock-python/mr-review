from __future__ import annotations

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider


def build_vcs_provider(host: Host, client: httpx.AsyncClient) -> VCSProvider:
    """Build the raw (uncached) provider for ``host`` on top of the shared HTTP client."""
    token = host.token.get_secret_value()
    if host.type == "gitlab":
        return GitLabProvider(client=client, base_url=host.base_url, token=token)
    if host.type == "github":
        return GitHubProvider(client=client, base_url=host.base_url, token=token)
    if host.type in ("gitea", "forgejo"):
        return GiteaProvider(client=client, base_url=host.base_url, token=token)
    if host.type == "bitbucket":
        return BitbucketProvider(client=client, base_url=host.base_url, token=token)
    raise ValueError(f"Unsupported host type: {host.type!r}")
