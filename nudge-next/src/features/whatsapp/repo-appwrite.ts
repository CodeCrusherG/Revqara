import "server-only";

/**
 * AppwriteWhatsAppRepo — the real `WhatsAppRepo` over the node-appwrite admin
 * SDK (lib/appwrite admin + collections). Tenancy is enforced by query-injected
 * `workspaceId` (the admin key bypasses ACLs by design).
 *
 * The two idempotency primitives use natural-key `$id` createDocument: a 409 is
 * the duplicate signal (returns null), exactly mirroring the SQL unique
 * constraints in the Python service:
 *   - webhook_events.$id  = sha256(provider:providerEventId)
 *   - message_outbox.$id  = sha256(workspaceId:idempotencyKey)
 *
 * conversations / contacts use natural unique keys too, but Appwrite uniqueness
 * is index-enforced (not $id), so get-or-create is read-then-create with a 409
 * fallback re-read to stay race-safe (R1). Defense-in-depth doc Team permissions
 * are out of scope here (workers use the API key); writes carry workspaceId.
 */
import { ID, Query, AppwriteException } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";

import { normalizePhone } from "./normalize";
import type {
  AccountRow,
  BotRow,
  ContactRow,
  ConversationRow,
  EnqueueOutboxInput,
  GetOrCreateLeadInput,
  InboxMessageRow,
  LeadRow,
  NewAiTrace,
  NewInboxMessage,
  NewWebhookEvent,
  OutboxRow,
  UpsertContactInput,
  UpsertConversationInput,
  WebhookEventRow,
  WhatsAppMessageRow,
  WhatsAppRepo,
  WorkspaceRow,
} from "./repo";

import { createHash } from "node:crypto";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function is409(err: unknown): boolean {
  return err instanceof AppwriteException && err.code === 409;
}
function is404(err: unknown): boolean {
  return err instanceof AppwriteException && err.code === 404;
}

// Loosely-typed Appwrite document shape.
type Doc = Record<string, unknown> & {
  $id: string;
  $createdAt: string;
};

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function bool(v: unknown, dflt = false): boolean {
  return typeof v === "boolean" ? v : dflt;
}
function num(v: unknown, dflt = 0): number {
  return typeof v === "number" ? v : dflt;
}

export class AppwriteWhatsAppRepo implements WhatsAppRepo {
  private get db() {
    return adminDatabases();
  }

  // ── Routing ──
  async getAccountByPhoneNumberId(phoneNumberId: string): Promise<AccountRow | null> {
    try {
      const doc = (await this.db.getDocument(
        DATABASE_ID,
        COLLECTION.whatsappAccounts,
        phoneNumberId,
      )) as Doc;
      return {
        $id: doc.$id,
        workspaceId: str(doc.workspaceId) ?? "",
        phoneNumberId: str(doc.phoneNumberId) ?? phoneNumberId,
      };
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRow | null> {
    try {
      const doc = (await this.db.getDocument(
        DATABASE_ID,
        COLLECTION.workspaces,
        workspaceId,
      )) as Doc;
      return { $id: doc.$id, vertical: str(doc.vertical) };
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  }

  async getBot(workspaceId: string): Promise<BotRow | null> {
    const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.bots, [
      Query.equal("workspaceId", workspaceId),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as Doc | undefined;
    if (!doc) return null;
    return {
      $id: doc.$id,
      workspaceId,
      enabled: bool(doc.enabled, true),
      knowledge: str(doc.knowledge),
    };
  }

  // ── webhook_events ──
  async createWebhookEventOrNull(ev: NewWebhookEvent): Promise<WebhookEventRow | null> {
    const id = sha256(`${ev.provider}:${ev.providerEventId}`);
    try {
      const doc = (await this.db.createDocument(
        DATABASE_ID,
        COLLECTION.webhookEvents,
        id,
        {
          workspaceId: null,
          provider: ev.provider,
          providerEventId: ev.providerEventId,
          messageId: ev.messageId,
          payloadJson: ev.payloadJson,
          status: "received",
          error: null,
          processedAt: null,
        },
      )) as Doc;
      return this.mapEvent(doc);
    } catch (err) {
      if (is409(err)) return null; // duplicate delivery
      throw err;
    }
  }

  private mapEvent(doc: Doc): WebhookEventRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId),
      provider: str(doc.provider) ?? "",
      providerEventId: str(doc.providerEventId) ?? "",
      messageId: str(doc.messageId),
      status: (str(doc.status) as WebhookEventRow["status"]) ?? "received",
      error: str(doc.error),
      processedAt: str(doc.processedAt),
    };
  }

  async getWebhookEvent(
    provider: string,
    providerEventId: string,
  ): Promise<WebhookEventRow | null> {
    const id = sha256(`${provider}:${providerEventId}`);
    try {
      const doc = (await this.db.getDocument(
        DATABASE_ID,
        COLLECTION.webhookEvents,
        id,
      )) as Doc;
      return this.mapEvent(doc);
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  }

  async updateWebhookEvent(
    id: string,
    patch: Partial<Pick<WebhookEventRow, "workspaceId" | "status" | "error" | "processedAt">>,
  ): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.webhookEvents, id, patch);
  }

