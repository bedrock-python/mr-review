import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNav } from "@app/navigation";
import { createTestQueryClient } from "@shared/lib/test-utils";
import { PickStage } from "./PickStage";
import type * as MRModule from "@entities/mr";
import type { DiffFile, MR } from "@entities/mr";

const HOST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const file = (path: string): DiffFile => ({
  path,
  old_path: null,
  additions: 1,
  deletions: 0,
  hunks: [
    {
      old_start: 0,
      old_count: 0,
      new_start: 1,
      new_count: 1,
      lines: [{ type: "added", content: `// ${path}`, old_line: null, new_line: 1 }],
    },
  ],
});

// Both merge requests change files under src/, and both change src/second.ts: a folder
// collapsed or a file picked in the first must not carry over to the second.
const DIFFS: Record<number, DiffFile[]> = {
  1: [file("src/first.ts"), file("src/second.ts")],
  2: [file("src/third.ts"), file("docs/readme.md"), file("src/second.ts")],
};

const mr = (iid: number): MR => ({
  iid,
  title: `MR ${String(iid)}`,
  description: "",
  author: "dev",
  source_branch: "feature",
  target_branch: "main",
  status: "opened",
  draft: false,
  pipeline: null,
  additions: null,
  deletions: null,
  file_count: null,
  web_url: "",
  created_at: "2026-05-16T10:00:00+00:00",
  updated_at: "2026-05-16T10:00:00+00:00",
});

vi.mock("@entities/mr", async (importOriginal) => {
  const actual = await importOriginal<typeof MRModule>();
  const loaded = { isLoading: false, isError: false };
  return {
    ...actual,
    useMR: (_host: string | null, _repo: string | null, iid: number | null) => ({
      ...loaded,
      data: iid === null ? undefined : mr(iid),
    }),
    useDiff: (_host: string | null, _repo: string | null, iid: number | null) => ({
      ...loaded,
      data: iid === null ? undefined : DIFFS[iid],
    }),
  };
});

const OpenMR2 = (): React.ReactElement => {
  const { setMR } = useNav();
  return (
    <button
      type="button"
      onClick={() => {
        setMR(HOST, "group/repo", 2);
      }}
    >
      open !2
    </button>
  );
};

describe("PickStage", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  const renderAtMR1 = (): void => {
    window.history.replaceState(null, "", `/${HOST}/${encodeURIComponent("group/repo")}/mrs/1`);
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <BrowserRouter>
          <OpenMR2 />
          <PickStage />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it("opens the next merge request with its folders expanded", async () => {
    const user = userEvent.setup();
    renderAtMR1();
    const tree = (): HTMLElement => screen.getByRole("tree", { name: "Changed files" });
    await user.click(within(tree()).getByTitle("src"));
    expect(within(tree()).queryByTitle("src/first.ts")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "open !2" }));

    expect(within(tree()).getByTitle("src/third.ts")).toBeInTheDocument();
    expect(within(tree()).getByTitle("docs/readme.md")).toBeInTheDocument();
  });

  it("drops the previous merge request's filter and selection", async () => {
    const user = userEvent.setup();
    renderAtMR1();
    await user.click(screen.getByTitle("src/second.ts"));
    await user.type(screen.getByPlaceholderText("Filter files…"), "second");

    await user.click(screen.getByRole("button", { name: "open !2" }));

    expect(screen.getByPlaceholderText("Filter files…")).toHaveValue("");
    // The first file of the new merge request is shown, not the one picked in the last.
    expect(screen.getByRole("table", { name: "Diff of src/third.ts" })).toBeInTheDocument();
  });
});
