import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";
import { beforeAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, "index.css");
const COMPILE_TIMEOUT_MS = 60_000;

/** index.css as the build ships it: Tailwind resolves the imports and drops what is unused. */
let built = "";

beforeAll(async () => {
  const result = await postcss([tailwind({ base: join(here, "../../..") })]).process(
    readFileSync(entry, "utf8"),
    { from: entry }
  );
  built = result.css;
}, COMPILE_TIMEOUT_MS);

describe("built stylesheet", () => {
  // Used only from inline styles, which Tailwind cannot see: inside @theme they were dropped.
  it.each(["spin", "blink", "fadeSlideIn", "pulse-ring", "pulse-ring-centered", "ui-pulse"])(
    "keeps @keyframes %s",
    (name) => {
      expect(built).toMatch(new RegExp(`@keyframes ${name}\\s*\\{`));
    }
  );

  it("draws text-field focus as an outline, which inline borders cannot hide", () => {
    const textFieldFocus =
      /input:not\([^{]*\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/;
    expect(built).toMatch(textFieldFocus);
    expect(built).toMatch(
      /\.ui-focus-within:has\([^{]*:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/
    );
  });

  it("loads no font from a third-party host", () => {
    expect(built).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});
