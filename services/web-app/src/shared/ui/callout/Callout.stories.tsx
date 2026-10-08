import { FileSearch } from "lucide-react";
import { Button } from "../button";
import { EmptyState, ErrorState } from "../state";
import { Callout } from "./Callout";
import type { CalloutTone } from "./Callout";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Callouts and states",
  parameters: { layout: "padded" },
};

export default meta;

const TONES: CalloutTone[] = ["neutral", "info", "warn", "danger", "success"];

export const Callouts: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gap: 10, width: 520 }}>
      {TONES.map((tone) => (
        <Callout
          key={tone}
          tone={tone}
          title={`A ${tone} callout`}
          actions={
            tone === "danger" ? (
              <>
                <Button size="sm" variant="primary">
                  Retry
                </Button>
                <Button size="sm" variant="ghost">
                  Use Copy &amp; paste
                </Button>
              </>
            ) : undefined
          }
        >
          The body says what happened and what to do about it.
        </Callout>
      ))}
      <Callout tone="warn" size="sm">
        A small one-line warning.
      </Callout>
    </div>
  ),
};

export const States: StoryObj = {
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: 760 }}>
      <div style={{ border: "1px solid var(--border)" }}>
        <EmptyState
          icon={<FileSearch size={18} />}
          title="No comments match"
          description="Try another severity or clear the search."
          actions={<Button size="sm">Clear filters</Button>}
        />
      </div>
      <div style={{ border: "1px solid var(--border)" }}>
        <ErrorState
          title="Could not load merge requests"
          message="GitLab answered 502 Bad Gateway."
          onRetry={() => undefined}
        />
      </div>
      <div style={{ border: "1px solid var(--border)" }}>
        <EmptyState size="sm" title="No repositories" />
      </div>
      <div style={{ border: "1px solid var(--border)" }}>
        <ErrorState size="sm" message="Timed out" onRetry={() => undefined} />
      </div>
    </div>
  ),
};
