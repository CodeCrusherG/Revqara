import type { Metadata } from "next";
import { Brain, GitBranch, Languages, ListChecks, MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/Reveal";
import { DemoPlayground } from "@/components/demo/demo-playground";

export const metadata: Metadata = {
  title: "Live demo — Revqara",
  description:
    "Pick a business type, fire a WhatsApp message, and watch the universal AI graph classify intent, capture fields, advance the pipeline, reply on-brand, and hand off on risk. No signup.",
};

/** Static shell; the interactive playground is a client island calling /api/demo. */
const HIGHLIGHTS = [
  { icon: GitBranch, label: "Vertical pipeline" },
  { icon: ListChecks, label: "Auto-captured fields" },
  { icon: MessageSquare, label: "On-brand replies" },
  { icon: Languages, label: "Tamil, Telugu, Gujarati, Marathi, Punjabi +" },
  { icon: Brain, label: "Human handoff on risk" },
];

export default function DemoPage() {
  return (
    <>
      <section className="container py-12 text-center md:py-16">
        <Reveal className="mx-auto max-w-3xl">
          <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Live, interactive demo · no signup
          </Badge>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl">
            One AI WhatsApp CRM.{" "}
            <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              A different brain for every business.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            This runs the same universal AI graph that powers Revqara. Pick a
            business type, choose the AI language, and send a message — the
            graph adapts its pipeline, captured fields, replies, and escalation
            rules to that vertical.
          </p>
        </Reveal>

        <div className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {HIGHLIGHTS.map((h) => (
            <span key={h.label} className="flex items-center gap-1.5">
              <h.icon className="h-4 w-4 text-primary" />
              {h.label}
            </span>
          ))}
        </div>
      </section>

      <section className="container pb-24">
        <div className="mx-auto max-w-5xl">
          <DemoPlayground />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          The deterministic path is the contract — confidence is reported as{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">null</code> with
          source <code className="rounded bg-muted px-1 py-0.5 text-xs">deterministic</code>.
          When you connect a real number, the exact same decision drives your
          inbox, leads, and follow-ups.
        </p>
      </section>
    </>
  );
}
