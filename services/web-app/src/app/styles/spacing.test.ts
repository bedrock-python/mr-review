import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The root font size is 13px, so Tailwind's numeric spacing scale is 3.25px a step: `p-4` is
 * 13px, not the 16px of `--space-4`. Spacing comes from the tokens — `p-(--space-4)`,
 * `gap-(--space-2)`, `size-(--control-sm)` — or from a primitive. Zero (`m-0`, `min-w-0`) is
 * the same on any scale and is fine; so is an arbitrary value (`w-[268px]`), kept for the
 * fixed layout widths (AUDIT §5: rail 56, repos pane 268, MR list 360, diff gutters).
 */
const SPACING_UTILITIES = [
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "w",
  "h",
  "size",
  "min-w",
  "min-h",
  "max-w",
  "max-h",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "inset",
  "inset-x",
  "inset-y",
  "translate-x",
  "translate-y",
  "scroll-m",
  "scroll-p",
  "indent",
  "basis",
];
const NUMERIC_SPACING = new RegExp(`^-?(?:${SPACING_UTILITIES.join("|")})-(\\d+(?:\\.\\d+)?)$`);
const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, "../..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [path] : [];
  });

/** The utility a class token applies, without its variants (`hover:`, `[&>svg]:`, `md:`). */
const utilityOf = (token: string): string => {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i += 1) {
    const char = token[i];
    if (char === "[") depth += 1;
    else if (char === "]") depth -= 1;
    else if (char === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/!$/, "").replace(/^!/, "");
};

export const findNumericSpacing = (source: string): string[] =>
  (source.match(STRING_LITERAL) ?? []).flatMap((literal) =>
    literal
      .slice(1, -1)
      .split(/\s+/)
      .filter((token) => {
        const match = NUMERIC_SPACING.exec(utilityOf(token));
        return match !== null && Number(match[1]) !== 0;
      })
  );

describe("spacing utilities", () => {
  it("finds numeric steps and lets tokens, zero and arbitrary values through", () => {
    expect(
      findNumericSpacing(
        `cn("p-4 hover:mt-2 -mx-1.5 [&>svg]:size-3", "gap-(--space-2) m-0 w-[268px] min-w-0 h-px")`
      )
    ).toEqual(["p-4", "hover:mt-2", "-mx-1.5", "[&>svg]:size-3"]);
  });

  it("are tokens in every component, not Tailwind's 3.25px steps", () => {
    const offenders = sourceFiles(SRC).flatMap((path) =>
      findNumericSpacing(readFileSync(path, "utf8")).map(
        (token) => `${relative(SRC, path)}: ${token}`
      )
    );

    expect(offenders).toEqual([]);
  });
});
