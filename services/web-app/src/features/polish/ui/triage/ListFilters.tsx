import { useId } from "react";
import { ListTree, SlidersHorizontal } from "lucide-react";
import {
  Button,
  CountBadge,
  Field,
  ICON_SIZE,
  IconButton,
  Popover,
  SegmentedControl,
  Select,
  Switch,
} from "@shared/ui";
import type { StatusFilter as StatusFilterValue } from "../../lib";

export type FileFilterOption = { value: string; label: string; count: number };

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "kept", label: "Kept" },
  { value: "dismissed", label: "Dismissed" },
];

const ALL_FILES = "";

type StatusFilterProps = {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
  "aria-labelledby"?: string;
};

export const StatusFilter = ({
  value,
  onChange,
  "aria-labelledby": labelledBy,
}: StatusFilterProps): React.ReactElement => (
  <SegmentedControl
    size="sm"
    options={STATUS_OPTIONS}
    value={value}
    onValueChange={onChange}
    {...(labelledBy === undefined
      ? { "aria-label": "Filter by status" }
      : { "aria-labelledby": labelledBy })}
  />
);

type FileFilterProps = {
  value: string | null;
  options: readonly FileFilterOption[];
  onChange: (value: string | null) => void;
  className?: string;
};

export const FileFilter = ({
  value,
  options,
  onChange,
  className,
}: FileFilterProps): React.ReactElement => (
  <Select
    size="sm"
    aria-label="Filter by file"
    value={value ?? ALL_FILES}
    onChange={(event) => {
      onChange(event.target.value === ALL_FILES ? null : event.target.value);
    }}
    {...(className === undefined ? {} : { className })}
  >
    <option value={ALL_FILES}>All files</option>
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label} ({option.count})
      </option>
    ))}
  </Select>
);

type GroupToggleProps = {
  isGrouped: boolean;
  onChange: (isGrouped: boolean) => void;
};

export const GroupToggle = ({ isGrouped, onChange }: GroupToggleProps): React.ReactElement => (
  <IconButton
    size="sm"
    label="Group by file"
    isPressed={isGrouped}
    icon={<ListTree size={ICON_SIZE.inline} aria-hidden="true" />}
    onClick={() => {
      onChange(!isGrouped);
    }}
  />
);

type FiltersPopoverProps = {
  /** The status filter moves in here too when the row is narrow. */
  status: StatusFilterProps | null;
  file: FileFilterProps;
  group: GroupToggleProps;
};

/** File and grouping (and, when narrow, status) behind one button, with a count of what is set. */
export const FiltersPopover = ({
  status,
  file,
  group,
}: FiltersPopoverProps): React.ReactElement => {
  const statusLabelId = useId();
  const activeCount =
    (status !== null && status.value !== "all" ? 1 : 0) +
    (file.value === null ? 0 : 1) +
    (group.isGrouped ? 1 : 0);

  return (
    <Popover
      aria-label="Filters"
      align="start"
      className="w-[280px]"
      trigger={
        <Button
          size="sm"
          icon={<SlidersHorizontal size={ICON_SIZE.inline} aria-hidden="true" />}
          iconRight={
            activeCount > 0 ? (
              <CountBadge
                count={activeCount}
                tone="accent"
                label={`${String(activeCount)} active`}
              />
            ) : undefined
          }
        >
          Filters
        </Button>
      }
    >
      {status !== null && (
        <div className="flex flex-col gap-(--space-2)">
          <span id={statusLabelId} className="ui-eyebrow">
            Status
          </span>
          <StatusFilter
            value={status.value}
            onChange={status.onChange}
            aria-labelledby={statusLabelId}
          />
        </div>
      )}
      <Field label="File">
        <FileFilter value={file.value} options={file.options} onChange={file.onChange} />
      </Field>
      <Switch label="Group by file" checked={group.isGrouped} onCheckedChange={group.onChange} />
    </Popover>
  );
};
