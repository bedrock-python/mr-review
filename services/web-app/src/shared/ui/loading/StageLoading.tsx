import { Spinner } from "./Spinner";

export type StageLoadingProps = {
  /** What is loading, as a sentence: "Loading review…". Omit for a bare spinner. */
  label?: string;
};

/** A stage's whole area while its data loads: a spinner and one line, centred. */
export const StageLoading = ({ label }: StageLoadingProps): React.ReactElement => (
  <div className="ui-stage-loading" role="status">
    <Spinner isDecorative />
    {label === undefined ? (
      <span className="ui-visually-hidden">Loading…</span>
    ) : (
      <span>{label}</span>
    )}
  </div>
);
