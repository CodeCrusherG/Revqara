import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { billingApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { CreditCard, Check, Loader2, Zap, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function UsageBar({ label, used, limit }) {
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const danger = pct > 90;
    return (
        <div className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-muted-foreground tabular-nums">
                    {used.toLocaleString()} / {limit.toLocaleString()}
                </span>
            </div>
            <Progress
                value={pct}
                indicatorClassName={danger ? 'bg-destructive' : 'bg-primary'}
            />
            <p className={cn('text-xs tabular-nums', danger ? 'text-destructive' : 'text-muted-foreground')}>
                {pct}% used{danger ? ' — approaching your limit' : ''}
            </p>
        </div>
    );
}

export default function BillingPage() {
    const { workspace, refreshWorkspace } = useAuth();
    const [plans, setPlans] = useState([]);
    const [usage, setUsage] = useState(null);
    const [busy, setBusy] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const [p, u] = await Promise.all([billingApi.plans(), billingApi.usage()]);
            setPlans(p.plans);
            setUsage(u);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const current = usage?.plan || workspace?.plan || 'free';

    const choose = async (planId) => {
        setBusy(planId);
        try {
            if (planId === 'free') await billingApi.cancel();
            else await billingApi.checkout(planId);
            const u = await billingApi.usage();
            setUsage(u);
            if (refreshWorkspace && workspace) refreshWorkspace({ ...workspace, plan: u.plan });
            toast.success(planId === 'free' ? 'Downgraded to Free.' : `You're now on ${planId === 'pro' ? 'Pro' : 'a new'} plan.`);
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not change plan.');
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
            <motion.header
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                            Plan &amp; Billing
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            You&apos;re on the{' '}
                            <span className="font-semibold text-primary">{usage?.plan_name || 'Free'}</span> plan.
                        </p>
                    </div>
                </div>
            </motion.header>

            {/* Usage */}
            {loading ? (
                <Card>
                    <CardHeader>
                        <Skeleton className="h-4 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </CardContent>
                </Card>
            ) : usage ? (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: 0.05 }}
                >
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                                Current usage
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <UsageBar label="Contacts" used={usage.contacts.used} limit={usage.contacts.limit} />
                            <Separator />
                            <UsageBar label="WhatsApp sends today" used={usage.sends_today.used} limit={usage.sends_today.limit} />
                        </CardContent>
                    </Card>
                </motion.div>
            ) : null}

            {/* Plans */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {loading
                    ? [0, 1].map((i) => (
                        <Card key={i}>
                            <CardContent className="p-8 space-y-4">
                                <Skeleton className="h-6 w-24" />
                                <Skeleton className="h-10 w-32" />
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-11 w-full mt-4" />
                            </CardContent>
                        </Card>
                    ))
                    : plans.map((p, idx) => {
                        const isCurrent = p.id === current;
                        const isPro = p.id === 'pro';
                        return (
                            <motion.div
                                key={p.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25, delay: 0.1 + idx * 0.05 }}
                            >
                                <Card
                                    className={cn(
                                        'relative flex h-full flex-col overflow-hidden transition-colors',
                                        isCurrent ? 'border-primary ring-1 ring-primary/30 bg-primary/[0.03]' : 'hover:border-foreground/20'
                                    )}
                                >
                                    {isPro && (
                                        <div className="absolute right-0 top-0 h-24 w-24 bg-gradient-to-br from-primary/15 to-transparent blur-2xl" />
                                    )}
                                    <CardContent className="flex h-full flex-col p-8">
                                        <div className="flex items-center justify-between">
                                            <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                                {isPro && <Zap className="h-4 w-4 fill-primary text-primary" />}
                                                {p.name}
                                            </h3>
                                            {isCurrent && <Badge>Current</Badge>}
                                            {!isCurrent && isPro && (
                                                <Badge variant="secondary" className="gap-1">
                                                    <Sparkles className="h-3 w-3" /> Popular
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="my-5 flex items-baseline gap-1">
                                            <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                                                ${p.price_usd}
                                            </span>
                                            <span className="text-sm font-medium text-muted-foreground">/mo</span>
                                        </div>

                                        <ul className="flex-1 space-y-3">
                                            {p.features.map((f) => (
                                                <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                        <Check className="h-3 w-3" />
                                                    </span>
                                                    <span>{f}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <Button
                                            onClick={() => choose(p.id)}
                                            disabled={isCurrent || busy === p.id}
                                            variant={isCurrent ? 'secondary' : 'default'}
                                            className="mt-7 w-full"
                                        >
                                            {busy === p.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            {isCurrent
                                                ? 'Your plan'
                                                : p.id === 'free'
                                                    ? 'Downgrade to Free'
                                                    : `Upgrade to ${p.name}`}
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
            </div>

            <p className="text-center text-xs text-muted-foreground">
                Checkout is simulated in this demo — upgrading switches your plan instantly with no charge.
            </p>
        </div>
    );
}
