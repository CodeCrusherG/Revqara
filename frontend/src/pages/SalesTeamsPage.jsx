import React, { useEffect, useState } from 'react';
import { salesTeamsApi, teamApi } from '../services/api';
import { useAuth } from '@/context/AuthContext';
import { Network, Plus, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

export default function SalesTeamsPage() {
    const { role } = useAuth();
    const canManage = role === 'owner' || role === 'admin';
    const [teams, setTeams] = useState(null);
    const [members, setMembers] = useState([]);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const load = async () => {
        try { setTeams(await salesTeamsApi.list()); } catch { setTeams([]); }
        teamApi.members().then(setMembers).catch(() => {});
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const createTeam = async () => {
        try {
            await salesTeamsApi.create({ name: name.trim(), description: description.trim() || null });
            setName(''); setDescription(''); setOpen(false);
            toast.success('Sales team created'); load();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create team'); }
    };

    const deleteTeam = async (t) => {
        try { await salesTeamsApi.remove(t.id); toast.success('Team deleted'); load(); }
        catch { toast.error('Could not delete team'); }
    };

    const addMember = async (t, userId) => {
        try { await salesTeamsApi.addMember(t.id, userId); load(); }
        catch (e) { toast.error(e?.response?.data?.detail || 'Could not add member'); }
    };

    const removeMember = async (t, userId) => {
        try { await salesTeamsApi.removeMember(t.id, userId); load(); }
        catch { toast.error('Could not remove member'); }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
                        <Network className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Sales Teams</h1>
                        <p className="text-sm text-muted-foreground">Group agents so leads can be routed to a team.</p>
                    </div>
                </div>
                {canManage && (
                    <Dialog open={open} onOpenChange={setOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2"><Plus className="h-4 w-4" /> New team</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create a sales team</DialogTitle>
                                <DialogDescription>Leads can be assigned to a whole team, not just one agent.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="team-name">Name</Label>
                                    <Input id="team-name" placeholder="North Zone, Inbound, Enterprise…"
                                        value={name} onChange={(e) => setName(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="team-desc">Description (optional)</Label>
                                    <Textarea id="team-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button onClick={createTeam} disabled={!name.trim()}>Create team</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </header>

            {teams === null ? (
                <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
            ) : teams.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center justify-center px-6 py-20 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Network className="h-6 w-6" /></span>
                    <h3 className="text-base font-semibold text-foreground">No sales teams yet</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">Create a team to route leads to a group of agents instead of one person.</p>
                </CardContent></Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {teams.map((t) => {
                        const inTeam = new Set((t.members || []).map((m) => m.user_id));
                        const candidates = members.filter((m) => !inTeam.has(m.user_id));
                        return (
                            <Card key={t.id}>
                                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                                    <div>
                                        <CardTitle className="text-base">{t.name}</CardTitle>
                                        {t.description && <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">{t.member_count} member{t.member_count === 1 ? '' : 's'}</Badge>
                                        {canManage && (
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTeam(t)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {(t.members || []).length === 0 && <span className="text-xs text-muted-foreground">No members yet.</span>}
                                        {(t.members || []).map((m) => (
                                            <span key={m.user_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                                                {m.full_name || m.email}
                                                {canManage && (
                                                    <button onClick={() => removeMember(t, m.user_id)} className="text-muted-foreground hover:text-destructive">
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </span>
                                        ))}
                                    </div>
                                    {canManage && candidates.length > 0 && (
                                        <Select onValueChange={(v) => addMember(t, v)} value="">
                                            <SelectTrigger className="h-8">
                                                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserPlus className="h-3.5 w-3.5" /> Add member</span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {candidates.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.full_name || m.email}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
