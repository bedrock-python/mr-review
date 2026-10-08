import { describe, expect, it } from "vitest";
import { truncateMiddle } from "./truncateMiddle";

describe("truncateMiddle", () => {
  it("leaves text that fits alone", () => {
    expect(truncateMiddle("main", 10)).toBe("main");
    expect(truncateMiddle("0123456789", 10)).toBe("0123456789");
  });

  it("cuts the middle out, keeping more of the start", () => {
    const shortened = truncateMiddle("feature/add-invoice-pdf-export-with-retry", 20);

    expect(shortened).toHaveLength(20);
    expect(shortened).toBe("feature/add-…h-retry");
  });
});
