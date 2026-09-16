"use client";

import {
  Bot,
  GitBranch,
  ListChecks,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DemoResponse } from "@/app/api/demo/route";
import { languageName } from "@/lib/india-languages";

/** Render a single extracted field as "key: value". */
function fieldLabel(key: string, value: unknown): string {
  if (value === null || value === undefined) return key;
  if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
  if (typeof value === "object") return key;
  return `${key}: ${String(value)}`;
}

/** Visualises the live AI-graph decision for a single demo turn. */
export function DecisionPanel({ data }: { data: DemoResponse }) {
  const { result, pipelineStages, stageBefore } = data;
  const fields = Object.entries(result.extracted_fields ?? {});
  const stageAfter = result.stage_hint ?? stageBefore;
  const stageIndex = pipelineStages.indexOf(stageAfter);

  return (
    <div className="space-y-4">
      {/* Conversation bubbles */}
      <Card className="space-y-3 p-5">
        <div className="self-start rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm">
          {/* customer message echoed by the playground above; the reply is here */}
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            {result.handoff ? "AI · handed to a human" : "AI reply"}
          </span>
          <p className="whitespace-pre-wrap text-foreground">{result.response}</p>
        </div>

        {result.handoff ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Escalated to a human agent
              {result.handoff_reason ? ` — ${result.handoff_reason}` : "."}
            </span>
          </div>
        ) : null}
      </Card>

      {/* AI analysis */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          AI analysis
        </div>

        {/* Intent */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Intent
            </span>
          </div>
          <Badge variant="secondary" className="mt-1.5 font-mono text-[11px]">
            {result.intent}
          </Badge>
        </div>

        {/* Captured fields */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" /> Captured fields
            </span>
          </div>
          {fields.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {fields.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[11px]"
                >
                  {fieldLabel(k, v)}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Nothing structured to capture from this message.
            </p>
          )}
        </div>

        {/* Pipeline */}
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> Pipeline stage
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pipelineStages.map((s, i) => {
              const active = s === stageAfter;
              const passed = stageIndex >= 0 && i <= stageIndex;
              return (
                <span
                  key={s}
                  className={[
                    "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : passed
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {s.replace(/_/g, " ")}
                </span>
              );
            })}
          </div>
        </div>

        {/* Tags */}
        {result.tags.length > 0 ? (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tags added
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {result.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-[11px]">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {/* Trace footer */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
          <span>
            confidence:{" "}
            <span className="font-mono">
              {result.confidence === null ? "null" : result.confidence}
            </span>{" "}
            ({result.confidence_source})
          </span>
          <span>next: {result.next_action}</span>
          <span>language: {languageName(result.response_language)}</span>
          <span>
            {result.fallback_used
              ? "deterministic"
              : `model: ${result.model_used ?? "llm"}`}
          </span>
          <span>graph v{result.graph_version}</span>
        </div>
      </Card>
    </div>
  );
}
