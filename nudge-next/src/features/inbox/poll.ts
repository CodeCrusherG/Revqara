"use server";

/**
 * Client-callable read wrappers for the Inbox live panes.
 *
 * `queries.ts` is `server-only` (cannot be imported into a client component), so
 * the inbox client island polls these thin Server Actions instead. They simply
 * delegate to the RBAC-scoped queries — the scope/tenancy checks happen there.
 * Polling is acceptable per the plan (Appwrite Realtime is the optional upgrade);
 * the default poll cadence matches the React app (~3s).
 */

import {
  listConversations,
  getConversation,
  inboxStats,
  type ConversationListItem,
  type ConversationThread,
  type InboxAssignedFilter,
  type InboxStats,
} from "./queries";

export async function fetchConversations(
  assigned: InboxAssignedFilter = "all",
): Promise<ConversationListItem[]> {
  return listConversations(assigned);
}

export async function fetchConversation(
  conversationId: string,
): Promise<ConversationThread | null> {
  return getConversation(conversationId);
}

export async function fetchInboxStats(): Promise<InboxStats> {
  return inboxStats();
}
