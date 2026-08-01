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
        <div className="p-6 m-4 rounded-xl border border-red-500/20 bg-red-950/10 text-red-200 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <h3 className="text-base font-semibold text-red-300">
              {this.props.fallbackTitle || 'Component Failed to Render'}
            </h3>
          </div>
          <p className="text-xs font-mono bg-black/40 p-3 rounded border border-red-500/10 text-red-300/80 mb-4 overflow-x-auto">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 hover:bg-red-500/30 text-red-200 transition-colors border border-red-500/30 cursor-pointer"
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
