/**
 * Leads board (RSC shell).
 *
 * Reads the RBAC-scoped lead set + pipeline stages + assignable members/teams on
 * the server, derives `canAssign` / `canEditStage` from the role, and hands a
 * plain-data payload to the <LeadsBoard> client island. Filters are URL-driven
 * (?filter=me|unassigned&team=<id>) so each filter change is a fresh scoped read.
 *
 * BUILD-SAFETY: the (app) group layout is force-dynamic; this page does
 * per-request Clerk + Appwrite reads and is never statically prerendered.
 */

import { getRequestContext } from "@/lib/auth/context";
import { canAssignLeads } from "@/lib/auth/rbac";
import { getLeadsByStage, getAssignableMembers } from "@/features/leads/queries";
import { LeadsBoard } from "@/components/leads/leads-board";

export const dynamic = "force-dynamic";

type SearchParams = { filter?: string; team?: string };

function parseFilter(v: string | undefined): "all" | "me" | "unassigned" {
  return v === "me" || v === "unassigned" ? v : "all";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const ctx = await getRequestContext();
  const filter = parseFilter(searchParams?.filter);
  const teamFilter = searchParams?.team ?? "all";

  const [board, assignable] = await Promise.all([
    getLeadsByStage({
      assigned: filter === "all" ? undefined : filter,
      teamId: teamFilter === "all" ? undefined : teamFilter,
    }),
    getAssignableMembers(ctx.orgId),
  ]);

  const canAssign = canAssignLeads(ctx.role);
  const canEditStage = ctx.role !== "org:viewer";

  // Flatten the kanban columns back into a single list for the client board
  // (which re-buckets by stage, so optimistic moves can animate between columns).
  const leads = board.stages
    .concat(board.extraStages)
    .flatMap((s) => board.columns[s] ?? [])
    .map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      intent: l.intent,
      details: l.details,
      status: l.status,
      assignedToUserId: l.assignedToUserId,
      assignedToTeamId: l.assignedToTeamId,
      assignedToUserName: l.assignedToUserName,
      assignedToTeamName: l.assignedToTeamName,
      needsHuman: l.needsHuman,
    }));

  return (
    <LeadsBoard
      leads={leads}
      stages={board.stages}
      extraStages={board.extraStages}
      label={board.label}
      members={assignable.members.map((m) => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
      }))}
      teams={assignable.teams}
      canAssign={canAssign}
      canEditStage={canEditStage}
      filter={filter}
      teamFilter={teamFilter}
    />
  );
}
