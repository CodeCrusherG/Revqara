import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { listsApi, contactsApi } from '../services/api';
import {
    ListChecks,
    Plus,
    Trash2,
    Loader2,
    UserPlus,
    Users,
    Search,
    Check,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Avatar,
    AvatarFallback,
} from '@/components/ui/avatar';

function initials(name, fallback) {
    const src = (name || fallback || '?').trim();
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AddMembersModal({ list, onClose, onChanged }) {
    const [contacts, setContacts] = useState([]);
    const [members, setMembers] = useState(new Set());
    const [selected, setSelected] = useState(new Set());
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [all, mem] = await Promise.all([
                contactsApi.list('', 500),
                listsApi.members(list.id),
            ]);
            setContacts(all.contacts);
            setMembers(new Set(mem.contacts.map((c) => c.id)));
        } catch (err) {
            toast.error('Could not load contacts for this list.');
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [list.id]);

    const toggle = (id) => {
        const next = new Set(selected);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelected(next);
    };
    const addSelected = async () => {
        setSaving(true);
        try {
            await listsApi.addMembers(list.id, [...selected]);
            const count = selected.size;
            setSelected(new Set());
            await load();
            onChanged();
            toast.success(`Added ${count} contact${count === 1 ? '' : 's'} to ${list.name}.`);
        } catch (err) {
            toast.error('Could not add contacts to the list.');
        } finally {
            setSaving(false);
        }
    };
    const removeMember = async (id) => {
        try {
            await listsApi.removeMember(list.id, id);
            await load();
            onChanged();
            toast.success('Contact removed from list.');
        } catch (err) {
            toast.error('Could not remove the contact.');
        }
    };

    const filtered = useMemo(
        () =>
            contacts.filter((c) =>
                `${c.full_name || ''} ${c.whatsapp_number}`
                    .toLowerCase()
                    .includes(q.toLowerCase()),
            ),
        [contacts, q],
    );

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                            <Users className="size-4" />
                        </span>
                        {list.name}
                    </DialogTitle>
                    <DialogDescription>
                        Search and select contacts, then add them to this audience.
                    </DialogDescription>
                </DialogHeader>

                <div className="px-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search contacts…"
                            className="pl-9"
                            autoFocus
                        />
                    </div>
                </div>

                <ScrollArea className="custom-scrollbar mt-3 h-[44vh] px-3">
                    <div className="space-y-1 px-3 pb-2">
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-2 py-2">
                                    <Skeleton className="size-9 rounded-full" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3.5 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                </div>
                            ))
                        ) : filtered.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                                No contacts match “{q}”.
                            </div>
                        ) : (
                            filtered.map((c) => {
                                const isMember = members.has(c.id);
                                const isSel = selected.has(c.id);
                                return (
                                    <div
                                        key={c.id}
                                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                                            isSel
                                                ? 'border-primary/40 bg-primary/5'
                                                : 'border-transparent hover:bg-muted/60'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            className="flex flex-1 items-center gap-3 text-left disabled:cursor-default"
                                            onClick={() => !isMember && toggle(c.id)}
                                            disabled={isMember}
                                        >
                                            <Avatar className="size-9">
                                                <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                                                    {initials(c.full_name, c.whatsapp_number)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-foreground">
                                                    {c.full_name || c.whatsapp_number}
                                                </p>
                                                <p className="truncate text-xs tabular-nums text-muted-foreground">
                                                    {c.whatsapp_number}
                                                </p>
                                            </div>
                                        </button>
                                        {isMember ? (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs text-destructive hover:text-destructive"
                                                onClick={() => removeMember(c.id)}
                                            >
                                                Remove
                                            </Button>
                                        ) : isSel ? (
                                            <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                                                <Check className="size-3.5" />
                                            </span>
                                        ) : (
                                            <span className="text-xs font-medium text-muted-foreground/60">
                                                Tap
                                            </span>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </ScrollArea>

                <Separator />
                <DialogFooter className="p-6 pt-4">
                    <Button
                        onClick={addSelected}
                        disabled={selected.size === 0 || saving}
                        className="w-full"
                    >
                        {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <UserPlus className="size-4" />
                        )}
                        Add {selected.size || ''} to list
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function ListsPage() {
    const [lists, setLists] = useState(null);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);

    const load = async () => setLists(await listsApi.list());
    useEffect(() => {
        load();
    }, []);

    const create = async () => {
        if (!name.trim()) return;
        setCreating(true);
        try {
            await listsApi.create({ name: name.trim() });
            setName('');
            await load();
            toast.success('List created.');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not create list.');
        } finally {
            setCreating(false);
        }
    };
    const del = async (id) => {
        if (!confirm('Delete this list?')) return;
        try {
            await listsApi.remove(id);
            await load();
            toast.success('List deleted.');
        } catch (err) {
            toast.error('Could not delete the list.');
        }
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
            <header className="space-y-1.5">
                <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
                    <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <ListChecks className="size-5" />
                    </span>
                    Contact Lists
                </h1>
                <p className="text-muted-foreground">
                    Group contacts into audiences you can target with a campaign.
                </p>
            </header>

            <Card>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && create()}
                        placeholder="New list name…"
                        className="sm:max-w-sm"
                    />
                    <Button
                        onClick={create}
                        disabled={creating || !name.trim()}
                        className="sm:w-auto"
                    >
                        {creating ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Plus className="size-4" />
                        )}
                        Create list
                    </Button>
                </CardContent>
            </Card>

            {lists === null ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Card key={i}>
                            <CardContent className="flex flex-col gap-4 p-6">
                                <div className="flex items-start justify-between">
                                    <Skeleton className="size-10 rounded-xl" />
                                    <Skeleton className="size-4" />
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                                <Skeleton className="h-4 w-28" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : lists.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                        <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
                            <ListChecks className="size-6" />
                        </span>
                        <div className="space-y-1">
                            <p className="font-semibold text-foreground">No lists yet</p>
                            <p className="text-sm text-muted-foreground">
                                Create your first audience using the field above.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {lists.map((l, i) => (
                        <motion.div
                            key={l.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                        >
                            <Card className="group h-full transition-shadow hover:shadow-md">
                                <CardContent className="flex h-full flex-col gap-4 p-6">
                                    <div className="flex items-start justify-between">
                                        <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                                            <Users className="size-5" />
                                        </span>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                                        onClick={() => del(l.id)}
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Delete list</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </div>
                                    <div className="space-y-1">
                                        <h3 className="font-semibold text-foreground">{l.name}</h3>
                                        <Badge variant="secondary" className="tabular-nums font-medium">
                                            {l.member_count} contact{l.member_count === 1 ? '' : 's'}
                                        </Badge>
                                    </div>
                                    <div className="mt-auto pt-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            onClick={() => setEditing(l)}
                                        >
                                            <UserPlus className="size-4" />
                                            Manage contacts
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            )}

            {editing && (
                <AddMembersModal
                    list={editing}
                    onClose={() => setEditing(null)}
                    onChanged={load}
                />
            )}
        </div>
    );
}
