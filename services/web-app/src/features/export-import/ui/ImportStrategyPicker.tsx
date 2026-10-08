import { MERGE_STRATEGIES, STRATEGY_DESCRIPTIONS, STRATEGY_LABELS } from "../lib/importSummary";
import { choiceStyle, hintStyle, labelStyle } from "./styles";
import type { MergeStrategy } from "@shared/api/export-import.api";

type ImportStrategyPickerProps = {
  value: MergeStrategy;
  isDisabled: boolean;
  onChange: (strategy: MergeStrategy) => void;
};

export const ImportStrategyPicker = ({
  value,
  isDisabled,
  onChange,
}: ImportStrategyPickerProps): React.ReactElement => (
  <fieldset style={{ border: "none", padding: 0, margin: "0 0 12px" }} disabled={isDisabled}>
    <legend style={labelStyle}>Records that already exist here</legend>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {MERGE_STRATEGIES.map((strategy) => (
        <label key={strategy} style={choiceStyle}>
          <input
            type="radio"
            name="import-strategy"
            checked={value === strategy}
            onChange={() => {
              onChange(strategy);
            }}
          />
          <span>
            {STRATEGY_LABELS[strategy]}
            <span style={{ ...hintStyle, display: "block" }}>
              {STRATEGY_DESCRIPTIONS[strategy]}
            </span>
          </span>
        </label>
      ))}
    </div>
  </fieldset>
);
