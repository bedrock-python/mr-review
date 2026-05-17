import type { Meta, StoryObj } from "@storybook/react";
import { DiffViewer } from "./DiffViewer";
import type { DiffLineWithFile } from "./types";

const HUNK_SMALL = `--- a/src/auth/login.py
+++ b/src/auth/login.py
@@ -10,5 +10,5 @@@@
 def get_user(user_id):
-    foo: Optional[str] = None
+    foo: str | None = None
     bar = compute()
     return foo, bar`;

const MULTI_HUNK = `--- a/src/api/handlers.py
+++ b/src/api/handlers.py
@@ -12,4 +12,5 @@
 def login(request):
-    user = User.objects.get(id=request.user_id)
+    user = User.objects.filter(id=request.user_id).first()
+    if not user: raise NotFound()
     return user
@@ -40,3 +41,3 @@
 def logout(request):
-    request.session.flush()
+    request.session.clear()
     return Response(status=204)`;

const meta: Meta<typeof DiffViewer> = {
  title: "shared/DiffViewer",
  component: DiffViewer,
  parameters: { layout: "padded" },
  decorators: [
    (Story): React.ReactElement => (
      <div className="h-[480px] w-[720px] border border-[var(--border)] bg-[var(--bg-1)]">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DiffViewer>;

export const Empty: Story = { args: { diff: "" } };

export const SingleHunk: Story = { args: { diff: HUNK_SMALL, mode: "hunk" } };

export const MultiHunk: Story = { args: { diff: MULTI_HUNK, mode: "full" } };

export const WithHighlightedLine: Story = {
  args: {
    diff: MULTI_HUNK,
    mode: "full",
    highlightFile: "src/api/handlers.py",
    highlightLine: 13,
  },
};

type DemoComment = { id: string; severity: "critical" | "major" | "minor"; file: string | null };

const COMMENTS = new Map<number, readonly DemoComment[]>([
  [13, [{ id: "c1", severity: "major", file: "src/api/handlers.py" }]],
  [14, [{ id: "c2", severity: "minor", file: "src/api/handlers.py" }]],
]);

const SEVERITY_COLOR: Record<DemoComment["severity"], string> = {
  critical: "var(--c-critical)",
  major: "var(--c-major)",
  minor: "var(--c-minor)",
};

export const WithComments: Story = {
  args: {
    diff: MULTI_HUNK,
    mode: "full",
    commentsOnLines: COMMENTS,
    renderLineDecoration: ({ comments }) => {
      const items = comments as readonly DemoComment[];
      if (items.length === 0) return null;
      return items.map((c) => (
        <span
          key={c.id}
          aria-label={`${c.severity} comment`}
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: SEVERITY_COLOR[c.severity] }}
        />
      ));
    },
  },
};

const PATCH_HUNK = `@@ -42,3 +42,3 @@
-    foo: Optional[str] = None
+    foo: str | None = None
     return foo`;

export const HunkApplied: Story = {
  args: {
    diff: PATCH_HUNK,
    mode: "hunk",
    ariaLabel: "Applied patch preview",
    renderLineDecoration: ({ line }: { line: DiffLineWithFile }): React.ReactNode =>
      line.type === "added" ? <span aria-hidden="true">✅</span> : null,
  },
};

export const HunkStale: Story = {
  args: {
    diff: PATCH_HUNK,
    mode: "hunk",
    ariaLabel: "Stale patch preview",
    className: "opacity-60",
  },
};

export const LightTheme: Story = {
  args: { diff: MULTI_HUNK, mode: "full" },
  decorators: [
    (Story): React.ReactElement => (
      <div
        data-theme="paper"
        className="h-[480px] w-[720px] border border-[var(--border)] bg-[var(--bg-1)]"
      >
        <Story />
      </div>
    ),
  ],
};

export const PhosphorTheme: Story = {
  args: { diff: MULTI_HUNK, mode: "full" },
  decorators: [
    (Story): React.ReactElement => (
      <div
        data-theme="phosphor"
        className="h-[480px] w-[720px] border border-[var(--border)] bg-[var(--bg-1)]"
      >
        <Story />
      </div>
    ),
  ],
};
