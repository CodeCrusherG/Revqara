/**
 * Team — RSC shell. Lists workspace members (Clerk org memberships, including
 * disabled ones) via the Phase-2 team actions, then renders the client table.
 *
 * RBAC: any member may view the roster; per-row management is gated by
 * canManageRole(myRole, targetRole) in the client and re-checked in each
 * server action (changeMemberRole / setMemberStatus / removeMember /
 * inviteMember).
 */

import { getRequestContext } from "@/lib/auth/context";
import { listMembers } from "@/features/team/actions";
import { TeamTable } from "@/components/team/team-table";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const ctx = await getRequestContext();
  const members = await listMembers();

  return (
    <TeamTable
      initialMembers={members}
      myUserId={ctx.userId}
      myRole={ctx.role}
    />
  );
}
