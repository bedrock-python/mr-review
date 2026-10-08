import { describe, expect, it } from "vitest";
import { formatAge, formatAgeAgo } from "./formatAge";

const NOW = Date.parse("2026-10-08T12:00:00Z");

describe("formatAge", () => {
  it.each([
    ["2026-10-08T11:30:00Z", "now", "just now"],
    ["2026-10-08T07:00:00Z", "5h", "5h ago"],
    ["2026-09-24T12:00:00Z", "14d", "14d ago"],
    ["2026-07-01T12:00:00Z", "3mo", "3mo ago"],
  ])("%s is %s / %s", (iso, compact, words) => {
    expect(formatAge(iso, NOW)).toBe(compact);
    expect(formatAgeAgo(iso, NOW)).toBe(words);
  });
});
