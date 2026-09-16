/**
 * Inbox (RSC shell).
 *
 * Loads the RBAC-scoped conversation list + stats + assignable members/teams on
 * the server and renders the <InboxView> client island (3-pane resizable on
 * desktop, sheet on mobile). The island polls fresh data via the inbox poll
 * Server Actions.
 *
 * BUILD-SAFETY: (app) group layout is force-dynamic; this page makes per-request
 * Clerk + Appwrite reads and is never statically prerendered.
 */

import { getRequestContext } from "@/lib/auth/context";
import { canAssignLeads } from "@/lib/auth/rbac";
import { listConversations, inboxStats } from "@/features/inbox/queries";
import { getAssignableMembers } from "@/features/leads/queries";
import { InboxView } from "@/components/inbox/inbox-view";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const ctx = await getRequestContext();

  const [conversations, stats, assignable] = await Promise.all([
    listConversations("all"),
    inboxStats(),
    getAssignableMembers(ctx.orgId),
  ]);

  return (
    <InboxView
      initialConversations={conversations}
      initialStats={stats}
      initialActiveId={null}
      initialThread={null}
      members={assignable.members.map((m) => ({
        userId: m.userId,
        name: m.name,
        role: m.role,
      }))}
      teams={assignable.teams}
      canAssign={canAssignLeads(ctx.role)}
      canReply={ctx.role !== "org:viewer"}
    />
  );
}
