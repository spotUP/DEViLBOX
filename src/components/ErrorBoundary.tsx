/**
 * ErrorBoundary - Catches React errors and displays a fallback UI
 * Prevents the entire app from crashing on component errors
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    // In production, you could send this to an error reporting service
    // Example: errorReportingService.log({ error, errorInfo });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-bg-secondary rounded-lg border border-border p-6 text-center">
            <div className="text-6xl mb-4">💀</div>
            <h1 className="text-2xl font-bold text-text mb-2">
              Something went wrong
            </h1>
            <p className="text-text-secondary mb-4">
              DEViLBOX encountered an unexpected error. Your work may have been auto-saved.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-accent hover:text-accent-hover text-sm">
                  Error Details (dev only)
                </summary>
                <pre className="mt-2 p-2 bg-bg rounded text-xs text-text-muted overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-bg-tertiary hover:bg-border rounded text-text transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-accent hover:bg-accent-hover rounded text-white transition-colors"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
