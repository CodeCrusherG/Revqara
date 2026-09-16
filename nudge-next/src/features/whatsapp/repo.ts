/**
 * WhatsAppRepo — the data-access PORT for the inbound pipeline + outbox.
 *
 * Appwrite has no ACID transactions; behavioral parity with the Python
 * `process_inbound_message` (which is unit-tested against a rolled-back DB) is
 * achieved by:
 *   - natural-key `$id` get-or-create for the two idempotency primitives
 *     (`createWebhookEventOrNull`, `enqueueOutboxOrNull` — both return `null`
 *     on a `$id`-409 = duplicate), and
 *   - get-or-create everywhere else (every create is idempotent under replay).
 *
 * The ENTIRE testable core (inbound.ts, outbox.ts) talks ONLY to this interface,
 * so it runs in vitest against `InMemoryWhatsAppRepo` exactly as the Python core
 * runs against a transactional test session. `AppwriteWhatsAppRepo` is the real
 * implementation over the node-appwrite admin SDK.
 *
 * Every method is tenant-scoped: reads/writes carry `workspaceId` (the global
 * routing collections `whatsapp_accounts` / `webhook_events` are keyed by their
 * natural id and resolve the workspace).
 */

// ── Row shapes (the subset of each collection the pipeline reads/writes) ─────

export interface AccountRow {
  $id: string;
  workspaceId: string;
  phoneNumberId: string;
}

export interface WorkspaceRow {
  $id: string;
  vertical: string | null;
}

export interface BotRow {
  $id: string;
  workspaceId: string;
  enabled: boolean;
  knowledge: string | null;
}

export interface ConversationRow {
  $id: string;
  workspaceId: string;
  phoneNumberId: string;
  customerWaId: string;
  customerName: string | null;
  contactId: string | null;
  status: "open" | "closed";
  autoReply: boolean;
  unread: boolean;
  lastInboundAt: string | null;
}

export interface ContactRow {
  $id: string;
  workspaceId: string;
  whatsappNumber: string;
  fullName: string | null;
  optInStatus: "opted_in" | "opted_out" | "unknown";
  optInSource: string | null;
  optInAt: string | null;
  tags: string[];
}

export interface LeadRow {
  $id: string;
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  name: string | null;
  phone: string | null;
  intent: string | null;
  details: string | null;
  source: "bot" | "agent";
  status: string;
  needsHuman: boolean;
}

export interface InboxMessageRow {
  $id: string;
  workspaceId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "bot" | "agent";
  text: string | null;
  wamid: string | null;
  $createdAt: string;
}

export interface WebhookEventRow {
  $id: string;
  workspaceId: string | null;
  provider: string;
  providerEventId: string;
  messageId: string | null;
  status:
    | "received"
    | "processing"
    | "processed"
    | "failed"
    | "ignored_duplicate";
  error: string | null;
  processedAt: string | null;
}

export interface OutboxRow {
  $id: string;
  workspaceId: string;
  contactId: string | null;
  conversationId: string | null;
  inboxMessageId: string | null;
  channel: "whatsapp";
  payloadJson: string; // {to,text,sender}
  idempotencyKey: string;
  status: "pending" | "sending" | "sent" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
  $createdAt: string;
}

export interface WhatsAppMessageRow {
  $id: string;
  workspaceId: string | null;
  waId: string | null;
  replied: boolean;
  $createdAt: string;
}

// ── Input payloads ──────────────────────────────────────────────────────────

export interface NewWebhookEvent {
  provider: string;
  providerEventId: string;
  messageId: string | null;
  payloadJson: string | null;
}

export interface UpsertConversationInput {
  workspaceId: string;
  phoneNumberId: string;
  customerWaId: string;
  customerName: string | null;
}

export interface UpsertContactInput {
  workspaceId: string;
  whatsappNumber: string;
  fullName: string | null;
}

export interface NewInboxMessage {
  workspaceId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "bot" | "agent";
  text: string | null;
  wamid?: string | null;
}

export interface GetOrCreateLeadInput {
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  name: string | null;
  phone: string | null;
}

export interface NewAiTrace {
  workspaceId: string;
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
  inboundMessageId?: string | null;
  vertical: string | null;
  intent: string | null;
  confidence: number | null;
  confidenceSource: string;
  extractedFieldsJson: string | null;
  stageBefore: string | null;
  stageAfter: string | null;
  tagsAdded: string[];
  nextAction: string | null;
  handoffRequired: boolean;
  handoffReason: string | null;
  fallbackUsed: boolean;
  modelUsed: string | null;
  graphVersion: string;
}

