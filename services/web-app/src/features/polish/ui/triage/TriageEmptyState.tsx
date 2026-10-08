import { SearchX } from "lucide-react";
import { Button, EmptyState, ICON_SIZE } from "@shared/ui";

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
      icon={<SearchX size={ICON_SIZE.state} aria-hidden="true" />}
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
