/**
 * Typed Appwrite collection id constants + the database id.
 *
 * Pure constants (no secrets, no SDK) — safe to import from server code,
 * Appwrite Functions, and client Realtime channel builders alike. The values
 * are the collection `$id`s the provisioner (appwrite/migrate.ts) creates.
 */

export const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "crm";

export const COLLECTION = {
  // Identity & tenancy
  workspaces: "workspaces",
  workspaceMembers: "workspace_members",
  workspaceInvites: "workspace_invites",
  // Sales routing
  salesTeams: "sales_teams",
  salesTeamMembers: "sales_team_members",
  leadAssignments: "lead_assignments",
  // Channel & CRM core
  whatsappAccounts: "whatsapp_accounts",
  contacts: "contacts",
  contactLists: "contact_lists",
  contactListMembers: "contact_list_members",
  templates: "templates",
  bots: "bots",
  conversations: "conversations",
  inboxMessages: "inbox_messages",
  leads: "leads",
  // AI audit, idempotency, outbox, sync
  aiTraces: "ai_traces",
  webhookEvents: "webhook_events",
  messageOutbox: "message_outbox",
  syncRuns: "sync_runs",
  // Agentic campaigns
  campaigns: "campaigns",
  customerProfiles: "customer_profiles",
  segments: "segments",
  variants: "variants",
  agentLogs: "agent_logs",
  whatsappMessages: "whatsapp_messages",
  // Billing idempotency
  billingWebhookEvents: "billing_webhook_events",
} as const;

export type CollectionKey = keyof typeof COLLECTION;
export type CollectionId = (typeof COLLECTION)[CollectionKey];

/** All collection ids (provisioning / iteration). */
export const COLLECTION_IDS: readonly CollectionId[] =
  Object.values(COLLECTION);
