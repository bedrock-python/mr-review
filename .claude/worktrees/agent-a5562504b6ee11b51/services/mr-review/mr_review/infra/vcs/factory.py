from __future__ import annotations

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider


def create_vcs_provider(host: Host, client: httpx.AsyncClient) -> VCSProvider:
    if host.type == "gitlab":
        return GitLabProvider(client=client, base_url=host.base_url, token=host.token)
    return GitHubProvider(client=client, base_url=host.base_url, token=host.token)
