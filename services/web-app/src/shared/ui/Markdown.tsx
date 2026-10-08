import { lazy, Suspense } from "react";
import type { MarkdownProps } from "./MarkdownContent";

// react-markdown and remark-gfm are most of a stage's weight; nothing needs them before a
// description or a comment is on screen.
const MarkdownContent = lazy(() =>
  import("./MarkdownContent").then((module) => ({ default: module.MarkdownContent }))
);

/** Markdown, rendered once the renderer has loaded; the plain text stands in until then. */
export const Markdown = ({ children, className }: MarkdownProps): React.ReactElement => (
  <Suspense
    fallback={
      <div
        className={`markdown-body${className ? ` ${className}` : ""}`}
        style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}
      >
        {children}
      </div>
    }
  >
    <MarkdownContent {...(className === undefined ? {} : { className })}>
      {children}
    </MarkdownContent>
  </Suspense>
);

export type { MarkdownProps };
