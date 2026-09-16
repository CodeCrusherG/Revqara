/**
 * Typed Appwrite document models — one per collection (24 domain collections +
 * billing_webhook_events). Mirrors backend/db/models.py with the naming /
 * tenancy conventions from NEXTJS_REWRITE_PLAN.md §3:
 *   - generic created_at/updated_at dropped → use $createdAt / $updatedAt
 *   - JSONB → stringified `…Json` attrs (string | null)
 *   - filterable lists → String[] array attrs
 *   - workspaceId is the Clerk org id on every tenant doc
 *
 * These describe the *document shape* (the attributes you set / read). Appwrite
 * adds the system fields in `AppwriteDocument`.
 */

import type { Role } from "./roles";

/** System fields Appwrite stamps on every document. */
export interface AppwriteDocument {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  $permissions: string[];
  $collectionId: string;
  $databaseId: string;
}

/** Every tenant document carries the Clerk org id as workspaceId. */
export interface TenantScoped {
  workspaceId: string;
}

// ── Identity & tenancy ──────────────────────────────────────────────────────

export type WorkspacePlan =
  | "free"
  | "starter"
  | "growth"
  | "ai_pro"
  | "agency";

export type WorkspacePlanStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "halted";

/** `$id` = Clerk org id (`org_…`). */
export interface Workspace {
  name: string;
  plan: WorkspacePlan;
  planStatus: WorkspacePlanStatus;
  vertical: string;
  appwriteTeamId: string | null;
  rzpCustomerId: string | null;
  rzpSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  billingEmail: string | null;
}

export type MemberStatus = "active" | "disabled";

export interface WorkspaceMember extends TenantScoped {
  userId: string;
  email: string | null;
  role: Role;
  status: MemberStatus;
}

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface WorkspaceInvite extends TenantScoped {
  email: string;
  role: Role;
  status: InviteStatus;
  expiresAt: string | null;
  acceptedAt: string | null;
}

// ── Sales routing ───────────────────────────────────────────────────────────

export interface SalesTeam extends TenantScoped {
  name: string;
  description: string | null;
}

export interface SalesTeamMember extends TenantScoped {
  teamId: string;
  userId: string;
}

export type LeadAssignmentStatus = "active" | "reassigned" | "closed";

export interface LeadAssignment extends TenantScoped {
  leadId: string;
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
  assignedByUserId: string | null;
  status: LeadAssignmentStatus;
}

// ── Channel & CRM core ──────────────────────────────────────────────────────

export type WhatsAppAccountStatus = "connected" | "disconnected" | "error";

/** `$id` = phoneNumberId (O(1) inbound routing). */
export interface WhatsAppAccount extends TenantScoped {
  wabaId: string | null;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  accessTokenRef: string | null;
  status: WhatsAppAccountStatus;
}

export type OptInStatus = "opted_in" | "opted_out" | "unknown";

export interface Contact extends TenantScoped {
  fullName: string | null;
  whatsappNumber: string;
  email: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  occupationType: string | null;
  monthlyIncome: number | null;
  creditScore: number | null;
  kycStatus: string | null;
  appInstalled: string | null;
  existingCustomer: string | null;
  socialMediaActive: string | null;
  attributesJson: string | null;
  tags: string[];
  optInStatus: OptInStatus;
  optInSource: string | null;
  optInAt: string | null;
}

export interface ContactList extends TenantScoped {
  name: string;
  description: string | null;
}

export interface ContactListMember extends TenantScoped {
  listId: string;
  contactId: string;
}

export type TemplateCategory =
  | "marketing"
  | "utility"
  | "authentication"
  | "service";

export type TemplateStatus = "draft" | "pending" | "approved" | "rejected";

export interface Template extends TenantScoped {
  name: string;
  category: TemplateCategory;
  language: string;
  body: string;
  status: TemplateStatus;
}

