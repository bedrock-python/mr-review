import { Skeleton } from "./Skeleton";
import { Spinner } from "./Spinner";
import { StageLoading } from "./StageLoading";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Loading",
  parameters: { layout: "padded" },
};

export default meta;

export const Spinners: StoryObj = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Spinner size="sm" />
      <Spinner />
      <Spinner size="lg" />
      <Spinner tone="muted" />
      <span style={{ color: "var(--c-critical-fg)" }}>
        <Spinner tone="current" />
      </span>
    </div>
  ),
};

export const Skeletons: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 320 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Skeleton width={20} height={20} radius="circle" />
        <Skeleton width={120} height={12} />
        <Skeleton width={48} height={16} radius="pill" />
      </div>
      <Skeleton width="85%" height={13} />
      <Skeleton width="50%" height={11} />
      <Skeleton height={64} radius="card" />
    </div>
  ),
};

export const Stage: StoryObj = {
  render: () => (
    <div style={{ height: 240, border: "1px solid var(--border)" }}>
      <StageLoading label="Loading review…" />
    </div>
  ),
};
