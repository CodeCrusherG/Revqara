import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Sparkles, MessageSquare, Users, Wand2, LineChart, ShieldCheck, Check,
    ArrowRight, Brain, Send, Zap, Star, BarChart3,
    Menu, PlayCircle, GitBranch, GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { DEMO_VERTICALS } from '@/lib/demoVerticals';

const NAV = [
    { href: '#verticals', label: 'Verticals' },
    { href: '#how', label: 'How it works' },
    { href: '#features', label: 'Features' },
    { href: '#pricing', label: 'Pricing' },
];

const CREDIBILITY = [
    { icon: MessageSquare, stat: '98%', label: 'WhatsApp open rate' },
    { icon: Zap, stat: '5 agents', label: 'collaborate per campaign' },
    { icon: ShieldCheck, stat: 'Opt-in', label: 'consent & compliance built in' },
    { icon: Brain, stat: 'Cloud API', label: 'native WhatsApp delivery' },
];

const fade = {
    initial: { opacity: 0, y: 16 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.5 },
};

const STEPS = [
    { icon: Users, title: 'Bring your contacts', body: 'Import a CSV or sync your CRM. Group people into targetable lists in seconds.' },
    { icon: Wand2, title: 'Describe the campaign', body: 'One sentence. Five AI agents segment your audience, write the messages, and predict engagement.' },
    { icon: Send, title: 'Approve & send', body: 'Review the plan, approve, and Nudge sends on WhatsApp — then optimizes the next round automatically.' },
];

const FEATURES = [
    { icon: Brain, title: '5-agent AI workflow', body: 'Profiler, Planner, Creative, Analyst, and Optimizer collaborate on every campaign — with a glass-box reasoning trace.' },
    { icon: MessageSquare, title: 'Native WhatsApp', body: 'Built on the WhatsApp Cloud API. Delivery, read receipts, and CTA clicks tracked in real time.' },
    { icon: LineChart, title: 'Self-optimizing', body: 'Read/click engagement feeds a Bayesian loop that rewrites under-performing copy automatically.' },
    { icon: Users, title: 'Built-in CRM', body: 'Replies become leads. Track every conversation from first nudge to closed deal in one inbox.' },
    { icon: ShieldCheck, title: 'Compliant by default', body: 'Opt-out handling, consent tracking, and template approval baked into the workflow.' },
    { icon: BarChart3, title: 'Real-time analytics', body: 'Cohort-level read, click, and reply analytics update live as your campaign goes out.' },
];

const FAQ = [
    { q: 'Do I need a WhatsApp Business account?', a: 'Yes — Nudge connects to the WhatsApp Cloud API. We walk you through connecting your number in under five minutes.' },
    { q: 'How does the AI write my messages?', a: 'Describe your goal in one sentence. Our agent team profiles your audience, drafts on-brand copy, predicts engagement, and you approve before anything sends.' },
    { q: 'Can I try it before paying?', a: 'Yes. Open a live demo workspace for your vertical — no signup — or start a 14-day free trial with full access to the AI graph, inbox, and CRM.' },
    { q: 'Can I bring my own contacts?', a: 'Absolutely. Import via CSV or sync your CRM, then organize people into reusable lists and segments.' },
    { q: 'How do WhatsApp message charges work?', a: 'WhatsApp (Meta) charges a small per-message fee that varies by country and message category (marketing, utility, etc.). Nudge passes those through at cost — your plan covers the platform and AI, not Meta\'s messaging fees.' },
];

