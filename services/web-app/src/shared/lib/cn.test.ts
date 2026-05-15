import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("filters falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    const flag = (v: boolean) => v;
    expect(cn("base", flag(true) && "active")).toBe("base active");
    expect(cn("base", flag(false) && "active")).toBe("base");
  });
});
