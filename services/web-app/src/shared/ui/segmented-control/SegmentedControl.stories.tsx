import { useState } from "react";
import { ArrowRight, List, MessagesSquare, Pin, Plus } from "lucide-react";
import { Chip } from "../badge";
import { Button } from "../button";
import { SearchField } from "../SearchField";
import { StageFooter } from "../stage-footer";
import { Toolbar, ToolbarDivider, ToolbarSpacer } from "../toolbar";
import { SegmentedControl } from "./SegmentedControl";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta = {
  title: "shared/Toolbar, segmented control, stage footer",
  parameters: { layout: "fullscreen" },
};

export default meta;

type View = "list" | "pinned" | "thread";
type Status = "kept" | "dismissed" | "all";

const Demo = (): React.ReactElement => {
  const [view, setView] = useState<View>("list");
  const [status, setStatus] = useState<Status>("kept");
  const [search, setSearch] = useState("");
  return (
    <div
      style={{ height: 360, display: "flex", flexDirection: "column", background: "var(--bg-0)" }}
    >
      <Toolbar aria-label="Polish view">
        <SegmentedControl<View>
          aria-label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: "list", label: "List", icon: <List size={14} aria-hidden="true" /> },
            { value: "pinned", label: "Pinned", icon: <Pin size={14} aria-hidden="true" /> },
            {
              value: "thread",
              label: "Thread",
              icon: <MessagesSquare size={14} aria-hidden="true" />,
            },
          ]}
        />
        <span style={{ color: "var(--fg-2)", fontSize: 12 }}>9 comments · 9 kept</span>
        <ToolbarSpacer />
        <Button variant="primary" iconRight={<ArrowRight size={14} aria-hidden="true" />}>
          Continue to post
        </Button>
      </Toolbar>
      <Toolbar size="sm" aria-label="Comment filters">
        <div style={{ width: 260 }}>
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search comments"
            ariaLabel="Search comments"
          />
        </div>
        <Chip tone="critical" hasDot count={2} isSelected={false}>
          critical
        </Chip>
        <Chip tone="major" hasDot count={4} isSelected>
          major
        </Chip>
        <ToolbarDivider />
        <SegmentedControl<Status>
          aria-label="Status"
          size="sm"
          value={status}
          onValueChange={setStatus}
          options={[
            { value: "kept", label: "Kept", count: 9 },
            { value: "dismissed", label: "Dismissed", count: 0 },
            { value: "all", label: "All" },
          ]}
        />
        <ToolbarSpacer />
        <Button size="sm" variant="ghost" icon={<Plus size={14} aria-hidden="true" />}>
          New comment
        </Button>
      </Toolbar>
      <div style={{ flex: 1 }} />
      <StageFooter
        summary="Thorough · diff + description · ~1.7k tokens"
        secondaryActions={<Button variant="ghost">Preview prompt</Button>}
        primaryAction={
          <Button
            variant="primary"
            size="lg"
            iconRight={<ArrowRight size={14} aria-hidden="true" />}
          >
            Continue to Dispatch
          </Button>
        }
      />
    </div>
  );
};

export const Composition: StoryObj = {
  render: () => <Demo />,
};
