import React, { useEffect, useState } from 'react';
import { leadsApi, verticalsApi, teamApi, salesTeamsApi } from '../services/api';
import { Target, TrendingUp, UserCog, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectGroup, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

const FALLBACK_STAGES = ['new', 'qualified', 'won', 'lost'];
const humanize = (s) => (s || '').replace(/_/g, ' ');
const CAN_ASSIGN = ['owner', 'admin', 'manager'];

function tone(stage) {
    const s = (stage || '').toLowerCase();
    if (s === 'lost') return { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', bar: 'bg-muted-foreground' };
    if (['won', 'converted', 'enrolled', 'closed', 'booked', 'ordered', 'visited', 'po_received', 'scheduled'].some((k) => s.includes(k)))
        return { chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', bar: 'bg-emerald-500' };
    if (['new', 'browsing'].includes(s)) return { chip: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', dot: 'bg-teal-500', bar: 'bg-teal-500' };
    return { chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', bar: 'bg-amber-500' };
}

function StageBadge({ stage }) {
    const t = tone(stage);
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', t.chip)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />
            {humanize(stage)}
        </span>
    );
}

// Encode an assignment as a single Select value so users and teams share one control.
const asValue = (l) => (l.assigned_to_user_id ? `u:${l.assigned_to_user_id}` : l.assigned_to_team_id ? `t:${l.assigned_to_team_id}` : 'none');

export default function LeadsPage() {
    const { role } = useAuth();
    const canAssign = CAN_ASSIGN.includes(role);
    const [leads, setLeads] = useState(null);
    const [vert, setVert] = useState(null);
    const [members, setMembers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [filter, setFilter] = useState('all');   // all | me | unassigned
    const [teamFilter, setTeamFilter] = useState('all');

    const load = async () => {
        const params = {};
        if (filter === 'me') params.assigned = 'me';
        if (filter === 'unassigned') params.assigned = 'unassigned';
        if (teamFilter !== 'all') params.team_id = teamFilter;
        try { setLeads(await leadsApi.list(params)); }
        catch { toast.error('Failed to load leads'); setLeads([]); }
    };

    useEffect(() => {
        verticalsApi.get().then(setVert).catch(() => {});
        teamApi.members().then(setMembers).catch(() => {});
        salesTeamsApi.list().then(setTeams).catch(() => {});
    }, []);
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, teamFilter]);

    const setStatus = async (id, status) => {
        const prev = leads;
        setLeads((cur) => (cur || []).map((l) => (l.id === id ? { ...l, status } : l)));
        try { await leadsApi.setStatus(id, status); toast.success(`Lead moved to ${humanize(status)}`); load(); }
        catch { toast.error('Could not update lead stage'); setLeads(prev); }
    };

    const setAssignee = async (id, value) => {
        try {
            if (value === 'none') await leadsApi.unassign(id);
            else if (value.startsWith('u:')) await leadsApi.assign(id, { user_id: value.slice(2) });
            else if (value.startsWith('t:')) await leadsApi.assign(id, { team_id: value.slice(2) });
            toast.success('Lead reassigned');
            load();
        } catch { toast.error('Could not reassign lead'); }
    };

    const stages = vert?.config?.pipeline_stages?.length ? vert.config.pipeline_stages : FALLBACK_STAGES;
    const counts = (leads || []).reduce((a, l) => ({ ...a, [l.status]: (a[l.status] || 0) + 1 }), {});
    const total = (leads || []).length;
    const ownerLabel = (l) => l.assigned_to_user_name || (l.assigned_to_team_name ? `Team: ${l.assigned_to_team_name}` : 'Unassigned');

    return (
        <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-8">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
                        <Target className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Leads</h1>
                        <p className="text-sm text-muted-foreground">Captured from WhatsApp conversations by the AI graph.</p>
                    </div>
                </div>
                {vert?.config?.label && (
                    <Badge variant="secondary" className="gap-1.5"><Target className="h-3.5 w-3.5 text-primary" /> {vert.config.label} pipeline</Badge>
                )}
            </header>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg border bg-card p-0.5">
                    {[['all', 'All'], ['me', 'Assigned to me'], ['unassigned', 'Unassigned']].map(([v, label]) => (
                        <button
                            key={v}
                            onClick={() => setFilter(v)}
                            className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                                filter === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {teams.length > 0 && (
                    <Select value={teamFilter} onValueChange={setTeamFilter}>
                        <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="All teams" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All teams</SelectItem>
                            {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Vertical pipeline summary */}
            {leads === null ? (
                <Skeleton className="h-16 w-full rounded-xl" />
            ) : leads.length > 0 && (
                <Card>
                    <CardContent className="flex flex-wrap gap-2 p-4">
                        {stages.map((s) => {
                            const t = tone(s);
                            const v = counts[s] || 0;
                            return (
                                <div key={s} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                                    <span className={cn('h-2 w-2 rounded-full', t.dot)} />
                                    <span className="text-sm font-bold tabular-nums">{v}</span>
                                    <span className="text-xs capitalize text-muted-foreground">{humanize(s)}</span>
                                </div>
                            );
                        })}
                        <div className="ms-auto flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-primary">
                            <span className="text-sm font-bold tabular-nums">{total}</span>
                            <span className="text-xs font-medium">total</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Table / states */}
            {leads === null ? (
                <Card><CardContent className="space-y-3 p-6">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-20" />
                            <Skeleton className="h-4 flex-1" /><Skeleton className="h-8 w-32" />
                        </div>
                    ))}
                </CardContent></Card>
            ) : leads.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center justify-center px-6 py-20 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><TrendingUp className="h-6 w-6" /></span>
                    <h3 className="text-base font-semibold text-foreground">No leads here</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">Leads are captured automatically when a customer asks to book, buy, or enquire in the Inbox.</p>
                </CardContent></Card>
            ) : (
                <Card className="overflow-hidden"><CardContent className="p-0">
                    <TooltipProvider delayDuration={200}>
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Name</TableHead>
                                    <TableHead>Phone</TableHead>
                                    <TableHead>Intent</TableHead>
                                    <TableHead className="min-w-[180px]">Owner</TableHead>
                                    <TableHead className="text-right">Stage</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {leads.map((l) => (
                                    <TableRow key={l.id}>
                                        <TableCell className="font-medium text-foreground">
                                            <span className="flex items-center gap-2">
                                                {l.name || '—'}
                                                {l.needs_human && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                                                <AlertTriangle className="h-3 w-3" /> needs human
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>The AI handed this off — assign it to an agent.</TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </span>
                                            {l.details && (
                                                <Tooltip>
                                                    <TooltipTrigger asChild><span className="block max-w-[220px] truncate text-xs text-muted-foreground">{l.details}</span></TooltipTrigger>
                                                    <TooltipContent className="max-w-sm">{l.details}</TooltipContent>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                        <TableCell className="tabular-nums text-muted-foreground">{l.phone}</TableCell>
                                        <TableCell>
                                            {l.intent ? <Badge variant="secondary" className="capitalize">{humanize(l.intent)}</Badge> : <span className="text-muted-foreground">—</span>}
                                        </TableCell>
                                        <TableCell>
                                            {canAssign ? (
                                                <Select value={asValue(l)} onValueChange={(v) => setAssignee(l.id, v)}>
                                                    <SelectTrigger className="h-8 w-[170px]">
                                                        <SelectValue>
                                                            <span className="flex items-center gap-1.5 text-xs">
                                                                <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
                                                                <span className="truncate">{ownerLabel(l)}</span>
                                                            </span>
                                                        </SelectValue>
                                                    </SelectTrigger>
                                                    <SelectContent align="start">
                                                        <SelectItem value="none">Unassigned</SelectItem>
                                                        {members.length > 0 && (
                                                            <SelectGroup>
                                                                <SelectLabel>Agents</SelectLabel>
                                                                {members.map((m) => (
                                                                    <SelectItem key={m.user_id} value={`u:${m.user_id}`}>
                                                                        {m.full_name || m.email} <span className="text-muted-foreground">· {m.role}</span>
                                                                    </SelectItem>
                                                                ))}
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
                                                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <UserCog className="h-3.5 w-3.5" /> {ownerLabel(l)}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Select value={l.status} onValueChange={(v) => setStatus(l.id, v)}>
                                                <SelectTrigger className="ml-auto h-8 w-[160px]">
                                                    <SelectValue><StageBadge stage={l.status} /></SelectValue>
                                                </SelectTrigger>
                                                <SelectContent align="end">
                                                    {stages.map((s) => (
                                                        <SelectItem key={s} value={s}>
                                                            <span className="flex items-center gap-2">
                                                                <span className={cn('h-1.5 w-1.5 rounded-full', tone(s).dot)} />
                                                                <span className="capitalize">{humanize(s)}</span>
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                    {l.status && !stages.includes(l.status) && (
                                                        <SelectItem value={l.status}><span className="capitalize">{humanize(l.status)}</span></SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TooltipProvider>
                </CardContent></Card>
            )}
        </div>
    );
}