/** 1:1 per workspace. */
export interface Bot extends TenantScoped {
  enabled: boolean;
  handoffEnabled: boolean;
  name: string | null;
  prompt: string | null;
  knowledge: string | null;
}

export type ConversationStatus = "open" | "closed";

export interface Conversation extends TenantScoped {
  phoneNumberId: string;
  customerWaId: string;
  customerName: string | null;
  contactId: string | null;
  status: ConversationStatus;
  autoReply: boolean;
  unread: boolean;
  lastInboundAt: string | null;
}

export type MessageDirection = "inbound" | "outbound";
export type MessageSender = "customer" | "bot" | "agent";

export interface InboxMessage extends TenantScoped {
  conversationId: string;
  direction: MessageDirection;
  sender: MessageSender;
  text: string | null;
  wamid: string | null;
}

export type LeadSource = "bot" | "agent";

export interface Lead extends TenantScoped {
  conversationId: string | null;
  contactId: string | null;
  name: string | null;
  phone: string | null;
  intent: string | null;
  details: string | null;
  source: LeadSource;
  /** Pipeline stage (String(48), pack-validated; not an enum). */
  status: string;
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
  needsHuman: boolean;
}

// ── AI audit, idempotency, outbox, sync ─────────────────────────────────────

export type ConfidenceSource = "llm" | "deterministic" | "rule" | "unknown";

export interface AiTrace extends TenantScoped {
  contactId: string | null;
  leadId: string | null;
  conversationId: string | null;
  inboundMessageId: string | null;
  vertical: string | null;
  intent: string | null;
  /** null when not honestly available. */
  confidence: number | null;
  confidenceSource: ConfidenceSource | null;
  extractedFieldsJson: string | null;
  stageBefore: string | null;
  stageAfter: string | null;
  tagsAdded: string[];
  nextAction: string | null;
  handoffRequired: boolean;
  handoffReason: string | null;
  fallbackUsed: boolean;
  modelUsed: string | null;
  graphVersion: string | null;
  error: string | null;
}

export type WebhookProvider = "whatsapp_cloud" | "whatsapp_sim";

export type WebhookEventStatus =
  | "received"
  | "processing"
  | "processed"
  | "failed"
  | "ignored_duplicate";

/** `$id` = sha256(provider:eventId). */
export interface WebhookEvent {
  workspaceId: string | null;
  provider: WebhookProvider;
  providerEventId: string;
  messageId: string | null;
  payloadJson: string | null;
  status: WebhookEventStatus;
  error: string | null;
  processedAt: string | null;
}

export type OutboxChannel = "whatsapp";

export type OutboxStatus = "pending" | "sending" | "sent" | "failed" | "dead";

/** `$id` = sha256(workspaceId:idempotencyKey). */
export interface MessageOutbox extends TenantScoped {
  contactId: string | null;
  conversationId: string | null;
  inboxMessageId: string | null;
  channel: OutboxChannel;
  payloadJson: string;
  idempotencyKey: string;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: string | null;
}

export type SyncType =
  | "message_status"
  | "contacts"
  | "campaigns"
  | "full_workspace";

export type SyncStatus = "running" | "success" | "failed";

