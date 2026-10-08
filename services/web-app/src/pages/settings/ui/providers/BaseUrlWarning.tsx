import { Callout } from "@shared/ui";

/** Says where a Claude provider's requests really go when that is not Anthropic. */
export const BaseUrlWarning = ({
  message,
}: {
  message: string | null;
}): React.ReactElement | null =>
  message ? (
    <Callout tone="warn" size="sm">
      {message}
    </Callout>
  ) : null;
