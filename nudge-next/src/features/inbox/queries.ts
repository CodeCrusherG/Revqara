import "server-only";

/**
 * Inbox reads. Port of backend/api/inbox.py `list_conversations`,
 * `get_conversation`, `inbox_stats`.
 *
 * RBAC: conversations are scoped exactly like leads — a conversation is visible
 * iff its lead is visible to the caller (agents see only their own / their
 * teams' threads; managers+ and viewers see all). We resolve the visible lead
 * set via `leadScopeQueries` and intersect by `conversationId`, then apply the
 * `assigned = me | unassigned` UI filter on top (parity with the endpoint).
 */

import { Query } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { getRequestContext } from "@/lib/auth/context";
import { assertOwned } from "@/lib/appwrite/tenant";
import { getPack } from "@/features/ai-graph/packs";

import {
  leadScopeQueries,
  isLeadScopeRestricted,
  resolveCallerTeamIds,
  canSeeLead,
} from "@/features/leads/scope";
import { getNameMaps } from "@/features/leads/queries";

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

export interface ConversationListItem {
  id: string;
  customerWaId: string;
  customerName: string | null;
  status: string;
  autoReply: boolean;
  unread: boolean;
  lastMessage: string | null;
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
}

export type InboxAssignedFilter = "all" | "me" | "unassigned";

/** Latest lead per conversation (one lead per conversation in practice). */
async function leadsByConversation(orgId: string): Promise<
  Map<
    string,
    {
      id: string;
      conversationId: string | null;
      assignedToUserId: string | null;
      assignedToTeamId: string | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      id: string;
      conversationId: string | null;
      assignedToUserId: string | null;
      assignedToTeamId: string | null;
    }
  >();
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.leads,
      [Query.equal("workspaceId", orgId), Query.limit(2000)],
    );
    for (const d of res.documents) {
      const convoId = str(d.conversationId);
      if (!convoId) continue;
      map.set(convoId, {
        id: String(d.$id),
        conversationId: convoId,
        assignedToUserId: str(d.assignedToUserId),
        assignedToTeamId: str(d.assignedToTeamId),
      });
    }
  } catch {
    /* ignore */
  }
  return map;
}

async function lastTextForConversation(
  conversationId: string,
): Promise<string | null> {
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.inboxMessages,
      [
        Query.equal("conversationId", conversationId),
        Query.orderDesc("$createdAt"),
        Query.limit(1),
      ],
    );
    return str(res.documents[0]?.text);
  } catch {
    return null;
  }
}

/**
 * List the workspace's conversations the caller may see, newest activity first,
 * filtered by `assigned` (all | me | unassigned). Mirrors `list_conversations`.
 */
export async function listConversations(
  assigned: InboxAssignedFilter = "all",
): Promise<ConversationListItem[]> {
  const ctx = await getRequestContext();
  const restricted = isLeadScopeRestricted(ctx);
  const teamIds = restricted ? await resolveCallerTeamIds(ctx) : [];

  let documents: Record<string, unknown>[] = [];
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.conversations,
      [
        Query.equal("workspaceId", ctx.orgId),
        Query.orderDesc("lastInboundAt"),
        Query.limit(200),
      ],
    );
    documents = res.documents;
  } catch {
    return [];
  }

  const leads = await leadsByConversation(ctx.orgId);

  const out: ConversationListItem[] = [];
  for (const c of documents) {
    const id = String(c.$id);
    const lead = leads.get(id);
    const au = lead?.assignedToUserId ?? null;
    const at = lead?.assignedToTeamId ?? null;

    // RBAC: restricted callers only see threads whose lead is theirs/their team.
    if (restricted) {
      const owned =
        (au && au === ctx.userId) || (at && teamIds.includes(at));
      if (!owned) continue;
    }

    // UI filter (parity with the endpoint's `assigned` param).
    if (assigned === "me" && au !== ctx.userId && !(at && teamIds.includes(at))) {
      continue;
    }
    if (assigned === "unassigned" && (au || at)) {
      continue;
    }

    out.push({
      id,
      customerWaId: str(c.customerWaId) ?? "",
      customerName: str(c.customerName),
      status: str(c.status) ?? "open",
      autoReply: c.autoReply === true,
      unread: c.unread === true,
      lastMessage: await lastTextForConversation(id),
      assignedToUserId: au,
      assignedToTeamId: at,
    });
  }

  return out;
}

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "bot" | "agent";
  text: string | null;
  createdAt: string;
}

export interface ConversationThread {
  id: string;
  customerWaId: string;
  customerName: string | null;
  status: string;
  autoReply: boolean;
  within24hWindow: boolean;
  vertical: string;
  verticalLabel: string;
  verticalFields: string[];
  tags: string[];
  lead: {
    id: string;
    intent: string | null;
    stage: string | null;
    details: string | null;
    fields: Record<string, string>;
    assignedToUserId: string | null;
    assignedToTeamId: string | null;
    needsHuman: boolean;
  } | null;
  messages: ThreadMessage[];
  /** Assignee display names for the right-hand assignment panel. */
  assignedToUserName: string | null;
  assignedToTeamName: string | null;
}

/**
 * Parse the graph's "k: v, k2: v2" detail string into a field map. Port of
 * `_parse_fields` (keys with no inner space, non-empty values).
 */
