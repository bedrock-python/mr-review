import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "@shared/lib/test-utils";
import { HostsRail } from "./HostsRail";

vi.mock("@app/navigation", () => ({
  useNav: () => ({ selectedHostId: null, setHost: vi.fn() }),
}));

const created: unknown[] = [];
const server = setupServer(
  http.get("*/api/v1/hosts", () => HttpResponse.json([])),
  http.post("*/api/v1/hosts", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    created.push(body);
    return HttpResponse.json(
      {
        ...body,
        id: "00000000-0000-4000-8000-0000000000aa",
        favourite_repos: [],
        created_at: "2026-10-01T00:00:00Z",
      },
      { status: 201 }
    );
  })
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  created.length = 0;
});
afterAll(() => {
  server.close();
});

describe("HostsRail add-host modal", () => {
  it("submits with the default timeout although the form has no timeout field", async () => {
    renderWithQueryClient(
      <MemoryRouter>
        <HostsRail />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: "Add host" }));
    const dialog = screen.getByRole("dialog", { name: "Add host" });
    await userEvent.type(within(dialog).getByLabelText("Name"), "Work GitLab");
    await userEvent.type(within(dialog).getByLabelText("Base URL"), "https://gitlab.work.test");
    await userEvent.type(within(dialog).getByLabelText("Access Token"), "glpat-secret");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add Host" }));

    await waitFor(() => {
      expect(created).toHaveLength(1);
    });
    expect(created[0]).toMatchObject({
      name: "Work GitLab",
      base_url: "https://gitlab.work.test",
      timeout: 30,
    });
  });
});
