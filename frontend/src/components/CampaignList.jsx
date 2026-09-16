import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { campaignApi } from '../services/api';
import {
    Plus,
    Search,
    Loader2,
    MessageSquare,
    Eye,
    MousePointerClick,
    Inbox,
    CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const STATUS_VARIANTS = {
    pending_approval: 'warning',
    completed: 'success',
    rejected: 'destructive',
    monitoring: 'default',
    optimizing: 'default',
};

function campaignMetrics(c) {
    const variants = (c.segments || []).flatMap((s) => s.variants || []);
    const sent = variants.reduce((a, v) => a + (v.sent_count || 0), 0);
    const open = variants.reduce((a, v) => a + (v.open_count || 0), 0);
    const click = variants.reduce((a, v) => a + (v.click_count || 0), 0);
    return {
        sent,
        readRate: sent ? Math.round((open / sent) * 100) : 0,
        clickRate: sent ? Math.round((click / sent) * 100) : 0,
    };
}

function CampaignCardSkeleton() {
    return (
        <Card className="overflow-hidden">
            <CardContent className="p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-11 w-11 rounded-xl" />
                    <Skeleton className="h-5 w-24 rounded-md" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                </div>
                <Separator />
                <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-10" />
                    <Skeleton className="h-4 w-10" />
                </div>
            </CardContent>
        </Card>
    );
}

export default function CampaignList() {
    const [campaigns, setCampaigns] = useState(null);
    const [query, setQuery] = useState('');

    useEffect(() => {
        campaignApi
            .listCampaigns(50)
            .then(setCampaigns)
            .catch(() => setCampaigns([]));
    }, []);

    // Loading state
    if (campaigns === null) {
        return (
            <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
                <header className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-48" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-10 w-36" />
                    </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <CampaignCardSkeleton key={i} />
                    ))}
                </div>
            </div>
        );
    }

    // Empty state (no campaigns at all)
    if (campaigns.length === 0) {
        return (
            <div className="p-6 md:p-8 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center"
                >
                    <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                        <Inbox className="h-9 w-9" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            No campaigns yet
                        </h2>
                        <p className="text-muted-foreground max-w-sm mx-auto">
                            Create your first WhatsApp campaign — describe your goal and Nudge
                            does the rest.
                        </p>
                    </div>
                    <Button asChild size="lg">
                        <Link to="/">
                            <Plus className="h-4 w-4" /> New Campaign
                        </Link>
                    </Button>
                </motion.div>
            </div>
        );
    }

    const filtered = campaigns.filter((c) =>
        (c.brief || '').toLowerCase().includes(query.trim().toLowerCase())
    );

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        Campaigns
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {campaigns.length} total
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative w-64 max-w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search campaigns…"
                            className="pl-9"
                        />
                    </div>
                    <Button asChild>
                        <Link to="/">
                            <Plus className="h-4 w-4" /> New Campaign
                        </Link>
                    </Button>
                </div>
            </header>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                        <Search className="h-6 w-6" />
                    </div>
                    <p className="text-muted-foreground font-medium">
                        No campaigns match “{query}”.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filtered.map((c, i) => {
                        const m = campaignMetrics(c);
                        const status = c.status || 'unknown';
                        return (
                            <motion.div
                                key={c.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                            >
                                <Link to={`/dashboard/${c.id}`} className="group block h-full">
                                    <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5">
                                        <CardContent className="p-6 flex flex-col gap-4 h-full">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                                                    <MessageSquare className="h-5 w-5" />
                                                </div>
                                                <Badge
                                                    variant={STATUS_VARIANTS[status] || 'secondary'}
                                                    className="uppercase tracking-wide text-[10px]"
                                                >
                                                    {status.replace(/_/g, ' ')}
                                                </Badge>
                                            </div>

                                            <p className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">
                                                {c.brief}
                                            </p>

                                            <Separator className="mt-auto" />

                                            <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground tabular-nums">
                                                <span
                                                    className="flex items-center gap-1.5"
                                                    title="Messages sent"
                                                >
                                                    <MessageSquare className="h-3.5 w-3.5" />
                                                    {m.sent}
                                                </span>
                                                <span
                                                    className="flex items-center gap-1.5"
                                                    title="Read rate"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    {m.readRate}%
                                                </span>
                                                <span
                                                    className="flex items-center gap-1.5"
                                                    title="Click rate"
                                                >
                                                    <MousePointerClick className="h-3.5 w-3.5" />
                                                    {m.clickRate}%
                                                </span>
                                                <span className="ml-auto flex items-center gap-1.5 text-muted-foreground/70">
                                                    <CalendarDays className="h-3.5 w-3.5" />
                                                    {c.created_at
                                                        ? new Date(c.created_at).toLocaleDateString()
                                                        : ''}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
