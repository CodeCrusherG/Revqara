import "server-only";

/**
 * Campaign reads (tenant-scoped) over the agentic-campaign collections:
 * campaigns / segments / variants / customer_profiles / agent_logs /
 * whatsapp_messages.
 *
 * Ground truth: backend/api/{campaigns,approval,analytics}.py
 * (_serialize_campaign / _serialize_campaign_status_summary / analytics funnel).
 *
 * Every list goes through `withTenant` so the admin client (which bypasses
 * Appwrite ACLs) can never read across tenants; reads-by-id assert ownership.
 *
 * Reads require only an active workspace membership (viewers included) — the
 * Brief home, approval, and dashboard pages are visible to any member;
 * mutations (generate/approve/reject) live in actions.ts and are gated by
 * `org:campaigns:manage`.
 */

import { Query, type Models } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";
import type {
  AgentLogView,
  CampaignAnalytics,
  CampaignDetail,
  CampaignStatus,
  CampaignSummary,
  SegmentView,
  VariantMetric,
  VariantView,
} from "./types";

type Doc = Models.Document & Record<string, unknown>;

// Indicative WhatsApp marketing rate per delivered message (INR), parity with
// campaigns.py MARKETING_RATE_INR. Non-secret default; env-overridable.
const MARKETING_RATE_INR = Number(process.env.WA_MARKETING_RATE_INR ?? "0.78");

const CAMPAIGN_STATUSES: ReadonlySet<string> = new Set<CampaignStatus>([
  "profiling",
  "planning",
  "generating",
  "pending_approval",
  "approved",
  "executing",
  "monitoring",
  "optimizing",
  "completed",
  "rejected",
  "scheduled",
]);

function asStatus(raw: unknown): CampaignStatus {
  return CAMPAIGN_STATUSES.has(raw as string)
    ? (raw as CampaignStatus)
    : "profiling";
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function asArray(raw: unknown): string[] {
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function asNum(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapVariant(doc: Doc): VariantView {
  return {
    id: doc.$id,
    segmentId: (doc.segmentId as string) ?? "",
    externalCampaignId: (doc.externalCampaignId as string) ?? null,
    subject: (doc.subject as string) ?? null,
    body: (doc.body as string) ?? "",
    hasEmoji: doc.hasEmoji === true,
    hasUrl: doc.hasUrl === true,
    fontStyles: parseJson<Record<string, unknown> | null>(doc.fontStylesJson, null),
    sentCount: (doc.sentCount as number) ?? 0,
    openCount: (doc.openCount as number) ?? 0,
    clickCount: (doc.clickCount as number) ?? 0,
  };
}

function mapSegment(doc: Doc, variants: VariantView[]): SegmentView {
  return {
    id: doc.$id,
    campaignId: (doc.campaignId as string) ?? "",
    label: (doc.label as string) ?? "Unnamed",
    criteria: parseJson<Record<string, unknown>>(doc.criteriaJson, {}),
    customerIds: asArray(doc.customerIds),
    sendTime: (doc.sendTime as string) ?? null,
    predictedOpenRate: asNum(doc.predictedOpenRate),
    predictedClickRate: asNum(doc.predictedClickRate),
    variants,
  };
}

function mapAgentLog(doc: Doc): AgentLogView {
  return {
    id: doc.$id,
    agentName: (doc.agentName as string) ?? "",
    step: asNum(doc.step),
    inputPayload: parseJson<unknown>(doc.inputPayloadJson, null),
    outputPayload: parseJson<unknown>(doc.outputPayloadJson, null),
    llmReasoning: (doc.llmReasoning as string) ?? null,
    createdAt: doc.$createdAt,
  };
}

function summaryFrom(doc: Doc, segmentCount: number, variantCount: number): CampaignSummary {
  const status = asStatus(doc.status);
  return {
    id: doc.$id,
    name: (doc.name as string) ?? null,
    status,
    brief: (doc.brief as string) ?? "",
    createdAt: doc.$createdAt,
    rejectionFeedback: (doc.rejectionFeedback as string) ?? null,
    segmentCount,
    variantCount,
    hasPendingReview: status === "pending_approval",
  };
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Fetch all tenant-scoped segments for a campaign. */
async function segmentDocsFor(orgId: string, campaignId: string): Promise<Doc[]> {
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.segments,
    withTenant(orgId, [
      Query.equal("campaignId", campaignId),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ]),
  );
  return res.documents as Doc[];
}

/** Fetch all tenant-scoped variants for the given segment ids (one query). */
async function variantDocsFor(orgId: string, segmentIds: string[]): Promise<Doc[]> {
  if (segmentIds.length === 0) return [];
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.variants,
    withTenant(orgId, [
      Query.equal("segmentId", segmentIds),
      Query.orderAsc("$createdAt"),
      Query.limit(500),
    ]),
  );
  return res.documents as Doc[];
}

/** Get a single owned campaign doc or throw (404 via assertOwned). */
async function ownedCampaignDoc(orgId: string, campaignId: string): Promise<Doc> {
  const db = adminDatabases();
  const doc = await db.getDocument(DATABASE_ID, COLLECTION.campaigns, campaignId);
  return assertOwned(orgId, doc as Doc & { workspaceId?: string });
}

// ── Public reads ─────────────────────────────────────────────────────────────

/** Recent campaigns for the active workspace (Brief-home list + CampaignList). */
export async function listCampaigns(limit = 50): Promise<CampaignSummary[]> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.campaigns,
    withTenant(ctx.orgId, [
      Query.orderDesc("$createdAt"),
      Query.limit(Math.min(Math.max(limit, 1), 100)),
    ]),
  );

  // Per-campaign segment/variant counts (bounded by the page size).
  return Promise.all(
    (res.documents as Doc[]).map(async (doc) => {
      const segDocs = await segmentDocsFor(ctx.orgId, doc.$id);
      const segIds = segDocs.map((s) => s.$id);
      const varDocs = await variantDocsFor(ctx.orgId, segIds);
      return summaryFrom(doc, segDocs.length, varDocs.length);
    }),
  );
}

