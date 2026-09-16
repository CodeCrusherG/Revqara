import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { campaignApi } from '../services/api';
import {
    Loader2,
    CheckCircle2,
    AlertTriangle,
    Clock,
    Target,
    Send,
    Sparkles,
    Users as UsersIcon,
    Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import VariantCard from '../components/VariantCard';
import AIPredictionCard from '../components/AIPredictionCard';

function StatTile({ icon: Icon, label, value, accent }) {
    return (
        <Card className={accent ? 'border-primary/20 bg-primary/5' : ''}>
            <CardContent className="flex items-center gap-3 p-4">
                <span
                    className={
                        accent
                            ? 'flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary'
                            : 'flex size-10 items-center justify-center rounded-xl bg-muted text-foreground'
                    }
                >
                    <Icon className="size-5" />
                </span>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {label}
                    </p>
                    <p className="text-xl font-bold tabular-nums text-foreground">
                        {value}
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

export default function ApprovalPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [feedback, setFeedback] = useState('');

    useEffect(() => {
        async function loadData() {
            try {
                const data = await campaignApi.getCampaignStatus(id);
                if (data.status !== 'pending_approval') {
                    navigate(`/dashboard/${id}`);
                    return;
                }
                setSessionData(data);
            } catch (error) {
                console.error('Failed to load campaign status', error);
                toast.error('Failed to load campaign.');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [id, navigate]);

    const handleApprove = async () => {
        setActionLoading(true);
        try {
            await campaignApi.approveCampaign(id);
            toast.success('Campaign approved. Deploying now.');
            navigate(`/dashboard/${id}`);
        } catch (error) {
            console.error('Approval failed', error);
            toast.error('Failed to approve campaign.');
            setActionLoading(false);
        }
    };

    const handleReject = async () => {
        setActionLoading(true);
        try {
            await campaignApi.rejectCampaign(id, feedback);
            toast.success('Revision requested. The planner will regenerate.');
            navigate(`/`);
        } catch (error) {
            console.error('Rejection failed', error);
            toast.error('Failed to reject campaign.');
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="mx-auto max-w-[90rem] space-y-8 p-8">
                <div className="space-y-3">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-10 w-96" />
                    <Skeleton className="h-4 w-72" />
                </div>
                <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                    {[0, 1].map((i) => (
                        <Skeleton key={i} className="h-80 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    if (!sessionData) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertTriangle className="size-8 text-destructive" />
                <p className="font-semibold text-foreground">Session Integrity Error.</p>
                <p className="text-sm text-muted-foreground">
                    We could not load this campaign for review.
                </p>
            </div>
        );
    }

    const segments = sessionData.segments || [];
    const totalCustomers = segments.reduce(
        (acc, seg) => acc + (seg.customer_ids?.length || 0),
        0
    );

    return (
        <div className="mx-auto max-w-[90rem] space-y-8 p-6 pb-36 md:p-8">
            {/* Header */}
            <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="size-4" />
                        <span className="text-xs font-semibold uppercase tracking-widest">
                            Review &amp; Approve
                        </span>
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
                        Review your campaign
                    </h1>
                    <p className="max-w-xl text-muted-foreground">
                        Check the audience segments and messages before anything is sent.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                    <StatTile
                        icon={Target}
                        label="Audience"
                        value={totalCustomers}
                        accent
                    />
                    <StatTile icon={Layers} label="Segments" value={segments.length} />
                </div>
            </header>

            {/* Brief */}
            <Card>
                <CardContent className="flex items-start gap-4 p-6">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Clock className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Campaign Brief
                        </p>
                        <p className="italic leading-relaxed text-foreground/90">
                            &ldquo;{sessionData.brief}&rdquo;
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Segment grid */}
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                {segments.map((segment, idx) => (
                    <motion.div
                        key={segment.id || idx}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.06, duration: 0.3 }}
                    >
                        <Card className="flex h-full flex-col overflow-hidden">
                            {/* Segment header */}
                            <div className="flex items-start justify-between gap-4 border-b border-border p-6">
                                <div className="space-y-2">
                                    <h3 className="text-lg font-semibold text-foreground">
                                        {segment.label}
                                    </h3>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="tabular-nums">
                                            <UsersIcon className="mr-1 size-3" />
                                            {segment.customer_ids?.length || 0} targeted
                                        </Badge>
                                        <Badge variant="outline" className="gap-1">
                                            <Clock className="size-3" />
                                            {segment.send_time || 'Immediate'}
                                        </Badge>
                                    </div>
                                </div>
                                <Badge variant="outline" className="font-mono">
                                    SEG-{idx + 1}
                                </Badge>
                            </div>

                            <CardContent className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
                                <AIPredictionCard segment={segment} />

                                <div className="space-y-3">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        Proposed Content
                                    </p>
                                    <div className="space-y-4">
                                        {segment.variants?.map((v, vIdx) => (
                                            <VariantCard key={vIdx} variant={v} />
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            {/* Floating action bar */}
            <div className="fixed inset-x-4 bottom-6 z-50 lg:left-[calc(var(--sidebar-width,18rem)+1.5rem)] lg:right-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-auto flex max-w-[90rem] flex-col items-stretch gap-4 rounded-2xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:flex-row sm:items-center sm:justify-between"
                >
                    <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
                            <AlertTriangle className="size-5" />
                        </span>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                System Impact
                            </p>
                            <p className="text-sm text-foreground">
                                Final approval triggers{' '}
                                <span className="font-semibold tabular-nums">
                                    {segments.length}
                                </span>{' '}
                                automated deployments.
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setShowRejectModal(true)}
                            disabled={actionLoading}
                        >
                            Reject &amp; revise
                        </Button>
                        <Button onClick={handleApprove} disabled={actionLoading}>
                            {actionLoading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <CheckCircle2 className="size-4" />
                            )}
                            Approve &amp; send
                        </Button>
                    </div>
                </motion.div>
            </div>

            {/* Rejection dialog */}
            <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Request revision</DialogTitle>
                        <DialogDescription>
                            Explain what needs to change. The AI Planner will incorporate
                            this feedback into the next generation loop.
                        </DialogDescription>
                    </DialogHeader>

                    <Separator />

                    <Textarea
                        className="min-h-[140px] resize-none"
                        placeholder="E.g., The tone is too formal. Make it more casual and emphasize the quick setup..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                    />

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowRejectModal(false)}
                            disabled={actionLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReject}
                            disabled={actionLoading}
                        >
                            {actionLoading && <Loader2 className="size-4 animate-spin" />}
                            Confirm rejection
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
