import { describe, expect, it } from "vitest";
import { ApiError } from "@shared/api";
import { describeLoadError, formatLoadError } from "./describeLoadError";

describe("describeLoadError", () => {
  it("keeps the server's own words", () => {
    expect(describeLoadError(new ApiError("GitLab answered 502", 502), "merge requests")).toEqual({
      title: "Could not load merge requests",
      message: "GitLab answered 502",
    });
  });

  it("names a rejected token, whatever the server said", () => {
    expect(describeLoadError(new ApiError("401 Unauthorized", 401), "repositories").title).toBe(
      "Authentication failed"
    );
    expect(describeLoadError(new ApiError("403", 403), "repositories").message).toBe(
      "The access token cannot read these repositories."
    );
  });

  it("puts both on one line, or the title alone", () => {
    expect(formatLoadError(new ApiError("timeout", 504), "more repositories")).toBe(
      "Could not load more repositories: timeout"
    );
    expect(formatLoadError(null, "more repositories")).toBe("Could not load more repositories");
  });
});
