export type TokenLink = { href: string; label: string };

const hostnameOf = (baseUrl: string): string | null => {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return null;
  }
};

/**
 * Where to create an access token for a host, and what to call the link. GitHub and Bitbucket
 * live at fixed addresses; GitLab, Gitea and Forgejo need the instance's base URL first.
 */
export const getTokenLink = (type: string, baseUrl: string): TokenLink | null => {
  if (type === "github") {
    return {
      href: "https://github.com/settings/tokens/new?description=mr-review&scopes=repo,read:user",
      label: "Create a token on GitHub",
    };
  }
  if (type === "bitbucket") {
    return {
      href: "https://bitbucket.org/account/settings/app-passwords/new",
      label: "Create an app password on Bitbucket",
    };
  }
  const base = baseUrl.trim().replace(/\/$/, "");
  const hostname = hostnameOf(base);
  if (!hostname) return null;
  if (type === "gitlab") {
    return {
      href: `${base}/-/user_settings/personal_access_tokens?name=mr-review&scopes=api,read_user`,
      label: `Create a token on ${hostname}`,
    };
  }
  if (type === "gitea" || type === "forgejo") {
    return { href: `${base}/user/settings/applications`, label: `Create a token on ${hostname}` };
  }
  return null;
};
