/**
 * ErrorBoundary - React error boundary for graceful error handling
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Log to external error service in production
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to error tracking service (e.g., Sentry)
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallbackMessage } = this.props;
      const { error, errorInfo } = this.state;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="max-w-md w-full">
            <div className="bg-dark-surface border border-red-500/50 rounded-lg p-6 space-y-4">
              {/* Error Icon */}
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <div>
                  <h3 className="text-lg font-bold text-white">Something went wrong</h3>
                  <p className="text-sm text-text-muted">
                    {fallbackMessage || 'An unexpected error occurred in the drum pad system.'}
                  </p>
                </div>
              </div>

              {/* Error Details (development only) */}
              {process.env.NODE_ENV === 'development' && error && (
                <div className="bg-dark-bg rounded p-3 space-y-2">
                  <div className="text-xs font-mono text-red-400">
                    <strong>Error:</strong> {error.toString()}
                  </div>
                  {errorInfo && (
                    <details className="text-xs font-mono text-text-muted">
                      <summary className="cursor-pointer hover:text-white">
                        Component Stack
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap">
                        {errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white text-sm font-bold rounded transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-white text-sm font-bold rounded transition-colors"
                >
                  Reload Page
                </button>
              </div>

              {/* Help Text */}
              <div className="text-xs text-text-muted">
                If this problem persists, try clearing your browser cache or contact support.
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
