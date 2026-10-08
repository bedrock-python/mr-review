import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { isChunkLoadError } from "@shared/lib";

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: 200,
            gap: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--c-critical)"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-0)", marginBottom: 6 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 12, color: "var(--fg-3)", maxWidth: 360 }}>
              {isChunkError
                ? "Part of the app could not be loaded — it was probably updated. Reload to get the current version."
                : (this.state.error?.message ?? "An unknown error occurred")}
            </div>
          </div>
          {isChunkError ? (
            <button type="button" className="btn" onClick={reloadPage}>
              Reload page
            </button>
          ) : (
            <button type="button" className="btn" onClick={this.handleReset}>
              Try again
            </button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
