import React from 'react';
import { Loader2, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function AgentStatusBadge({ label, status }) {
    // status can be 'waiting', 'active', 'completed'
    return (
        <div
            className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300',
                status === 'active' && 'border-primary/30 bg-primary/10 text-primary shadow-sm',
                status === 'completed' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                status === 'waiting' && 'border-border bg-card text-muted-foreground'
            )}
        >
            {status === 'active' && <Loader2 className="h-5 w-5 animate-spin" />}
            {status === 'completed' && <CheckCircle2 className="h-5 w-5" />}
            {status === 'waiting' && <Circle className="h-5 w-5" />}
            <span className="text-sm font-medium">{label}</span>
        </div>
    );
}
