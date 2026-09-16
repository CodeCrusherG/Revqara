import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Check, GitBranch, ListChecks, MessageSquare, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/motion/Reveal";
import { VerticalIcon } from "@/components/marketing/vertical-icon";
import {
  MARKETING_VERTICAL_SLUGS,
  getMarketingVertical,
} from "@/lib/marketing/verticals";

/** SSG: prerender all 12 specialist pages at build. */
export function generateStaticParams(): { slug: string }[] {
  return MARKETING_VERTICAL_SLUGS.map((slug) => ({ slug }));
}

/** Reject any slug outside the known set (no fallback rendering). */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = getMarketingVertical(slug);
  if (!v) return { title: "Vertical — Revqara" };
  return {
    title: `${v.label} — Revqara ${v.specialist}`,
    description: v.pitch,
  };
}

export default async function VerticalSpecialistPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const v = getMarketingVertical(slug);
  if (!v) notFound();

  const stages = v.pipeline.split("→").map((s) => s.trim());

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 hidden md:block"
        >
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-50" />
          <div className="animate-aurora absolute left-1/2 top-[-20%] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />
        </div>

        <div className="container py-16 md:py-20">
          <Reveal className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <VerticalIcon name={v.icon} className="h-7 w-7" />
              </span>
            </div>
            <Badge variant="secondary" className="mb-4 gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Revqara {v.specialist}
            </Badge>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight md:text-5xl">
              {v.label}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              {v.pitch}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/demo">
                  Try it on the live demo <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/sign-up">Start free</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Pipeline */}
      <section className="container py-12">
        <Reveal>
          <Card className="p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-primary" />
              The pipeline this pack ships with
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stages.map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                    {s}
                  </span>
                  {i < stages.length - 1 ? (
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </section>

      {/* Captures + wow */}
      <section className="container grid gap-6 py-12 lg:grid-cols-2">
        <Reveal>
          <Card className="h-full p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4 text-primary" />
              Fields the AI auto-captures
            </div>
            <div className="flex flex-wrap gap-2">
              {v.captures.map((c) => (
                <span
                  key={c}
                  className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm capitalize text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.05}>
          <Card className="h-full p-6 md:p-8">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              What you get out of the box
            </div>
            <ul className="space-y-3 text-sm">
              {v.wow.map((w) => (
                <li key={w} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{w}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>
      </section>

      {/* Demo prompts */}
      <section className="container py-12">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center">
          <Badge variant="secondary" className="mb-3 gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            Try these in the demo
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Real messages this pack handles
          </h2>
        </Reveal>
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
          {v.prompts.map((p) => (
            <Card
              key={p}
              className="flex items-start gap-2.5 p-4 text-sm text-foreground/90"
            >
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>&ldquo;{p}&rdquo;</span>
            </Card>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Button asChild className="gap-2">
            <Link href="/demo">
              Send one to the AI now <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24 pt-4">
        <Reveal>
          <Card className="glass relative overflow-hidden p-10 text-center md:p-14">
            <div
              aria-hidden
              className="animate-aurora absolute inset-x-0 top-0 -z-10 mx-auto h-56 w-56 rounded-full bg-primary/20 blur-3xl"
            />
            <h2 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">
              Give your {v.label.toLowerCase()} its WhatsApp brain
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Connect your number, pick this pack, and you&apos;re live in
              minutes. 14-day free trial.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="gap-2" asChild>
                <Link href="/sign-up">
                  Start free <ArrowRight className="h-4 w-4" />
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
