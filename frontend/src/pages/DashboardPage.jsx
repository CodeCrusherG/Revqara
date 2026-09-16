import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { campaignApi } from '../services/api';
import MetricsChart from '../components/MetricsChart';
import CampaignList from '../components/CampaignList';
import {
    Loader2,
    RefreshCw,
    Activity,
    Database,
    BarChart3,
    Terminal,
    Zap,
    TrendingUp,
    Target,
    Cpu,
    CheckSquare,
    Users,
    Send,
    Eye,
    XCircle,
    MessageSquare,
    UserCheck,
    Wallet
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

const KPICard = ({ icon: Icon, label, value, sub, accent }) => (
    <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between">
                <div
                    className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-xl',
                        accent || 'bg-primary/10 text-primary'
                    )}
                >
                    <Icon className="h-5 w-5" />
                </div>
                {sub && (
                    <span className="text-[11px] font-medium text-muted-foreground">{sub}</span>
                )}
            </div>
            <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </p>
                <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
            </div>
        </CardContent>
    </Card>
);

export default function DashboardPage() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);

    const loadData = async () => {
        if (!id) {
            setLoading(false);
            return;
        }
        try {
            const [campData, metsResponse, analyticsResp] = await Promise.all([
                campaignApi.getCampaignStatus(id),
                campaignApi.getMetrics(id).catch(() => ({ metrics: [] })),
                campaignApi.getAnalytics(id).catch(() => null),
            ]);

            const metricsArray = metsResponse.metrics || [];
            setData(campData);
            setMetrics(metricsArray);
            setAnalytics(analyticsResp);

            if (!selectedNode && campData.agent_logs?.length > 0) {
                setSelectedNode(campData.agent_logs[campData.agent_logs.length - 1]);
            }
        } catch (error) {
            console.error("Dashboard fetch error", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 8000);
        return () => clearInterval(interval);
    }, [id]);

    if (!id) {
        return <CampaignList />;
    }

    if (loading && !data) {
        return (
            <div className="flex h-full flex-col gap-8 p-8">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-10 w-72" />
                    <Skeleton className="h-10 w-40" />
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                </div>
                <div className="grid flex-1 grid-cols-12 gap-6">
                    <Skeleton className="col-span-12 rounded-2xl lg:col-span-8" />
                    <Skeleton className="col-span-12 rounded-2xl lg:col-span-4" />
                </div>
            </div>
        );
    }

    const chartData = (metrics || []).map((v, i) => ({
        name: v.segment_label || `V${i + 1}`,
        openRate: v.open_rate || 0,
        clickRate: v.click_rate || 0,
        weighted: v.weighted_score || 0
    }));

    const totalSent = (metrics || []).reduce((acc, v) => acc + (v.total_sent || 0), 0);
    const avgOpen = metrics?.length ? (metrics.reduce((acc, v) => acc + (v.open_rate || 0), 0) / metrics.length).toFixed(1) : "0.0";
    const avgClick = metrics?.length ? (metrics.reduce((acc, v) => acc + (v.click_rate || 0), 0) / metrics.length).toFixed(1) : "0.0";
    const campaignStatus = data?.status || 'unknown';
    const statusText = campaignStatus.replace('_', ' ');
    const isAwaitingReview = campaignStatus === 'pending_approval';

    const stats = [
        { id: 'reach', label: 'Messages Sent', value: totalSent.toLocaleString(), icon: Target },
        { id: 'open', label: 'Avg Read Rate', value: `${avgOpen}%`, icon: TrendingUp, accent: 'bg-emerald-500/10 text-emerald-500' },
        { id: 'click', label: 'Avg Click Rate', value: `${avgClick}%`, icon: Activity, accent: 'bg-emerald-500/10 text-emerald-500' },
    ];

    const hasAnalytics = analytics && analytics.recipients > 0;
    const analyticsCards = hasAnalytics
        ? [
              { label: 'Recipients', value: (analytics.recipients ?? 0).toLocaleString(), icon: Users, accent: 'bg-primary/10 text-primary' },
              { label: 'Delivered', value: (analytics.delivered ?? 0).toLocaleString(), icon: Send, accent: 'bg-sky-500/10 text-sky-500' },
              { label: 'Read', value: `${(analytics.read ?? 0).toLocaleString()}`, sub: `${analytics.read_rate}%`, icon: Eye, accent: 'bg-primary/10 text-primary' },
              { label: 'Failed', value: (analytics.failed ?? 0).toLocaleString(), icon: XCircle, accent: analytics.failed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground' },
              { label: 'Replies', value: `${(analytics.replies ?? 0).toLocaleString()}`, sub: `${analytics.reply_rate}%`, icon: MessageSquare, accent: 'bg-emerald-500/10 text-emerald-500' },
              { label: 'Leads', value: (analytics.leads ?? 0).toLocaleString(), icon: UserCheck, accent: 'bg-emerald-500/10 text-emerald-500' },
          ]
        : [];

    const nodeLabel = (log, i) => {
        switch (log.agent_name) {
            case 'CustomerProfiler': return 'Insight';
            case 'CampaignPlanner': return 'Strategy';
            case 'ContentGenerator': return 'Creative';
            case 'PerformanceAnalyst': return 'Analytics';
            case 'Optimizer':
            case 'StrategyOptimizer': return 'Growth';
            default: return `Phase ${i + 1}`;
        }
    };

    return (
        <div className="flex h-full flex-col gap-6 p-6 md:p-8">
            {/* Control Bar */}
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-emerald-500">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Live</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                        Campaign{' '}
                        <span className="bg-gradient-to-r from-primary to-emerald-500 bg-clip-text text-transparent">
                            Analytics
                        </span>
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <Badge
                        variant={isAwaitingReview ? 'warning' : 'success'}
                        className="capitalize"
                    >
                        {statusText}
                    </Badge>
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
                        <Database className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono text-xs text-muted-foreground">
                            {id?.substring(0, 8)}
                        </span>
                    </div>
                    <Button variant="outline" size="icon" onClick={loadData} aria-label="Refresh">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </header>

            {isAwaitingReview && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                            <CheckSquare className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                Human review required
                            </p>
                            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                                The next optimization iteration is ready. Approve or reject to continue agentic execution.
                            </p>
                        </div>
                    </div>
                    <Button asChild className="bg-amber-600 text-white hover:bg-amber-700">
                        <Link to={`/approval/${id}`}>Open review</Link>
                    </Button>
                </motion.div>
            )}

            {hasAnalytics && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                        {analyticsCards.map((c) => (
                            <KPICard key={c.label} {...c} />
                        ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5" />
                            Unsubscribes:{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                {analytics.unsubscribes}
                            </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                            <Wallet className="h-3.5 w-3.5" />
                            Est. WhatsApp cost:{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                ₹{analytics.estimated_cost_inr}
                            </span>
                        </span>
                    </div>
                </div>
            )}

            {/* Main Grid */}
            <div className="grid min-h-0 flex-1 grid-cols-12 gap-6">
                {/* Left Side: Stats & Metrics */}
                <div className="col-span-12 flex min-h-0 flex-col gap-6 lg:col-span-8">
                    {/* KPI Ribbon */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {stats.map((s) => (
                            <KPICard key={s.id} {...s} />
                        ))}
                    </div>

                    {/* Chart Center */}
                    <Card className="flex min-h-0 flex-1 flex-col">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <BarChart3 className="h-4.5 w-4.5 text-primary" />
                                Conversion Funnel
                            </CardTitle>
                            <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
                                    Read
                                </span>
                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                                    Click
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="min-h-0 flex-1 pt-4">
                            <MetricsChart data={chartData} />
                        </CardContent>
                    </Card>
                </div>

                {/* Right Side: Reasoning Console */}
                <div className="col-span-12 flex min-h-0 flex-col lg:col-span-4">
                    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-zinc-800 bg-zinc-950 text-zinc-100">
                        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-4">
                            <div className="flex items-center gap-2.5">
                                <Terminal className="h-4.5 w-4.5 text-primary" />
                                <h3 className="text-sm font-semibold tracking-wide">AI Activity</h3>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
                                <Cpu className="h-3 w-3 text-primary" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                    {selectedNode?.agent_name || 'System'}
                                </span>
                            </div>
                        </div>

                        <div className="custom-scrollbar min-h-0 flex-1 space-y-7 overflow-y-auto p-5 font-mono">
                            {selectedNode ? (
                                <motion.div
                                    key={selectedNode.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="space-y-7"
                                >
                                    <div>
                                        <span className="mb-3 block text-[10px] font-bold uppercase tracking-[0.2em] text-primary/90">
                                            Trace Reasoning
                                        </span>
                                        <p className="border-l-2 border-primary/40 pl-4 text-xs italic leading-relaxed text-zinc-400">
                                            {selectedNode.llm_reasoning || '// No cognitive trace found for this vector.'}
                                        </p>
                                    </div>

                                    <div>
                                        <span className="mb-3 block text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/90">
                                            State Modification
                                        </span>
                                        <pre className="custom-scrollbar overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-[10px] leading-relaxed text-zinc-300">
                                            {JSON.stringify(selectedNode.output_payload, null, 2)}
                                        </pre>
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-zinc-600">
                                    <Zap className="h-10 w-10" />
                                    <p className="text-sm font-semibold uppercase tracking-wider">
                                        Awaiting agent I/O
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Node Selector (Mini Timeline) */}
                        {data?.agent_logs?.length > 0 && (
                            <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto border-t border-zinc-800 bg-zinc-900/40 p-3">
                                {data.agent_logs.map((log, i) => (
                                    <button
                                        key={log.id}
                                        onClick={() => setSelectedNode(log)}
                                        className={cn(
                                            'shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all',
                                            selectedNode?.id === log.id
                                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
                                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                                        )}
                                    >
                                        {nodeLabel(log, i)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
