# VCS hosts

A **host** is one VCS instance mr-review connects to for fetching merge requests and posting
review comments. Five types are supported: GitLab, GitHub, Gitea, Forgejo and Bitbucket.

You can add as many as you need — a self-hosted GitLab, github.com and a Forgejo instance
side by side.

## Add a host

1. Open **Settings → Git hosts** and click **Add host**
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
| GitHub | `github.com`, `www.github.com`, `api.github.com` (any path) or empty → `https://api.github.com`; anything else → `<base_url>/api/v3` | Classic personal access token, `repo` scope |
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

The repository list comes from what the token is a member of, most recently active first, and
is loaded a page at a time as you scroll. To reach a repository outside that — a public one, say —
paste its URL or `owner/repo` slug into **Add repository by URL**: it is resolved against the host,
checked, and pinned as a favourite so it stays at the top of the list.

## Merge request lists and the inbox

Merge request lists also load a page at a time, most recently updated first, and can be filtered
by state (open, merged, closed or all) and searched by title. Each page is a single request to the
host, so a repository with years of history opens as fast as a new one.

What each host type offers:

* **GitLab** — states and title search are answered by GitLab itself. List entries carry no file
  count or pipeline status; opening the merge request shows them. GitLab reports no line counts.
* **GitHub** — open and all pull requests come from the pulls API. Merged and closed ones, and title
  searches, come from GitHub's issue search, which shows no branch names and allows 30 searches a
  minute. Line counts appear once a pull request is opened.
* **Gitea / Forgejo** — title search is answered by Gitea's issue search, which also matches
  descriptions and comments and shows no branch names. Gitea can only list open or closed pull
  requests, so merged and closed are told apart within each page as it arrives: a page can come back
  short, or empty, while more remain. After a few such pages the list stops and offers
  **Load more**.
* **Bitbucket** — states and title search are answered by Bitbucket. Line counts appear once a pull
  request is opened.

The **inbox** has four views of open merge requests:

| View | What it shows |
|------|---------------|
| **All** | Open merge requests across your repositories, newest first, ten repositories at a time, most recently active repositories first; pinned favourites are included on the first page. Each repository shows its ten newest; a note names the ones that have more |
| **Authored** | Ones you opened |
| **Assigned** | Ones assigned to you |
| **Review requested** | Ones waiting for your review |

Authored, assigned and review-requested are asked of the host directly, across every repository
the token can see. Bitbucket has no assignees and no list of pull requests awaiting a user's review,
so those two views are always empty there. On GitHub and Gitea these three views come from issue
search and show no branch names.

Responses from the host are cached in memory for five minutes (repository lists for fifteen), so
going back to a list you just saw does not call the host again. **Sync** forgets them, so a push
made a minute ago shows up, and editing or deleting a host forgets everything cached for it.

## Verify a token

`GET /api/v1/hosts/{id}/test` asks the host who the token belongs to and returns the
username, name and email it authenticated as. A `401` means the host rejected the token, a
`403` that it is valid but not entitled to what was asked for.

## Remove a host

Open the host and click **Delete**. This removes the host and its token from `hosts.yaml`.
Reviews already created against it stay in the data directory; delete them from the reviews
list if you want them gone.
