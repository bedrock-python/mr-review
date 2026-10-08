import { describe, expect, it } from "vitest";
import { toPlainText } from "./plainText";

describe("toPlainText", () => {
  it("drops code fences and inline code ticks but keeps the code", () => {
    const body = "Drop the token:\n\n```python\nlogger.warning(`x`)\n```\nThen `retry`.";

    expect(toPlainText(body)).toBe("Drop the token: logger.warning(x) Then retry.");
  });

  it("keeps link text, bold text and headings without their marks", () => {
    expect(toPlainText("## Why\n**Major**: see [the docs](https://example.com).")).toBe(
      "Why Major: see the docs."
    );
  });

  it("leaves identifiers with underscores and single stars alone", () => {
    expect(toPlainText("customer_name and EXPORT_DIR; backoff * 2")).toBe(
      "customer_name and EXPORT_DIR; backoff * 2"
    );
  });
});
