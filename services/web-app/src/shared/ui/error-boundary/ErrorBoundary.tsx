import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { isChunkLoadError } from "@shared/lib";
import { ErrorState } from "../state";

export type ErrorFallbackProps = {
  error: Error;
  /** Renders the children again. */
  reset: () => void;
};

export type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: ReactNode;
  /** Takes precedence over `fallback`. */
  fallbackRender?: (props: ErrorFallbackProps) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

const reloadPage = (): void => {
  window.location.reload();
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallbackRender && this.state.error) {
        return this.props.fallbackRender({ error: this.state.error, reset: this.handleReset });
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      // A chunk that failed to load stays failed (React caches the import): only a reload,
      // which fetches the current build, gets past it.
      const isChunkError = isChunkLoadError(this.state.error);

      return (
        <ErrorState
          isFill
          title="Something went wrong"
          message={
            isChunkError
              ? "Part of the app could not be loaded — it was probably updated. Reload to get the current version."
              : (this.state.error?.message ?? "An unknown error occurred")
          }
          onRetry={isChunkError ? reloadPage : this.handleReset}
          retryLabel={isChunkError ? "Reload page" : "Try again"}
        />
      );
    }

    return this.props.children;
  }
}
