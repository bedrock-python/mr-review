import { describe, expect, it } from "vitest";
import { buildRepoTree, flattenRepoRows, resolveFavouriteRepos } from "./repoTree";
import type { Repo } from "@entities/mr";
import type { RepoListRow } from "./repoTree";

const repo = (path: string): Repo => ({
  id: path,
  path,
  name: path.split("/").at(-1) ?? path,
  description: null,
});

const describeRow = (row: RepoListRow): string => {
  if (row.kind === "section") return `section ${row.label}`;
  if (row.kind === "divider") return "divider";
  if (row.kind === "namespace") return `${"  ".repeat(row.depth)}ns ${row.fullPath}`;
  return `${"  ".repeat(row.depth)}repo ${row.repo.path}`;
};

describe("buildRepoTree + flattenRepoRows", () => {
  const repos = [repo("top"), repo("a/one"), repo("a/b/two"), repo("c/three"), repo("a/four")];

  it("groups repositories by namespace in first-seen order", () => {
    const rows = flattenRepoRows({
      favourites: [],
      tree: buildRepoTree(repos),
      collapsed: new Set(),
    });
    expect(rows.map(describeRow)).toEqual([
      "repo top",
      "ns a",
      "  repo a/one",
      "  ns a/b",
      "    repo a/b/two",
      "  repo a/four",
      "ns c",
      "  repo c/three",
    ]);
  });

  it("puts favourites in their own section on top", () => {
    const rows = flattenRepoRows({
      favourites: [repo("c/three")],
      tree: buildRepoTree([repo("c/three")]),
      collapsed: new Set(),
    });
    expect(rows.map(describeRow)).toEqual([
      "section Favourites",
      "repo c/three",
      "divider",
      "ns c",
      "  repo c/three",
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it("hides the children of collapsed namespaces", () => {
    const rows = flattenRepoRows({
      favourites: [],
      tree: buildRepoTree(repos),
      collapsed: new Set(["a"]),
    });
    expect(rows.map(describeRow)).toEqual(["repo top", "ns a", "ns c", "  repo c/three"]);
    const namespaceA = rows.find((row) => row.key === "namespace:a");
    expect(namespaceA).toMatchObject({ isOpen: false });
  });
});

describe("resolveFavouriteRepos", () => {
  it("uses loaded repositories and stubs pins that are not loaded yet", () => {
    const loaded = { ...repo("g/loaded"), name: "Loaded Repo" };
    const favourites = resolveFavouriteRepos(["g/loaded", "g/sub/not-loaded"], [loaded]);
    expect(favourites).toEqual([
      loaded,
      {
        id: "favourite:g/sub/not-loaded",
        path: "g/sub/not-loaded",
        name: "not-loaded",
        description: null,
      },
    ]);
  });
});
