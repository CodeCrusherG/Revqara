import React from 'react';
import { cn } from '@/lib/utils';
import { Check, Clock, AlertTriangle, Loader2 } from 'lucide-react';

export default function TimelineNode({ node, isActive, onClick }) {
    // node structure: { id, label, status: 'pending'|'active'|'success'|'error' }
    const isPending = node.status === 'pending';
    const isActiveStatus = node.status === 'active';
    const isSuccess = node.status === 'success';
    const isError = node.status === 'error';

    return (
        <div
            className={cn(
                'group relative flex flex-col items-center cursor-pointer transition-transform hover:scale-105',
                isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
            )}
            onClick={() => onClick(node)}
        >
            <div
                className={cn(
                    'z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-card transition-colors',
                    isSuccess && 'border-emerald-500 bg-emerald-500/10 text-emerald-500',
                    isError && 'border-destructive bg-destructive/10 text-destructive',
                    isActiveStatus && 'border-primary bg-primary/10 text-primary ring-4 ring-primary/20',
                    isPending && 'border-border text-muted-foreground',
                    isActive && !isActiveStatus && 'ring-2 ring-ring/30'
                )}
            >
                {isSuccess ? (
                    <Check className="h-5 w-5" />
                ) : isError ? (
                    <AlertTriangle className="h-5 w-5" />
                ) : isActiveStatus ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                    <Clock className="h-5 w-5" />
                )}
            </div>
            <div
                className={cn(
                    'mt-2 w-24 text-center text-xs font-semibold tracking-wide',
                    isSuccess && 'text-emerald-600 dark:text-emerald-400',
                    isError && 'text-destructive',
                    isActiveStatus && 'font-bold text-primary',
                    isPending && 'text-muted-foreground'
                )}
            >
                {node.label}
            </div>

            {/* Node selection indicator */}
            {isActive && (
                <div className="absolute -bottom-3 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
        </div>
    );
}
