import { describe, expect, it } from "vitest";

import { ApiError } from "@shared/api";
import { formatImportError } from "./formatImportError";

const problem = (loc: (string | number)[], msg: string): Record<string, unknown> => ({
  type: "value_error",
  loc,
  msg,
});

describe("formatImportError", () => {
  it("passes a server message through", () => {
    const error = new ApiError("Wrong passphrase: it does not decrypt this file.", 400);

    expect(formatImportError(error)).toBe("Wrong passphrase: it does not decrypt this file.");
  });

  it("turns validation details into one readable sentence", () => {
    const details = [
      problem(["body", "hosts", 0, "type"], "Input should be 'gitlab'"),
      problem(["body", "hosts", 0, "created_at"], "Field required"),
    ];
    const error = new ApiError(JSON.stringify(details), 422);

    expect(formatImportError(error)).toBe(
      "This file is not a valid mr-review export " +
        "(hosts.0.type: Input should be 'gitlab'; hosts.0.created_at: Field required)."
    );
  });

  it("lists at most three problems", () => {
    const details = Array.from({ length: 5 }, (_, i) => problem(["body", "reviews", i], "bad"));

    expect(formatImportError(new ApiError(JSON.stringify(details), 422))).toMatch(
      /reviews\.2: bad; and 2 more\)\.$/
    );
  });

  it("explains an unreachable server", () => {
    expect(formatImportError(new ApiError("Network Error", 0))).toMatch(/could not be reached/);
  });
});
