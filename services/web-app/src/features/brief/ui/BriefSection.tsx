import { useId } from "react";
import { SectionHeader } from "@shared/ui";

export type BriefSectionProps = {
  title: string;
  description?: React.ReactNode;
  /** Small buttons at the right end of the title row. */
  actions?: React.ReactNode;
  /** h2 for a top-level part of the brief, h3 inside Advanced. */
  as?: "h2" | "h3";
  children: React.ReactNode;
};

/** One part of the brief: an eyebrow title, an optional line under it, then its controls. */
export const BriefSection = ({
  title,
  description,
  actions,
  as = "h2",
  children,
}: BriefSectionProps): React.ReactElement => {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`}>
      <SectionHeader
        as={as}
        id={`${id}-title`}
        title={title}
        {...(description === undefined ? {} : { description })}
        {...(actions === undefined ? {} : { actions })}
      />
      <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
    </section>
  );
};
