import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/motion/Reveal";
import { PLAN_LIST } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing — Revqara",
  description:
    "Simple INR pricing for the vertical-aware AI WhatsApp CRM. Start free, upgrade as you grow. 14-day free trial on every paid plan.",
};

/** INR money formatter. */
const inr = (n: number) =>
  n === 0 ? "Free" : `₹${n.toLocaleString("en-IN")}`;

/** Per-plan limit table rows (config from lib/billing/plans). */
const LIMIT_ROWS = [
  { label: "WhatsApp numbers", key: "maxNumbers" as const },
  { label: "Contacts", key: "maxContacts" as const },
  { label: "Sends / day", key: "maxSends" as const },
  { label: "Lists", key: "maxLists" as const },
];

const FAQ = [
  {
    q: "Is there a free plan?",
    a: "Yes. The Free plan includes 1 WhatsApp number, 500 contacts, and 200 sends/day with full AI campaign generation — no credit card required.",
  },
  {
    q: "How does the 14-day trial work?",
    a: "Every paid plan starts with a 14-day free trial. You get the full plan limits during the trial; we only charge once it ends, and you can cancel anytime before then.",
  },
  {
    q: "Are Meta's WhatsApp charges included?",
    a: "No. Meta bills per-message charges separately; we pass them through at cost. Plans cover the Revqara platform and AI — you typically recover the platform fee with a single saved lead.",
  },
  {
    q: "Can I change plans later?",
    a: "Anytime. Upgrades apply immediately and downgrades take effect at the end of your billing cycle. Your contacts, leads, and conversations are never touched.",
  },
  {
    q: "What happens if I hit a limit?",
    a: "Usage is metered live. You'll see a banner as you approach a limit and can upgrade in one click — sends are capped, not silently dropped.",
  },
  {
    q: "Do you work with AiSensy / Wati / Interakt?",
    a: "Keep them for broadcasts if you like. Revqara handles what happens after a customer replies: reading the message, updating the lead stage, drafting the reply, and tracking follow-up — tuned to your business type.",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="container py-16 text-center md:py-20">
        <Reveal className="mx-auto max-w-2xl">
          <Badge variant="secondary" className="mb-5">
            INR pricing · 14-day free trial
          </Badge>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight md:text-5xl">
            Pricing that pays for itself with one recovered lead
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Start free. Upgrade when you grow. Meta&apos;s per-message charges are
            billed separately and passed through at cost.
          </p>
        </Reveal>
      </section>

      {/* Plan cards */}
      <section className="container pb-12">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {PLAN_LIST.map((p) => (
            <Card
              key={p.id}
              className={`lift flex flex-col p-6 ${
                p.id === "growth" ? "ring-2 ring-primary" : ""
              }`}
            >
              {p.id === "growth" ? (
                <Badge className="mb-3 w-fit">Most popular</Badge>
              ) : null}
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold tracking-tight">
                  {inr(p.priceInr)}
                </span>
                {p.priceInr > 0 ? (
                  <span className="text-sm text-muted-foreground">/mo</span>
                ) : null}
              </div>

              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {p.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {feat}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-6 w-full"
                variant={p.id === "growth" ? "default" : "outline"}
                asChild
              >
                <Link href="/sign-up">
                  {p.priceInr === 0 ? "Start free" : "Start 14-day trial"}
                </Link>
              </Button>
            </Card>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Agency includes sales-led custom overage. Need more numbers or volume?{" "}
          <Link href="/sign-up" className="text-primary hover:underline">
            Talk to us.
          </Link>
        </p>
      </section>

      {/* Compare limits */}
      <section className="container py-12">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Compare the limits
          </h2>
        </Reveal>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Limit
                </th>
                {PLAN_LIST.map((p) => (
                  <th key={p.id} className="px-4 py-3 text-left font-semibold">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIMIT_ROWS.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                  {PLAN_LIST.map((p) => (
                    <td key={p.id} className="px-4 py-3 tabular-nums">
                      {p[row.key].toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="container py-12">
        <Reveal className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Frequently asked
          </h2>
        </Reveal>
        <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
          {FAQ.map((item) => (
            <Card key={item.q} className="p-6">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-24">
        <Card className="glass relative overflow-hidden p-10 text-center md:p-14">
          <h2 className="text-balance text-2xl font-bold tracking-tight md:text-3xl">
            Try it free for 14 days
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
            Connect your WhatsApp number, pick your business type, and you&apos;re
            live in minutes.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="gap-2" asChild>
              <Link href="/sign-up">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/demo">Try the live demo</Link>
            </Button>
          </div>
        </Card>
      </section>
    </>
  );
}