export interface EnqueueOutboxInput {
  workspaceId: string;
  idempotencyKey: string;
  to: string;
  text: string;
  sender: string | null;
  conversationId?: string | null;
  contactId?: string | null;
  inboxMessageId?: string | null;
  channel?: "whatsapp";
}

/**
 * The data-access port. Implementations: `AppwriteWhatsAppRepo` (real) and
 * `InMemoryWhatsAppRepo` (tests). All methods async to match the real SDK.
 */
export interface WhatsAppRepo {
  // ── Routing (global natural-key collection) ──
  getAccountByPhoneNumberId(phoneNumberId: string): Promise<AccountRow | null>;

  // ── Workspace / bot ──
  getWorkspace(workspaceId: string): Promise<WorkspaceRow | null>;
  getBot(workspaceId: string): Promise<BotRow | null>;

  // ── Idempotency: webhook_events ($id = sha256(provider:eventId)) ──
  /** Create the event; returns the row, or `null` if a $id-409 means duplicate. */
  createWebhookEventOrNull(
    ev: NewWebhookEvent,
  ): Promise<WebhookEventRow | null>;
  getWebhookEvent(
    provider: string,
    providerEventId: string,
  ): Promise<WebhookEventRow | null>;
  updateWebhookEvent(
    id: string,
    patch: Partial<
      Pick<
        WebhookEventRow,
        "workspaceId" | "status" | "error" | "processedAt"
      >
    >,
  ): Promise<void>;

  // ── Conversation + contact (get-or-create, tenant-scoped) ──
  upsertConversation(
    input: UpsertConversationInput,
  ): Promise<ConversationRow>;
  updateConversation(
    id: string,
    patch: Partial<
      Pick<
        ConversationRow,
        | "customerName"
        | "contactId"
        | "status"
        | "autoReply"
        | "unread"
        | "lastInboundAt"
      >
    >,
  ): Promise<void>;
  upsertContact(input: UpsertContactInput): Promise<ContactRow>;
  updateContact(
    id: string,
    patch: Partial<
      Pick<
        ContactRow,
        "optInStatus" | "optInSource" | "optInAt" | "tags" | "fullName"
      >
    >,
  ): Promise<void>;

  // ── Lead capture (one per conversation) ──
  getOrCreateLead(input: GetOrCreateLeadInput): Promise<LeadRow>;
  updateLead(
    id: string,
    patch: Partial<
      Pick<LeadRow, "intent" | "details" | "status" | "needsHuman">
    >,
  ): Promise<void>;

  // ── Messages ──
  addInboxMessage(msg: NewInboxMessage): Promise<InboxMessageRow>;
  /** Conversation history in ascending $createdAt order (for graph context). */
  listMessagesAsc(conversationId: string): Promise<InboxMessageRow[]>;
  /** Backfill an outbound message's wamid once the provider returns it. */
  setInboxMessageWamid(id: string, wamid: string): Promise<void>;

  // ── Campaign reply attribution ──
  getLatestWhatsAppMessageByWaId(
    waId: string,
  ): Promise<WhatsAppMessageRow | null>;
  markWhatsAppMessageReplied(id: string): Promise<void>;

  // ── AI audit ──
  addAiTrace(trace: NewAiTrace): Promise<void>;

  // ── Outbox ──
  /**
   * Enqueue an outbound message; idempotent on $id = sha256(workspaceId:key).
   * Returns the new row, or `null` if it already existed (the enqueue is a
   * no-op — the same logical reply is enqueued at most once).
   */
  enqueueOutboxOrNull(input: EnqueueOutboxInput): Promise<OutboxRow | null>;
  getOutboxByKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<OutboxRow | null>;
  /** Due rows for the worker: status∈{pending,failed}, attempts<max, due. */
  listDueOutbox(now: Date, limit: number): Promise<OutboxRow[]>;
  updateOutbox(
    id: string,
    patch: Partial<
      Pick<
        OutboxRow,
        | "status"
        | "attempts"
        | "nextAttemptAt"
        | "providerMessageId"
        | "lastError"
        | "sentAt"
      >
    >,
  ): Promise<void>;
}
