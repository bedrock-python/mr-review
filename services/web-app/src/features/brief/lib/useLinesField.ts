import { useCallback, useState } from "react";
import { parseLines, sameLines } from "./briefConfig";

export type LinesField = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
};

/**
 * A one-entry-per-line textarea over a list. The text is kept as typed — blank lines and all —
 * so Enter starts a new line; the list it stands for is reported on every change and the text
 * is tidied when the field loses focus.
 */
export const useLinesField = (
  lines: string[],
  onLinesChange: (lines: string[]) => void
): LinesField => {
  const joined = lines.join("\n");
  const [text, setText] = useState(joined);
  const [followed, setFollowed] = useState(joined);

  // Follow a list changed elsewhere (the review loaded, a preset applied) without undoing typing:
  // while the text already stands for the new list, it stays as typed.
  if (joined !== followed) {
    setFollowed(joined);
    if (parseLines(text).join("\n") !== joined) setText(joined);
  }

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
      const next = event.target.value;
      setText(next);
      const parsed = parseLines(next);
      if (!sameLines(parsed, lines)) onLinesChange(parsed);
    },
    [lines, onLinesChange]
  );

  const onBlur = useCallback((): void => {
    setText((current) => parseLines(current).join("\n"));
  }, []);

  return { value: text, onChange, onBlur };
};
