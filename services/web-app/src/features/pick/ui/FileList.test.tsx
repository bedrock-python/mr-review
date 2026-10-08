import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileList } from "./FileList";
import type { DiffFile } from "@entities/mr";

const file = (path: string): DiffFile => ({
  path,
  old_path: null,
  additions: 1,
  deletions: 0,
  hunks: [],
});

const FILES = [file("src/a/x.ts"), file("src/b.ts"), file("docs/r.md")];

describe("FileList", () => {
  it("holds folders open while filtering: ← steps out and nothing changes underneath", async () => {
    const user = userEvent.setup();
    render(<FileList files={FILES} selectedPath="src/b.ts" onSelect={vi.fn()} />);
    const tree = screen.getByRole("tree", { name: "Changed files" });
    await user.type(screen.getByRole("searchbox", { name: "Filter files" }), "x.ts");
    const folderA = within(tree).getByRole("treeitem", { name: "a" });

    act(() => {
      folderA.focus();
    });
    await user.keyboard("{ArrowLeft}");

    expect(within(tree).getByRole("treeitem", { name: "src" })).toHaveFocus();
    expect(folderA).toHaveAttribute("aria-expanded", "true");

    await user.click(folderA);
    expect(folderA).toHaveAttribute("aria-expanded", "true");

    await user.clear(screen.getByRole("searchbox", { name: "Filter files" }));
    expect(within(tree).getByRole("treeitem", { name: "a" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(within(tree).getByRole("treeitem", { name: /x\.ts/ })).toBeInTheDocument();
  });

  it("opens and closes folders with the arrow keys when not filtering", async () => {
    const user = userEvent.setup();
    render(<FileList files={FILES} selectedPath="src/b.ts" onSelect={vi.fn()} />);
    const tree = screen.getByRole("tree", { name: "Changed files" });
    const folderA = within(tree).getByRole("treeitem", { name: "a" });

    act(() => {
      folderA.focus();
    });
    await user.keyboard("{ArrowLeft}");
    expect(folderA).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{ArrowRight}");
    expect(folderA).toHaveAttribute("aria-expanded", "true");
  });
});
