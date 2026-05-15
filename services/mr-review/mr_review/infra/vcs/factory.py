from __future__ import annotations

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.cache import CachedVCSProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider


def create_vcs_provider(host: Host, client: httpx.AsyncClient, cached: bool = True) -> VCSProvider:
    provider: VCSProvider
    if host.type == "gitlab":
        provider = GitLabProvider(client=client, base_url=host.base_url, token=host.token)
    elif host.type == "github":
        provider = GitHubProvider(client=client, base_url=host.base_url, token=host.token)
    elif host.type in ("gitea", "forgejo"):
        provider = GiteaProvider(client=client, base_url=host.base_url, token=host.token)
    elif host.type == "bitbucket":
        provider = BitbucketProvider(client=client, base_url=host.base_url, token=host.token)
    else:
        raise ValueError(f"Unsupported host type: {host.type!r}")
    if cached:
        return CachedVCSProvider(provider)
    return provider
