import { useMemo } from "react";
import { cn } from "@shared/lib";
import { getDiffSnippet } from "../../lib";
import { useTriageContext } from "./triageContext";
import type { DiffRow } from "../../lib";

type CodeContextProps = {
  file: string;
  line: number;
};

const ROW_CLASS: Record<DiffRow["kind"], string> = {
  added: "bg-[var(--diff-add-bg)] text-diff-add-fg",
  removed: "bg-[var(--diff-del-bg)] text-diff-del-fg",
  context: "text-fg-1",
  hunk: "text-fg-2",
};

const SIGN: Record<DiffRow["kind"], string> = { added: "+", removed: "−", context: " ", hunk: " " };

export const CodeContext = ({ file, line }: CodeContextProps): React.ReactElement => {
  const { diffIndex, isDiffLoading } = useTriageContext();
  const snippet = useMemo(
    () => (diffIndex === null ? null : getDiffSnippet(diffIndex, file, line)),
    [diffIndex, file, line]
  );

  if (snippet === null) {
    return (
      <div className="text-fg-2 px-2.5 py-2 font-mono text-[11px]" role="status">
        {isDiffLoading
          ? "Loading code…"
          : `Line ${String(line)} of ${file} is not shown in the diff.`}
      </div>
    );
  }

  return (
    <table
      className="w-full table-fixed border-collapse font-mono text-[11px] leading-[18px]"
      aria-label={`Code around ${file}:${String(line)}`}
    >
      <colgroup>
        <col style={{ width: 40 }} />
        <col style={{ width: 40 }} />
        <col style={{ width: 14 }} />
        <col />
      </colgroup>
      <tbody>
        {snippet.rows.map((row, index) => {
          const isTarget = index === snippet.targetIndex;
          return (
            <tr
              key={`${String(row.oldLine)}:${String(row.newLine)}:${row.kind}`}
              aria-current={isTarget ? "true" : undefined}
              className={cn(ROW_CLASS[row.kind], isTarget && "diff-row-highlight")}
            >
              <td className="text-fg-2 px-1.5 text-right select-none">{row.oldLine ?? ""}</td>
              <td className="text-fg-2 px-1.5 text-right select-none">{row.newLine ?? ""}</td>
              <td className="text-center select-none" aria-hidden="true">
                {SIGN[row.kind]}
              </td>
              <td className="pr-2 break-all whitespace-pre-wrap">{row.content}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
