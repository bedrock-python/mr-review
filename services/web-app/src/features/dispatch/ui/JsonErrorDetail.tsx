/** The JSON parser's message, verbatim — where the model's answer broke — inside a notice. */
export const JsonErrorDetail = ({ message }: { message: string }): React.ReactElement => (
  <code
    style={{
      display: "block",
      marginTop: "var(--space-2)",
      padding: "var(--space-1) var(--space-2)",
      borderRadius: "var(--radius-badge)",
      background: "var(--bg-1)",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--fs-meta)",
      color: "var(--fg-1)",
      wordBreak: "break-word",
    }}
  >
    {message}
  </code>
);
