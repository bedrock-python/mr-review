import axios from "axios";
import { z } from "zod";

const GITHUB_RELEASES_URL = "https://api.github.com/repos/bedrock-python/mr-review/releases";

export const GithubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z.string(),
  body: z.string(),
  html_url: z.string().url(),
  published_at: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
});

export type GithubRelease = z.infer<typeof GithubReleaseSchema>;

export const extractVersion = (tagName: string): string => {
  return tagName.replace(/^(?:mr-review|web-app)-v/, "");
};

const githubClient = axios.create({
  timeout: 10_000,
  headers: { Accept: "application/vnd.github+json" },
});

export type LatestReleases = {
  backend: GithubRelease | null;
  frontend: GithubRelease | null;
};

export const githubApi = {
  getLatestReleases: async (): Promise<LatestReleases> => {
    const res = await githubClient.get<unknown>(GITHUB_RELEASES_URL, {
      params: { per_page: 50 },
    });
    const releases = z.array(GithubReleaseSchema).parse(res.data);

    const published = releases.filter((r) => !r.draft && !r.prerelease);

    const backend = published.find((r) => r.tag_name.startsWith("mr-review-v")) ?? null;
    const frontend = published.find((r) => r.tag_name.startsWith("web-app-v")) ?? null;

    return { backend, frontend };
  },
};
