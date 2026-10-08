import { ListFilter } from "lucide-react";
import { ICON_SIZE, IconButton, Popover, Radio, RadioGroup } from "@shared/ui";
import { READINESS_OPTIONS } from "../lib/mrListView";
import type { ReadinessFilter as Readiness } from "../lib/mrListView";

const isReadiness = (value: string): value is Readiness =>
  READINESS_OPTIONS.some((option) => option.value === value);

const checkedRadioIn = (panel: HTMLElement): HTMLElement | null =>
  panel.querySelector<HTMLInputElement>("input:checked");

export type ReadinessFilterProps = {
  value: Readiness;
  onValueChange: (value: Readiness) => void;
};

/**
 * The filter menu of the list: drafts only, ready only, or everything. A popover under its
 * button, its checked option focused so the arrow keys work at once; Esc, a press outside it
 * or Tab away closes it. A dot on the button says a filter is on.
 */
export const ReadinessFilter = ({
  value,
  onValueChange,
}: ReadinessFilterProps): React.ReactElement => {
  const isActive = value !== "any";
  const activeLabel = READINESS_OPTIONS.find((option) => option.value === value)?.label;

  return (
    <Popover
      aria-label="Filter merge requests"
      align="end"
      getInitialFocus={checkedRadioIn}
      className="w-max"
      trigger={
        <IconButton
          variant="secondary"
          label="Filter merge requests"
          tooltip={isActive ? `Showing: ${activeLabel ?? ""}` : "Filter merge requests"}
          hasIndicator={isActive}
          icon={<ListFilter size={ICON_SIZE.button} aria-hidden="true" />}
        />
      }
    >
      <RadioGroup
        legend="Show"
        value={value}
        onValueChange={(next) => {
          if (isReadiness(next)) onValueChange(next);
        }}
      >
        {READINESS_OPTIONS.map((option) => (
          <Radio key={option.value} value={option.value} label={option.label} />
        ))}
      </RadioGroup>
    </Popover>
  );
};
