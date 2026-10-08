import { Combobox } from "@shared/ui";

export type ModelPickerProps = {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  isDisabled: boolean;
};

/**
 * One of the provider's models, or any other id typed in: the shared editable Combobox, mono,
 * with "Use “…”" for an id the provider does not list. Use inside a Field, which names it.
 */
export const ModelPicker = ({
  models,
  value,
  onChange,
  isDisabled,
}: ModelPickerProps): React.ReactElement => (
  <Combobox
    options={models}
    value={value}
    onValueChange={onChange}
    allowsCustomValue
    listLabel="Models"
    emptyMessage="No models configured — type a model id"
    placeholder="Search or type a model id…"
    isMono
    isDisabled={isDisabled}
    data-testid="selected-model"
  />
);
