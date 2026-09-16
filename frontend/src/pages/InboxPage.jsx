import React, { useEffect, useRef, useState } from 'react';
import { inboxApi, verticalsApi, teamApi, salesTeamsApi } from '../services/api';
import { getDemoVertical } from '@/lib/demoVerticals';
import { useAuth } from '@/context/AuthContext';
import {
    MessageSquare, Send, Bot, User, Loader2, Settings2, Sparkles, Zap,
    Users, AlertCircle, Inbox as InboxIcon, Target,
    Brain, Tag, ListChecks, GitBranch, ShieldAlert, Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const CAN_ASSIGN_ROLES = ['owner', 'admin', 'manager'];

function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

const humanize = (s) => (s || '').replace(/_/g, ' ');

const TONE = {
    primary: 'bg-primary/10 text-primary ring-primary/20',
    teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/20',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
};

// Derive a read-only "what the AI did" timeline from data the graph already
// persisted (intent, extracted fields, pipeline stage, tags, reply mode).
// No fabricated metrics — only what is actually stored.
function aiTimeline(thread) {
    if (!thread?.lead) return [];
    const lead = thread.lead;
    const fields = Object.entries(lead.fields || {});
    const tags = thread.tags || [];
    const events = [];
    if (lead.intent)
        events.push({ icon: Brain, tone: 'primary', title: 'Intent detected', chips: [humanize(lead.intent)] });
    if (fields.length)
        events.push({ icon: ListChecks, tone: 'teal', title: 'Fields extracted', chips: fields.map(([k, v]) => `${humanize(k)}: ${v}`) });
    if (lead.stage)
        events.push({ icon: GitBranch, tone: 'emerald', title: 'Pipeline stage', chips: [humanize(lead.stage)] });
    if (tags.length)
        events.push({ icon: Tag, tone: 'amber', title: 'Tags added', chips: tags.map(humanize) });
    if (thread.auto_reply) {
        events.push({ icon: Bot, tone: 'primary', title: 'Next action', chips: ['Auto-reply active'] });
    } else {
        const escalated = tags.some((t) => /complaint|refund|escalat|emergency/i.test(t));
        events.push({
            icon: ShieldAlert, tone: 'amber', title: 'Handed to human',
            chips: [escalated ? 'Complaint / escalation detected' : 'Agent took over'],
        });
    }
    return events;
}

function LeadTimeline({ thread, members = [], teams = [], canAssign = false, onAssign }) {
    const events = aiTimeline(thread);
    const lead = thread?.lead;
    const owner = members.find((m) => m.user_id === lead?.assigned_to_user_id);
    const team = teams.find((t) => t.id === lead?.assigned_to_team_id);
    const ownerLabel = owner ? (owner.full_name || owner.email) : team ? `Team: ${team.name}` : 'Unassigned';
    const assignValue = lead?.assigned_to_user_id ? `u:${lead.assigned_to_user_id}` : lead?.assigned_to_team_id ? `t:${lead.assigned_to_team_id}` : 'none';
    return (
        <aside className="custom-scrollbar hidden w-72 shrink-0 overflow-y-auto border-l border-border bg-card xl:block">
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Activity className="h-4 w-4" />
                </span>
                <div>
                    <div className="text-sm font-semibold leading-none">AI Analysis</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">What the graph understood</div>
                </div>
            </div>

            {lead && (
                <div className="border-b border-border px-4 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Assignment</span>
                        {lead.needs_human && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                <ShieldAlert className="h-3 w-3" /> needs human
                            </span>
                        )}
                    </div>
                    {canAssign ? (
                        <Select value={assignValue} onValueChange={onAssign}>
                            <SelectTrigger className="mt-2 h-8"><SelectValue><span className="flex items-center gap-1.5 text-xs"><Users className="h-3.5 w-3.5 text-muted-foreground" />{ownerLabel}</span></SelectValue></SelectTrigger>
                            <SelectContent align="end">
                                <SelectItem value="none">Unassigned</SelectItem>
                                {members.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Agents</SelectLabel>
                                        {members.map((m) => <SelectItem key={m.user_id} value={`u:${m.user_id}`}>{m.full_name || m.email}</SelectItem>)}
                                    </SelectGroup>
                                )}
                                {teams.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Teams</SelectLabel>
                                        {teams.map((t) => <SelectItem key={t.id} value={`t:${t.id}`}>Team: {t.name}</SelectItem>)}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>
                    ) : (
                        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="h-3.5 w-3.5" /> {ownerLabel}</div>
                    )}
                </div>
            )}
            {events.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No AI activity yet — the graph annotates this panel once a customer messages.
                </div>
            ) : (
                <ol className="relative space-y-5 px-5 py-5">
                    <span aria-hidden className="absolute left-[1.65rem] top-6 bottom-6 w-px bg-border" />
                    {events.map((e, i) => {
                        const Icon = e.icon;
                        return (
                            <li key={i} className="relative flex gap-3">
                                <span className={cn('z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card', TONE[e.tone])}>
                                    <Icon className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0 pt-0.5">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{e.title}</div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {e.chips.map((c, j) => (
                                            <span key={j} className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] capitalize text-foreground">{c}</span>
                                        ))}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </aside>
    );
}

function BotSettingsDialog({ open, onClose }) {
    const [bot, setBot] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setBot(null);
        inboxApi.getBot().then(setBot).catch(() => toast.error('Could not load bot settings'));
    }, [open]);

    const set = (k) => (e) => setBot({ ...bot, [k]: e.target.value });
    const setSwitch = (k) => (v) => setBot({ ...bot, [k]: v });

    const save = async () => {
        setSaving(true);
        try {
            await inboxApi.updateBot(bot);
            toast.success('Bot settings saved');
            onClose();
        } catch {
            toast.error('Could not save bot settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Bot className="h-5 w-5" />
                        </span>
                        AI Bot
                    </DialogTitle>
                    <DialogDescription>
                        Configure how Nudge auto-replies and hands off to your team.
                    </DialogDescription>
                </DialogHeader>

                {!bot ? (
                    <div className="space-y-4 py-2">
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-14 w-full rounded-xl" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </div>
                ) : (
                    <div className="space-y-5 py-1">
                        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium leading-none">Auto-reply enabled</p>
                                <p className="text-xs text-muted-foreground">Let the AI answer incoming messages.</p>
                            </div>
                            <Switch checked={!!bot.enabled} onCheckedChange={setSwitch('enabled')} />
                        </div>
                        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium leading-none">Allow human handoff</p>
                                <p className="text-xs text-muted-foreground">Pause the bot when an agent replies.</p>
                            </div>
                            <Switch checked={!!bot.handoff_enabled} onCheckedChange={setSwitch('handoff_enabled')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bot-name">Business name</Label>
                            <Input id="bot-name" value={bot.name || ''} onChange={set('name')} placeholder="Acme Realty" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bot-prompt">Persona / instructions</Label>
                            <Textarea
                                id="bot-prompt" rows={3} value={bot.prompt || ''} onChange={set('prompt')}
                                placeholder="e.g. You are the assistant for Acme Realty. Help buyers, qualify leads, book site visits."
                                className="resize-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bot-knowledge">Knowledge / FAQ</Label>
                            <Textarea
                                id="bot-knowledge" rows={4} value={bot.knowledge || ''} onChange={set('knowledge')}
                                placeholder="Paste FAQs, pricing, hours, policies…"
                                className="resize-none"
                            />
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={save} disabled={saving || !bot}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save bot
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function StatPill({ icon: Icon, label, value }) {
    return (
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
            </span>
            <div>
                <div className="text-base font-semibold leading-none tabular-nums">{value}</div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
        </div>
    );
}

export default function InboxPage() {
    const { role } = useAuth();
    const canAssign = CAN_ASSIGN_ROLES.includes(role);
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [convos, setConvos] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [thread, setThread] = useState(null);
    const [reply, setReply] = useState('');
    const [showBot, setShowBot] = useState(false);
    const [simText, setSimText] = useState('');
    const [stats, setStats] = useState(null);
    const [loadingConvos, setLoadingConvos] = useState(true);
    const [prompts, setPrompts] = useState([]);
    const [convoFilter, setConvoFilter] = useState('all');   // all | me | unassigned
    const bottomRef = useRef();

    const loadConvos = async () => {
        try {
            const params = convoFilter === 'all' ? {} : { assigned: convoFilter };
            setConvos(await inboxApi.conversations(params));
        } finally {
            setLoadingConvos(false);
        }
        inboxApi.stats().then(setStats).catch(() => {});
    };
    const loadThread = async (id) => { if (id) setThread(await inboxApi.thread(id)); };

    useEffect(() => {
        loadConvos();
        verticalsApi.get().then((v) => setPrompts(getDemoVertical(v.current)?.prompts || [])).catch(() => {});
        teamApi.members().then(setMembers).catch(() => {});
        salesTeamsApi.list().then(setTeams).catch(() => {});
    }, []);

    const assignActive = async (value) => {
        try {
            if (value === 'none') await inboxApi.assign(activeId, {});
            else if (value.startsWith('u:')) await inboxApi.assign(activeId, { user_id: value.slice(2) });
            else if (value.startsWith('t:')) await inboxApi.assign(activeId, { team_id: value.slice(2) });
            toast.success('Lead reassigned');
            loadThread(activeId); loadConvos();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Could not assign'); }
    };
    useEffect(() => {
        if (!activeId) return;
        loadThread(activeId);
        const t = setInterval(() => { loadThread(activeId); loadConvos(); }, 3000);
        return () => clearInterval(t);
    }, [activeId]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);
    useEffect(() => { loadConvos(); /* eslint-disable-next-line */ }, [convoFilter]);

    const sendReply = async () => {
        if (!reply.trim()) return;
        const text = reply; setReply('');
        try {
            await inboxApi.reply(activeId, text);
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not send');
        }
        loadThread(activeId);
    };
    const toggleAuto = async () => {
        const next = !thread.auto_reply;
        await inboxApi.setAutoReply(activeId, next);
        toast.success(next ? 'AI is now replying' : 'Switched to human takeover');
        loadThread(activeId);
    };
    const simulate = async (presetText) => {
        const text = (typeof presetText === 'string' ? presetText : simText).trim() || 'Hi, I have a question about your services';
        setSimText('');
        await inboxApi.simulate(text, 'Test Customer');
        toast.success('Inbound message simulated');
        setTimeout(() => { loadConvos(); if (activeId) loadThread(activeId); }, 1800);
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background">
            {/* Pinned secondary header */}
            <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <MessageSquare className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold leading-none tracking-tight">Inbox</h1>
                        <p className="mt-1 hidden truncate text-xs text-muted-foreground md:block">
                            Live WhatsApp conversations · AI replies + human takeover
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {stats && (
                        <div className="hidden items-center divide-x divide-border rounded-lg border bg-card xl:flex">
                            {[['Chats', stats.total_chats], ['Leads', stats.leads], ['Unresolved', stats.unresolved]].map(([k, v]) => (
                                <div key={k} className="px-3.5 py-1 text-center">
                                    <div className="text-sm font-bold leading-none tabular-nums">{v}</div>
                                    <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{k}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="hidden items-center gap-1 rounded-lg border border-border bg-card py-1 ps-2.5 pe-1 sm:flex">
                        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                            value={simText}
                            onChange={(e) => setSimText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && simulate()}
                            placeholder="Simulate a message…"
                            className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground lg:w-44"
                        />
                        <Button size="sm" onClick={simulate} className="h-7 gap-1.5">
                            <Zap className="h-3.5 w-3.5" /> Send
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setShowBot(true)} className="h-9 gap-2">
                        <Settings2 className="h-4 w-4" /> <span className="hidden sm:inline">AI Bot</span>
                    </Button>
                </div>
            </header>

            {/* Suggested demo prompts (vertical-aware) */}
            {prompts.length > 0 && (
                <div className="custom-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-muted/30 px-5 py-2">
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Try
                    </span>
                    {prompts.map((p) => (
                        <button
                            key={p}
                            onClick={() => simulate(p)}
                            className="shrink-0 rounded-full border border-border bg-card px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
                        >
                            {p}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex min-h-0 flex-1">
                {/* Conversation list */}
                <aside className="custom-scrollbar w-80 shrink-0 overflow-y-auto border-r border-border">
                    <div className="sticky top-0 z-10 flex gap-1 border-b border-border bg-card/80 p-2 backdrop-blur">
                        {[['all', 'All'], ['me', 'Mine'], ['unassigned', 'Unassigned']].map(([v, label]) => (
                            <button
                                key={v}
                                onClick={() => setConvoFilter(v)}
                                className={cn('flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                                    convoFilter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {loadingConvos ? (
                        <div className="space-y-1 p-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-3.5 w-24" />
                                        <Skeleton className="h-3 w-40" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : convos.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                                <InboxIcon className="h-6 w-6" />
                            </span>
                            <p className="text-sm font-medium">No conversations yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Use “Simulate a customer message” to start one.
                            </p>
                        </div>
                    ) : (
                        <div className="p-2">
                            {convos.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => setActiveId(c.id)}
                                    className={cn(
                                        'group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors',
                                        activeId === c.id ? 'bg-accent' : 'hover:bg-muted/60',
                                    )}
                                >
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                            {initials(c.customer_name || c.customer_wa_id)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">
                                                {c.customer_name || c.customer_wa_id}
                                            </span>
                                            {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message}</p>
                                        <div className="mt-1.5">
                                            <Badge variant={c.auto_reply ? 'secondary' : 'warning'} className="gap-1 px-1.5 py-0 text-[10px]">
                                                {c.auto_reply ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                                                {c.auto_reply ? 'AI' : 'Human'}
                                            </Badge>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </aside>

                {/* Thread */}
                <section className="flex min-h-0 flex-1 flex-col bg-muted/30">
                    {!thread ? (
                        <div className="flex flex-1 flex-col items-center justify-center text-center">
                            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                                <MessageSquare className="h-7 w-7" />
                            </span>
                            <p className="text-sm font-medium">Select a conversation</p>
                            <p className="mt-1 text-xs text-muted-foreground">Pick a chat from the left to view the thread.</p>
                        </div>
                    ) : (
                        <>
                            {/* Thread header */}
                            <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3.5">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                                            {initials(thread.customer_name || thread.customer_wa_id)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <div className="text-sm font-semibold">{thread.customer_name || thread.customer_wa_id}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {thread.customer_wa_id} · {thread.within_24h_window ? 'within 24h window' : 'outside 24h window'}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant={thread.auto_reply ? 'default' : 'outline'}
                                    onClick={toggleAuto}
                                    className={cn(
                                        'gap-2',
                                        !thread.auto_reply && 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400',
                                    )}
                                >
                                    {thread.auto_reply ? <><Bot className="h-4 w-4" /> AI replying</> : <><User className="h-4 w-4" /> Human takeover</>}
                                </Button>
                            </div>

                            {/* Lead context (vertical-aware) */}
                            {thread.lead && (
                                <div className="shrink-0 border-b border-border bg-muted/30 px-6 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                            <Target className="h-3.5 w-3.5 text-primary" /> Lead
                                        </span>
                                        {thread.lead.intent && (
                                            <Badge variant="secondary" className="capitalize">{thread.lead.intent.replace(/_/g, ' ')}</Badge>
                                        )}
                                        {thread.lead.stage && (
                                            <Badge variant="outline" className="capitalize">{thread.lead.stage.replace(/_/g, ' ')}</Badge>
                                        )}
                                        {thread.vertical_label && (
                                            <span className="text-[11px] text-muted-foreground">· {thread.vertical_label}</span>
                                        )}
                                    </div>
                                    {thread.vertical_fields?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {thread.vertical_fields.map((f) => {
                                                const val = thread.lead.fields?.[f];
                                                return (
                                                    <span key={f} className={cn(
                                                        'rounded-md border px-2 py-0.5 text-[11px]',
                                                        val ? 'border-primary/30 bg-primary/5 text-foreground' : 'border-border text-muted-foreground',
                                                    )}>
                                                        <span className="capitalize text-muted-foreground">{f.replace(/_/g, ' ')}:</span>{' '}
                                                        {val || '—'}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Messages */}
                            <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-6">
                                <AnimatePresence initial={false}>
                                    {thread.messages.map((m) => {
                                        const inbound = m.direction === 'inbound';
                                        const isBot = m.sender === 'bot';
                                        return (
                                            <motion.div
                                                key={m.id}
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.15 }}
                                                className={cn('flex', inbound ? 'justify-start' : 'justify-end')}
                                            >
                                                <div
                                                    className={cn(
                                                        'max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                                                        inbound
                                                            ? 'rounded-tl-sm border border-border bg-card text-card-foreground'
                                                            : isBot
                                                                ? 'rounded-tr-sm bg-primary text-primary-foreground'
                                                                : 'rounded-tr-sm bg-emerald-600 text-white',
                                                    )}
                                                >
                                                    {!inbound && (
                                                        <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                                                            {isBot ? <><Bot className="h-3 w-3" /> AI</> : <><User className="h-3 w-3" /> Agent</>}
                                                        </div>
                                                    )}
                                                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                <div ref={bottomRef} />
                            </div>

                            {/* Reply box */}
                            <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card p-4">
                                <Input
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                                    placeholder={thread.auto_reply ? 'Reply as agent (this takes over from the bot)…' : 'Reply as agent…'}
                                    className="flex-1"
                                />
                                <Button size="icon" onClick={sendReply} disabled={!reply.trim()}>
                                    <Send className="h-5 w-5" />
                                </Button>
                            </div>
                        </>
                    )}
                </section>

                {/* AI analysis timeline (read-only) */}
                {thread?.lead && <LeadTimeline thread={thread} members={members} teams={teams} canAssign={canAssign} onAssign={assignActive} />}
            </div>

            <BotSettingsDialog open={showBot} onClose={() => setShowBot(false)} />
        </div>
    );
}
