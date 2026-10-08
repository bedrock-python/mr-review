import { describe, expect, it } from "vitest";
import { mrStateStatus, pipelineStatus } from "./mrStatus";

describe("mrStateStatus", () => {
  it("is neutral while open, success once merged, danger once closed", () => {
    expect(mrStateStatus("opened")).toMatchObject({ status: "neutral", label: "Opened" });
    expect(mrStateStatus("merged")).toMatchObject({ status: "success", label: "Merged" });
    expect(mrStateStatus("closed")).toMatchObject({ status: "danger", label: "Closed" });
  });
});

describe("pipelineStatus", () => {
  it("maps passed, failed and a live running pipeline; none is nothing", () => {
    expect(pipelineStatus("passed")).toMatchObject({ status: "success", isLive: false });
    expect(pipelineStatus("failed")).toMatchObject({ status: "danger", label: "Failed" });
    expect(pipelineStatus("running")).toEqual({
      status: "active",
      label: "Running",
      description: "Pipeline running",
      isLive: true,
    });
    expect(pipelineStatus("none")).toBeNull();
    expect(pipelineStatus(null)).toBeNull();
  });
});
