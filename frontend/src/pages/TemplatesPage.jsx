import React, { useEffect, useState } from 'react';
import { templatesApi } from '../services/api';
import { FileText, Plus, Trash2, Loader2, CheckCircle2, Clock, Send, MessageSquare, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const CATEGORIES = ['marketing', 'utility', 'authentication', 'service'];

const STATUS_BADGE = {
    approved: { variant: 'success', icon: CheckCircle2, label: 'Approved' },
    draft: { variant: 'secondary', icon: FileText, label: 'Draft' },
    pending: { variant: 'warning', icon: Clock, label: 'Pending' },
    rejected: { variant: 'destructive', icon: XCircle, label: 'Rejected' },
};

function StatusBadge({ status }) {
    const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
    const Icon = cfg.icon;
    return (
        <Badge variant={cfg.variant} className="gap-1 capitalize">
            <Icon className="h-3 w-3" /> {cfg.label}
        </Badge>
    );
}

function TestSendModal({ template, open, onClose }) {
    const [number, setNumber] = useState('');
    const [name, setName] = useState('');
    const [result, setResult] = useState(null);
    const [sending, setSending] = useState(false);

    const send = async () => {
        setSending(true);
        try {
            const r = await templatesApi.testSend({ to_number: number, template_id: template.id, name });
            setResult(r);
            toast.success('Test message sent', { description: `From ${r.from_number}` });
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    const handleOpenChange = (v) => {
        if (!v) {
            onClose();
            setNumber('');
            setName('');
            setResult(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Send className="h-5 w-5 text-primary" /> Send test
                    </DialogTitle>
                    <DialogDescription>
                        Preview <span className="font-semibold text-foreground">{template.name}</span> by sending it to one number.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <div className="space-y-2">
                        <Label htmlFor="test-number">Test WhatsApp number</Label>
                        <Input
                            id="test-number"
                            placeholder="e.g. 919812345678"
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="test-name">Name for {'{{1}}'} <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                            id="test-name"
                            placeholder="Recipient name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>
                    <div className="rounded-lg border bg-muted/50 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                            {template.body.replace('{{1}}', name.split(' ')[0] || 'there')}
                        </p>
                    </div>
                    {result && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Sent from {result.from_number} · {result.wamid}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button onClick={send} disabled={sending || !number.trim()} className="w-full">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send test message
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function NewTemplateModal({ open, onClose, onSaved }) {
    const [form, setForm] = useState({ name: '', category: 'marketing', body: '' });
    const [saving, setSaving] = useState(false);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const save = async () => {
        setSaving(true);
        try {
            await templatesApi.create(form);
            toast.success('Draft template created');
            onSaved();
            setForm({ name: '', category: 'marketing', body: '' });
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not create template');
        } finally {
            setSaving(false);
        }
    };

    const handleOpenChange = (v) => {
        if (!v) onClose();
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5 text-primary" /> New template
                    </DialogTitle>
                    <DialogDescription>
                        Create a reusable message template for business-initiated sends.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <div className="space-y-2">
                        <Label htmlFor="tpl-name">Template name</Label>
                        <Input
                            id="tpl-name"
                            placeholder="e.g. festive_offer"
                            value={form.name}
                            onChange={set('name')}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tpl-category">Category</Label>
                        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                            <SelectTrigger id="tpl-category" className="capitalize">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tpl-body">Message body</Label>
                        <Textarea
                            id="tpl-body"
                            rows={4}
                            placeholder="Hi {{1}}, here's a special offer just for you…"
                            value={form.body}
                            onChange={set('body')}
                        />
                        <p className="text-xs text-muted-foreground">
                            Use {'{{1}}'}, {'{{2}}'} for variables. Marketing templates need approval before business-initiated sends.
                        </p>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        onClick={save}
                        disabled={saving || !form.name.trim() || !form.body.trim()}
                        className="w-full"
                    >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Create draft
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function TemplatesPage() {
    const [items, setItems] = useState(null);
    const [showNew, setShowNew] = useState(false);
    const [testTpl, setTestTpl] = useState(null);

    const load = async () => setItems(await templatesApi.list());
    useEffect(() => { load(); }, []);

    const submit = async (id) => {
        try {
            await templatesApi.submit(id);
            toast.success('Submitted for approval');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not submit template');
        }
    };

    const del = async (id) => {
        if (!confirm('Delete template?')) return;
        try {
            await templatesApi.remove(id);
            toast.success('Template deleted');
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || 'Could not delete template');
        }
    };

    return (
        <div className="mx-auto max-w-6xl p-6 md:p-8 space-y-8">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                    <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <FileText className="h-5 w-5" />
                        </span>
                        Message Templates
                    </h1>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                        Pre-approved templates for business-initiated messages, required outside the 24-hour window.
                    </p>
                </div>
                <Button onClick={() => setShowNew(true)} className="shrink-0">
                    <Plus className="h-4 w-4" /> New template
                </Button>
            </header>

            {items === null ? (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Card key={i} className="p-6 space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                                <Skeleton className="h-5 w-20 rounded-full" />
                            </div>
                            <Skeleton className="h-16 w-full rounded-lg" />
                            <Skeleton className="h-4 w-40" />
                        </Card>
                    ))}
                </div>
            ) : items.length === 0 ? (
                <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-20 text-center">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                        <MessageSquare className="h-7 w-7" />
                    </span>
                    <div className="space-y-1">
                        <p className="text-base font-semibold text-foreground">No templates yet</p>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            Create one, then submit it for approval to use in marketing sends.
                        </p>
                    </div>
                    <Button onClick={() => setShowNew(true)} variant="outline" className="mt-2">
                        <Plus className="h-4 w-4" /> Create your first template
                    </Button>
                </Card>
            ) : (
                <TooltipProvider delayDuration={200}>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        {items.map((t, i) => (
                            <motion.div
                                key={t.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                            >
                                <Card className="flex h-full flex-col gap-4 p-6 transition-shadow hover:shadow-md">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 space-y-1">
                                            <div className="truncate font-semibold text-foreground">{t.name}</div>
                                            <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                                                {t.category} · {t.language}
                                            </div>
                                        </div>
                                        <StatusBadge status={t.status} />
                                    </div>

                                    <p className="min-h-[3.5rem] whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm text-foreground/90">
                                        {t.body}
                                    </p>

                                    <Separator />

                                    <div className="flex items-center gap-2">
                                        {t.status !== 'approved' && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-primary hover:text-primary"
                                                onClick={() => submit(t.id)}
                                            >
                                                <CheckCircle2 className="h-4 w-4" /> Submit for approval
                                            </Button>
                                        )}
                                        <Button size="sm" variant="ghost" onClick={() => setTestTpl(t)}>
                                            <Send className="h-4 w-4" /> Send test
                                        </Button>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="ml-auto text-muted-foreground hover:text-destructive"
                                                    onClick={() => del(t.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Delete template</TooltipContent>
                                        </Tooltip>
                                    </div>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </TooltipProvider>
            )}

            <NewTemplateModal
                open={showNew}
                onClose={() => setShowNew(false)}
                onSaved={() => { setShowNew(false); load(); }}
            />
            {testTpl && (
                <TestSendModal
                    template={testTpl}
                    open={!!testTpl}
                    onClose={() => setTestTpl(null)}
                />
            )}
        </div>
    );
}
