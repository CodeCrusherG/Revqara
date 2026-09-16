"use server";

/**
 * Inbox mutations. Port of backend/api/inbox.py `reply`, `set_auto_reply`,
 * `assign_conversation`, `mark_read`.
 *
 * `sendReply` does NOT call Meta inline (unlike the FastAPI handler, which sent
 * best-effort then committed). In revqara-next every outbound goes through the
 * durable transactional outbox: we store the agent's outbound `inbox_messages`
 * row, then `enqueueMessage` it (idempotent on `reply:<messageId>`); the
 * outbox-worker drains it with retry/backoff and backfills the wamid. This is
 * the at-most-once guarantee from §5.
 *
 * RBAC:
 *   - sendReply / setAutoReply / markRead: any member who can SEE the thread
 *     (the conversation read in getConversation already enforces the agent scope;
 *     here we re-assert tenancy + reject viewers on writes).
 *   - assignConversation: requires `org:leads:assign` (assigns the convo's lead).
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { Query, AppwriteException } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { getRequestContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertOwned } from "@/lib/appwrite/tenant";
import { enqueueMessage } from "@/features/whatsapp/outbox";
import { AppwriteWhatsAppRepo } from "@/features/whatsapp/repo-appwrite";
import { assignLead, unassignLead } from "@/features/leads/actions";
import { INBOX_TAG, LEADS_TAG } from "@/features/leads/tags";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

type ConvoDoc = Record<string, unknown> & {
  $id: string;
  workspaceId?: string | null;
};

/** Load the conversation by id and assert it belongs to the active workspace. */
async function loadOwnedConvo(
  orgId: string,
  conversationId: string,
): Promise<ConvoDoc> {
  try {
    const doc = (await adminDatabases().getDocument(
      DATABASE_ID,
      COLLECTION.conversations,
      conversationId,
    )) as ConvoDoc;
    return assertOwned(orgId, doc);
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      throw new ForbiddenError("Conversation not found.");
    }
    throw err;
  }
}

function revalidateInbox(): void {
  revalidateTag(INBOX_TAG);
  revalidatePath("/inbox");
}

export interface SendReplyInput {
  conversationId: string;
  text: string;
}

/**
 * Send an agent reply. Enforces the 24-hour customer-service window (parity with
 * the FastAPI 400), stores the outbound message, marks the thread read, and
 * enqueues the send on the durable outbox (idempotent on `reply:<messageId>`).
 */
export async function sendReply(
  input: SendReplyInput,
): Promise<{ ok: true }> {
  const ctx = await getRequestContext();
  if (ctx.role === "org:viewer") {
    throw new ForbiddenError("Viewers cannot send replies.");
  }
  const text = (input.text ?? "").trim();
  if (!text) {
    throw new ForbiddenError("Reply text is required.");
  }

  const convo = await loadOwnedConvo(ctx.orgId, input.conversationId);

  // 24h service-window check (port of the FastAPI guard).
  const lastInboundAt = str(convo.lastInboundAt);
  const withinWindow =
    !!lastInboundAt &&
    Date.now() - new Date(lastInboundAt).getTime() <= SERVICE_WINDOW_MS;
  if (!withinWindow) {
    throw new ForbiddenError(
      "Outside the 24-hour customer-service window — an approved template is required to re-open this chat.",
    );
  }

  const repo = new AppwriteWhatsAppRepo();

  // Store the agent's outbound message first (the wamid is backfilled by the
  // outbox worker once Meta accepts it).
  const msg = await repo.addInboxMessage({
    workspaceId: ctx.orgId,
    conversationId: convo.$id,
    direction: "outbound",
    sender: "agent",
    text,
  });

  // Mark the conversation read (the agent has now handled it).
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.conversations,
    convo.$id,
    { unread: false },
  );

  // Enqueue the durable send — idempotent on reply:<messageId>.
  await enqueueMessage(repo, {
    workspaceId: ctx.orgId,
    idempotencyKey: `reply:${msg.$id}`,
    to: str(convo.customerWaId) ?? "",
    text,
    sender: str(convo.phoneNumberId),
    conversationId: convo.$id,
    contactId: str(convo.contactId),
    inboxMessageId: msg.$id,
  });

  revalidateInbox();
  return { ok: true };
}

export interface SetAutoReplyInput {
  conversationId: string;
  enabled: boolean;
}

/** Toggle the bot's auto-reply for a conversation. Port of `set_auto_reply`. */
export async function setAutoReply(
  input: SetAutoReplyInput,
): Promise<{ ok: true; autoReply: boolean }> {
  const ctx = await getRequestContext();
  if (ctx.role === "org:viewer") {
    throw new ForbiddenError("Viewers cannot change auto-reply.");
  }
  const convo = await loadOwnedConvo(ctx.orgId, input.conversationId);
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.conversations,
    convo.$id,
    { autoReply: input.enabled },
  );
  revalidateInbox();
  return { ok: true, autoReply: input.enabled };
}

export interface MarkReadInput {
  conversationId: string;
}

/** Mark a conversation read. Port of `mark_read`. */
export async function markRead(
  input: MarkReadInput,
): Promise<{ ok: true }> {
  const ctx = await getRequestContext();
  const convo = await loadOwnedConvo(ctx.orgId, input.conversationId);
  await adminDatabases().updateDocument(
    DATABASE_ID,
    COLLECTION.conversations,
    convo.$id,
    { unread: false },
  );
  revalidateInbox();
  return { ok: true };
}

export interface AssignConversationInput {
  conversationId: string;
  userId?: string | null;
  teamId?: string | null;
}

/**
 * Assign the conversation's latest lead. Requires `org:leads:assign` (enforced
 * by the delegated lead actions). Port of `assign_conversation` — resolves the
 * conversation's most-recent lead, then assigns/unassigns it.
 */
export async function assignConversation(
  input: AssignConversationInput,
): Promise<{ ok: true }> {
  const ctx = await getRequestContext();
  const convo = await loadOwnedConvo(ctx.orgId, input.conversationId);

  // Latest lead for this conversation.
  const res = await adminDatabases().listDocuments(
    DATABASE_ID,
    COLLECTION.leads,
    [
      Query.equal("workspaceId", ctx.orgId),
      Query.equal("conversationId", convo.$id),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ],
  );
  const lead = res.documents[0];
  if (!lead) {
    throw new ForbiddenError("No lead exists for this conversation yet.");
  }

  const userId = input.userId ?? null;
  const teamId = input.teamId ?? null;

  // Delegate to the lead actions (they enforce org:leads:assign + audit + revalidate).
  if (!userId && !teamId) {
    await unassignLead({ leadId: lead.$id });
  } else {
    await assignLead({ leadId: lead.$id, userId, teamId });
  }

  revalidateTag(LEADS_TAG);
  revalidateInbox();
  return { ok: true };
}
