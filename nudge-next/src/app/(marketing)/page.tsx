"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  GitBranch,
  Inbox,
  Languages,
  ListChecks,
  MessageSquare,
  Sparkles,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/motion/FadeIn";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Reveal } from "@/components/motion/Reveal";
import { VerticalGrid } from "@/components/marketing/vertical-grid";
import { PLAN_LIST } from "@/lib/billing/plans";
import { INDIAN_LANGUAGES } from "@/lib/india-languages";

const FEATURES = [
  {
    icon: Bot,
    title: "Vertical-aware AI",
    body: "One deterministic graph, 12 industry packs. It classifies intent, extracts the right fields, and advances the right pipeline stage for your business — not a generic chatbot.",
  },
  {
    icon: Inbox,
    title: "A real inbox, not a blast tool",
    body: "Every conversation lands in a control room with auto-reply, an AI activity timeline, and one-click handoff to a human when it matters.",
  },
  {
    icon: Workflow,
    title: "Leads that move themselves",
    body: "Kanban pipelines tuned per industry. The AI captures, qualifies, and routes leads to the right agent or sales team automatically.",
  },
];

/** What the AI does on every reply — the "control room" reasoning, visualised. */
const REASONING = [
  { icon: GitBranch, label: "Vertical pipeline" },
  { icon: ListChecks, label: "Auto-captured fields" },
  { icon: MessageSquare, label: "On-brand replies" },
  { icon: Bot, label: "Human handoff on risk" },
];

const REGIONAL_LANGUAGES = INDIAN_LANGUAGES.filter((language) =>
  ["hi", "ta", "te", "gu", "mr", "pa", "kn", "ml", "bn", "ur"].includes(
    language.code,
  ),
);

/** INR money formatter for the pricing teaser. */
const inr = (n: number) =>
  n === 0 ? "Free" : `₹${n.toLocaleString("en-IN")}`;

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Aurora + grid backdrop (hidden on small screens). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden md:block"
        >
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
          <div className="animate-aurora absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/30 blur-[120px]" />
        </div>

        <div className="container flex flex-col items-center py-20 text-center md:py-28">
          <FadeIn>
            <Badge variant="secondary" className="mb-6 gap-1.5 py-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              WhatsApp Cloud API · 12 industry packs
            </Badge>
          </FadeIn>

          <FadeIn delay={0.05} className="max-w-4xl">
            <h1 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
              Not another WhatsApp campaign tool —{" "}
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
                a control room that understands your business type
              </span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.12} className="mt-6 max-w-2xl">
            <p className="text-balance text-lg text-muted-foreground md:text-xl">
              Revqara turns every WhatsApp reply into CRM updates, lead stages,
              follow-ups, and human handoffs — using one universal AI graph that
              adapts to coaching, clinics, real estate, and 9 more verticals out
              of the box.
            </p>
          </FadeIn>

          <FadeIn delay={0.18}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/sign-up">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/demo">Try the live demo</Link>
              </Button>
            </div>
          </FadeIn>

          <FadeIn delay={0.22}>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {REASONING.map((r) => (
                <span key={r.label} className="flex items-center gap-1.5">
                  <r.icon className="h-4 w-4 text-primary" />
                  {r.label}
                </span>
              ))}
            </div>
          </FadeIn>

          {/* Product mock — glass card with brand glow. */}
          <FadeIn delay={0.26} className="mt-16 w-full max-w-4xl">
            <Card className="glass glow-primary overflow-hidden p-1.5">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1.4fr]">
                <div className="hidden flex-col gap-2 rounded-lg bg-sidebar p-4 sm:flex">
                  {["New chat", "Qualified", "Follow-up", "Converted"].map(
                    (s, i) => (
                      <div
                        key={s}
                        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                          i === 0
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground"
                        }`}
                      >
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        {s}
                      </div>
                    ),
                  )}
                </div>
                <div className="flex flex-col gap-3 rounded-lg bg-card p-5 text-left">
                  <div className="self-start rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm">
                    Hi, do you have a weekend batch for the IIT foundation
                    course?
                  </div>
                  <div className="self-end rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
                    Yes! Weekend batches start Saturday 10am. Want me to book a
                    free demo class?
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    AI captured lead · stage → demo_scheduled
                  </div>
                </div>
              </div>
            </Card>
          </FadeIn>
        </div>
      </section>

      {/* Feature trio */}
      <section className="container py-20">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Built around your pipeline, not a template
          </h2>
          <p className="mt-3 text-muted-foreground">
            The same AI graph adapts to 12 verticals — the difference is in the
            packs, the stages, and the guardrails.
          </p>
        </Reveal>

        <Stagger className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <StaggerItem key={f.title}>
              <Card className="lift h-full p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Regional language moat */}
      <section className="container py-12">
        <div className="grid items-center gap-8 rounded-lg border border-border bg-card/70 p-6 shadow-sm backdrop-blur md:grid-cols-[0.9fr_1.1fr] md:p-8">
          <Reveal>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <Languages className="h-3.5 w-3.5 text-primary" />
              Regional-first WhatsApp AI
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Win the market most tools still ignore.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Revqara can auto-detect or target major Indian languages for AI
              replies and campaign copy, so local customers see your business in
              the language they actually use on WhatsApp.
            </p>
          </Reveal>

          <Stagger className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REGIONAL_LANGUAGES.map((language) => (
              <StaggerItem key={language.code}>
                <div className="rounded-md border border-border bg-background/80 px-3 py-3">
                  <p className="text-sm font-semibold">{language.nativeLabel}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {language.label}
                  </p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Vertical grid */}
      <section className="container py-12">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-4 gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            12 vertical specialists
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            One AI WhatsApp CRM. A different brain for every business.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each pack ships its own pipeline stages, captured fields, replies,
            and escalation rules. Pick yours.
          </p>
        </Reveal>

        <VerticalGrid />
      </section>

      {/* Pricing teaser */}
      <section className="container py-20">
        <Reveal className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Simple INR pricing
          </h2>
          <p className="mt-3 text-muted-foreground">
            Start free. Upgrade when you grow. 14-day free trial on every paid
            plan — Meta&apos;s per-message charges passed through at cost.
          </p>
        </Reveal>

        <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {PLAN_LIST.map((p) => (
            <StaggerItem key={p.id}>
              <Card
                className={`lift flex h-full flex-col p-6 ${
                  p.id === "growth" ? "ring-2 ring-primary" : ""
                }`}
              >
                {p.id === "growth" ? (
                  <Badge className="mb-3 w-fit">Most popular</Badge>
                ) : null}
                <h3 className="text-lg font-semibold">{p.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold tracking-tight">
                    {inr(p.priceInr)}
                  </span>
                  {p.priceInr > 0 ? (
                    <span className="text-sm text-muted-foreground">/mo</span>
                  ) : null}
                </div>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {feat}
                    </li>
                  ))}
                </ul>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="mt-8 text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/pricing" className="gap-2">
              See full pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* CTA band */}
      <section className="container pb-24">
        <Reveal>
          <Card className="glass relative overflow-hidden p-10 text-center md:p-16">
            <div
              aria-hidden
              className="animate-aurora absolute inset-x-0 top-0 -z-10 mx-auto h-64 w-64 rounded-full bg-primary/20 blur-3xl"
            />
            <h2 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">
              Give your WhatsApp a brain that knows your business
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Free to start. INR pricing. No credit card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/sign-up">
                  Create your workspace <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </Card>
        </Reveal>
      </section>
    </>
  );
}
