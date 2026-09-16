"use client";

/**
 * AI Activity Timeline + assignment panel (right pane). Port of `aiTimeline` /
 * `LeadTimeline` from frontend/src/pages/InboxPage.jsx — a read-only "what the
 * graph understood" timeline derived ONLY from data the graph already persisted
 * (intent, extracted fields, stage, tags, reply mode). No fabricated metrics.
 *
 * The assignment Select is role-gated (`canAssign`) and reuses OwnerSelect so
 * the `u:`/`t:`/none encoding matches the Leads board.
 */

import * as React from "react";
import {
  Activity,
  Bot,
  Brain,
  GitBranch,
  ListChecks,
  ShieldAlert,
  Tag,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  OwnerSelect,
  type OwnerMember,
  type OwnerTeam,
} from "@/components/leads/owner-select";
import type { ConversationThread } from "@/features/inbox/queries";

const humanize = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");

const TONE: Record<string, string> = {
  primary: "bg-primary/10 text-primary ring-primary/20",
  teal: "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/20",
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
};

interface TimelineEvent {
  icon: React.ComponentType<{ className?: string }>;
  tone: keyof typeof TONE;
  title: string;
  chips: string[];
}

/** Derive the read-only AI activity timeline (verbatim logic from `aiTimeline`). */
function buildTimeline(thread: ConversationThread): TimelineEvent[] {
  const lead = thread.lead;
  if (!lead) return [];
  const fields = Object.entries(lead.fields ?? {});
  const tags = thread.tags ?? [];
  const events: TimelineEvent[] = [];

  if (lead.intent)
    events.push({
      icon: Brain,
      tone: "primary",
      title: "Intent detected",
      chips: [humanize(lead.intent)],
    });
  if (fields.length)
    events.push({
      icon: ListChecks,
      tone: "teal",
      title: "Fields extracted",
      chips: fields.map(([k, v]) => `${humanize(k)}: ${v}`),
    });
  if (lead.stage)
    events.push({
      icon: GitBranch,
      tone: "emerald",
      title: "Pipeline stage",
      chips: [humanize(lead.stage)],
    });
  if (tags.length)
    events.push({
      icon: Tag,
      tone: "amber",
      title: "Tags added",
      chips: tags.map(humanize),
    });

  if (thread.autoReply) {
    events.push({
      icon: Bot,
      tone: "primary",
      title: "Next action",
      chips: ["Auto-reply active"],
    });
  } else {
    const escalated = tags.some((t) =>
      /complaint|refund|escalat|emergency/i.test(t),
    );
    events.push({
      icon: ShieldAlert,
      tone: "amber",
      title: "Handed to human",
      chips: [escalated ? "Complaint / escalation detected" : "Agent took over"],
    });
  }
  return events;
}

export interface AiTimelineProps {
  thread: ConversationThread;
  members: OwnerMember[];
  teams: OwnerTeam[];
  canAssign: boolean;
  disabled?: boolean;
  onAssign: (next: { userId?: string | null; teamId?: string | null }) => void;
  className?: string;
}

export function AiTimeline({
  thread,
  members,
  teams,
  canAssign,
  disabled,
  onAssign,
  className,
}: AiTimelineProps) {
  const lead = thread.lead;
  const events = buildTimeline(thread);

  const ownerLabel = thread.assignedToUserName
    ? thread.assignedToUserName
    : thread.assignedToTeamName
      ? `Team: ${thread.assignedToTeamName}`
      : "Unassigned";

  return (
    <aside
      className={cn(
        "custom-scrollbar h-full overflow-y-auto border-l border-border bg-card",
        className,
      )}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Activity className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-semibold leading-none">AI Analysis</div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            What the graph understood
          </div>
        </div>
      </div>

      {lead && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Assignment
            </span>
            {lead.needsHuman && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <ShieldAlert className="h-3 w-3" /> needs human
              </span>
            )}
          </div>
          <div className="mt-2">
            {canAssign ? (
              <OwnerSelect
                assignedToUserId={lead.assignedToUserId}
                assignedToTeamId={lead.assignedToTeamId}
                ownerLabel={ownerLabel}
                members={members}
                teams={teams}
                canAssign
                align="end"
                triggerClassName="h-8 w-full"
                disabled={disabled}
                onAssign={onAssign}
              />
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> {ownerLabel}
              </div>
            )}
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No AI activity yet — the graph annotates this panel once a customer
          messages.
        </div>
      ) : (
        <ol className="relative space-y-5 px-5 py-5">
          <span
            aria-hidden
            className="absolute left-[1.65rem] bottom-6 top-6 w-px bg-border"
          />
          {events.map((e, i) => {
            const Icon = e.icon;
            return (
              <li key={i} className="relative flex gap-3">
                <span
                  className={cn(
                    "z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card",
                    TONE[e.tone],
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {e.title}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {e.chips.map((c, j) => (
                      <span
                        key={j}
                        className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] capitalize text-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