export interface SyncRun {
  workspaceId: string | null;
  syncType: SyncType;
  cursorJson: string | null;
  status: SyncStatus;
  statsJson: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

// ── Agentic campaigns ───────────────────────────────────────────────────────

export type CampaignStatus =
  | "profiling"
  | "planning"
  | "generating"
  | "pending_approval"
  | "approved"
  | "executing"
  | "monitoring"
  | "optimizing"
  | "completed"
  | "rejected"
  | "scheduled";

export interface Campaign {
  workspaceId: string | null;
  name: string | null;
  brief: string;
  targetListId: string | null;
  templateId: string | null;
  scheduledAt: string | null;
  status: CampaignStatus;
  stateCheckpointJson: string | null;
  rejectionFeedback: string | null;
}

export interface CustomerProfile {
  workspaceId: string | null;
  customerId: string;
  email: string | null;
  fullName: string | null;
  whatsappNumber: string | null;
  age: number | null;
  gender: string | null;
  maritalStatus: string | null;
  familySize: number | null;
  dependentCount: number | null;
  kidsInHousehold: number | null;
  city: string | null;
  occupation: string | null;
  occupationType: string | null;
  monthlyIncome: number | null;
  creditScore: number | null;
  kycStatus: string | null;
  appInstalled: string | null;
  existingCustomer: string | null;
  socialMediaActive: string | null;
  rawDataJson: string | null;
  segmentTags: string[];
}

export interface Segment {
  workspaceId: string | null;
  campaignId: string;
  label: string;
  criteriaJson: string | null;
  customerIds: string[];
  sendTime: string | null;
  predictedOpenRate: number | null;
  predictedClickRate: number | null;
}

export interface Variant {
  workspaceId: string | null;
  segmentId: string;
  externalCampaignId: string | null;
  subject: string | null;
  body: string;
  hasEmoji: boolean;
  hasUrl: boolean;
  fontStylesJson: string | null;
  sentCount: number;
  openCount: number;
  clickCount: number;
}

export interface AgentLog {
  workspaceId: string | null;
  campaignId: string;
  agentName: string;
  step: number | null;
  inputPayloadJson: string | null;
  outputPayloadJson: string | null;
  llmReasoning: string | null;
}

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

export interface WhatsAppMessage {
  workspaceId: string | null;
  broadcastId: string;
  campaignId: string | null;
  customerId: string;
  waId: string | null;
  wamid: string | null;
  /** `"{broadcastId}:{customerId}"`. */
  tracker: string;
  status: WhatsAppMessageStatus;
  clicked: boolean;
  replied: boolean;
}

// ── Billing idempotency ─────────────────────────────────────────────────────

/** `$id` = Razorpay eventId. */
export interface BillingWebhookEvent {
  type: string | null;
  processedAt: string | null;
  payloadHash: string | null;
}

// ── Convenience "document" aliases (shape + Appwrite system fields) ──────────

export type WorkspaceDoc = Workspace & AppwriteDocument;
export type WorkspaceMemberDoc = WorkspaceMember & AppwriteDocument;
export type WorkspaceInviteDoc = WorkspaceInvite & AppwriteDocument;
export type SalesTeamDoc = SalesTeam & AppwriteDocument;
export type SalesTeamMemberDoc = SalesTeamMember & AppwriteDocument;
export type LeadAssignmentDoc = LeadAssignment & AppwriteDocument;
export type WhatsAppAccountDoc = WhatsAppAccount & AppwriteDocument;
export type ContactDoc = Contact & AppwriteDocument;
export type ContactListDoc = ContactList & AppwriteDocument;
export type ContactListMemberDoc = ContactListMember & AppwriteDocument;
export type TemplateDoc = Template & AppwriteDocument;
export type BotDoc = Bot & AppwriteDocument;
export type ConversationDoc = Conversation & AppwriteDocument;
export type InboxMessageDoc = InboxMessage & AppwriteDocument;
export type LeadDoc = Lead & AppwriteDocument;
export type AiTraceDoc = AiTrace & AppwriteDocument;
export type WebhookEventDoc = WebhookEvent & AppwriteDocument;
export type MessageOutboxDoc = MessageOutbox & AppwriteDocument;
export type SyncRunDoc = SyncRun & AppwriteDocument;
export type CampaignDoc = Campaign & AppwriteDocument;
export type CustomerProfileDoc = CustomerProfile & AppwriteDocument;
export type SegmentDoc = Segment & AppwriteDocument;
export type VariantDoc = Variant & AppwriteDocument;
export type AgentLogDoc = AgentLog & AppwriteDocument;
export type WhatsAppMessageDoc = WhatsAppMessage & AppwriteDocument;
export type BillingWebhookEventDoc = BillingWebhookEvent & AppwriteDocument;
