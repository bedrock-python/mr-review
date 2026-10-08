/**
 * A colour role. Severity tones match comment severities; the others are UI roles.
 * Rendered as `data-tone`, which the styles turn into --tone (dots, fills), --tone-fg (text),
 * --tone-tint (12% fill) and --tone-line (40% border).
 */
export type Tone =
  | "neutral"
  | "accent"
  | "critical"
  | "major"
  | "minor"
  | "suggestion"
  | "danger"
  | "warn"
  | "info"
  | "success";

/** The data-tone attribute value; neutral is the default look and sets none. */
export const toneAttribute = (tone: Tone): string | undefined =>
  tone === "neutral" ? undefined : tone;
