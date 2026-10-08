import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@shared/lib";
import type { Components } from "react-markdown";

export type MarkdownProps = {
  children: string;
  className?: string;
};

const ABSOLUTE_URL = /^https?:\/\//i;

// The look is in `.ui-markdown` (styles/markdown.css): body type tokens, no margin under the
// last block. Only what changes behaviour is a component here.
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Comment bodies come from a model: an image would make the browser fetch whatever URL it
  // chose. Shown as a link instead, fetched only if the reader follows it.
  img: ({ src, alt }) => {
    const url = typeof src === "string" && ABSOLUTE_URL.test(src) ? src : undefined;
    const label = alt !== undefined && alt.trim() !== "" ? alt : (url ?? "image");
    if (url === undefined) return <span className="ui-markdown__muted">[{label}]</span>;
    return (
      <a href={url} title={url} target="_blank" rel="noopener noreferrer nofollow">
        [image: {label}]
      </a>
    );
  },
  table: ({ children }) => (
    <div className="ui-markdown__table">
      <table>{children}</table>
    </div>
  ),
  input: ({ type, checked }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} readOnly />
    ) : (
      <input type={type} readOnly />
    ),
};

export const MarkdownContent = ({ children, className }: MarkdownProps): React.ReactElement => (
  <div className={cn("ui-markdown", className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  </div>
);
