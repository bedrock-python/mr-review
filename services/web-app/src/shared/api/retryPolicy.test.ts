import MockAdapter from "axios-mock-adapter";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError, httpClient } from "./http-client";
import { MAX_QUERY_RETRIES, isRetryableError, shouldRetryQuery } from "./retryPolicy";

describe("isRetryableError", () => {
  it("retries a GET that failed on the server or on the network", () => {
    expect(isRetryableError(new ApiError("bad gateway", 502, "http", "get"))).toBe(true);
    expect(isRetryableError(new ApiError("offline", 0, "network", "get"))).toBe(true);
  });

  it("does not retry a timeout: the server is still doing the first request's work", () => {
    expect(isRetryableError(new ApiError("timeout", 0, "timeout", "get"))).toBe(false);
  });

  it("does not retry a POST read as a query, whatever the failure", () => {
    expect(isRetryableError(new ApiError("timeout", 0, "timeout", "post"))).toBe(false);
    expect(isRetryableError(new ApiError("bad gateway", 502, "http", "post"))).toBe(false);
  });

  it("does not retry answers that cannot change", () => {
    expect(isRetryableError(new ApiError("not found", 404, "http", "get"))).toBe(false);
    expect(isRetryableError(z.string().safeParse(1).error)).toBe(false);
  });

  it("stops after the retry budget", () => {
    const error = new ApiError("bad gateway", 502, "http", "get");

    expect(shouldRetryQuery(MAX_QUERY_RETRIES - 1, error)).toBe(true);
    expect(shouldRetryQuery(MAX_QUERY_RETRIES, error)).toBe(false);
  });
});

describe("httpClient error mapping", () => {
  const mock = new MockAdapter(httpClient);

  afterEach(() => {
    mock.reset();
  });

  it("tells a timeout from a network failure and keeps the method", async () => {
    mock.onPost("/api/v1/reviews/r1/prompt").timeout();
    mock.onGet("/api/v1/hosts").networkError();

    const timeout = await httpClient.post("/api/v1/reviews/r1/prompt").catch((e: unknown) => e);
    const network = await httpClient.get("/api/v1/hosts").catch((e: unknown) => e);

    expect(timeout).toMatchObject({ kind: "timeout", method: "post", status: 0 });
    expect(network).toMatchObject({ kind: "network", method: "get", status: 0 });
    expect(isRetryableError(timeout)).toBe(false);
  });

  it("keeps the server's detail and status for an HTTP error", async () => {
    mock.onGet("/api/v1/reviews/missing").reply(404, { detail: "Review missing not found" });

    const error = await httpClient.get("/api/v1/reviews/missing").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: "http", status: 404, message: "Review missing not found" });
  });
});
