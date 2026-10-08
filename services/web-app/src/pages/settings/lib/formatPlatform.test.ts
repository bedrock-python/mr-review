import { describe, expect, it } from "vitest";
import { formatPlatform } from "./formatPlatform";

describe("formatPlatform", () => {
  it("names macOS once, not 'Darwin Darwin'", () => {
    expect(
      formatPlatform("Darwin", "Darwin Kernel Version 25.0.0: Mon Aug 25 21:17:51 PDT 2026")
    ).toBe("macOS");
  });

  it("keeps a Windows build number", () => {
    expect(formatPlatform("Windows", "10.0.22631")).toBe("Windows 10.0.22631");
  });

  it("drops a Linux kernel banner", () => {
    expect(formatPlatform("Linux", "#1 SMP PREEMPT_DYNAMIC Thu Sep 4 10:00:00 UTC 2026")).toBe(
      "Linux"
    );
  });
});
