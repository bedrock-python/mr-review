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

  it("annotates rows with descriptive aria-labels (not color-only)", () => {
    render(<DiffViewer diff={SAMPLE} />);
    const labels = screen
      .getAllByRole("row")
      .map((row) => row.getAttribute("aria-label"))
      .filter((label): label is string => label !== null);
    expect(labels).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^File header:/),
        expect.stringMatching(/^Hunk header:/),
        expect.stringMatching(/^Context line 1: def foo\(\):$/),
        expect.stringMatching(/^Removed line 2: {5}return 1$/),
        expect.stringMatching(/^Added line 2: {5}return 2$/),
      ])
    );
  });

  it("marks highlighted row with aria-current", () => {
    render(<DiffViewer diff={SAMPLE} highlightFile="src/foo.py" highlightLine={2} />);
    const highlighted = screen
      .getAllByRole("row")
      .find((row) => row.getAttribute("aria-current") === "true");
    expect(highlighted?.getAttribute("aria-label")).toMatch(/^Added line 2:/);
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
