import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { contactsApi, billingApi } from '../services/api';
import {
    Users, Search, Upload, Plus, Trash2, Loader2, Sparkles,
    UserPlus, ShieldCheck, ShieldX, ShieldQuestion, Tag, MapPin, Wallet,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
    Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
    Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@/components/ui/tooltip';

function AddContactDialog({ open, onOpenChange, onSaved }) {
    const empty = { full_name: '', whatsapp_number: '', email: '', city: '', monthly_income: '', existing_customer: '' };
    const [form, setForm] = useState(empty);
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    useEffect(() => { if (open) { setForm(empty); } }, [open]);

    const save = async () => {
        setSaving(true);
        try {
            const payload = { ...form };
            if (payload.monthly_income) payload.monthly_income = parseInt(payload.monthly_income, 10);
            else delete payload.monthly_income;
            Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
            await contactsApi.create(payload);
            toast.success('Contact added');
            onSaved();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not save contact.');
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <UserPlus className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle>Add contact</DialogTitle>
                            <DialogDescription>Manually add a single contact to your workspace.</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="full_name">Full name</Label>
                        <Input id="full_name" placeholder="Priya Sharma" value={form.full_name} onChange={set('full_name')} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="whatsapp_number">WhatsApp number</Label>
                        <Input id="whatsapp_number" placeholder="919876543210" value={form.whatsapp_number} onChange={set('whatsapp_number')} className="tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input id="email" type="email" placeholder="priya@example.com" value={form.email} onChange={set('email')} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="city">City</Label>
                            <Input id="city" placeholder="Mumbai" value={form.city} onChange={set('city')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="monthly_income">Monthly income</Label>
                            <Input id="monthly_income" inputMode="numeric" placeholder="50000" value={form.monthly_income} onChange={set('monthly_income')} className="tabular-nums" />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Existing customer?</Label>
                        <Select value={form.existing_customer} onValueChange={(v) => setForm((f) => ({ ...f, existing_customer: v }))}>
                            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Y">Yes</SelectItem>
                                <SelectItem value="N">No</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={save} disabled={saving || !form.whatsapp_number}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save contact
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ConsentBadge({ status }) {
    if (status === 'opted_in') {
        return <Badge variant="success" className="gap-1"><ShieldCheck className="h-3 w-3" /> Opted in</Badge>;
    }
    if (status === 'opted_out') {
        return <Badge variant="destructive" className="gap-1"><ShieldX className="h-3 w-3" /> Opted out</Badge>;
    }
    return <Badge variant="secondary" className="gap-1"><ShieldQuestion className="h-3 w-3" /> Unknown</Badge>;
}

function TagChips({ tags }) {
    const list = Array.isArray(tags)
        ? tags
        : typeof tags === 'string' && tags.trim()
            ? tags.split(',').map((t) => t.trim()).filter(Boolean)
            : [];
    if (!list.length) return <span className="text-muted-foreground">—</span>;
    const shown = list.slice(0, 3);
    return (
        <div className="flex flex-wrap items-center gap-1">
            {shown.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    <Tag className="h-2.5 w-2.5" /> {t}
                </span>
            ))}
            {list.length > shown.length && (
                <span className="text-[11px] text-muted-foreground">+{list.length - shown.length}</span>
            )}
        </div>
    );
}

export default function ContactsPage() {
    const [data, setData] = useState({ total: 0, contacts: [] });
    const [usage, setUsage] = useState(null);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [busy, setBusy] = useState('');
    const fileRef = useRef();

    const load = async (q = query) => {
        setLoading(true);
        const [contacts, u] = await Promise.all([contactsApi.list(q, 200), billingApi.usage().catch(() => null)]);
        setData(contacts);
        setUsage(u);
        setLoading(false);
    };
    useEffect(() => { load(''); }, []);

    const onImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setBusy('import');
        try {
            const res = await contactsApi.importCsv(file);
            toast.success(`Imported: ${res.created} added, ${res.updated} updated, ${res.skipped} skipped.`);
            await load('');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Import failed.');
        } finally {
            setBusy(''); if (fileRef.current) fileRef.current.value = '';
        }
    };

    const seedDemo = async () => {
        setBusy('seed');
        try {
            await contactsApi.seedDemo(100);
            toast.success('Demo contacts loaded');
            await load('');
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not load demo contacts.');
        } finally { setBusy(''); }
    };

    const del = async (id) => {
        if (!confirm('Delete this contact?')) return;
        try {
            await contactsApi.remove(id);
            toast.success('Contact deleted');
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not delete contact.');
        }
    };

    const toggleConsent = async (c) => {
        try {
            if (c.opt_in_status === 'opted_out') await contactsApi.optIn(c.id);
            else await contactsApi.optOut(c.id);
            toast.success(c.opt_in_status === 'opted_out' ? 'Contact opted in' : 'Contact opted out');
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || 'Could not update consent.');
        }
    };

    const limit = usage?.contacts?.limit;
    const pct = limit ? Math.min(100, Math.round((data.total / limit) * 100)) : null;

    return (
        <TooltipProvider delayDuration={200}>
            <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
                {/* Header */}
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Users className="h-5 w-5" />
                            </span>
                            Contacts
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            <span className="font-semibold tabular-nums text-foreground">{data.total.toLocaleString()}</span>
                            {limit ? <span className="tabular-nums"> / {limit.toLocaleString()}</span> : null} contacts in your workspace
                            {pct != null && <span className="ml-1">· {pct}% of plan</span>}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input ref={fileRef} type="file" accept=".csv" hidden onChange={onImport} />
                        <Button variant="outline" onClick={seedDemo} disabled={!!busy}>
                            {busy === 'seed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Load demo data
                        </Button>
                        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                            {busy === 'import' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            Import CSV
                        </Button>
                        <Button onClick={() => setShowAdd(true)}>
                            <Plus className="h-4 w-4" /> Add contact
                        </Button>
                    </div>
                </header>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && load()}
                        placeholder="Search name, number, email… (press Enter)"
                        className="pl-9"
                    />
                </div>

                {/* Table */}
                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="space-y-3 p-6">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <Skeleton className="h-9 w-9 rounded-full" />
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                                    </div>
                                ))}
                            </div>
                        ) : data.contacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                                    <Users className="h-7 w-7" />
                                </div>
                                <p className="text-base font-semibold text-foreground">No contacts yet</p>
                                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    Add a contact, import a CSV, or load demo data to get your audience started.
                                </p>
                                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                    <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> Add contact</Button>
                                    <Button variant="outline" onClick={seedDemo} disabled={!!busy}>
                                        {busy === 'seed' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        Load demo data
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead>Name</TableHead>
                                        <TableHead>WhatsApp</TableHead>
                                        <TableHead>City</TableHead>
                                        <TableHead className="text-right">Income</TableHead>
                                        <TableHead>Tags</TableHead>
                                        <TableHead>Consent</TableHead>
                                        <TableHead className="w-10" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.contacts.map((c, i) => (
                                        <motion.tr
                                            key={c.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.15, delay: Math.min(i * 0.012, 0.25) }}
                                            className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                        {(c.full_name || c.whatsapp_number || '?').slice(0, 1).toUpperCase()}
                                                    </span>
                                                    <span className="font-medium text-foreground">{c.full_name || '—'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="tabular-nums text-muted-foreground">{c.whatsapp_number}</TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {c.city ? (
                                                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.city}</span>
                                                ) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-muted-foreground">
                                                {c.monthly_income ? `₹${c.monthly_income.toLocaleString()}` : '—'}
                                            </TableCell>
                                            <TableCell><TagChips tags={c.tags} /></TableCell>
                                            <TableCell>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            onClick={() => toggleConsent(c)}
                                                            className="cursor-pointer rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            <ConsentBadge status={c.opt_in_status} />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>
                                                        {c.opt_in_status === 'opted_out' ? 'Click to opt in' : 'Click to opt out'}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                                            onClick={() => del(c.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Delete contact</TooltipContent>
                                                </Tooltip>
                                            </TableCell>
                                        </motion.tr>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                <AddContactDialog
                    open={showAdd}
                    onOpenChange={setShowAdd}
                    onSaved={() => { setShowAdd(false); load(''); }}
                />
            </div>
        </TooltipProvider>
    );
}