  // ── conversations ──
  private mapConversation(doc: Doc): ConversationRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId) ?? "",
      phoneNumberId: str(doc.phoneNumberId) ?? "",
      customerWaId: str(doc.customerWaId) ?? "",
      customerName: str(doc.customerName),
      contactId: str(doc.contactId),
      status: (str(doc.status) as ConversationRow["status"]) ?? "open",
      autoReply: bool(doc.autoReply, true),
      unread: bool(doc.unread, true),
      lastInboundAt: str(doc.lastInboundAt),
    };
  }

  async upsertConversation(input: UpsertConversationInput): Promise<ConversationRow> {
    const find = async (): Promise<Doc | undefined> => {
      const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.conversations, [
        Query.equal("workspaceId", input.workspaceId),
        Query.equal("phoneNumberId", input.phoneNumberId),
        Query.equal("customerWaId", input.customerWaId),
        Query.limit(1),
      ]);
      return res.documents[0] as Doc | undefined;
    };

    const existing = await find();
    if (existing) return this.mapConversation(existing);

    try {
      const doc = (await this.db.createDocument(
        DATABASE_ID,
        COLLECTION.conversations,
        ID.unique(),
        {
          workspaceId: input.workspaceId,
          phoneNumberId: input.phoneNumberId,
          customerWaId: input.customerWaId,
          customerName: input.customerName,
          contactId: null,
          status: "open",
          autoReply: true,
          unread: true,
          lastInboundAt: null,
        },
      )) as Doc;
      return this.mapConversation(doc);
    } catch (err) {
      if (is409(err)) {
        // Lost a race against the unique index — re-read.
        const again = await find();
        if (again) return this.mapConversation(again);
      }
      throw err;
    }
  }

  async updateConversation(
    id: string,
    patch: Partial<
      Pick<
        ConversationRow,
        "customerName" | "contactId" | "status" | "autoReply" | "unread" | "lastInboundAt"
      >
    >,
  ): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.conversations, id, patch);
  }

  // ── contacts ──
  private mapContact(doc: Doc): ContactRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId) ?? "",
      whatsappNumber: str(doc.whatsappNumber) ?? "",
      fullName: str(doc.fullName),
      optInStatus: (str(doc.optInStatus) as ContactRow["optInStatus"]) ?? "unknown",
      optInSource: str(doc.optInSource),
      optInAt: str(doc.optInAt),
      tags: Array.isArray(doc.tags) ? (doc.tags as string[]) : [],
    };
  }

  async upsertContact(input: UpsertContactInput): Promise<ContactRow> {
    const number = normalizePhone(input.whatsappNumber) || input.whatsappNumber;
    const find = async (): Promise<Doc | undefined> => {
      const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.contacts, [
        Query.equal("workspaceId", input.workspaceId),
        Query.equal("whatsappNumber", number),
        Query.limit(1),
      ]);
      return res.documents[0] as Doc | undefined;
    };

    const existing = await find();
    if (existing) return this.mapContact(existing);

    try {
      const doc = (await this.db.createDocument(
        DATABASE_ID,
        COLLECTION.contacts,
        ID.unique(),
        {
          workspaceId: input.workspaceId,
          whatsappNumber: number,
          fullName: input.fullName,
          optInStatus: "unknown",
          optInSource: null,
          optInAt: null,
          tags: [],
        },
      )) as Doc;
      return this.mapContact(doc);
    } catch (err) {
      if (is409(err)) {
        const again = await find();
        if (again) return this.mapContact(again);
      }
      throw err;
    }
  }

  async updateContact(
    id: string,
    patch: Partial<
      Pick<ContactRow, "optInStatus" | "optInSource" | "optInAt" | "tags" | "fullName">
    >,
  ): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.contacts, id, patch);
  }

  // ── leads ──
  private mapLead(doc: Doc): LeadRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId) ?? "",
      conversationId: str(doc.conversationId) ?? "",
      contactId: str(doc.contactId),
      name: str(doc.name),
      phone: str(doc.phone),
      intent: str(doc.intent),
      details: str(doc.details),
      source: (str(doc.source) as LeadRow["source"]) ?? "bot",
      status: str(doc.status) ?? "new",
      needsHuman: bool(doc.needsHuman, false),
    };
  }

  async getOrCreateLead(input: GetOrCreateLeadInput): Promise<LeadRow> {
    const find = async (): Promise<Doc | undefined> => {
      const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.leads, [
        Query.equal("conversationId", input.conversationId),
        Query.limit(1),
      ]);
      return res.documents[0] as Doc | undefined;
    };

    const existing = await find();
    if (existing) return this.mapLead(existing);

    try {
      const doc = (await this.db.createDocument(
        DATABASE_ID,
        COLLECTION.leads,
        ID.unique(),
        {
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          contactId: input.contactId,
          name: input.name,
          phone: input.phone,
          source: "bot",
          status: "new",
          needsHuman: false,
        },
      )) as Doc;
      return this.mapLead(doc);
    } catch (err) {
      if (is409(err)) {
        // uq_lead_conversation race — re-read.
        const again = await find();
        if (again) return this.mapLead(again);
      }
      throw err;
    }
  }

  async updateLead(
    id: string,
    patch: Partial<Pick<LeadRow, "intent" | "details" | "status" | "needsHuman">>,
  ): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.leads, id, patch);
  }

  // ── messages ──
  private mapMessage(doc: Doc): InboxMessageRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId) ?? "",
      conversationId: str(doc.conversationId) ?? "",
      direction: (str(doc.direction) as InboxMessageRow["direction"]) ?? "inbound",
      sender: (str(doc.sender) as InboxMessageRow["sender"]) ?? "customer",
      text: str(doc.text),
      wamid: str(doc.wamid),
      $createdAt: doc.$createdAt,
    };
  }

  async addInboxMessage(msg: NewInboxMessage): Promise<InboxMessageRow> {
    const doc = (await this.db.createDocument(
      DATABASE_ID,
      COLLECTION.inboxMessages,
      ID.unique(),
      {
        workspaceId: msg.workspaceId,
        conversationId: msg.conversationId,
        direction: msg.direction,
        sender: msg.sender,
        text: msg.text,
        wamid: msg.wamid ?? null,
      },
    )) as Doc;
    return this.mapMessage(doc);
  }

  async listMessagesAsc(conversationId: string): Promise<InboxMessageRow[]> {
    const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.inboxMessages, [
      Query.equal("conversationId", conversationId),
      Query.orderAsc("$createdAt"),
      Query.limit(200),
    ]);
    return (res.documents as Doc[]).map((d) => this.mapMessage(d));
  }

  async setInboxMessageWamid(id: string, wamid: string): Promise<void> {
    try {
      const doc = (await this.db.getDocument(
        DATABASE_ID,
        COLLECTION.inboxMessages,
        id,
      )) as Doc;
      if (!str(doc.wamid)) {
        await this.db.updateDocument(DATABASE_ID, COLLECTION.inboxMessages, id, { wamid });
      }
    } catch (err) {
      if (is404(err)) return;
      throw err;
    }
  }

  // ── campaign attribution ──
  async getLatestWhatsAppMessageByWaId(waId: string): Promise<WhatsAppMessageRow | null> {
    const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.whatsappMessages, [
      Query.equal("waId", waId),
      Query.orderDesc("$createdAt"),
      Query.limit(1),
    ]);
    const doc = res.documents[0] as Doc | undefined;
    if (!doc) return null;
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId),
      waId: str(doc.waId),
      replied: bool(doc.replied, false),
      $createdAt: doc.$createdAt,
    };
  }

  async markWhatsAppMessageReplied(id: string): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.whatsappMessages, id, {
      replied: true,
    });
  }

  // ── ai_traces ──
  async addAiTrace(trace: NewAiTrace): Promise<void> {
    await this.db.createDocument(DATABASE_ID, COLLECTION.aiTraces, ID.unique(), {
      workspaceId: trace.workspaceId,
      contactId: trace.contactId,
      leadId: trace.leadId,
      conversationId: trace.conversationId,
      inboundMessageId: trace.inboundMessageId ?? null,
      vertical: trace.vertical,
      intent: trace.intent,
      confidence: trace.confidence,
      confidenceSource: trace.confidenceSource,
      extractedFieldsJson: trace.extractedFieldsJson,
      stageBefore: trace.stageBefore,
      stageAfter: trace.stageAfter,
      tagsAdded: trace.tagsAdded,
      nextAction: trace.nextAction,
      handoffRequired: trace.handoffRequired,
      handoffReason: trace.handoffReason,
      fallbackUsed: trace.fallbackUsed,
      modelUsed: trace.modelUsed,
      graphVersion: trace.graphVersion,
    });
  }

  // ── outbox ──
  private mapOutbox(doc: Doc): OutboxRow {
    return {
      $id: doc.$id,
      workspaceId: str(doc.workspaceId) ?? "",
      contactId: str(doc.contactId),
      conversationId: str(doc.conversationId),
      inboxMessageId: str(doc.inboxMessageId),
      channel: "whatsapp",
      payloadJson: str(doc.payloadJson) ?? "{}",
      idempotencyKey: str(doc.idempotencyKey) ?? "",
      status: (str(doc.status) as OutboxRow["status"]) ?? "pending",
      attempts: num(doc.attempts, 0),
      maxAttempts: num(doc.maxAttempts, 5),
      nextAttemptAt: str(doc.nextAttemptAt),
      providerMessageId: str(doc.providerMessageId),
      lastError: str(doc.lastError),
      sentAt: str(doc.sentAt),
      $createdAt: doc.$createdAt,
    };
  }

  async enqueueOutboxOrNull(input: EnqueueOutboxInput): Promise<OutboxRow | null> {
    const id = sha256(`${input.workspaceId}:${input.idempotencyKey}`);
    try {
      const doc = (await this.db.createDocument(
        DATABASE_ID,
        COLLECTION.messageOutbox,
        id,
        {
          workspaceId: input.workspaceId,
          contactId: input.contactId ?? null,
          conversationId: input.conversationId ?? null,
          inboxMessageId: input.inboxMessageId ?? null,
          channel: input.channel ?? "whatsapp",
          payloadJson: JSON.stringify({
            to: input.to,
            text: input.text,
            sender: input.sender,
          }),
          idempotencyKey: input.idempotencyKey,
          status: "pending",
          attempts: 0,
          maxAttempts: 5,
          nextAttemptAt: null,
          providerMessageId: null,
          lastError: null,
          sentAt: null,
        },
      )) as Doc;
      return this.mapOutbox(doc);
    } catch (err) {
      if (is409(err)) return null; // uq_outbox_idem — already enqueued
      throw err;
    }
  }

  async getOutboxByKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<OutboxRow | null> {
    const id = sha256(`${workspaceId}:${idempotencyKey}`);
    try {
      const doc = (await this.db.getDocument(
        DATABASE_ID,
        COLLECTION.messageOutbox,
        id,
      )) as Doc;
      return this.mapOutbox(doc);
    } catch (err) {
      if (is404(err)) return null;
      throw err;
    }
  }

  async listDueOutbox(now: Date, limit: number): Promise<OutboxRow[]> {
    // The status+nextAttemptAt index narrows by status; the attempts<max + due
    // predicate (incl. null nextAttemptAt for fresh pending rows) can't be fully
    // expressed by one Appwrite query, so we fetch an oldest-first window of
    // claimable rows and filter in-process — parity with the Python SQL query.
    const res = await this.db.listDocuments(DATABASE_ID, COLLECTION.messageOutbox, [
      Query.equal("status", ["pending", "failed"]),
      Query.orderAsc("$createdAt"),
      Query.limit(Math.max(limit * 4, limit)),
    ]);
    const rows = (res.documents as Doc[]).map((d) => this.mapOutbox(d));
    return rows
      .filter(
        (r) =>
          r.attempts < r.maxAttempts &&
          (r.nextAttemptAt === null ||
            new Date(r.nextAttemptAt).getTime() <= now.getTime()),
      )
      .slice(0, limit);
  }

  async updateOutbox(
    id: string,
    patch: Partial<
      Pick<
        OutboxRow,
        "status" | "attempts" | "nextAttemptAt" | "providerMessageId" | "lastError" | "sentAt"
      >
    >,
  ): Promise<void> {
    await this.db.updateDocument(DATABASE_ID, COLLECTION.messageOutbox, id, patch);
  }
}
