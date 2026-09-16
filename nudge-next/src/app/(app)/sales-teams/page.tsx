/**
 * Sales Teams — RSC shell. Reads tenant-scoped sales teams (with resolved
 * members) plus the workspace roster (for the member picker) on the server,
 * then renders the client grid island.
 *
 * RBAC: any member may view; create/delete + add/remove member are gated
 * client-side by RoleGate('org:team:manage') and re-checked in the server
 * actions.
 */

import { listSalesTeams } from "@/features/salesTeams/queries";
import { listMembers } from "@/features/team/actions";
import {
  SalesTeamsGrid,
  type RosterMember,
} from "@/components/sales-teams/sales-teams-grid";

export const dynamic = "force-dynamic";

export default async function SalesTeamsPage() {
  const [teams, members] = await Promise.all([
    listSalesTeams(),
    listMembers(),
  ]);

  const roster: RosterMember[] = members
    .filter((m) => m.status === "active")
    .map((m) => ({
      userId: m.userId,
      fullName: m.fullName,
      email: m.email,
    }));

  return <SalesTeamsGrid initialTeams={teams} roster={roster} />;
}
