import { describe, expect, it } from "vitest";
import { getTokenLink } from "./tokenLink";

describe("getTokenLink", () => {
  it("points GitHub and Bitbucket at their fixed pages", () => {
    expect(getTokenLink("github", "")?.label).toBe("Create a token on GitHub");
    expect(getTokenLink("bitbucket", "")?.href).toContain("bitbucket.org");
  });

  it("needs the instance's address for GitLab, Gitea and Forgejo", () => {
    expect(getTokenLink("gitlab", "")).toBeNull();
    expect(getTokenLink("gitlab", "not a url")).toBeNull();
    expect(getTokenLink("gitlab", "https://gitlab.example.com/")).toEqual({
      href: "https://gitlab.example.com/-/user_settings/personal_access_tokens?name=mr-review&scopes=api,read_user",
      label: "Create a token on gitlab.example.com",
    });
    expect(getTokenLink("forgejo", "https://code.example.org")?.href).toBe(
      "https://code.example.org/user/settings/applications"
    );
  });
});
