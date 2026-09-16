import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, ArrowLeft, Loader2, Brain, GitBranch, ListChecks, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { DEMO_VERTICALS, DEMO_PASSWORD } from '@/lib/demoVerticals';

const fade = {
    initial: { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
};

export default function DemoPage() {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [loadingValue, setLoadingValue] = useState(null);

    const openDemo = async (v) => {
        setLoadingValue(v.value);
        try {
            await login({ email: v.email, password: DEMO_PASSWORD });
            navigate('/inbox');
        } catch {
            toast.error('This demo workspace is not seeded yet. Run scripts/seed_demo.py.');
            setLoadingValue(null);
        }
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Nav */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
                <div className="container flex h-16 items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-primary/20">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-lg font-bold tracking-tight">Nudge</span>
                    </Link>
                    <Button variant="ghost" asChild>
                        <Link to="/"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
                    </Button>
                </div>
            </header>

            {/* Hero */}
            <section className="container py-14 text-center lg:py-20">
                <motion.div {...fade}>
                    <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1">
                        <Brain className="h-3.5 w-3.5 text-primary" /> Live, interactive demo
                    </Badge>
                    <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                        One AI WhatsApp CRM.{' '}
                        <span className="bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                            A different brain for every business.
                        </span>
                    </h1>
                    <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
                        The same universal AI graph powers all of these. Pick a business below to open a fully
                        seeded workspace — real conversations, captured leads, and the AI&apos;s reasoning,
                        adapted to that vertical&apos;s pipeline, fields, replies, and escalation rules.
                    </p>
                </motion.div>

                <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><GitBranch className="h-4 w-4 text-primary" /> Vertical pipeline</span>
                    <span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-primary" /> Auto-captured fields</span>
                    <span className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-primary" /> On-brand replies</span>
                    <span className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-primary" /> Human handoff on risk</span>
                </div>
            </section>

            {/* Vertical grid */}
            <section className="container pb-24">
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {DEMO_VERTICALS.map((v, i) => {
                        const Icon = v.icon;
                        const busy = loadingValue === v.value;
                        return (
                            <motion.div key={v.value} {...fade} transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}>
                                <Card className="group flex h-full flex-col transition-shadow hover:shadow-lg">
                                    <CardContent className="flex flex-1 flex-col p-6">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <h3 className="text-lg font-semibold">{v.label}</h3>
                                        </div>
                                        <p className="mt-3 text-sm text-muted-foreground">{v.tagline}</p>

                                        <div className="mt-4 space-y-3 text-xs">
                                            <div>
                                                <div className="font-semibold uppercase tracking-wider text-muted-foreground/70">Pipeline</div>
                                                <p className="mt-1 text-foreground/80">{v.pipeline}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {v.captures.map((c) => (
                                                    <span key={c} className="rounded-md border border-border bg-muted/50 px-2 py-0.5 capitalize text-muted-foreground">{c}</span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-4 rounded-xl border bg-muted/30 p-3">
                                            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">Try sending</div>
                                            <ul className="mt-1.5 space-y-1">
                                                {v.prompts.map((p) => (
                                                    <li key={p} className="flex items-start gap-1.5 text-xs text-foreground/80">
                                                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" /> “{p}”
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <Button className="mt-5 w-full" onClick={() => openDemo(v)} disabled={busy}>
                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                            {busy ? 'Opening…' : 'Open live demo'}
                                            {!busy && <ArrowRight className="h-4 w-4" />}
                                        </Button>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                </div>

                <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
                    Inside each demo, open the <span className="font-medium text-foreground">Inbox</span> and use
                    “Simulate a message” (or the suggested prompts) to watch the AI classify intent, capture the
                    lead, reply on-brand, and hand off to a human when needed.
                </p>
            </section>
        </div>
    );
}
