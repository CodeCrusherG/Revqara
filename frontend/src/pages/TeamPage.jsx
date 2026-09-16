import React, { useEffect, useState } from 'react';
import { teamApi } from '../services/api';
import { useAuth } from '@/context/AuthContext';
import { UsersRound, UserPlus, Copy, Trash2, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

const ALL_ROLES = ['owner', 'admin', 'manager', 'agent', 'viewer'];
const ROLE_DESC = {
    owner: 'Full control incl. billing',
    admin: 'Manage team, campaigns, settings',
    manager: 'See all leads, assign, reports',
    agent: 'Only assigned leads & inbox',
    viewer: 'Read-only dashboards',
};

export default function TeamPage() {
    const { role: myRole, user } = useAuth();
    const canManage = myRole === 'owner' || myRole === 'admin';
    const assignableRoles = myRole === 'owner' ? ALL_ROLES : ALL_ROLES.filter((r) => r !== 'owner');

    const [members, setMembers] = useState(null);
    const [invites, setInvites] = useState([]);
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('agent');
    const [lastToken, setLastToken] = useState(null);

    const load = async () => {
        try { setMembers(await teamApi.members()); } catch { setMembers([]); }
        if (canManage) teamApi.invites().then(setInvites).catch(() => {});
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const sendInvite = async () => {
        try {
            const res = await teamApi.invite({ email: email.trim(), role });
            setLastToken(res.token);
            setEmail('');
            toast.success(`Invite created for ${res.email}`);
            load();
        } catch (e) { toast.error(e?.response?.data?.detail || 'Could not create invite'); }
    };

    const changeRole = async (m, newRole) => {
        try { await teamApi.updateMember(m.id, { role: newRole }); toast.success('Role updated'); load(); }
        catch (e) { toast.error(e?.response?.data?.detail || 'Could not update role'); }
    };

    const removeMember = async (m) => {
        try { await teamApi.removeMember(m.id); toast.success('Member removed'); load(); }
        catch (e) { toast.error(e?.response?.data?.detail || 'Could not remove member'); }
    };

    const copyInvite = (token) => {
        const link = `${window.location.origin}/accept-invite?token=${token}`;
        navigator.clipboard?.writeText(link);
        toast.success('Invite link copied');
    };

    return (
        <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
                        <UsersRound className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Team</h1>
                        <p className="text-sm text-muted-foreground">Members and roles for this workspace.</p>
                    </div>
                </div>
                {canManage && (
                    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setLastToken(null); }}>
                        <DialogTrigger asChild>
                            <Button className="gap-2"><UserPlus className="h-4 w-4" /> Invite member</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Invite a team member</DialogTitle>
                                <DialogDescription>They'll join this workspace with the role you pick.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                                <div className="space-y-2">
                                    <Label htmlFor="invite-email">Email</Label>
                                    <Input id="invite-email" type="email" placeholder="teammate@company.com"
                                        value={email} onChange={(e) => setEmail(e.target.value)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select value={role} onValueChange={setRole}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {assignableRoles.map((r) => (
                                                <SelectItem key={r} value={r}>
                                                    <span className="capitalize">{r}</span>
                                                    <span className="ml-1 text-xs text-muted-foreground">· {ROLE_DESC[r]}</span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {lastToken && (
                                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                                        <p className="mb-2 font-medium text-foreground">Invite link (no email is sent in this build):</p>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs">{`${window.location.origin}/accept-invite?token=${lastToken}`}</code>
                                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => copyInvite(lastToken)}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <DialogFooter>
                                <Button onClick={sendInvite} disabled={!email.trim()} className="gap-2">
                                    <Mail className="h-4 w-4" /> Create invite
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )}
            </header>

            <Card className="overflow-hidden">
                <CardContent className="p-0">
                    {members === null ? (
                        <div className="space-y-3 p-6">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Member</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Status</TableHead>
                                    {canManage && <TableHead className="text-right">Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {members.map((m) => {
                                    const editable = canManage && (myRole === 'owner' || m.role !== 'owner');
                                    const isMe = m.user_id === user?.id;
                                    return (
                                        <TableRow key={m.id}>
                                            <TableCell>
                                                <div className="font-medium text-foreground">{m.full_name || m.email}{isMe && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</div>
                                                <div className="text-xs text-muted-foreground">{m.email}</div>
                                            </TableCell>
                                            <TableCell>
                                                {editable && !isMe ? (
                                                    <Select value={m.role} onValueChange={(v) => changeRole(m, v)}>
                                                        <SelectTrigger className="h-8 w-[140px] capitalize"><SelectValue /></SelectTrigger>
                                                        <SelectContent>
                                                            {assignableRoles.map((r) => <SelectItem key={r} value={r}><span className="capitalize">{r}</span></SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                ) : (
                                                    <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={m.status === 'active' ? 'success' : 'outline'} className="capitalize">{m.status}</Badge>
                                            </TableCell>
                                            {canManage && (
                                                <TableCell className="text-right">
                                                    {!isMe && (myRole === 'owner' || m.role !== 'owner') && (
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeMember(m)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {canManage && invites.length > 0 && (
                <Card>
                    <CardHeader><CardTitle className="text-base">Pending invites</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {invites.map((i) => (
                            <div key={i.id} className="flex items-center justify-between rounded-lg border bg-card px-3 py-2 text-sm">
                                <span className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {i.email}</span>
                                <Badge variant="secondary" className="capitalize">{i.role}</Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
