import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxMRListItem } from "./InboxMRListItem";
import { MRListItem } from "./MRListItem";
import type { InboxMR, MR } from "@entities/mr";

const makeMR = (overrides: Partial<MR> = {}): MR => ({
  iid: 42,
  title: "feat: paginate lists",
  description: "",
  author: "alice",
  source_branch: "feat/paginate",
  target_branch: "main",
  status: "opened",
  draft: false,
  pipeline: "passed",
  additions: 12,
  deletions: 3,
  file_count: 4,
  web_url: "",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
  ...overrides,
});

const makeInboxMR = (overrides: Partial<InboxMR> = {}): InboxMR => ({
  ...makeMR(),
  repo_path: "group/sub/service",
  ...overrides,
});

describe("MRListItem", () => {
  it("shows diff stats and the branch range when the host reported them", () => {
    render(<MRListItem mr={makeMR()} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByText("+12")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAttribute("title", "feat/paginate → main");
  });

  it("hides unknown stats instead of rendering zeros", () => {
    render(
      <MRListItem
        mr={makeMR({ additions: null, deletions: null, file_count: null })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d/)).not.toBeInTheDocument();
  });

  it("does not invent a review state the list endpoint does not provide", () => {
    render(<MRListItem mr={makeMR()} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.queryByText(/drafted/i)).not.toBeInTheDocument();
  });

  it("passes the MR to onSelect", async () => {
    const onSelect = vi.fn();
    const mr = makeMR();
    render(<MRListItem mr={mr} isSelected onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { pressed: true }));

    expect(onSelect).toHaveBeenCalledWith(mr);
  });
});

describe("InboxMRListItem", () => {
  it("renders search results without branches or stats gracefully", () => {
    render(
      <InboxMRListItem
        mr={makeInboxMR({
          source_branch: "",
          target_branch: "",
          additions: null,
          deletions: null,
        })}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );

    expect(screen.getByText("service")).toHaveAttribute("title", "group/sub/service");
    expect(screen.getByText("feat: paginate lists")).toBeInTheDocument();
    expect(screen.getByRole("button")).not.toHaveAttribute("title");
    expect(screen.queryByText("→", { exact: false })).not.toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("is memoized: identical props do not re-render", () => {
    const onSelect = vi.fn();
    const mr = makeInboxMR();
    const { rerender } = render(<InboxMRListItem mr={mr} isSelected={false} onSelect={onSelect} />);
    const before = screen.getByRole("button");

    rerender(<InboxMRListItem mr={mr} isSelected={false} onSelect={onSelect} />);

    expect(screen.getByRole("button")).toBe(before);
    expect(InboxMRListItem).toHaveProperty("$$typeof", Symbol.for("react.memo"));
  });
});
