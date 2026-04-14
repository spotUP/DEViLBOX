import React from 'react';

interface Props {
  children: React.ReactNode;
  viewName: string; // "DJ" or "VJ"
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryKey: number;
}

export class DJErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`[${this.props.viewName}] Crash caught:`, error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState(prev => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }));
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', background: '#1a1a1a', color: '#fff', fontFamily: 'monospace', gap: 16,
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold' }}>
            {this.props.viewName} View Crashed
          </div>
          <div style={{ fontSize: 12, color: '#888', maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message ?? 'Unknown error'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={this.handleRetry} style={{
              padding: '8px 20px', background: '#2a6', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontSize: 14,
            }}>
              Retry
            </button>
            <button onClick={this.handleReload} style={{
              padding: '8px 20px', background: '#444', color: '#fff', border: 'none',
              borderRadius: 4, cursor: 'pointer', fontSize: 14,
            }}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}
