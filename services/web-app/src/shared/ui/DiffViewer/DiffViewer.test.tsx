import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer } from "./DiffViewer";

const SAMPLE = `--- a/src/foo.py
+++ b/src/foo.py
@@ -1,3 +1,3 @@
 def foo():
-    return 1
+    return 2
     # done`;

describe("DiffViewer", () => {
  it("renders empty state when diff is empty", () => {
    render(<DiffViewer diff="" />);
    expect(screen.getByRole("status")).toHaveTextContent("No diff available");
  });

  it("renders a semantic table with sr-only headers", () => {
    render(<DiffViewer diff={SAMPLE} />);
    const table = screen.getByRole("table", { name: "Code diff" });
    expect(table).toBeInTheDocument();
    expect(screen.getByText("Old line")).toBeInTheDocument();
    expect(screen.getByText("New line")).toBeInTheDocument();
    expect(screen.getByText("Change type")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("uses a custom aria-label when provided", () => {
    render(<DiffViewer diff={SAMPLE} ariaLabel="My diff" />);
    expect(screen.getByRole("table", { name: "My diff" })).toBeInTheDocument();
  });

  it("says added and removed in text, not only in colour, and does not repeat the line in a label", () => {
    render(<DiffViewer diff={SAMPLE} />);
    const rows = screen.getAllByRole("row").filter((row) => row.closest("tbody") !== null);
    const added = rows.find((row) => row.textContent.includes("return 2"));
    const removed = rows.find((row) => row.textContent.includes("return 1"));

    expect(added).toHaveTextContent("added");
    expect(removed).toHaveTextContent("removed");
    expect(rows.filter((row) => row.hasAttribute("aria-label"))).toHaveLength(0);
  });

  it("marks highlighted row with aria-current", () => {
    render(<DiffViewer diff={SAMPLE} highlightFile="src/foo.py" highlightLine={2} />);
    const highlighted = screen
      .getAllByRole("row")
      .find((row) => row.getAttribute("aria-current") === "true");
    expect(highlighted).toHaveAttribute("data-diff-row", "src/foo.py:2");
    expect(highlighted).toHaveTextContent("return 2");
  });

  it("moves the highlight when the target line changes", () => {
    const { rerender } = render(
      <DiffViewer diff={SAMPLE} highlightFile="src/foo.py" highlightLine={2} />
    );

    rerender(<DiffViewer diff={SAMPLE} highlightFile="src/foo.py" highlightLine={3} />);

    const highlighted = screen
      .getAllByRole("row")
      .filter((row) => row.getAttribute("aria-current") === "true");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]).toHaveAttribute("data-diff-row", "src/foo.py:3");
  });

  it("marks the active decoration", () => {
    type DummyComment = { id: string; file: string | null };
    const commentsOnLines = new Map<number, readonly DummyComment[]>([
      [2, [{ id: "c1", file: "src/foo.py" }]],
    ]);

    render(
      <DiffViewer<DummyComment>
        diff={SAMPLE}
        commentsOnLines={commentsOnLines}
        activeDecorationId="c1"
        renderLineDecoration={({ comments }) =>
          comments.map((c) => <span key={c.id} data-decoration-id={c.id} data-testid={c.id} />)
        }
      />
    );

    expect(screen.getByTestId("c1")).toHaveClass("diff-pin-active");
  });

  it("hides the old-line gutter in hunk mode", () => {
    render(<DiffViewer diff={SAMPLE} mode="hunk" />);
    expect(screen.queryByText("Old line")).not.toBeInTheDocument();
    expect(screen.getByText("New line")).toBeInTheDocument();
  });

  it("calls renderLineDecoration with matching comments", () => {
    type DummyComment = { id: string; file: string | null };
    type DecorationArgs = {
      line: { type: string; newLine: number | null };
      comments: readonly DummyComment[];
    };
    const renderDecoration = vi.fn<(args: DecorationArgs) => React.ReactNode>(({ comments }) => (
      <span data-testid={`marks-${String(comments.length)}`} />
    ));
    const commentsOnLines = new Map<number, readonly DummyComment[]>([
      [
        2,
        [
          { id: "c1", file: "src/foo.py" },
          { id: "c2", file: "other/file.py" },
        ],
      ],
    ]);

    render(
      <DiffViewer<DummyComment>
        diff={SAMPLE}
        commentsOnLines={commentsOnLines}
        renderLineDecoration={renderDecoration}
      />
    );

    expect(renderDecoration).toHaveBeenCalled();
    // Decoration for the matching new line (added) gets exactly one comment after file-filter.
    const callForAdded = renderDecoration.mock.calls.find(
      ([args]) => args.line.type === "added" && args.line.newLine === 2
    );
    expect(callForAdded?.[0].comments).toHaveLength(1);
    expect(callForAdded?.[0].comments[0]?.id).toBe("c1");
  });

  it("does not invoke renderLineDecoration with comments for header rows", () => {
    type DummyComment = { id: string };
    type DecorationArgs = { line: { type: string }; comments: readonly DummyComment[] };
    const renderDecoration = vi.fn<(args: DecorationArgs) => React.ReactNode>(
      ({ line }) => `decoration-for-${line.type}`
    );

    render(<DiffViewer<DummyComment> diff={SAMPLE} renderLineDecoration={renderDecoration} />);

    // No comments map provided, so decoration is invoked but always with empty comments.
    const nonEmptyCalls = renderDecoration.mock.calls.filter(([args]) => args.comments.length > 0);
    expect(nonEmptyCalls).toHaveLength(0);
  });

  it("passes comments with null file to all matching lines", () => {
    type DummyComment = { id: string; file: string | null };
    type DecorationArgs = {
      line: { type: string; newLine: number | null };
      comments: readonly DummyComment[];
    };
    const renderDecoration = vi.fn<(args: DecorationArgs) => React.ReactNode>(({ comments }) => (
      <span>{comments.length}</span>
    ));
    const commentsOnLines = new Map<number, readonly DummyComment[]>([
      [1, [{ id: "general", file: null }]],
    ]);

    render(
      <DiffViewer<DummyComment>
        diff={SAMPLE}
        commentsOnLines={commentsOnLines}
        renderLineDecoration={renderDecoration}
      />
    );

    const callForContext = renderDecoration.mock.calls.find(
      ([args]) => args.line.type === "context" && args.line.newLine === 1
    );
    expect(callForContext?.[0].comments).toHaveLength(1);
  });
});
