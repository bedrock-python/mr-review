import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";
import type { Severity } from "./Badge";

describe("Badge", () => {
  const severities: Severity[] = ["critical", "major", "minor", "suggestion"];

  it.each(severities)("renders %s severity label", (severity) => {
    render(<Badge severity={severity} />);
    expect(screen.getByText(severity.toUpperCase())).toBeInTheDocument();
  });

  it("applies additional className", () => {
    render(<Badge severity="critical" className="test-class" />);
    expect(screen.getByText("CRITICAL")).toHaveClass("test-class");
  });
});
