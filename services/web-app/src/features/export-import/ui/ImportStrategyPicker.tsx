import { Radio, RadioGroup } from "@shared/ui";

import { MERGE_STRATEGIES, STRATEGY_DESCRIPTIONS, STRATEGY_LABELS } from "../lib/importSummary";
import type { MergeStrategy } from "@shared/api/export-import.api";

type ImportStrategyPickerProps = {
  value: MergeStrategy;
  isDisabled: boolean;
  onChange: (strategy: MergeStrategy) => void;
};

const isMergeStrategy = (value: string): value is MergeStrategy =>
  MERGE_STRATEGIES.some((strategy) => strategy === value);

export const ImportStrategyPicker = ({
  value,
  isDisabled,
  onChange,
}: ImportStrategyPickerProps): React.ReactElement => (
  <RadioGroup
    legend="Records that already exist here"
    name="import-strategy"
    value={value}
    isDisabled={isDisabled}
    onValueChange={(next) => {
      if (isMergeStrategy(next)) onChange(next);
    }}
  >
    {MERGE_STRATEGIES.map((strategy) => (
      <Radio
        key={strategy}
        value={strategy}
        label={STRATEGY_LABELS[strategy]}
        description={STRATEGY_DESCRIPTIONS[strategy]}
      />
    ))}
  </RadioGroup>
);
