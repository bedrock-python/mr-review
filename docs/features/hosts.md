# VCS hosts

A **host** is one VCS instance mr-review connects to for fetching merge requests and posting
review comments. Five types are supported: GitLab, GitHub, Gitea, Forgejo and Bitbucket.

You can add as many as you need — a self-hosted GitLab, github.com and a Forgejo instance
side by side.

## Add a host

1. Open **Settings → Hosts** and click **Add host**
2. Fill in the form:

| Field | Description |
|-------|-------------|
| **Name** | A display label (e.g. "Work GitLab") |
| **Type** | `GitLab`, `GitHub`, `Gitea`, `Forgejo` or `Bitbucket` |
| **Base URL** | The instance's **web** URL — each type appends its own API path |
| **Access Token** | See the table below |
| **Timeout** | Seconds for a single call to the host (default `30`) |

3. Click **Save**

The base URL is the address you would open in a browser, not the API endpoint. Give GitLab,
Gitea or Forgejo a URL that already ends in the API path and the suffix is appended a second
time.

| Type | API base derived from the base URL | Token |
|------|------------------------------------|-------|
| GitLab | `<base_url>/api/v4` | Personal access token, `api` scope |
| GitHub | `https://github.com` or empty → `https://api.github.com`; anything else → `<base_url>/api/v3` | Classic personal access token, `repo` scope |
| Gitea, Forgejo | `<base_url>/api/v1` | Personal access token with repository read/write |
| Bitbucket | the base URL is **ignored** — always `https://api.bitbucket.org/2.0` | `username:app_password` |

## Tokens

**GitLab** — **User settings → Access tokens**, or
`https://<your-gitlab>/-/user_settings/personal_access_tokens`, scope `api`.

**GitHub** — a classic token at
[github.com/settings/tokens](https://github.com/settings/tokens) with the `repo` scope.

**Gitea / Forgejo** — **Settings → Applications → Generate new token**, at
`https://<your-instance>/user/settings/applications`.

**Bitbucket** — mr-review talks to Bitbucket **Cloud**. Create an app password at
[bitbucket.org/account/settings/app-passwords](https://bitbucket.org/account/settings/app-passwords/new)
with pull request read and write, and enter the token as `username:app_password` — the
username is your Bitbucket account name, not your email. A token without a colon is sent as
a bearer token instead, for Bitbucket OAuth.

## Repository paths

A repository is identified by `owner/repo`. Only GitLab accepts more than two segments
(`group/subgroup/project`); for the other types a deeper path is rejected before any request
is made.

The repository list comes from what the token is a member of. To reach a repository outside
that — a public one, say — paste its URL or `owner/repo` slug into **Add repository by URL**: it is
resolved against the host, checked, and pinned as a favourite so it stays in the sidebar.

## Verify a token

`GET /api/v1/hosts/{id}/test` asks the host who the token belongs to and returns the
username, name and email it authenticated as. A `401` means the host rejected the token, a
`403` that it is valid but not entitled to what was asked for.

## Remove a host

Open the host and click **Delete**. This removes the host and its token from `hosts.yaml`.
Reviews already created against it stay in the data directory; delete them from the reviews
list if you want them gone.
