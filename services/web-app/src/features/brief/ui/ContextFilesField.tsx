import { useId } from "react";
import { useLinesField } from "../lib";
import { HINT_STYLE, SECTION_STYLE, toggleChipStyle } from "./styles";

export type ContextFilesFieldProps = {
  isEnabled: boolean;
  paths: string[];
  onToggle: (isEnabled: boolean) => void;
  onChange: (paths: string[]) => void;
};

export const ContextFilesField = ({
  isEnabled,
  paths,
  onToggle,
  onChange,
}: ContextFilesFieldProps): React.ReactElement => {
  const id = useId();
  const field = useLinesField(paths, onChange);

  return (
    <section style={SECTION_STYLE}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <label className="field-label" htmlFor={`${id}-paths`} style={{ margin: 0 }}>
          Context Files
        </label>
        <button
          type="button"
          aria-pressed={isEnabled}
          aria-label="Include project context files"
          onClick={() => {
            onToggle(!isEnabled);
          }}
          style={toggleChipStyle(isEnabled)}
        >
          {isEnabled ? "On" : "Off"}
        </button>
      </div>
      {isEnabled && (
        <>
          <div id={`${id}-hint`} style={{ ...HINT_STYLE, marginBottom: 8 }}>
            Paths to include as project context, one per line. Leave empty to auto-detect{" "}
            <span className="mono" style={{ fontSize: 10 }}>
              .claude/CLAUDE.md
            </span>
            ,{" "}
            <span className="mono" style={{ fontSize: 10 }}>
              CONTRIBUTING.md
            </span>
            ,{" "}
            <span className="mono" style={{ fontSize: 10 }}>
              README.md
            </span>{" "}
            and more.
          </div>
          <textarea
            id={`${id}-paths`}
            className="field"
            aria-describedby={`${id}-hint`}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={".claude/rules\nCONTRIBUTING.md\ndocs/"}
            rows={3}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </>
      )}
    </section>
  );
};
