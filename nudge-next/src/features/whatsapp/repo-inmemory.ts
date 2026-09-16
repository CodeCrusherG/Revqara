/**
 * InMemoryWhatsAppRepo — a pure in-memory implementation of `WhatsAppRepo` for
 * vitest, mirroring how the Python `process_inbound_message` is unit-tested
 * against a rolled-back transactional session.
 *
 * It faithfully reproduces the natural-key idempotency primitives:
 *   - createWebhookEventOrNull returns null on a duplicate (provider,eventId)
 *     ($id collision), exactly like the Appwrite createDocument 409.
 *   - enqueueOutboxOrNull returns null on a duplicate (workspaceId,key)
 *     ($id collision = uq_outbox_idem).
 *   - upsertConversation / upsertContact / getOrCreateLead are get-or-create on
 *     their natural unique keys.
 *   - setInboxMessageWamid only sets wamid when not already present (parity with
 *     `if msg and not msg.wamid`).
 *
 * No timers, no I/O — deterministic. `$createdAt` is a monotonically increasing
 * counter-backed ISO timestamp so ascending-order history is stable.
 */
import { createHash } from "node:crypto";

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

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

interface SeedAccount {
  phoneNumberId: string;
  workspaceId: string;
}
interface SeedWorkspace {
  workspaceId: string;
  vertical?: string | null;
}
interface SeedBot {
  workspaceId: string;
  enabled?: boolean;
  knowledge?: string | null;
}

export class InMemoryWhatsAppRepo implements WhatsAppRepo {
  private accounts = new Map<string, AccountRow>();
  private workspaces = new Map<string, WorkspaceRow>();
  private bots = new Map<string, BotRow>();
  private events = new Map<string, WebhookEventRow>(); // by $id
  private conversations = new Map<string, ConversationRow>(); // by $id
  private contacts = new Map<string, ContactRow>(); // by $id
  private leads = new Map<string, LeadRow>(); // by $id
  private messages: InboxMessageRow[] = [];
  private traces: NewAiTrace[] = [];
  private outbox = new Map<string, OutboxRow>(); // by $id
  private waMessages: WhatsAppMessageRow[] = [];

  private seq = 0;

