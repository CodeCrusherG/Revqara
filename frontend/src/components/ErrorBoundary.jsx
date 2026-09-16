import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * App-wide error boundary — a render error in any page shows a graceful,
 * recoverable fallback instead of white-screening the whole SaaS.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        // Keep a console trace for debugging; never crash the shell.
        console.error('UI error boundary caught:', error, info);
    }

    reset = () => this.setState({ error: null });

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-6">
                <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-xl">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                        <AlertTriangle className="h-7 w-7" />
                    </div>
                    <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        This view hit an unexpected error. Your data is safe — try reloading it.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <Button onClick={this.reset} variant="outline" className="gap-2">
                            <RotateCcw className="h-4 w-4" /> Try again
                        </Button>
                        <Button onClick={() => (window.location.href = '/')}>Go home</Button>
                    </div>
                </div>
            </div>
        );
    }
}
