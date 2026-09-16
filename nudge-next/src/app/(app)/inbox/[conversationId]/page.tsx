/**
 * Inbox with a pre-selected conversation (deep link / shareable thread URL).
 *
 * Same shell as /inbox, but additionally preloads the requested thread on the
 * server (RBAC-scoped: `getConversation` returns null if the caller can't see
 * it, in which case the island opens with no active thread). The client island
 * then takes over polling.
 *
 * BUILD-SAFETY: (app) group layout is force-dynamic.
 */

import { getRequestContext } from "@/lib/auth/context";
import { canAssignLeads } from "@/lib/auth/rbac";
import {
  listConversations,
  getConversation,
  inboxStats,
} from "@/features/inbox/queries";
import { getAssignableMembers } from "@/features/leads/queries";
import { InboxView } from "@/components/inbox/inbox-view";

export const dynamic = "force-dynamic";

export default async function InboxConversationPage({
  params,
}: {
  params: { conversationId: string };
}) {
  const ctx = await getRequestContext();
  const { conversationId } = params;

  const [conversations, stats, thread, assignable] = await Promise.all([
    listConversations("all"),
    inboxStats(),
    getConversation(conversationId),
    getAssignableMembers(ctx.orgId),
  ]);

  return (
    <InboxView
      initialConversations={conversations}
      initialStats={stats}
      initialActiveId={thread ? conversationId : null}
      initialThread={thread}
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