  /** Monotonic ISO timestamp so list-asc ordering is deterministic. */
  private tick(): string {
    this.seq += 1;
    return new Date(1_700_000_000_000 + this.seq).toISOString();
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  // ── Seeding helpers (test fixtures) ──
  seedAccount(a: SeedAccount): void {
    this.accounts.set(a.phoneNumberId, {
      $id: a.phoneNumberId,
      workspaceId: a.workspaceId,
      phoneNumberId: a.phoneNumberId,
    });
  }
  seedWorkspace(w: SeedWorkspace): void {
    this.workspaces.set(w.workspaceId, {
      $id: w.workspaceId,
      vertical: w.vertical ?? null,
    });
  }
  seedBot(b: SeedBot): void {
    this.bots.set(b.workspaceId, {
      $id: this.id("bot"),
      workspaceId: b.workspaceId,
      enabled: b.enabled ?? true,
      knowledge: b.knowledge ?? null,
    });
  }
  /** Seed a campaign send so reply attribution has a row to flip. */
  seedWhatsAppMessage(waId: string, workspaceId: string | null = null): WhatsAppMessageRow {
    const row: WhatsAppMessageRow = {
      $id: this.id("wam"),
      workspaceId,
      waId,
      replied: false,
      $createdAt: this.tick(),
    };
    this.waMessages.push(row);
    return row;
  }

  // ── Introspection helpers (assertions) ──
  allInbox(): InboxMessageRow[] {
    return [...this.messages];
  }
  inboxFor(conversationId: string, direction?: "inbound" | "outbound"): InboxMessageRow[] {
    return this.messages.filter(
      (m) =>
        m.conversationId === conversationId &&
        (direction ? m.direction === direction : true),
    );
  }
  allOutbox(): OutboxRow[] {
    return [...this.outbox.values()];
  }
  outboxFor(conversationId: string): OutboxRow[] {
    return [...this.outbox.values()].filter((o) => o.conversationId === conversationId);
  }
  allTraces(): NewAiTrace[] {
    return [...this.traces];
  }
  tracesFor(conversationId: string): NewAiTrace[] {
    return this.traces.filter((t) => t.conversationId === conversationId);
  }
  allEvents(): WebhookEventRow[] {
    return [...this.events.values()];
  }
  getConversation(id: string): ConversationRow | undefined {
    return this.conversations.get(id);
  }
  getContact(id: string): ContactRow | undefined {
    return this.contacts.get(id);
  }
  getLead(id: string): LeadRow | undefined {
    return this.leads.get(id);
  }
  contactByNumber(workspaceId: string, number: string): ContactRow | undefined {
    return [...this.contacts.values()].find(
      (c) => c.workspaceId === workspaceId && c.whatsappNumber === number,
    );
  }

  // ── Routing ──
  async getAccountByPhoneNumberId(phoneNumberId: string): Promise<AccountRow | null> {
    return this.accounts.get(phoneNumberId) ?? null;
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceRow | null> {
    return this.workspaces.get(workspaceId) ?? null;
  }

  async getBot(workspaceId: string): Promise<BotRow | null> {
    return this.bots.get(workspaceId) ?? null;
  }

  // ── webhook_events (natural key $id = sha256(provider:eventId)) ──
  async createWebhookEventOrNull(ev: NewWebhookEvent): Promise<WebhookEventRow | null> {
    const id = sha256(`${ev.provider}:${ev.providerEventId}`);
    if (this.events.has(id)) return null; // $id-409 = duplicate
    const row: WebhookEventRow = {
      $id: id,
      workspaceId: null,
      provider: ev.provider,
      providerEventId: ev.providerEventId,
      messageId: ev.messageId,
      status: "received",
      error: null,
      processedAt: null,
    };
    this.events.set(id, row);
    return row;
  }

  async getWebhookEvent(
    provider: string,
    providerEventId: string,
  ): Promise<WebhookEventRow | null> {
    return this.events.get(sha256(`${provider}:${providerEventId}`)) ?? null;
  }

  async updateWebhookEvent(
    id: string,
    patch: Partial<Pick<WebhookEventRow, "workspaceId" | "status" | "error" | "processedAt">>,
  ): Promise<void> {
    const row = this.events.get(id);
    if (row) Object.assign(row, patch);
  }

  // ── conversations (get-or-create on workspaceId+phoneNumberId+customerWaId) ──
  async upsertConversation(input: UpsertConversationInput): Promise<ConversationRow> {
    const existing = [...this.conversations.values()].find(
      (c) =>
        c.workspaceId === input.workspaceId &&
        c.phoneNumberId === input.phoneNumberId &&
        c.customerWaId === input.customerWaId,
    );
    if (existing) return existing;
    const row: ConversationRow = {
      $id: this.id("convo"),
      workspaceId: input.workspaceId,
      phoneNumberId: input.phoneNumberId,
      customerWaId: input.customerWaId,
      customerName: input.customerName,
      contactId: null,
      status: "open",
      autoReply: true,
      unread: true,
      lastInboundAt: null,
    };
    this.conversations.set(row.$id, row);
    return row;
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
    const row = this.conversations.get(id);
    if (row) Object.assign(row, patch);
  }

  // ── contacts (get-or-create on workspaceId+whatsappNumber) ──
  async upsertContact(input: UpsertContactInput): Promise<ContactRow> {
    const existing = this.contactByNumber(input.workspaceId, input.whatsappNumber);
    if (existing) return existing;
    const row: ContactRow = {
      $id: this.id("contact"),
      workspaceId: input.workspaceId,
      whatsappNumber: input.whatsappNumber,
      fullName: input.fullName,
      optInStatus: "unknown",
      optInSource: null,
      optInAt: null,
      tags: [],
    };
    this.contacts.set(row.$id, row);
    return row;
  }

  async updateContact(
    id: string,
    patch: Partial<
      Pick<ContactRow, "optInStatus" | "optInSource" | "optInAt" | "tags" | "fullName">
    >,
  ): Promise<void> {
    const row = this.contacts.get(id);
    if (row) Object.assign(row, patch);
  }

  // ── leads (one per conversation) ──
  async getOrCreateLead(input: GetOrCreateLeadInput): Promise<LeadRow> {
    const existing = [...this.leads.values()].find(
      (l) => l.conversationId === input.conversationId,
    );
    if (existing) return existing;
    const row: LeadRow = {
      $id: this.id("lead"),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      contactId: input.contactId,
      name: input.name,
      phone: input.phone,
      intent: null,
      details: null,
      source: "bot",
      status: "new",
      needsHuman: false,
    };
    this.leads.set(row.$id, row);
    return row;
  }

  async updateLead(
    id: string,
    patch: Partial<Pick<LeadRow, "intent" | "details" | "status" | "needsHuman">>,
  ): Promise<void> {
    const row = this.leads.get(id);
    if (row) Object.assign(row, patch);
  }

  // ── messages ──
  async addInboxMessage(msg: NewInboxMessage): Promise<InboxMessageRow> {
    const row: InboxMessageRow = {
      $id: this.id("msg"),
      workspaceId: msg.workspaceId,
      conversationId: msg.conversationId,
      direction: msg.direction,
      sender: msg.sender,
      text: msg.text,
      wamid: msg.wamid ?? null,
      $createdAt: this.tick(),
    };
    this.messages.push(row);
    return row;
  }

  async listMessagesAsc(conversationId: string): Promise<InboxMessageRow[]> {
    return this.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt));
  }

