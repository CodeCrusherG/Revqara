"use client";

/**
 * LeadsBoard — the interactive Leads kanban (client island).
 *
 * Mirrors frontend/src/pages/LeadsPage.jsx affordances:
 *   - filter toggle (All · Assigned to me · Unassigned) + team Select
 *   - per-vertical pipeline summary chips + total
 *   - kanban columns by pipeline_stages with framer `layoutId` card moves
 *     (AnimatePresence popLayout) so a stage change animates the card between
 *     columns
 *   - owner assignment Select (role-gated via `canAssign`)
 *   - needs_human badge + a keyboard-accessible stage Select on every card (a11y)
 *
 * All mutations call the leads Server Actions and refresh via `router.refresh()`
 * (the actions revalidate the leads tag/path). Optimistic stage moves keep the
 * board responsive; a failure rolls back.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Target, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { StageBadge, stageTone, humanizeStage } from "./stage-badge";
import {
  OwnerSelect,
  type OwnerMember,
  type OwnerTeam,
} from "./owner-select";
import {
  setLeadStatus,
  assignLead,
  unassignLead,
} from "@/features/leads/actions";

export interface BoardLead {
  id: string;
  name: string | null;
  phone: string | null;
  intent: string | null;
  details: string | null;
  status: string;
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
  assignedToUserName: string | null;
  assignedToTeamName: string | null;
  needsHuman: boolean;
}

export interface LeadsBoardProps {
  leads: BoardLead[];
  stages: string[];
  extraStages: string[];
  label: string;
  members: OwnerMember[];
  teams: OwnerTeam[];
  canAssign: boolean;
  canEditStage: boolean;
  filter: "all" | "me" | "unassigned";
  teamFilter: string;
}

const FILTERS: Array<["all" | "me" | "unassigned", string]> = [
  ["all", "All"],
  ["me", "Assigned to me"],
  ["unassigned", "Unassigned"],
];

function ownerLabel(l: BoardLead): string {
  if (l.assignedToUserName) return l.assignedToUserName;
  if (l.assignedToTeamName) return `Team: ${l.assignedToTeamName}`;
  return "Unassigned";
}

export function LeadsBoard({
  leads: initialLeads,
  stages,
  extraStages,
  label,
  members,
  teams,
  canAssign,
  canEditStage,
  filter,
  teamFilter,
}: LeadsBoardProps) {
  const router = useRouter();
  const [leads, setLeads] = React.useState<BoardLead[]>(initialLeads);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => setLeads(initialLeads), [initialLeads]);

  const allStages = React.useMemo(
    () => [...stages, ...extraStages],
    [stages, extraStages],
  );

  // ── Filter navigation (server-driven; re-reads with new query params) ──
  function applyFilters(next: {
    filter?: "all" | "me" | "unassigned";
    teamFilter?: string;
  }) {
    const params = new URLSearchParams();
    const f = next.filter ?? filter;
    const t = next.teamFilter ?? teamFilter;
    if (f !== "all") params.set("filter", f);
    if (t !== "all") params.set("team", t);
    const qs = params.toString();
    router.push(qs ? `/leads?${qs}` : "/leads");
  }

  // ── Stage move (optimistic) ──
  function moveStage(id: string, status: string) {
    const prev = leads;
    setLeads((cur) => cur.map((l) => (l.id === id ? { ...l, status } : l)));
    startTransition(async () => {
      try {
        await setLeadStatus({ leadId: id, status });
        toast.success(`Lead moved to ${humanizeStage(status)}`);
        router.refresh();
      } catch {
        toast.error("Could not update lead stage");
        setLeads(prev);
      }
    });
  }

  // ── Assignment ──
  function reassign(
    id: string,
    next: { userId?: string | null; teamId?: string | null },
  ) {
    startTransition(async () => {
      try {
        if (!next.userId && !next.teamId) await unassignLead({ leadId: id });
        else
          await assignLead({
            leadId: id,
            userId: next.userId ?? null,
            teamId: next.teamId ?? null,
          });
        toast.success("Lead reassigned");
        router.refresh();
      } catch {
        toast.error("Could not reassign lead");
      }
    });
  }

  const counts = leads.reduce<Record<string, number>>((a, l) => {
    a[l.status] = (a[l.status] ?? 0) + 1;
    return a;
  }, {});
  const total = leads.length;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
            <Target className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Leads
            </h1>
            <p className="text-sm text-muted-foreground">
              Captured from WhatsApp conversations by the AI graph.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Target className="h-3.5 w-3.5 text-primary" /> {label} pipeline
        </Badge>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          value={filter}
          onValueChange={(v) =>
            applyFilters({ filter: v as "all" | "me" | "unassigned" })
          }
        >
          {FILTERS.map(([v, l]) => (
            <ToggleGroupItem key={v} value={v}>
              {l}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {teams.length > 0 && (
          <Select
            value={teamFilter}
            onValueChange={(v) => applyFilters({ teamFilter: v })}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Pipeline summary */}
      {total > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-2 p-4">
            {allStages.map((s) => {
              const t = stageTone(s);
              return (
                <div
                  key={s}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5"
                >
                  <span className={cn("h-2 w-2 rounded-full", t.dot)} />
                  <span className="text-sm font-bold tabular-nums">
                    {counts[s] ?? 0}
                  </span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {humanizeStage(s)}
                  </span>
                </div>
              );
            })}
            <div className="ms-auto flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-primary">
              <span className="text-sm font-bold tabular-nums">{total}</span>
              <span className="text-xs font-medium">total</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <TrendingUp className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold text-foreground">
              No leads here
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Leads are captured automatically when a customer asks to book, buy,
              or enquire in the Inbox.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Kanban */
        <TooltipProvider delayDuration={200}>
          <div
            className={cn(
              "custom-scrollbar flex gap-4 overflow-x-auto pb-4",
              pending && "opacity-95",
            )}
          >
            {allStages.map((stage) => {
              const column = leads.filter((l) => l.status === stage);
              const t = stageTone(stage);
              return (
                <section
                  key={stage}
                  className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
                >
                  <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-semibold capitalize">
                      <span className={cn("h-2 w-2 rounded-full", t.dot)} />
                      {humanizeStage(stage)}
                    </span>
                    <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                      {column.length}
                    </span>
                  </header>
                  <div className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-2">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {column.map((l) => (
                        <motion.article
                          key={l.id}
                          layout
                          layoutId={`lead-${l.id}`}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="rounded-lg border bg-card p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                              {l.name || "—"}
                              {l.needsHuman && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                      <AlertTriangle className="h-3 w-3" /> needs
                                      human
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    The AI handed this off — assign it to an
                                    agent.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </span>
                            <StageBadge stage={l.status} />
                          </div>

                          {l.phone && (
                            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                              {l.phone}
                            </div>
                          )}
                          {l.details && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {l.details}
                                </p>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">
                                {l.details}
                              </TooltipContent>
                            </Tooltip>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {l.intent && (
                              <Badge
                                variant="secondary"
                                className="capitalize"
                              >
                                {humanizeStage(l.intent)}
                              </Badge>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <OwnerSelect
                              assignedToUserId={l.assignedToUserId}
                              assignedToTeamId={l.assignedToTeamId}
                              ownerLabel={ownerLabel(l)}
                              members={members}
                              teams={teams}
                              canAssign={canAssign}
                              align="start"
                              triggerClassName="w-[150px]"
                              disabled={pending}
                              onAssign={(next) => reassign(l.id, next)}
                            />
                            {/* Keyboard-accessible stage select (a11y) */}
                            <Select
                              value={l.status}
                              onValueChange={(v) => moveStage(l.id, v)}
                              disabled={!canEditStage || pending}
                            >
                              <SelectTrigger
                                className="h-8 w-[130px]"
                                aria-label={`Stage for ${l.name || "lead"}`}
                              >
                                <SelectValue>
                                  <span className="capitalize">
                                    {humanizeStage(l.status)}
                                  </span>
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="end">
                                {allStages.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={cn(
                                          "h-1.5 w-1.5 rounded-full",
                                          stageTone(s).dot,
                                        )}
                                      />
                                      <span className="capitalize">
                                        {humanizeStage(s)}
                                      </span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </motion.article>
                      ))}
                    </AnimatePresence>
                    {column.length === 0 && (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        No leads
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
