import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelative } from "./formatRelative";

const NOW = new Date("2026-10-08T12:00:00Z");
const ago = (ms: number): string => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts minutes, hours and days", () => {
    expect(formatRelative(ago(20 * 1000))).toBe("just now");
    expect(formatRelative(ago(5 * MINUTE))).toBe("5m ago");
    expect(formatRelative(ago(3 * HOUR))).toBe("3h ago");
    expect(formatRelative(ago(12 * DAY))).toBe("12d ago");
  });

  it("gives the date after a month", () => {
    expect(formatRelative(ago(40 * DAY))).toBe(
      new Date(NOW.getTime() - 40 * DAY).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    );
  });
});
