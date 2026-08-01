import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive backdrop-blur-md">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <h3 className="text-base font-semibold text-destructive">
              {this.props.fallbackTitle || 'Component Failed to Render'}
            </h3>
          </div>
          <p className="text-xs font-mono bg-muted p-3 rounded border border-destructive/10 text-muted-foreground mb-4 overflow-x-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/20 hover:bg-destructive/30 text-destructive transition-colors border border-destructive/30 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Reloading Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
