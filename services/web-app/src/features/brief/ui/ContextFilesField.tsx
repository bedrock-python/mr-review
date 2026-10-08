import { Field, Textarea } from "@shared/ui";
import { useLinesField } from "../lib";

const PATH_ROWS = 3;

const Mono = ({ children }: { children: string }): React.ReactElement => (
  <code className="font-mono">{children}</code>
);

export type ContextFilesFieldProps = {
  paths: string[];
  onChange: (paths: string[]) => void;
};

/** The project context files to read, one path per line; empty auto-detects the usual ones. */
export const ContextFilesField = ({
  paths,
  onChange,
}: ContextFilesFieldProps): React.ReactElement => {
  const field = useLinesField(paths, onChange);

  return (
    <Field
      label="Context file paths"
      hint={
        <>
          One per line. Empty: auto-detect <Mono>.claude/CLAUDE.md</Mono>,{" "}
          <Mono>CONTRIBUTING.md</Mono>, <Mono>README.md</Mono> and more.
        </>
      }
    >
      <Textarea
        isMono
        spellCheck={false}
        rows={PATH_ROWS}
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        placeholder={"e.g. .claude/rules\nCONTRIBUTING.md\ndocs/"}
      />
    </Field>
  );
};
