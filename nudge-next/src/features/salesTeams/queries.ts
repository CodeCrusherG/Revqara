import "server-only";

/**
 * Sales-team reads (tenant-scoped). Sales teams group agents so leads can be
 * routed to a whole team. Membership lives in `sales_team_members`
 * (unique teamId+userId). Member display names/emails are resolved from the
 * Clerk roster (listMembers) so the picker can show humans, not raw user ids.
 *
 * Reads require only an active workspace membership; mutations live in
 * actions.ts (gated by `org:team:manage`).
 */

import { Query, type Models } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant } from "@/lib/appwrite/tenant";
import { listMembers, type TeamMember } from "@/features/team/actions";

export interface SalesTeamMember {
  userId: string;
  fullName: string | null;
  email: string | null;
}

export interface SalesTeam {
  id: string;
  name: string;
  description: string | null;
  members: SalesTeamMember[];
  memberCount: number;
  createdAt: string;
}

function resolveMember(
  userId: string,
  roster: Map<string, TeamMember>,
): SalesTeamMember {
  const m = roster.get(userId);
  return {
    userId,
    fullName: m?.fullName ?? null,
    email: m?.email ?? null,
  };
}

/** List every sales team in the active workspace (with resolved members). */
export async function listSalesTeams(): Promise<SalesTeam[]> {
  const ctx = await getRequestContext();
  const db = adminDatabases();

  const [teamsRes, roster] = await Promise.all([
    db.listDocuments(
      DATABASE_ID,
      COLLECTION.salesTeams,
      withTenant(ctx.orgId, [Query.orderDesc("$createdAt"), Query.limit(200)]),
    ),
    listMembers(),
  ]);
  const rosterMap = new Map(roster.map((m) => [m.userId, m]));

  return Promise.all(
    teamsRes.documents.map(async (doc) => {
      const memberDocs = await db.listDocuments(
        DATABASE_ID,
        COLLECTION.salesTeamMembers,
        withTenant(ctx.orgId, [
          Query.equal("teamId", doc.$id),
          Query.limit(200),
        ]),
      );
      const members = memberDocs.documents
        .map((m) => (m as Models.Document & { userId?: string }).userId)
        .filter((id): id is string => !!id)
        .map((userId) => resolveMember(userId, rosterMap));

      return {
        id: doc.$id,
        name: (doc as Models.Document & { name?: string }).name ?? "",
        description:
          (doc as Models.Document & { description?: string }).description ??
          null,
        members,
        memberCount: members.length,
        createdAt: doc.$createdAt,
      };
    }),
  );
}
