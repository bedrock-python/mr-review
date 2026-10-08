import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { collapseFileHeaders } from "./collapseFileHeaders";
import { DiffViewer } from "./DiffViewer";
import { attachFileInfo, parseDiff } from "./parseDiff";

const TWO_FILES = `diff --git a/src/a.py b/src/a.py
index 1111111..2222222 100644
--- a/src/a.py
+++ b/src/a.py
@@ -1,2 +1,2 @@
 keep
-old
+new
diff --git a/src/old.py b/src/new.py
similarity index 90%
rename from src/old.py
rename to src/new.py
--- a/src/old.py
+++ b/src/new.py
@@ -3,1 +3,1 @@
-x = 1
+x = 2
diff --git a/img.png b/img.png
index 3333333..4444444 100644
Binary files a/img.png and b/img.png differ
`;

const rowsOf = (diff: string) => collapseFileHeaders(attachFileInfo(parseDiff(diff)));

describe("collapseFileHeaders", () => {
  it("leaves one titled row per file and no git header lines", () => {
    const fileRows = rowsOf(TWO_FILES).filter((line) => line.type === "file");

    expect(fileRows.map((line) => line.content)).toEqual([
      "src/a.py",
      "src/old.py → src/new.py",
      "img.png (binary)",
    ]);
    expect(fileRows.map((line) => line.file)).toEqual(["src/a.py", "src/new.py", "img.png"]);
  });

  it("keeps every other line and its numbers", () => {
    const rows = rowsOf(TWO_FILES);
    const added = rows.filter((line) => line.type === "added");

    expect(added.map((line) => [line.file, line.newLine, line.content])).toEqual([
      ["src/a.py", 2, "new"],
      ["src/new.py", 3, "x = 2"],
    ]);
    expect(
      rows.some((line) => line.content.startsWith("+++") || line.content.startsWith("---"))
    ).toBe(false);
  });

  it("does nothing to a diff without headers", () => {
    const lines = attachFileInfo(parseDiff("@@ -1,1 +1,1 @@\n-a\n+b\n"));

    expect(collapseFileHeaders(lines)).toEqual(lines);
  });
});

describe("DiffViewer with several files", () => {
  it("shows each file's path once, not its raw ---/+++ lines", () => {
    render(<DiffViewer diff={TWO_FILES} />);

    expect(screen.getByText("src/a.py")).toBeInTheDocument();
    expect(screen.getByText("src/old.py → src/new.py")).toBeInTheDocument();
    expect(screen.queryByText("+++ b/src/a.py")).not.toBeInTheDocument();
    expect(screen.queryByText(/^diff --git/)).not.toBeInTheDocument();
  });
});
