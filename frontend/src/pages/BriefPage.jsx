import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { campaignApi, listsApi, templatesApi } from '../services/api';
import {
    Sparkles, ArrowRight, Loader2, Info, Users, FileText, CalendarClock, ShieldCheck,
    Rocket, Undo2, Gift, Search, BrainCircuit, PenLine, ClipboardCheck, Check, Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const TEMPLATES = [
    { label: 'New product launch', icon: Rocket, text: 'Launch our new high-yield savings account to young professionals in Tier-1 cities. Highlight instant onboarding and a limited-time bonus rate.' },
    { label: 'Win back inactive users', icon: Undo2, text: 'Re-engage existing customers who have not transacted in 60 days. Offer a personalised incentive and a single clear call to action.' },
    { label: 'Festive offer', icon: Gift, text: 'Promote a festive season cashback offer to high-income, app-installed customers. Keep the message warm, concise, and emoji-led.' },
];

const STEPS = [
    { key: 'profiling', label: 'Audience', icon: Search },
    { key: 'planning', label: 'Strategy', icon: BrainCircuit },
    { key: 'generating', label: 'Creative', icon: PenLine },
    { key: 'pending_approval', label: 'Review', icon: ClipboardCheck },
];

const MIN_BRIEF_LENGTH = 20;
const ALL_CONTACTS = '__all__';
const AI_COPY = '__ai__';

export default function BriefPage() {
    const [brief, setBrief] = useState('');
    const [loading, setLoading] = useState(false);
    const [campaignId, setCampaignId] = useState(null);
    const [currentStatus, setCurrentStatus] = useState(null);
    const [lists, setLists] = useState([]);
    const [targetListId, setTargetListId] = useState('');
    const [templates, setTemplates] = useState([]);
    const [templateId, setTemplateId] = useState('');
    const [scheduledAt, setScheduledAt] = useState('');
    const navigate = useNavigate();

    const trimmedLen = brief.trim().length;
    const tooShort = trimmedLen > 0 && trimmedLen < MIN_BRIEF_LENGTH;
    const canSubmit = !loading && trimmedLen >= MIN_BRIEF_LENGTH;

    useEffect(() => {
        listsApi.list().then(setLists).catch(() => setLists([]));
        templatesApi.list().then((t) => setTemplates(t.filter((x) => x.status === 'approved'))).catch(() => setTemplates([]));
    }, []);

    const handleSubmit = async (e) => {
        e?.preventDefault();
        if (!brief.trim()) return;
        setLoading(true);
        try {
            const data = await campaignApi.generateCampaign({
                brief,
                target_list_id: targetListId || null,
                template_id: templateId || null,
                scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            });
            setCampaignId(data.campaign_id);
            setCurrentStatus(data.status || 'profiling');
        } catch (error) {
            toast.error(error?.response?.data?.detail || 'Error generating campaign');
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!campaignId) return;
        const interval = setInterval(async () => {
            try {
                const data = await campaignApi.getCampaignStatusSummary(campaignId);
                setCurrentStatus(data.status);
                if (data.status === 'pending_approval') {
                    clearInterval(interval);
                    setTimeout(() => navigate(`/approval/${campaignId}`), 1400);
                } else if (['rejected', 'approved', 'completed', 'scheduled'].includes(data.status)) {
                    clearInterval(interval);
                    navigate(`/dashboard/${campaignId}`);
                }
            } catch { /* keep polling */ }
        }, 3000);
        return () => clearInterval(interval);
    }, [campaignId, navigate]);

    const onKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e);
    };

    const activeIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentStatus));

    return (
        <div className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden">
            {/* Backdrop: technical grid + emerald aurora glow */}
            <div className="pointer-events-none absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-[0.22]" />
            <div className="pointer-events-none absolute left-1/2 top-[-10%] -z-10 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px] animate-aurora" />

            <div className="mx-auto max-w-3xl px-6 py-14">
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                    {/* Header */}
                    <div className="mb-9 text-center">
                        <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-bold uppercase tracking-widest">AI Campaign Studio</span>
                        </Badge>
                        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-[2.75rem] sm:leading-[1.1]">
                            What should we send today?
                        </h1>
                        <p className="mx-auto mt-4 max-w-md text-[15px] text-muted-foreground">
                            Describe your goal — Nudge segments the audience, writes the messages, and predicts engagement. You approve before anything sends.
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {!campaignId ? (
                            <motion.div key="composer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }}>
                                {/* Composer */}
                                <form onSubmit={handleSubmit}>
                                    <div className="group overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/[0.03] transition-all focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
                                        <Textarea
                                            autoFocus
                                            value={brief}
                                            onChange={(e) => setBrief(e.target.value)}
                                            onKeyDown={onKeyDown}
                                            disabled={loading}
                                            maxLength={2000}
                                            placeholder="e.g. Promote our new high-yield savings account to young professionals in Tier-1 cities, with a limited-time bonus rate…"
                                            className="min-h-[150px] resize-none border-0 bg-transparent p-5 text-base leading-relaxed shadow-none focus-visible:ring-0"
                                        />

                                        {/* Integrated toolbar */}
                                        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 p-3">
                                            {/* Send to */}
                                            <Select value={targetListId || ALL_CONTACTS} onValueChange={(v) => setTargetListId(v === ALL_CONTACTS ? '' : v)}>
                                                <SelectTrigger className="h-8 w-auto gap-1.5 rounded-lg border-border/60 bg-background px-2.5 text-xs font-medium shadow-none">
                                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <SelectValue placeholder="All contacts" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={ALL_CONTACTS}>All contacts</SelectItem>
                                                    {lists.map((l) => (
                                                        <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.member_count})</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {/* Message */}
                                            <Select value={templateId || AI_COPY} onValueChange={(v) => setTemplateId(v === AI_COPY ? '' : v)}>
                                                <SelectTrigger className="h-8 w-auto gap-1.5 rounded-lg border-border/60 bg-background px-2.5 text-xs font-medium shadow-none">
                                                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                    <SelectValue placeholder="AI copy" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={AI_COPY}>AI-generated copy</SelectItem>
                                                    {templates.map((t) => (
                                                        <SelectItem key={t.id} value={String(t.id)}>Template: {t.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>

                                            {/* Schedule */}
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <button type="button" className={cn(
                                                        'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs font-medium transition-colors hover:bg-muted',
                                                        scheduledAt && 'border-primary/40 text-primary'
                                                    )}>
                                                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {scheduledAt ? new Date(scheduledAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Send now'}
                                                    </button>
                                                </PopoverTrigger>
                                                <PopoverContent align="start" className="w-64 space-y-3">
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Schedule send</p>
                                                    <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-9" />
                                                    {scheduledAt && (
                                                        <Button type="button" variant="ghost" size="sm" className="h-7 w-full text-xs" onClick={() => setScheduledAt('')}>
                                                            <Clock className="h-3.5 w-3.5" /> Send immediately instead
                                                        </Button>
                                                    )}
                                                </PopoverContent>
                                            </Popover>

                                            <div className="ms-auto flex items-center gap-3">
                                                <span className={cn('text-xs tabular-nums', tooShort ? 'text-amber-500' : 'text-muted-foreground')}>
                                                    {brief.length}/2000
                                                </span>
                                                <Button
                                                    type="submit"
                                                    disabled={!canSubmit}
                                                    className="group/btn h-9 gap-1.5 rounded-lg bg-gradient-to-r from-primary to-emerald-400 px-4 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 disabled:bg-none disabled:from-muted disabled:to-muted disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                                                >
                                                    Generate
                                                    <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Validation / tip line */}
                                    <div className="mt-2.5 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                                        <Info className="h-3.5 w-3.5 shrink-0" />
                                        {tooShort
                                            ? <span className="text-amber-500">A little more detail helps ({trimmedLen}/{MIN_BRIEF_LENGTH})</span>
                                            : <span>Mention the audience, the offer, and the goal. Press <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">⌘↵</kbd> to generate.</span>}
                                    </div>

                                    {/* Starter suggestions */}
                                    <div className="mt-7">
                                        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Start from a template</p>
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {TEMPLATES.map((t) => (
                                                <button
                                                    key={t.label}
                                                    type="button"
                                                    onClick={() => setBrief(t.text)}
                                                    className="lift group/card flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]"
                                                >
                                                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover/card:bg-primary group-hover/card:text-primary-foreground">
                                                        <t.icon className="h-5 w-5" />
                                                    </span>
                                                    <span className="text-sm font-semibold text-foreground">{t.label}</span>
                                                    <span className="line-clamp-2 text-xs text-muted-foreground">{t.text}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Trust */}
                                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-muted-foreground">
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest"><ShieldCheck className="h-3.5 w-3.5" /> You approve before sending</span>
                                        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest"><Sparkles className="h-3.5 w-3.5" /> 5-agent AI pipeline</span>
                                    </div>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div key="generating" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
                                className="rounded-2xl border bg-card p-8 shadow-2xl shadow-primary/5 sm:p-10">
                                {/* Pipeline stepper */}
                                <div className="flex items-center justify-between">
                                    {STEPS.map((s, i) => {
                                        const done = i < activeIdx;
                                        const active = i === activeIdx;
                                        return (
                                            <React.Fragment key={s.key}>
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className={cn(
                                                        'relative flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors',
                                                        done && 'border-primary bg-primary text-primary-foreground',
                                                        active && 'border-primary bg-primary/10 text-primary',
                                                        !done && !active && 'border-border bg-muted/40 text-muted-foreground'
                                                    )}>
                                                        {active && (
                                                            <motion.span
                                                                className="absolute inset-0 rounded-2xl ring-2 ring-primary/40"
                                                                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                                                                transition={{ duration: 1.6, repeat: Infinity }}
                                                            />
                                                        )}
                                                        {done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                                                    </div>
                                                    <span className={cn('text-[11px] font-bold uppercase tracking-wider',
                                                        active || done ? 'text-foreground' : 'text-muted-foreground')}>{s.label}</span>
                                                </div>
                                                {i < STEPS.length - 1 && (
                                                    <div className="mx-1 mb-6 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                                                        <div className={cn('h-full rounded-full bg-primary transition-all duration-700', i < activeIdx ? 'w-full' : 'w-0')} />
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Shimmer progress + caption */}
                                <div className="mt-8 h-1 w-full overflow-hidden rounded-full bg-muted">
                                    <motion.div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
                                        animate={{ x: ['-120%', '320%'] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
                                </div>
                                <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    Building segments and writing your messages…
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
}