/** Lightweight status summary for frequent polling (status-summary parity). */
export async function getCampaignStatus(
  campaignId: string,
): Promise<CampaignSummary> {
  const ctx = await getRequestContext();
  const doc = await ownedCampaignDoc(ctx.orgId, campaignId);
  const segDocs = await segmentDocsFor(ctx.orgId, campaignId);
  const varDocs = await variantDocsFor(
    ctx.orgId,
    segDocs.map((s) => s.$id),
  );
  return summaryFrom(doc, segDocs.length, varDocs.length);
}

/** Full campaign detail (approval + dashboard) — parity with _serialize_campaign. */
export async function getCampaignDetail(
  campaignId: string,
): Promise<CampaignDetail> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  const doc = await ownedCampaignDoc(ctx.orgId, campaignId);

  const segDocs = await segmentDocsFor(ctx.orgId, campaignId);
  const segIds = segDocs.map((s) => s.$id);
  const varDocs = await variantDocsFor(ctx.orgId, segIds);

  const variantsBySegment = new Map<string, VariantView[]>();
  for (const v of varDocs) {
    const view = mapVariant(v);
    const list = variantsBySegment.get(view.segmentId) ?? [];
    list.push(view);
    variantsBySegment.set(view.segmentId, list);
  }

  const segments: SegmentView[] = segDocs.map((s) =>
    mapSegment(s, variantsBySegment.get(s.$id) ?? []),
  );

  const logsRes = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.agentLogs,
    withTenant(ctx.orgId, [
      Query.equal("campaignId", campaignId),
      Query.orderAsc("$createdAt"),
      Query.limit(100),
    ]),
  );
  const agentLogs: AgentLogView[] = (logsRes.documents as Doc[]).map(mapAgentLog);

  return {
    id: doc.$id,
    name: (doc.name as string) ?? null,
    status: asStatus(doc.status),
    brief: (doc.brief as string) ?? "",
    createdAt: doc.$createdAt,
    scheduledAt: (doc.scheduledAt as string) ?? null,
    rejectionFeedback: (doc.rejectionFeedback as string) ?? null,
    segments,
    agentLogs,
  };
}

