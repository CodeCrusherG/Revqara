/**
 * Schema registry — all 24 domain collections + billing_webhook_events.
 * The provisioner (appwrite/migrate.ts) iterates `ALL_COLLECTIONS` in order.
 */

import type { CollectionDefinition } from "./_types";

import { workspaces } from "./workspaces";
import { workspaceMembers } from "./workspaceMembers";
import { workspaceInvites } from "./workspaceInvites";
import { salesTeams } from "./salesTeams";
import { salesTeamMembers } from "./salesTeamMembers";
import { leadAssignments } from "./leadAssignments";
import { whatsappAccounts } from "./whatsappAccounts";
import { contacts } from "./contacts";
import { contactLists } from "./contactLists";
import { contactListMembers } from "./contactListMembers";
import { templates } from "./templates";
import { bots } from "./bots";
import { conversations } from "./conversations";
import { inboxMessages } from "./inboxMessages";
import { leads } from "./leads";
import { aiTraces } from "./aiTraces";
import { webhookEvents } from "./webhookEvents";
import { messageOutbox } from "./messageOutbox";
import { syncRuns } from "./syncRuns";
import { campaigns } from "./campaigns";
import { customerProfiles } from "./customerProfiles";
import { segments } from "./segments";
import { variants } from "./variants";
import { agentLogs } from "./agentLogs";
import { whatsappMessages } from "./whatsappMessages";
import { billingWebhookEvents } from "./billingWebhookEvents";

export type { CollectionDefinition };

export const ALL_COLLECTIONS: CollectionDefinition[] = [
  // Identity & tenancy
  workspaces,
  workspaceMembers,
  workspaceInvites,
  // Sales routing
  salesTeams,
  salesTeamMembers,
  leadAssignments,
  // Channel & CRM core
  whatsappAccounts,
  contacts,
  contactLists,
  contactListMembers,
  templates,
  bots,
  conversations,
  inboxMessages,
  leads,
  // AI audit, idempotency, outbox, sync
  aiTraces,
  webhookEvents,
  messageOutbox,
  syncRuns,
  // Agentic campaigns
  campaigns,
  customerProfiles,
  segments,
  variants,
  agentLogs,
  whatsappMessages,
  // Billing idempotency
  billingWebhookEvents,
];

export {
  workspaces,
  workspaceMembers,
  workspaceInvites,
  salesTeams,
  salesTeamMembers,
  leadAssignments,
  whatsappAccounts,
  contacts,
  contactLists,
  contactListMembers,
  templates,
  bots,
  conversations,
  inboxMessages,
  leads,
  aiTraces,
  webhookEvents,
  messageOutbox,
  syncRuns,
  campaigns,
  customerProfiles,
  segments,
  variants,
  agentLogs,
  whatsappMessages,
  billingWebhookEvents,
};
