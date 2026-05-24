import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Captured error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  handleHome = () => {
    this.setState({ error: null, errorInfo: null });
    window.location.href = "/";
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, errorInfo } = this.state;

    return (
      <main
        role="alert"
        className="min-h-screen flex items-center justify-center px-5 py-10"
      >
        <div className="w-full max-w-lg wood-surface border-2 border-destructive/60 rounded-2xl card-shadow p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-destructive/20 border-2 border-destructive flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h1 className="font-display font-bold text-2xl text-gold leading-tight">
                Alguna cosa ha fallat
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                S'ha produït un error inesperat a l'aplicació.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-background/60 border border-destructive/40 p-3 font-mono text-xs text-foreground/90 overflow-auto max-h-40">
            <div className="font-bold text-destructive break-words">
              {error.name}: {error.message}
            </div>
            {error.stack && (
              <pre className="mt-2 whitespace-pre-wrap break-words text-muted-foreground text-[10px] leading-snug">
                {error.stack.split("\n").slice(0, 6).join("\n")}
              </pre>
            )}
          </div>

          {errorInfo?.componentStack && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-display tracking-wide uppercase text-[10px] text-primary/85">
                Pila de components
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-snug max-h-40 overflow-auto">
                {errorInfo.componentStack}
              </pre>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <Button
              onClick={this.handleReset}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-display font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Tornar a intentar
            </Button>
            <Button
              onClick={this.handleHome}
              variant="outline"
              className="flex-1 font-display font-bold"
            >
              <Home className="w-4 h-4 mr-2" />
              Anar a l'inici
            </Button>
            <Button
              onClick={this.handleReload}
              variant="ghost"
              className="font-display font-bold"
            >
              Recarregar
            </Button>
          </div>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;