const PLANS = [
    {
        name: 'Starter', price: '₹1,499', cadence: '/mo', highlight: false,
        blurb: 'For solo founders and single-location SMBs.',
        features: ['1 WhatsApp number', 'Universal AI graph + your vertical pack', 'Shared team inbox', 'Auto lead capture & pipeline', '1,000 AI conversations / mo'],
        cta: 'Start free trial', to: '/signup',
    },
    {
        name: 'Growth', price: '₹2,999', cadence: '/mo', highlight: true,
        blurb: 'For growing teams running inbound + campaigns.',
        features: ['Everything in Starter', '3 team seats', 'AI campaigns + scheduling', 'Advanced analytics', '5,000 AI conversations / mo'],
        cta: 'Start free trial', to: '/signup',
    },
    {
        name: 'AI Pro', price: '₹6,999', cadence: '/mo', highlight: false,
        blurb: 'For high-volume sales & support teams.',
        features: ['Everything in Growth', '10 team seats', 'Priority template approval', 'Custom knowledge base', '25,000 AI conversations / mo'],
        cta: 'Start free trial', to: '/signup',
    },
    {
        name: 'Agency', price: '₹14,999+', cadence: '/mo', highlight: false,
        blurb: 'For agencies managing many client numbers.',
        features: ['Multiple workspaces', 'Unlimited seats', 'White-glove onboarding', 'Dedicated support', 'Volume AI pricing'],
        cta: 'Book a demo', to: '/demo',
    },
];

function Logo() {
    return (
        <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-primary/20">
                <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Nudge</span>
        </Link>
    );
}

