import "server-only";

/**
 * Lead reads (RBAC-scoped). Port of backend/api/leads.py `list_leads` +
 * `_name_maps` + `_serialize`, plus a kanban-grouping helper for the Leads board.
 *
 * Every read goes through `leadScopeQueries(ctx)` so the tenant filter + the
 * agent-sees-assigned rule are enforced at the query layer (defense-in-depth on
 * top of the admin key bypassing ACLs). UI never imports lib/appwrite directly.
 */

import { Query } from "node-appwrite";

import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { getRequestContext } from "@/lib/auth/context";
import { getPack } from "@/features/ai-graph/packs";

import { leadScopeQueries } from "./scope";

/** A lead enriched with assignee display names (the shape the board renders). */
export interface LeadView {
  id: string;
  name: string | null;
  phone: string | null;
  intent: string | null;
  details: string | null;
  source: string | null;
  status: string;
  conversationId: string | null;
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
  assignedToUserName: string | null;
  assignedToTeamName: string | null;
  needsHuman: boolean;
  createdAt: string;
}

export interface LeadFilters {
  /** "me" → assigned to caller; "unassigned" → no owner; undefined → all. */
  assigned?: "me" | "unassigned";
  teamId?: string;
  stage?: string;
}

/** Lightweight option used by assignment selects. */
export interface MemberOption {
  userId: string;
  name: string;
  role: string;
}
export interface TeamOption {
  id: string;
  name: string;
}

interface NameMaps {
  users: Record<string, string>;
  teams: Record<string, string>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Tenant-scoped display-name maps for assignees. Port of `_name_maps`:
 * userId → (fullName || email) from the `workspace_members` mirror, and
 * teamId → name from `sales_teams`.
 */
export async function getNameMaps(orgId: string): Promise<NameMaps> {
  const db = adminDatabases();
  const users: Record<string, string> = {};
  const teams: Record<string, string> = {};

  try {
    const members = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      [Query.equal("workspaceId", orgId), Query.limit(500)],
    );
    for (const m of members.documents) {
      const uid = str(m.userId);
      if (uid) {
        users[uid] =
          str((m as { fullName?: unknown }).fullName) ?? str(m.email) ?? uid;
      }
    }
  } catch {
    /* mirror may be empty / Appwrite unconfigured */
  }

  try {
    const t = await db.listDocuments(DATABASE_ID, COLLECTION.salesTeams, [
      Query.equal("workspaceId", orgId),
      Query.limit(500),
    ]);
    for (const row of t.documents) {
      const id = str(row.$id);
      const name = str(row.name);
      if (id && name) teams[id] = name;
    }
  } catch {
    /* no sales teams */
  }

  return { users, teams };
}

/** Member + team options for the owner-assignment select. */
export async function getAssignableMembers(
  orgId: string,
): Promise<{ members: MemberOption[]; teams: TeamOption[] }> {
  const db = adminDatabases();
  const members: MemberOption[] = [];
  const teams: TeamOption[] = [];

  try {
    const res = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      [
        Query.equal("workspaceId", orgId),
        Query.notEqual("status", "disabled"),
        Query.limit(500),
      ],
    );
    for (const m of res.documents) {
      const uid = str(m.userId);
      if (!uid) continue;
      members.push({
        userId: uid,
        name:
          str((m as { fullName?: unknown }).fullName) ?? str(m.email) ?? uid,
        role: str(m.role) ?? "org:agent",
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const res = await db.listDocuments(DATABASE_ID, COLLECTION.salesTeams, [
      Query.equal("workspaceId", orgId),
      Query.limit(500),
    ]);
    for (const t of res.documents) {
      const id = str(t.$id);
      const name = str(t.name);
      if (id && name) teams.push({ id, name });
    }
  } catch {
    /* ignore */
  }

  return { members, teams };
}

function toLeadView(doc: Record<string, unknown>, maps: NameMaps): LeadView {
  const assignedToUserId = str(doc.assignedToUserId);
  const assignedToTeamId = str(doc.assignedToTeamId);
  return {
    id: String(doc.$id),
    name: str(doc.name),
    phone: str(doc.phone),
    intent: str(doc.intent),
    details: str(doc.details),
    source: str(doc.source),
    status: str(doc.status) ?? "new",
    conversationId: str(doc.conversationId),
    assignedToUserId,
    assignedToTeamId,
    assignedToUserName: assignedToUserId
      ? (maps.users[assignedToUserId] ?? null)
      : null,
    assignedToTeamName: assignedToTeamId
      ? (maps.teams[assignedToTeamId] ?? null)
      : null,
    needsHuman: doc.needsHuman === true,
    createdAt: String(doc.$createdAt ?? ""),
  };
}

/**
 * List leads for the active workspace, RBAC-scoped, newest first. Mirrors the
 * `assigned` / `team_id` / `stage` query params of the FastAPI endpoint.
 */
export async function listLeads(
  filters: LeadFilters = {},
): Promise<LeadView[]> {
  const ctx = await getRequestContext();
  const queries = await leadScopeQueries(ctx);

  if (filters.assigned === "me") {
    queries.push(Query.equal("assignedToUserId", ctx.userId));
  } else if (filters.assigned === "unassigned") {
    queries.push(Query.isNull("assignedToUserId"));
    queries.push(Query.isNull("assignedToTeamId"));
  }
  if (filters.teamId) {
    queries.push(Query.equal("assignedToTeamId", filters.teamId));
  }
  if (filters.stage) {
    queries.push(Query.equal("status", filters.stage));
  }
  queries.push(Query.orderDesc("$createdAt"));
  queries.push(Query.limit(500));

  let documents: Record<string, unknown>[] = [];
  try {
    const res = await adminDatabases().listDocuments(
      DATABASE_ID,
      COLLECTION.leads,
      queries,
    );
    documents = res.documents;
  } catch {
    return [];
  }

  const maps = await getNameMaps(ctx.orgId);
  return documents.map((d) => toLeadView(d, maps));
}

/** The ordered pipeline stages for the workspace's vertical (kanban columns). */
export async function getPipelineStages(): Promise<{
  stages: string[];
  label: string;
}> {
  const ctx = await getRequestContext();
  const pack = getPack(ctx.vertical);
  return { stages: pack.pipeline_stages, label: pack.label };
}

export interface LeadsByStage {
  stages: string[];
  label: string;
  /** stage → leads in that column (order preserved from listLeads). */
  columns: Record<string, LeadView[]>;
  /** leads whose status isn't in the pack pipeline (rendered in their own column). */
  extraStages: string[];
  total: number;
}

/**
 * Leads grouped into kanban columns by pipeline stage. Any lead whose status is
 * not part of the vertical pipeline keeps its own trailing column (so a
 * pack/vertical change never hides a lead).
 */
export async function getLeadsByStage(
  filters: LeadFilters = {},
): Promise<LeadsByStage> {
  const [leads, pipeline] = await Promise.all([
    listLeads(filters),
    getPipelineStages(),
  ]);

  const columns: Record<string, LeadView[]> = {};
  for (const s of pipeline.stages) columns[s] = [];

  const extraStages: string[] = [];
  for (const lead of leads) {
    const stage = lead.status;
    if (!columns[stage]) {
      columns[stage] = [];
      if (!extraStages.includes(stage)) extraStages.push(stage);
    }
    columns[stage].push(lead);
  }

  return {
    stages: pipeline.stages,
    label: pipeline.label,
    columns,
    extraStages,
    total: leads.length,
  };
}