function parseFields(details: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!details || !details.includes(":")) return out;
  for (const part of details.split(", ")) {
    const idx = part.indexOf(": ");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 2).trim();
    if (k && !k.includes(" ") && v) out[k] = v;
  }
  return out;
}

/**
 * Fetch a single conversation thread (messages asc + lead + vertical config +
 * assignment + 24h window). Returns null if not found / not visible to caller.
 * Mirrors `get_conversation`.
 */
export async function getConversation(
  conversationId: string,
): Promise<ConversationThread | null> {
  const ctx = await getRequestContext();
  const db = adminDatabases();

  let convo: Record<string, unknown>;
  try {
    convo = (await db.getDocument(
      DATABASE_ID,
      COLLECTION.conversations,
      conversationId,
    )) as Record<string, unknown>;
    assertOwned(ctx.orgId, convo as { workspaceId?: string | null });
  } catch {
    return null;
  }

  // Latest lead for this conversation.
  let leadDoc: Record<string, unknown> | null = null;
  try {
    const res = await db.listDocuments(DATABASE_ID, COLLECTION.leads, [
      Query.equal("workspaceId", ctx.orgId),
      Query.equal("conversationId", conversationId),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);
    leadDoc = res.documents[0] ?? null;
  } catch {
    /* ignore */
  }

  // RBAC: a restricted caller may only open a thread whose lead is theirs.
  if (isLeadScopeRestricted(ctx)) {
    const teamIds = await resolveCallerTeamIds(ctx);
    const visible = canSeeLead(
      ctx,
      leadDoc as {
        workspaceId?: string | null;
        assignedToUserId?: string | null;
        assignedToTeamId?: string | null;
      } | null,
      teamIds,
    );
    if (!visible) return null;
  }

  // Messages ascending.
  let msgs: Record<string, unknown>[] = [];
  try {
    const res = await db.listDocuments(DATABASE_ID, COLLECTION.inboxMessages, [
      Query.equal("conversationId", conversationId),
      Query.orderAsc("$createdAt"),
      Query.limit(500),
    ]);
    msgs = res.documents;
  } catch {
    /* ignore */
  }

  // Contact tags.
  let tags: string[] = [];
  const contactId = str(convo.contactId);
  if (contactId) {
    try {
      const contact = (await db.getDocument(
        DATABASE_ID,
        COLLECTION.contacts,
        contactId,
      )) as { tags?: unknown };
      if (Array.isArray(contact.tags)) {
        tags = contact.tags.filter((t): t is string => typeof t === "string");
      }
    } catch {
      /* ignore */
    }
  }

  const pack = getPack(ctx.vertical);
  const lastInboundAt = str(convo.lastInboundAt);
  const within24h =
    !!lastInboundAt &&
    Date.now() - new Date(lastInboundAt).getTime() <= SERVICE_WINDOW_MS;

  const details = leadDoc ? str(leadDoc.details) : null;
  const assignedToUserId = leadDoc ? str(leadDoc.assignedToUserId) : null;
  const assignedToTeamId = leadDoc ? str(leadDoc.assignedToTeamId) : null;
  const maps = await getNameMaps(ctx.orgId);

  return {
    id: String(convo.$id),
    customerWaId: str(convo.customerWaId) ?? "",
    customerName: str(convo.customerName),
    status: str(convo.status) ?? "open",
    autoReply: convo.autoReply === true,
    within24hWindow: within24h,
    vertical: pack.vertical,
    verticalLabel: pack.label,
    verticalFields: pack.lead_fields,
    tags,
    lead: leadDoc
      ? {
          id: String(leadDoc.$id),
          intent: str(leadDoc.intent),
          stage: str(leadDoc.status),
          details,
          fields: parseFields(details),
          assignedToUserId,
          assignedToTeamId,
          needsHuman: leadDoc.needsHuman === true,
        }
      : null,
    messages: msgs.map((m) => ({
      id: String(m.$id),
      direction: (str(m.direction) ?? "inbound") as "inbound" | "outbound",
      sender: (str(m.sender) ?? "customer") as "customer" | "bot" | "agent",
      text: str(m.text),
      createdAt: String(m.$createdAt ?? ""),
    })),
    assignedToUserName: assignedToUserId
      ? (maps.users[assignedToUserId] ?? null)
      : null,
    assignedToTeamName: assignedToTeamId
      ? (maps.teams[assignedToTeamId] ?? null)
      : null,
  };
}

export interface InboxStats {
  totalChats: number;
  leads: number;
  unresolved: number;
}

/**
 * Header counters. Mirrors `inbox_stats`: total conversations, total leads, and
 * "unresolved" = conversations with auto_reply off OR still unread. Stats are
 * scoped to what the caller can see.
 */
export async function inboxStats(): Promise<InboxStats> {
  const convos = await listConversations("all");
  const ctx = await getRequestContext();

  let leadCount = 0;
  try {
    const queries = await leadScopeQueries(ctx);
    queries.push(Query.limit(1));
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.leads,
      queries,
    );
    leadCount = res.total;
  } catch {
    /* ignore */
  }

  const unresolved = convos.filter((c) => !c.autoReply || c.unread).length;
  return { totalChats: convos.length, leads: leadCount, unresolved };
}
