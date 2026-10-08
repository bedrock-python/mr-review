import { useId, useState } from "react";
import type { BriefConfig, ExcludedFiles } from "@entities/review";
import { escapeGlob, excludedSummary, useLinesField } from "../lib";
import { CHECKBOX_STYLE, HINT_STYLE } from "./styles";

export type PathFiltersProps = {
  config: BriefConfig;
  excluded: ExcludedFiles | undefined;
  isChecking: boolean;
  onChange: (patch: Partial<BriefConfig>) => void;
};

const LIST_PREVIEW = 8;

export const PathFilters = ({
  config,
  excluded,
  isChecking,
  onChange,
}: PathFiltersProps): React.ReactElement => {
  const id = useId();
  const [showAll, setShowAll] = useState(false);
  const include = useLinesField(config.include_paths, (lines) => {
    onChange({ include_paths: lines });
  });
  const exclude = useLinesField(config.exclude_paths, (lines) => {
    onChange({ exclude_paths: lines });
  });
  const files = excluded?.excluded ?? [];
  const shown = showAll ? files : files.slice(0, LIST_PREVIEW);

  const reviewAnyway = (path: string): void => {
    onChange({ exclude_paths: [...config.exclude_paths, `!/${escapeGlob(path)}`] });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={HINT_STYLE}>
        Glob patterns over changed-file paths, one per line, as in{" "}
        <span className="mono">.gitignore</span>: <span className="mono">*.snap</span> or{" "}
        <span className="mono">docs</span> match at any depth, a directory with everything in it;{" "}
        <span className="mono">src/generated</span> and <span className="mono">src/**/*.py</span>{" "}
        are paths from the root; <span className="mono">\</span> escapes{" "}
        <span className="mono">* ? [</span>. Your patterns are case-sensitive, the built-in defaults
        are not. Excluded files are left out of the diff and of context gathering.
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-include`}>
          Include only
        </label>
        <textarea
          id={`${id}-include`}
          className="field"
          rows={2}
          placeholder="Empty: every changed file"
          value={include.value}
          onChange={include.onChange}
          onBlur={include.onBlur}
          style={{ fontFamily: "var(--font-mono)" }}
        />
      </div>
      <div>
        <label className="field-label" htmlFor={`${id}-exclude`}>
          Exclude
        </label>
        <textarea
          id={`${id}-exclude`}
          className="field"
          rows={2}
          placeholder={"*.snap\n!/go.sum   (a leading ! takes a file back in)"}
          value={exclude.value}
          onChange={exclude.onChange}
          onBlur={exclude.onBlur}
          style={{ fontFamily: "var(--font-mono)" }}
        />
      </div>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={config.use_default_excludes}
          onChange={(event) => {
            onChange({ use_default_excludes: event.target.checked });
          }}
          style={{ ...CHECKBOX_STYLE, marginTop: 3 }}
        />
        <span style={{ fontSize: 12, color: "var(--fg-1)" }}>
          Skip lockfiles, minified bundles, source maps, generated and vendored code, binary assets
        </span>
      </label>
      <div aria-live="polite" style={HINT_STYLE}>
        {isChecking && !excluded ? "Checking which files are excluded…" : null}
        {excluded &&
          files.length === 0 &&
          `All ${String(excluded.total)} changed files are reviewed.`}
      </div>
      {files.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "var(--fg-1)", marginBottom: 6 }}>
            {excludedSummary(excluded)}
          </div>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {shown.map((file) => (
              <li
                key={file.path}
                style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}
              >
                <span
                  className="mono"
                  style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {file.path}
                </span>
                <span className="mono" style={{ color: "var(--fg-3)" }}>
                  {file.reason}
                </span>
                {file.reason.startsWith("(") ? null : (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ padding: "1px 6px", fontSize: 11 }}
                    aria-label={`Review ${file.path} anyway`}
                    onClick={() => {
                      reviewAnyway(file.path);
                    }}
                  >
                    Review anyway
                  </button>
                )}
              </li>
            ))}
          </ul>
          {files.length > LIST_PREVIEW && (
            <button
              type="button"
              className="btn ghost"
              style={{ padding: "2px 6px", fontSize: 11, marginTop: 4 }}
              onClick={() => {
                setShowAll((all) => !all);
              }}
            >
              {showAll ? "Show fewer" : `Show all ${String(files.length)}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
