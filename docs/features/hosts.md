# VCS hosts

A **host** is a VCS instance (GitLab or GitHub) that mr-review connects to for fetching MRs and posting review comments.

You can add as many hosts as you need — for example a self-hosted GitLab plus github.com.

## Add a host

1. Open the app and click **Add host**
2. Fill in the form:

| Field | Description |
|-------|-------------|
| **Name** | A display label (e.g. "Work GitLab") |
| **Type** | `gitlab` or `github` |
| **URL** | Base URL of the instance |
| **Token** | Personal access token |

3. Click **Save**

## GitLab token

Create a personal access token at `https://<your-gitlab>/profile/personal_access_tokens` with the `api` scope.

For gitlab.com: **User settings → Access tokens → Add new token**, scopes: `api`.

## GitHub token

Create a classic personal access token at `https://github.com/settings/tokens` with the `repo` scope.

## Verify connection

After saving, mr-review immediately tests the connection. A green indicator means the host is reachable and the token is valid.

## Remove a host

Open the host settings and click **Delete**. This removes the host and all associated review history from the local database.