/**
 * Cached per-variant metrics for the dashboard chart (parity with
 * /campaigns/{id}/metrics, served from DB — no live API quota concept here).
 */
export async function getCampaignMetrics(
  campaignId: string,
): Promise<VariantMetric[]> {
  const ctx = await getRequestContext();
  await ownedCampaignDoc(ctx.orgId, campaignId);

  const segDocs = await segmentDocsFor(ctx.orgId, campaignId);
  const labelById = new Map(segDocs.map((s) => [s.$id, (s.label as string) ?? ""]));
  const varDocs = await variantDocsFor(
    ctx.orgId,
    segDocs.map((s) => s.$id),
  );

  const metrics: VariantMetric[] = [];
  for (const v of varDocs) {
    const externalCampaignId = (v.externalCampaignId as string) ?? null;
    if (!externalCampaignId) continue;
    const total = (v.sentCount as number) ?? 0;
    const open = (v.openCount as number) ?? 0;
    const click = (v.clickCount as number) ?? 0;
    const openRate = total ? round2((open / total) * 100) : 0;
    const clickRate = total ? round2((click / total) * 100) : 0;
    metrics.push({
      variantId: v.$id,
      externalCampaignId,
      segmentLabel: labelById.get((v.segmentId as string) ?? "") ?? "",
      totalSent: total,
      openCount: open,
      clickCount: click,
      openRate,
      clickRate,
      weightedScore: total
        ? round2(clickRate * 0.7 + openRate * 0.3)
        : 0,
    });
  }
  return metrics;
}

/**
 * Campaign funnel analytics (parity with /campaigns/{id}/analytics). Reads the
 * tenant's whatsapp_messages for this campaign + opt-out / lead overlays.
 */
export async function getCampaignAnalytics(
  campaignId: string,
): Promise<CampaignAnalytics> {
  const ctx = await getRequestContext();
  const db = adminDatabases();
  await ownedCampaignDoc(ctx.orgId, campaignId);

  const res = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.whatsappMessages,
    withTenant(ctx.orgId, [
      Query.equal("campaignId", campaignId),
      Query.limit(5000),
    ]),
  );
  const msgs = res.documents as Doc[];

  const recipients = msgs.length;
  const delivered = msgs.filter(
    (m) => m.status === "delivered" || m.status === "read",
  ).length;
  const read = msgs.filter((m) => m.status === "read").length;
  const failed = msgs.filter((m) => m.status === "failed").length;
  const clicked = msgs.filter((m) => m.clicked === true).length;
  const replies = msgs.filter((m) => m.replied === true).length;

  const waIds = Array.from(
    new Set(
      msgs
        .map((m) => (m.waId as string) ?? null)
        .filter((id): id is string => !!id),
    ),
  );

  let unsubscribes = 0;
  let leads = 0;
  if (waIds.length > 0) {
    // Appwrite Query.equal accepts up to 100 values; chunk to be safe.
    for (const chunk of chunkArray(waIds, 100)) {
      const optOut = await db.listDocuments(
        DATABASE_ID,
        COLLECTION.contacts,
        withTenant(ctx.orgId, [
          Query.equal("whatsappNumber", chunk),
          Query.equal("optInStatus", "opted_out"),
          Query.limit(1),
        ]),
      );
      unsubscribes += optOut.total;

      const leadRes = await db.listDocuments(
        DATABASE_ID,
        COLLECTION.leads,
        withTenant(ctx.orgId, [Query.equal("phone", chunk), Query.limit(1)]),
      );
      leads += leadRes.total;
    }
  }

  return {
    recipients,
    sent: recipients,
    delivered,
    read,
    failed,
    clicked,
    replies,
    replyRate: delivered ? round1((replies / delivered) * 100) : 0,
    readRate: delivered ? round1((read / delivered) * 100) : 0,
    unsubscribes,
    leads,
    estimatedCostInr: round2(delivered * MARKETING_RATE_INR),
    currency: "INR",
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Re-export for actions.ts (tenant query helper) without leaking the appwrite
// layer to UI imports.
export { mapVariant, mapSegment };
