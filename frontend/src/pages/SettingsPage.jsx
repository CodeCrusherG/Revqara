import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Shield, Cpu, MessageSquare, Plus, Trash2, Loader2,
    CheckCircle2, Phone, Info, Sparkles, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import { whatsappApi, verticalsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

export default function SettingsPage() {
    const { workspace } = useAuth();
    const [accounts, setAccounts] = useState(null);
    const [maxNumbers, setMaxNumbers] = useState(1);
    const [connecting, setConnecting] = useState(false);
    const [pendingDisconnect, setPendingDisconnect] = useState(null);
    const [disconnecting, setDisconnecting] = useState(false);
    const [vert, setVert] = useState(null);
    const [savingVert, setSavingVert] = useState(false);

    const load = async () => {
        const data = await whatsappApi.listAccounts();
        setAccounts(data.accounts);
        setMaxNumbers(data.max_numbers);
    };
    useEffect(() => {
        load();
        verticalsApi.get().then(setVert).catch(() => {});
    }, []);

    const changeVertical = async (v) => {
        setSavingVert(true);
        try {
            await verticalsApi.set(v);
            setVert(await verticalsApi.get());
            toast.success('Business type updated — your AI is now tuned for it.');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not update business type.');
        } finally {
            setSavingVert(false);
        }
    };

    const connect = async () => {
        setConnecting(true);
        try {
            await whatsappApi.connect();
            await load();
            toast.success('WhatsApp number connected.');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not connect a number.');
        } finally {
            setConnecting(false);
        }
    };

    const confirmDisconnect = async () => {
        if (!pendingDisconnect) return;
        setDisconnecting(true);
        try {
            await whatsappApi.disconnect(pendingDisconnect.id);
            await load();
            toast.success('WhatsApp number disconnected.');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not disconnect.');
        } finally {
            setDisconnecting(false);
            setPendingDisconnect(null);
        }
    };

    const atLimit = accounts && accounts.length >= maxNumbers;

    return (
        <TooltipProvider delayDuration={200}>
            <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-1 border-b border-border pb-6"
                >
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
                    <p className="text-muted-foreground">
                        Manage your workspace, WhatsApp numbers, and AI model.
                    </p>
                </motion.div>

                {/* Connect WhatsApp */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                >
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                                    <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="space-y-1">
                                    <CardTitle className="text-base">WhatsApp Numbers</CardTitle>
                                    <CardDescription>
                                        Connect your business number to send and receive.
                                    </CardDescription>
                                </div>
                            </div>
                            <Button onClick={connect} disabled={connecting || atLimit} size="sm">
                                {connecting
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <Plus className="h-4 w-4" />}
                                Connect WhatsApp
                            </Button>
                        </CardHeader>
                        <CardContent>
                            {accounts === null ? (
                                <div className="space-y-3">
                                    {[0, 1].map((i) => (
                                        <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-4">
                                            <Skeleton className="h-5 w-5 rounded-full" />
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-40" />
                                                <Skeleton className="h-3 w-56" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : accounts.length === 0 ? (
                                <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-10 text-center">
                                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                        <Phone className="h-6 w-6 text-muted-foreground" />
                                    </div>
                                    <p className="font-semibold text-foreground">No number connected</p>
                                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                                        Click <span className="font-semibold text-foreground">Connect WhatsApp</span> to link a
                                        business number (this demo simulates Meta&apos;s Embedded Signup — no real account
                                        needed). Campaigns then send from your own number.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {accounts.map((a) => (
                                        <motion.div
                                            key={a.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
                                        >
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                                <div>
                                                    <div className="font-semibold text-foreground tabular-nums">
                                                        {a.display_phone_number}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {a.verified_name} · ID {a.phone_number_id}
                                                    </div>
                                                </div>
                                            </div>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-muted-foreground hover:text-destructive"
                                                        onClick={() => setPendingDisconnect(a)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Disconnect number</TooltipContent>
                                            </Tooltip>
                                        </motion.div>
                                    ))}
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        {accounts.length} / {maxNumbers} numbers used on your plan.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Business type (vertical pack) */}
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.08 }}>
                    <Card>
                        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                    <Briefcase className="h-5 w-5 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <CardTitle className="text-base">Business type</CardTitle>
                                    <CardDescription>
                                        Tunes the universal AI graph — lead fields, pipeline stages, replies, and compliance rules.
                                    </CardDescription>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {savingVert && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                                <Select value={vert?.current || 'custom'} onValueChange={changeVertical} disabled={!vert || savingVert}>
                                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {(vert?.verticals || []).map((v) => (
                                            <SelectItem key={v.vertical} value={v.vertical}>{v.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        {vert?.config && (
                            <CardContent className="grid gap-5 sm:grid-cols-2">
                                <div>
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Pipeline stages</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {vert.config.pipeline_stages.map((s) => (
                                            <Badge key={s} variant="secondary" className="font-normal capitalize">{s.replace(/_/g, ' ')}</Badge>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Lead fields captured</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {vert.config.lead_fields.map((f) => (
                                            <Badge key={f} variant="outline" className="font-normal">{f.replace(/_/g, ' ')}</Badge>
                                        ))}
                                    </div>
                                    {vert.config.rules?.require_human_for?.length > 0 && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            <span className="font-semibold text-foreground">Always escalates to a human:</span>{' '}
                                            {vert.config.rules.require_human_for.join(', ')}.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        )}
                    </Card>
                </motion.div>

                {/* AI Model + Workspace */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    className="grid grid-cols-1 gap-6 md:grid-cols-2"
                >
                    <Card>
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                <Cpu className="h-5 w-5 text-primary" />
                            </div>
                            <CardTitle className="text-base">AI Model</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <Row label="Primary Model" value="mistral:latest" />
                            <Separator />
                            <Row
                                label="Plan"
                                value={
                                    <Badge variant={workspace?.plan === 'pro' ? 'default' : 'secondary'}>
                                        {workspace?.plan === 'pro' ? 'Pro' : 'Free'}
                                    </Badge>
                                }
                            />
                            <Separator />
                            <Row
                                label="AI Agents"
                                value={
                                    <span className="inline-flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                                        5 active
                                    </span>
                                }
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                                <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <CardTitle className="text-base">Workspace</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0">
                            <Row label="Name" value={workspace?.name || '—'} />
                            <Separator />
                            <Row
                                label="Sending"
                                value={<Badge variant="success">Offline simulator</Badge>}
                            />
                            <Separator />
                            <Row label="Data residency" value="Isolated workspace" />
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Good to know */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 }}
                    className="rounded-xl border border-border bg-muted/40 p-6"
                >
                    <div className="mb-2 flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                            Good to know
                        </h4>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        One Nudge backend serves every workspace, but each connects its{' '}
                        <span className="font-semibold text-foreground">own</span> WhatsApp number — inbound
                        webhooks route to you by{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                            phone_number_id
                        </code>
                        . In this demo, &quot;Connect WhatsApp&quot; simulates Meta&apos;s Embedded Signup; in
                        production it returns your real WABA credentials. Nothing is delivered to real phones —
                        sends go through the offline simulator.
                    </p>
                </motion.div>
            </div>

            {/* Disconnect confirmation */}
            <Dialog
                open={!!pendingDisconnect}
                onOpenChange={(open) => { if (!open && !disconnecting) setPendingDisconnect(null); }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disconnect this WhatsApp number?</DialogTitle>
                        <DialogDescription>
                            {pendingDisconnect ? (
                                <>
                                    <span className="font-semibold text-foreground">
                                        {pendingDisconnect.display_phone_number}
                                    </span>{' '}
                                    will stop sending and receiving campaign messages.
                                </>
                            ) : null}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setPendingDisconnect(null)}
                            disabled={disconnecting}
                        >
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDisconnect} disabled={disconnecting}>
                            {disconnecting
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                            Disconnect
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}

function Row({ label, value }) {
    return (
        <div className="flex items-center justify-between py-3">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold text-foreground">{value}</span>
        </div>
    );
}
