import { SearchX } from "lucide-react";
import { Button, EmptyState } from "@shared/ui";

/** The size EmptyState draws its own md icon at. */
const STATE_ICON_PX = 18;

type TriageEmptyStateProps = {
  hasComments: boolean;
  onClearFilters: () => void;
};

export const TriageEmptyState = ({
  hasComments,
  onClearFilters,
}: TriageEmptyStateProps): React.ReactElement =>
  hasComments ? (
    <EmptyState
      isFill
      icon={<SearchX size={STATE_ICON_PX} aria-hidden="true" />}
      title="No comments match these filters"
      description="Try another search or severity, or show every comment again."
      actions={
        <Button size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      isFill
      title="No comments yet"
      description="Write one with New comment, or press n."
    />
  );
