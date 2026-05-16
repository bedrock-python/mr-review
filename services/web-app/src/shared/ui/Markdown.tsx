import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownProps = {
  children: string;
  className?: string;
};

export const Markdown = ({ children, className }: MarkdownProps): React.ReactElement => {
  return (
    <div className={`markdown-body${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-0)", margin: "0 0 10px" }}>
              {c}
            </h1>
          ),
          h2: ({ children: c }) => (
            <h2
              style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-0)", margin: "12px 0 8px" }}
            >
              {c}
            </h2>
          ),
          h3: ({ children: c }) => (
            <h3
              style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-0)", margin: "10px 0 6px" }}
            >
              {c}
            </h3>
          ),
          p: ({ children: c }) => (
            <p style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.65, margin: "0 0 8px" }}>
              {c}
            </p>
          ),
          strong: ({ children: c }) => (
            <strong style={{ fontWeight: 700, color: "var(--fg-0)" }}>{c}</strong>
          ),
          em: ({ children: c }) => (
            <em style={{ fontStyle: "italic", color: "var(--fg-1)" }}>{c}</em>
          ),
          ul: ({ children: c }) => (
            <ul style={{ margin: "0 0 8px 0", paddingLeft: 18, listStyleType: "disc" }}>{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol style={{ margin: "0 0 8px 0", paddingLeft: 18, listStyleType: "decimal" }}>{c}</ol>
          ),
          li: ({ children: c }) => (
            <li style={{ fontSize: 12, color: "var(--fg-1)", lineHeight: 1.65, marginBottom: 2 }}>
              {c}
            </li>
          ),
          code: ({ children: c, className: cls }) => {
            const isInline = !cls;
            if (isInline) {
              return (
                <code
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "1px 5px",
                    color: "var(--fg-0)",
                  }}
                >
                  {c}
                </code>
              );
            }
            return (
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--fg-0)",
                  display: "block",
                }}
              >
                {c}
              </code>
            );
          },
          pre: ({ children: c }) => (
            <pre
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "10px 12px",
                overflowX: "auto",
                margin: "0 0 8px",
                fontSize: 11,
                lineHeight: 1.6,
                fontFamily: "var(--font-mono)",
              }}
            >
              {c}
            </pre>
          ),
          blockquote: ({ children: c }) => (
            <blockquote
              style={{
                borderLeft: "3px solid var(--border-strong)",
                marginLeft: 0,
                paddingLeft: 12,
                color: "var(--fg-2)",
                margin: "0 0 8px",
              }}
            >
              {c}
            </blockquote>
          ),
          a: ({ href, children: c }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", textDecoration: "underline", fontSize: 12 }}
            >
              {c}
            </a>
          ),
          hr: () => (
            <hr
              style={{ border: "none", borderTop: "1px solid var(--border)", margin: "10px 0" }}
            />
          ),
          table: ({ children: c }) => (
            <div style={{ overflowX: "auto", margin: "0 0 8px" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {c}
              </table>
            </div>
          ),
          th: ({ children: c }) => (
            <th
              style={{
                padding: "4px 8px",
                textAlign: "left",
                fontWeight: 600,
                color: "var(--fg-0)",
                borderBottom: "1px solid var(--border-strong)",
                background: "var(--bg-2)",
              }}
            >
              {c}
            </th>
          ),
          td: ({ children: c }) => (
            <td
              style={{
                padding: "4px 8px",
                color: "var(--fg-1)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {c}
            </td>
          ),
          input: ({ type, checked }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  style={{ marginRight: 4, accentColor: "var(--accent)", cursor: "default" }}
                />
              );
            }
            return <input type={type} readOnly />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
