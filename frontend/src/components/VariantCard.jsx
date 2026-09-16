import React from 'react';
import { Smile, Link as LinkIcon, AlertTriangle, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

export default function VariantCard({ variant }) {
    const bodyLen = variant.body?.length || 0;
    const isBodyTooLong = bodyLen > 5000;
    const isBodyTooShort = bodyLen < 1;
    const hasIssue = isBodyTooLong || isBodyTooShort;

    return (
        <TooltipProvider delayDuration={150}>
            <Card className="flex h-full flex-col overflow-hidden border-border transition-shadow hover:shadow-md">
                <div className="flex items-start gap-3 border-b border-border bg-muted/40 px-5 py-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MessageSquare className="size-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Message
                        </p>
                        <h4
                            className="line-clamp-2 text-sm font-semibold text-foreground"
                            title={variant.subject}
                        >
                            {variant.subject}
                        </h4>
                    </div>
                </div>

                <div className="custom-scrollbar max-h-64 flex-grow overflow-y-auto whitespace-pre-wrap break-words px-5 py-4 text-sm leading-relaxed text-foreground/90">
                    {variant.body}
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-border bg-muted/40 px-5 py-3">
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex">
                                    <Smile
                                        className={
                                            variant.has_emoji
                                                ? 'size-4 text-emerald-500'
                                                : 'size-4 text-muted-foreground/40'
                                        }
                                    />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {variant.has_emoji ? 'Contains emoji' : 'No emoji'}
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex">
                                    <LinkIcon
                                        className={
                                            variant.has_url
                                                ? 'size-4 text-primary'
                                                : 'size-4 text-muted-foreground/40'
                                        }
                                    />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>
                                {variant.has_url ? 'Contains link' : 'No link'}
                            </TooltipContent>
                        </Tooltip>
                    </div>

                    <Badge
                        variant={hasIssue ? 'destructive' : 'secondary'}
                        className="gap-1 tabular-nums"
                    >
                        {hasIssue && <AlertTriangle className="size-3" />}
                        {bodyLen} chars
                        {isBodyTooLong ? ' · too long' : isBodyTooShort ? ' · empty' : ''}
                    </Badge>
                </div>

                {variant.font_styles &&
                    Object.keys(variant.font_styles).length > 0 && (
                        <>
                            <Separator />
                            <div
                                className="truncate bg-muted/40 px-5 py-2 text-xs text-primary"
                                title={JSON.stringify(variant.font_styles)}
                            >
                                Styles: {JSON.stringify(variant.font_styles)}
                            </div>
                        </>
                    )}
            </Card>
        </TooltipProvider>
    );
}