  async setInboxMessageWamid(id: string, wamid: string): Promise<void> {
    const row = this.messages.find((m) => m.$id === id);
    if (row && !row.wamid) row.wamid = wamid;
  }

  // ── campaign attribution ──
  async getLatestWhatsAppMessageByWaId(waId: string): Promise<WhatsAppMessageRow | null> {
    const rows = this.waMessages
      .filter((m) => m.waId === waId)
      .sort((a, b) => b.$createdAt.localeCompare(a.$createdAt));
    return rows[0] ?? null;
  }

  async markWhatsAppMessageReplied(id: string): Promise<void> {
    const row = this.waMessages.find((m) => m.$id === id);
    if (row) row.replied = true;
  }

  // ── ai_traces ──
  async addAiTrace(trace: NewAiTrace): Promise<void> {
    this.traces.push(trace);
  }

  // ── outbox (natural key $id = sha256(workspaceId:idempotencyKey)) ──
  async enqueueOutboxOrNull(input: EnqueueOutboxInput): Promise<OutboxRow | null> {
    const id = sha256(`${input.workspaceId}:${input.idempotencyKey}`);
    if (this.outbox.has(id)) return null; // $id-409 = uq_outbox_idem
    const row: OutboxRow = {
      $id: id,
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
      $createdAt: this.tick(),
    };
    this.outbox.set(id, row);
    return row;
  }

  async getOutboxByKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<OutboxRow | null> {
    return this.outbox.get(sha256(`${workspaceId}:${idempotencyKey}`)) ?? null;
  }

  async listDueOutbox(now: Date, limit: number): Promise<OutboxRow[]> {
    const nowMs = now.getTime();
    return [...this.outbox.values()]
      .filter(
        (r) =>
          (r.status === "pending" || r.status === "failed") &&
          r.attempts < r.maxAttempts &&
          (r.nextAttemptAt === null || new Date(r.nextAttemptAt).getTime() <= nowMs),
      )
      .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
      .slice(0, limit);
  }

  async updateOutbox(
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
  ): Promise<void> {
    const row = this.outbox.get(id);
    if (row) Object.assign(row, patch);
  }
}