function ProductMock() {
    return (
        <Card className="overflow-hidden border-border/60 bg-card/90 shadow-2xl shadow-primary/10 backdrop-blur">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
                <span className="h-3 w-3 rounded-full bg-red-400/80" />
                <span className="h-3 w-3 rounded-full bg-amber-400/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs font-medium text-muted-foreground">Nudge · Inbox</span>
                <Badge variant="secondary" className="ml-auto gap-1 text-[10px]">
                    <GraduationCap className="h-3 w-3 text-primary" /> Coaching institute
                </Badge>
            </div>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-5">
                {/* Conversation */}
                <div className="space-y-3 sm:col-span-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">RS</span>
                        Rohan Sharma · +91 98120 00101
                    </div>
                    <div className="flex justify-start">
                        <p className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2 text-sm shadow-sm">
                            Fees kitna hai for class 11 JEE weekend batch?
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground shadow-sm">
                            <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                                <Sparkles className="h-3 w-3" /> AI
                            </div>
                            Fees depend on class band, mode, and batch type. I can route this to the class 11 JEE weekend fee plan and demo slot.
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                        Complaint or refund → auto-handed to a human agent.
                    </div>
                </div>

                {/* AI Analysis */}
                <div className="space-y-3 rounded-xl border bg-muted/30 p-3 sm:col-span-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Brain className="h-3.5 w-3.5 text-primary" /> AI Analysis
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Intent</div>
                        <Badge variant="secondary" className="mt-1 text-[11px]">PRICE_QUERY</Badge>
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Captured</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                            {['exam: JEE', 'class: 11', 'batch: weekend'].map((c) => (
                                <span key={c} className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px]">{c}</span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pipeline stage</div>
                        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <GitBranch className="h-3 w-3" /> fee discussed
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Nav */}
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur">
                <div className="container flex h-16 items-center justify-between">
                    <Logo />
                    <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
                        {NAV.map((n) => (
                            <a key={n.href} href={n.href} className="transition-colors hover:text-foreground">{n.label}</a>
                        ))}
                    </nav>
                    <div className="hidden items-center gap-2 md:flex">
                        <Button variant="ghost" asChild>
                            <Link to="/demo"><PlayCircle className="h-4 w-4" /> Live demo</Link>
                        </Button>
                        <Button variant="ghost" asChild>
                            <Link to="/login">Log in</Link>
                        </Button>
                        <Button asChild>
                            <Link to="/signup">Get started <ArrowRight className="h-4 w-4" /></Link>
                        </Button>
                    </div>

                    {/* Mobile menu */}
                    <Sheet>
                        <SheetTrigger asChild className="md:hidden">
                            <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-72">
                            <div className="mb-8 mt-2"><Logo /></div>
                            <nav className="flex flex-col gap-1">
                                {NAV.map((n) => (
                                    <SheetClose asChild key={n.href}>
                                        <a href={n.href} className="rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                                            {n.label}
                                        </a>
                                    </SheetClose>
                                ))}
                            </nav>
                            <div className="mt-6 space-y-2 border-t pt-6">
                                <SheetClose asChild>
                                    <Button variant="outline" className="w-full" asChild>
                                        <Link to="/demo"><PlayCircle className="h-4 w-4" /> Live demo</Link>
                                    </Button>
                                </SheetClose>
                                <SheetClose asChild>
                                    <Button variant="ghost" className="w-full" asChild><Link to="/login">Log in</Link></Button>
                                </SheetClose>
                                <SheetClose asChild>
                                    <Button className="w-full" asChild><Link to="/signup">Get started</Link></Button>
                                </SheetClose>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </header>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 -z-10">
                    <div className="absolute left-1/2 top-[-10%] h-[480px] w-[820px] -translate-x-1/2 rounded-full bg-gradient-to-r from-teal-500/20 via-emerald-500/20 to-fuchsia-500/10 blur-3xl" />
                </div>
                <div className="container grid items-center gap-12 py-20 lg:grid-cols-2 lg:py-28">
                    <motion.div {...fade}>
                        <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Vertical-aware AI WhatsApp CRM
                        </Badge>
                        <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                            One AI WhatsApp CRM.{' '}
                            <span className="bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent">
                                A different brain
                            </span>{' '}
                            for every business.
                        </h1>
                        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                            Nudge turns every WhatsApp reply into CRM updates, lead stages, follow-ups, and human
                            handoffs — using one universal AI graph that adapts to coaching, clinics, real estate,
                            salons, ecommerce, B2B, travel, and civic-office workflows.
                        </p>
                        <div className="mt-8 flex flex-wrap items-center gap-3">
                            <Button size="lg" asChild>
                                <Link to="/demo">Try a live demo <ArrowRight className="h-4 w-4" /></Link>
                            </Button>
                            <Button size="lg" variant="outline" asChild>
                                <Link to="/signup"><PlayCircle className="h-4 w-4" /> Start free trial</Link>
                            </Button>
                        </div>
                        <p className="mt-4 text-sm text-muted-foreground">
                            14-day free trial · No credit card required · Live demo — no signup
                        </p>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                    >
                        <ProductMock />
                    </motion.div>
                </div>
            </section>

            {/* Credibility strip (honest, fact-based) */}
            <section className="border-y bg-muted/30 py-8">
                <div className="container grid grid-cols-2 gap-6 sm:grid-cols-4">
                    {CREDIBILITY.map((c) => (
                        <div key={c.label} className="flex items-center justify-center gap-3 text-center sm:justify-start sm:text-left">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <c.icon className="h-5 w-5" />
                            </span>
                            <div>
                                <div className="text-base font-bold leading-none tracking-tight">{c.stat}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Verticals — one graph, different brain */}
            <section id="verticals" className="container py-20 lg:py-28">
                <motion.div {...fade} className="mx-auto max-w-2xl text-center">
                    <Badge variant="secondary" className="mb-4 gap-1.5"><GitBranch className="h-3.5 w-3.5 text-primary" /> One universal graph</Badge>
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">A different brain for every business</h2>
                    <p className="mt-4 text-muted-foreground">
                        The same AI graph runs everywhere. Pick your vertical and it instantly adapts its pipeline
                        stages, the fields it captures, how it replies, and when it hands off to a human.
                    </p>
                </motion.div>
                <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {DEMO_VERTICALS.map((v, i) => {
                        const Icon = v.icon;
                        return (
                            <motion.div key={v.value} {...fade} transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}>
                                <Card className="group h-full transition-shadow hover:shadow-lg">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <h3 className="font-semibold">{v.label}</h3>
                                        </div>
                                        <p className="mt-3 text-sm text-muted-foreground">{v.tagline}</p>
                                        <p className="mt-3 text-xs text-muted-foreground/80">{v.pipeline}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        );
                    })}
                    <motion.div {...fade} transition={{ duration: 0.5, delay: 0.16 }}>
                        <Card className="flex h-full items-center justify-center border-dashed bg-muted/30">
                            <CardContent className="p-6 text-center">
                                <p className="text-sm font-medium">Don&apos;t see yours?</p>
                                <p className="mt-1 text-xs text-muted-foreground">Start with the <span className="font-medium text-foreground">Custom</span> pack — it works for any business.</p>
                                <Button variant="outline" size="sm" className="mt-4" asChild>
                                    <Link to="/demo">Open a live demo <ArrowRight className="h-4 w-4" /></Link>
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </section>

            {/* Problem -> Solution */}
            <section className="container py-20 lg:py-28">
                <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
                    <motion.div {...fade}>
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                            Broadcast blasts are dead. Conversations convert.
                        </h2>
                        <p className="mt-4 text-muted-foreground">
                            Email open rates are collapsing and ad costs keep climbing. Meanwhile WhatsApp messages
                            get a 98% open rate — but running personalized campaigns by hand doesn&apos;t scale.
                        </p>
                        <div className="mt-6 space-y-3">
                            {[
                                'Generic blasts get ignored and flagged as spam',
                                'Personalization at scale needs a team you don\'t have',
                                'Replies pile up with nowhere to track them',
                            ].map((t) => (
                                <div key={t} className="flex items-start gap-3 text-sm text-muted-foreground">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">×</span>
                                    {t}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div {...fade}>
                        <Card className="h-full bg-gradient-to-br from-primary/5 to-emerald-500/5">
                            <CardContent className="space-y-4 p-8">
                                <h3 className="text-xl font-bold">Nudge does it for you</h3>
                                {[
                                    'AI writes personalized copy for every segment',
                                    'Predicts engagement before you spend a send',
                                    'Replies auto-convert into tracked leads',
                                    'The optimizer improves every campaign automatically',
                                ].map((t) => (
                                    <div key={t} className="flex items-start gap-3 text-sm">
                                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                                            <Check className="h-3 w-3" />
                                        </span>
                                        {t}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </section>

            {/* How it works */}
            <section id="how" className="border-y bg-muted/30 py-20 lg:py-28">
                <div className="container">
                    <motion.div {...fade} className="mx-auto max-w-2xl text-center">
                        <Badge variant="secondary" className="mb-4">How it works</Badge>
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From idea to inbox in three steps</h2>
                        <p className="mt-4 text-muted-foreground">No funnels to build. No templates to wrangle. Just describe what you want.</p>
                    </motion.div>
                    <div className="mt-14 grid gap-6 md:grid-cols-3">
                        {STEPS.map((s, i) => (
                            <motion.div key={s.title} {...fade} transition={{ duration: 0.5, delay: i * 0.1 }}>
                                <Card className="h-full">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                                <s.icon className="h-5 w-5" />
                                            </div>
                                            <span className="text-3xl font-extrabold text-muted-foreground/20 tabular-nums">
                                                0{i + 1}
                                            </span>
                                        </div>
                                        <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                                        <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="container py-20 lg:py-28">
                <motion.div {...fade} className="mx-auto max-w-2xl text-center">
                    <Badge variant="secondary" className="mb-4">Features</Badge>
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to run on WhatsApp</h2>
                    <p className="mt-4 text-muted-foreground">A complete, AI-native CRM — from first message to closed deal.</p>
                </motion.div>
                <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f, i) => (
                        <motion.div key={f.title} {...fade} transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}>
                            <Card className="group h-full transition-shadow hover:shadow-lg">
                                <CardContent className="p-6">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-110">
                                        <f.icon className="h-5 w-5" />
                                    </div>
                                    <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Pricing */}
            <section id="pricing" className="border-y bg-muted/30 py-20 lg:py-28">
                <div className="container">
                    <motion.div {...fade} className="mx-auto max-w-2xl text-center">
                        <Badge variant="secondary" className="mb-4">Pricing</Badge>
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start free. Scale when you&apos;re ready.</h2>
                        <p className="mt-4 text-muted-foreground">Transparent platform pricing. Cancel anytime.</p>
                    </motion.div>
                    <div className="mx-auto mt-14 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
                        {PLANS.map((p) => (
                            <motion.div key={p.name} {...fade}>
                                <Card className={p.highlight ? 'relative h-full border-primary shadow-xl shadow-primary/10' : 'h-full'}>
                                    {p.highlight && (
                                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                            <Badge className="gap-1"><Star className="h-3 w-3" /> Most popular</Badge>
                                        </div>
                                    )}
                                    <CardContent className="flex h-full flex-col p-6">
                                        <h3 className="text-lg font-semibold">{p.name}</h3>
                                        <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                                        <div className="mt-5 flex items-end gap-1">
                                            <span className="text-3xl font-extrabold tracking-tight tabular-nums">{p.price}</span>
                                            <span className="pb-1 text-sm text-muted-foreground">{p.cadence}</span>
                                        </div>
                                        <Button asChild className="mt-6 w-full" variant={p.highlight ? 'default' : 'outline'}>
                                            <Link to={p.to}>{p.cta}</Link>
                                        </Button>
                                        <Separator className="my-6" />
                                        <ul className="space-y-3">
                                            {p.features.map((f) => (
                                                <li key={f} className="flex items-start gap-3 text-sm">
                                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                    <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-muted-foreground">
                        Plans cover the Nudge platform and AI. Meta&apos;s WhatsApp per-message charges — which vary by
                        country and message category — are billed separately and passed through at cost.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section id="faq" className="container py-20 lg:py-28">
                <motion.div {...fade} className="mx-auto max-w-2xl text-center">
                    <Badge variant="secondary" className="mb-4">FAQ</Badge>
                    <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
                </motion.div>
                <div className="mx-auto mt-12 grid max-w-3xl gap-4">
                    {FAQ.map((item) => (
                        <motion.div key={item.q} {...fade}>
                            <Card>
                                <CardContent className="p-6">
                                    <h3 className="font-semibold">{item.q}</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Big CTA */}
            <section className="container pb-20 lg:pb-28">
                <motion.div {...fade}>
                    <Card className="overflow-hidden border-0 bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-2xl shadow-primary/20">
                        <CardContent className="relative px-8 py-16 text-center">
                            <div className="pointer-events-none absolute inset-0 opacity-20">
                                <div className="absolute left-1/4 top-0 h-64 w-64 rounded-full bg-white blur-3xl" />
                            </div>
                            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
                                Give your business its WhatsApp brain.
                            </h2>
                            <p className="relative mx-auto mt-4 max-w-xl text-white/80">
                                Open a live demo for your vertical, or start a free trial and connect your number in minutes.
                            </p>
                            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                                <Button size="lg" variant="secondary" asChild>
                                    <Link to="/signup">Start free trial <ArrowRight className="h-4 w-4" /></Link>
                                </Button>
                                <Button size="lg" variant="outline" asChild className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
                                    <Link to="/demo"><PlayCircle className="h-4 w-4" /> Try a live demo</Link>
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </section>

            {/* Footer */}
            <footer className="border-t">
                <div className="container flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
                    <Logo />
                    <nav className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                        <a href="#features" className="hover:text-foreground">Features</a>
                        <a href="#pricing" className="hover:text-foreground">Pricing</a>
                        <a href="#faq" className="hover:text-foreground">FAQ</a>
                        <Link to="/login" className="hover:text-foreground">Log in</Link>
                    </nav>
                    <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Nudge. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
