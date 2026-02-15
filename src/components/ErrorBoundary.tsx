/**
 * ErrorBoundary - Catches React errors and displays a fallback UI
 * Prevents the entire app from crashing on component errors
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      copied: false,
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
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, copied: false });
  };

  handleCopy = async (): Promise<void> => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    const debugInfo = `
=== DEViLBOX Critical Error ===
Message: ${error.toString()}
Component Stack: ${errorInfo?.componentStack}
User Agent: ${navigator.userAgent}
Time: ${new Date().toISOString()}
    `.trim();

    try {
      await navigator.clipboard.writeText(debugInfo);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error info:', err);
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-4 select-text">
          <div className="max-w-lg w-full bg-bg-secondary rounded-lg border border-border p-6 text-center select-text">
            <div className="text-6xl mb-4 select-none">💀</div>
            <h1 className="text-2xl font-bold text-text mb-2">
              Something went wrong
            </h1>
            <p className="text-text-secondary mb-4">
              DEViLBOX encountered an unexpected error. Your work may have been auto-saved.
            </p>

            <div className="mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider select-none">Error Details</span>
                <button 
                  onClick={this.handleCopy}
                  className="flex items-center gap-1.5 px-2 py-1 text-[10px] bg-bg-tertiary hover:bg-border rounded transition-colors text-text-secondary select-none"
                >
                  {this.state.copied ? (
                    <>
                      <Check size={12} className="text-green-500" />
                      <span className="text-green-500">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>Copy Info</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 bg-bg rounded text-xs text-red-400 overflow-auto max-h-60 font-mono border border-red-900/30">
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </div>

            <div className="flex gap-3 justify-center select-none">
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

