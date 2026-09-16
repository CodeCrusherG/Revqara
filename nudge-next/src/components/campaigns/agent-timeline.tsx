"use client";

/**
 * AgentTimeline — the 5-stage agentic activity log (Profiler → Planner →
 * Creative → Analyst → Optimizer). Ported from the agent-log timeline in
 * frontend/src/pages/{ApprovalPage,DashboardPage}.jsx: each persisted agent_log
 * row becomes a timeline node with its step, a human summary, and (collapsible)
 * the LLM/deterministic reasoning JSON.
 *
 * Read-only and derived only from data the pipeline persisted — no fabricated
 * metrics.
 */

import * as React from "react";
import {
  Brain,
  ChevronDown,
  PenLine,
  ScanSearch,
  Target,
  TrendingUp,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AgentLogView } from "@/features/campaigns/types";

export interface AgentTimelineProps {
  logs: AgentLogView[];
}

const AGENT_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  CustomerProfiler: { label: "Profiler", icon: ScanSearch },
  CampaignPlanner: { label: "Planner", icon: Target },
  ContentGenerator: { label: "Creative", icon: PenLine },
  PerformanceAnalyst: { label: "Analyst", icon: TrendingUp },
  Optimizer: { label: "Optimizer", icon: Brain },
};

/** Pull a one-line summary out of an agent_log output payload. */
function summarize(log: AgentLogView): string {
  const out = log.outputPayload;
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    if (typeof o.analysis_summary === "string" && o.analysis_summary) {
      return o.analysis_summary;
    }
    if (typeof o.optimization_summary === "string" && o.optimization_summary) {
      return o.optimization_summary;
    }
    if (typeof o.segment_count === "number") {
      return `${o.segment_count} segments`;
    }
    if (typeof o.variant_count === "number") {
      return `${o.variant_count} variants generated`;
    }
    if (typeof o.next_strategy === "string" && o.next_strategy) {
      return o.next_strategy;
    }
  }
  return AGENT_META[log.agentName]?.label ?? log.agentName;
}

function deterministic(log: AgentLogView): boolean {
  const out = log.outputPayload as Record<string, unknown> | null;
  return out?.llm_used === false || out?.llm_used === undefined;
}

export function AgentTimeline({ logs }: AgentTimelineProps) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No AI activity yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6">
      {/* connecting line */}
      <span
        aria-hidden
        className="absolute left-[9px] top-1 h-[calc(100%-0.5rem)] w-px bg-border"
      />
      {logs.map((log) => {
        const meta = AGENT_META[log.agentName] ?? {
          label: log.agentName,
          icon: Brain,
        };
        const Icon = meta.icon;
        return <TimelineNode key={log.id} log={log} meta={meta} Icon={Icon} />;
      })}
    </ol>
  );
}

function TimelineNode({
  log,
  meta,
  Icon,
}: {
  log: AgentLogView;
  meta: { label: string };
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const hasReasoning = !!log.llmReasoning?.trim();

  return (
    <li className="relative">
      <span className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-background text-primary">
        <Icon className="h-3 w-3" />
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{meta.label}</span>
        {log.step !== null ? (
          <Badge variant="secondary" className="text-[10px]">
            Step {log.step}
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className={cn(
            "text-[10px]",
            deterministic(log)
              ? "bg-muted text-muted-foreground"
              : "bg-primary/15 text-primary",
          )}
        >
          {deterministic(log) ? "deterministic" : "AI-polished"}
        </Badge>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">{summarize(log)}</p>

      {hasReasoning ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
            />
            {open ? "Hide reasoning" : "Show reasoning"}
          </button>
          {open ? (
            <pre className="custom-scrollbar mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
              {prettyJson(log.llmReasoning!)}
            </pre>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
