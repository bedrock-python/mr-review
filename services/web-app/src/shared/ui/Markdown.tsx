import { lazy, memo, Suspense } from "react";
import { reloadOnStaleChunk } from "@shared/lib";
import { ErrorBoundary } from "./error-boundary";
import type { MarkdownProps } from "./MarkdownContent";

// react-markdown and remark-gfm are most of a stage's weight; nothing needs them before a
// description or a comment is on screen.
const MarkdownContent = lazy(
  reloadOnStaleChunk(() =>
    import("./MarkdownContent").then((module) => ({ default: module.MarkdownContent }))
  )
);

const PlainText = ({ children, className }: MarkdownProps): React.ReactElement => (
  <div
    className={`markdown-body${className ? ` ${className}` : ""}`}
    style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}
  >
    {children}
  </div>
);

const MarkdownBase = ({ children, className }: MarkdownProps): React.ReactElement => {
  const plain = (
    <PlainText {...(className === undefined ? {} : { className })}>{children}</PlainText>
  );
  return (
    <ErrorBoundary fallback={plain}>
      <Suspense fallback={plain}>
        <MarkdownContent {...(className === undefined ? {} : { className })}>
          {children}
        </MarkdownContent>
      </Suspense>
    </ErrorBoundary>
  );
};

/**
 * Markdown, rendered once the renderer has loaded. The plain text stands in until then, and
 * for good when the renderer cannot be loaded or fails on the text. Memoised on the text:
 * a list of comments re-renders without parsing every body again.
 */
export const Markdown = memo(MarkdownBase);

export type { MarkdownProps };
