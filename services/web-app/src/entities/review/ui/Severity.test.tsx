import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { countSeverities } from "../lib";
import { SeverityBadge } from "./SeverityBadge";
import { SeverityCounts } from "./SeverityCounts";

describe("SeverityBadge", () => {
  it("names the severity in its tone", () => {
    render(<SeverityBadge severity="suggestion" />);

    const badge = screen.getByText("suggestion");
    expect(badge).toHaveAttribute("data-tone", "suggestion");
    expect(badge).toHaveClass("ui-badge");
  });
});

describe("SeverityCounts", () => {
  it("reads as a sentence, most severe first, zeros skipped", () => {
    const { container } = render(
      <SeverityCounts counts={{ minor: 1, critical: 2, major: 0 }} isCompact />
    );

    expect(container.querySelector(".ui-visually-hidden")).toHaveTextContent("2 critical, 1 minor");
    expect(container.querySelectorAll(".ui-severity-counts__item")).toHaveLength(2);
  });

  it("says when there is nothing to count", () => {
    const { container } = render(<SeverityCounts counts={{}} />);

    expect(container.querySelector(".ui-visually-hidden")).toHaveTextContent("No comments");
  });

  it("shows zeros when asked", () => {
    const { container } = render(<SeverityCounts counts={{ major: 1 }} shouldShowZero />);

    expect(container.querySelectorAll(".ui-severity-counts__item")).toHaveLength(4);
  });
});

describe("countSeverities", () => {
  it("counts every severity, zeros included", () => {
    expect(
      countSeverities([{ severity: "major" }, { severity: "major" }, { severity: "critical" }])
    ).toEqual({ critical: 1, major: 2, minor: 0, suggestion: 0 });
  });
});
