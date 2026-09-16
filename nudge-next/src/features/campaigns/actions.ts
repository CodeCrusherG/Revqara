"use server";

/**
 * Campaign mutations (port of backend/api/{campaigns,approval}.py).
 *
 * All mutations require `org:campaigns:manage` (owner/admin grant it; manager/
 * agent/viewer do not) and are tenant-scoped via `withTenant` / ownership
 * assertions.
 *
 * `generateCampaign` runs the deterministic-by-default pipeline (src/
 * features/campaigns/pipeline.ts) INLINE inside the server action up to the HITL
 * pause — there is no always-on worker. It:
 *   1. validates audience (target list non-empty, or any contacts) + template,
 *   2. creates the campaign row (scheduled when future-dated, else profiling),
 *   3. loads tenant customer_profiles (falls back to contacts),
 *   4. runs profiler → planner → creative → pending_approval,
 *   5. persists segments + variants + agent_logs + stateCheckpointJson.
 *
 * `approveCampaign` runs the post-execution analyst → optimizer loop on the
 * persisted segments/variants (deterministic; no live WhatsApp send here — the
 * outbox-worker owns real sends) and flips the status to completed. A future
 * `campaign-scheduler` Appwrite Function would launch `scheduled` campaigns and
 * dispatch real sends; not required for the demo.
 *
 * `rejectCampaign` records feedback and re-plans (re-enters the pipeline with the
 * feedback injected into the brief), parity with reject_handler → planner.
 */

import { revalidatePath } from "next/cache";
import { Query, AppwriteException, type Models } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { GatedError, ForbiddenError } from "@/lib/auth/errors";
import { adminDatabases, ID } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { withTenant, assertOwned } from "@/lib/appwrite/tenant";
import { GRAPH_VERSION } from "@/features/ai-graph/graph";
import { normalizeLanguageCode } from "@/lib/india-languages";
import {
  analyzeMetrics,
  optimizeStrategy,
  pipelineModelLabel,
  runPipelineToApproval,
  type PipelineProfile,
  type SegmentMetricsInput,
  type StageLog,
} from "./pipeline";
import type {
  CampaignStatus,
  GenerateCampaignInput,
  GenerateCampaignResult,
} from "./types";

const PERM = "org:campaigns:manage" as const;

type Doc = Models.Document & Record<string, unknown>;

// ── small helpers ────────────────────────────────────────────────────────────

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

function jsonAttr(value: unknown): string {
  return JSON.stringify(value ?? null);
}

// ── profile loading (customer_profiles, fallback contacts) ───────────────────

function profileFromCustomerProfile(doc: Doc): PipelineProfile {
  return {
    customerId: (doc.customerId as string) ?? doc.$id,
    fullName: (doc.fullName as string) ?? null,
    email: (doc.email as string) ?? null,
    age: safeNum(doc.age),
    gender: (doc.gender as string) ?? null,
    city: (doc.city as string) ?? null,
    monthlyIncome: safeNum(doc.monthlyIncome),
    creditScore: safeNum(doc.creditScore),
    kycStatus: (doc.kycStatus as string) ?? null,
    appInstalled: (doc.appInstalled as string) ?? null,
    existingCustomer: (doc.existingCustomer as string) ?? null,
    socialMediaActive: (doc.socialMediaActive as string) ?? null,
    occupationType: (doc.occupationType as string) ?? null,
    maritalStatus: (doc.maritalStatus as string) ?? null,
    familySize: safeNum(doc.familySize),
  };
}

function profileFromContact(doc: Doc): PipelineProfile {
  return {
    customerId: doc.$id,
    fullName: (doc.fullName as string) ?? null,
    email: (doc.email as string) ?? null,
    age: safeNum(doc.age),
    gender: (doc.gender as string) ?? null,
    city: (doc.city as string) ?? null,
    monthlyIncome: safeNum(doc.monthlyIncome),
    creditScore: safeNum(doc.creditScore),
    kycStatus: (doc.kycStatus as string) ?? null,
    appInstalled: (doc.appInstalled as string) ?? null,
    existingCustomer: (doc.existingCustomer as string) ?? null,
    socialMediaActive: (doc.socialMediaActive as string) ?? null,
    occupationType: (doc.occupationType as string) ?? null,
    maritalStatus: null,
    familySize: null,
  };
}

/**
 * Load the cohort the pipeline profiles. Prefers materialised customer_profiles
 * (parity with the Profiler's persisted rows); falls back to the workspace's
 * contacts, optionally scoped to a target list's members.
 */
async function loadProfiles(
  orgId: string,
  targetListId: string | null,
): Promise<PipelineProfile[]> {
  const db = adminDatabases();

  const cp = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.customerProfiles,
    withTenant(orgId, [Query.orderDesc("$createdAt"), Query.limit(1000)]),
  );
  if (cp.total > 0) {
    return (cp.documents as Doc[]).map(profileFromCustomerProfile);
  }

  // Fallback: contacts (optionally a target list's members).
  let contactIds: string[] | null = null;
  if (targetListId) {
    const members = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.contactListMembers,
      withTenant(orgId, [Query.equal("listId", targetListId), Query.limit(1000)]),
    );
    contactIds = (members.documents as Doc[])
      .map((m) => (m.contactId as string) ?? null)
      .filter((id): id is string => !!id);
    if (contactIds.length === 0) return [];
  }

  const queries = [Query.orderDesc("$createdAt"), Query.limit(1000)];
  if (contactIds) queries.unshift(Query.equal("$id", contactIds.slice(0, 100)));
  const contacts = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.contacts,
    withTenant(orgId, queries),
  );
  return (contacts.documents as Doc[]).map(profileFromContact);
}

// ── persistence of pipeline output ───────────────────────────────────────────

/** Delete a campaign's existing segments + their variants (idempotent re-plan). */
async function clearSegmentsAndVariants(
  orgId: string,
  campaignId: string,
): Promise<void> {
  const db = adminDatabases();
  const segs = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.segments,
    withTenant(orgId, [Query.equal("campaignId", campaignId), Query.limit(100)]),
  );
  for (const seg of segs.documents) {
    const vars = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.variants,
      withTenant(orgId, [Query.equal("segmentId", seg.$id), Query.limit(100)]),
    );
    for (const v of vars.documents) {
      await db.deleteDocument(DATABASE_ID, COLLECTION.variants, v.$id);
    }
    await db.deleteDocument(DATABASE_ID, COLLECTION.segments, seg.$id);
  }
}

/** Append agent_logs rows for the run (tenant-scoped). */
async function writeAgentLogs(
  orgId: string,
  campaignId: string,
  logs: StageLog[],
): Promise<void> {
  const db = adminDatabases();
  for (const log of logs) {
    await db.createDocument(DATABASE_ID, COLLECTION.agentLogs, ID.unique(), {
      workspaceId: orgId,
      campaignId,
      agentName: log.agentName,
      step: log.step,
      inputPayloadJson: jsonAttr(log.inputPayload),
      outputPayloadJson: jsonAttr(log.outputPayload),
      llmReasoning: log.llmReasoning,
    });
  }
}

async function setStatus(
  campaignId: string,
  status: CampaignStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const db = adminDatabases();
  await db.updateDocument(DATABASE_ID, COLLECTION.campaigns, campaignId, {
    status,
    ...patch,
  });
}

/**
 * Run the pipeline to the HITL pause and persist segments + variants + logs +
 * checkpoint. Shared by generate + reject(re-plan). Flips status profiling →
 * pending_approval. One variant per segment (index-aligned), parity with the port.
 */
async function runAndPersist(args: {
  orgId: string;
  campaignId: string;
  brief: string;
  rejectionFeedback: string | null;
  targetListId: string | null;
  targetLanguage?: string | null;
}): Promise<void> {
  const { orgId, campaignId, brief, rejectionFeedback, targetListId } = args;
  const db = adminDatabases();
  const targetLanguage = normalizeLanguageCode(args.targetLanguage);

  await setStatus(campaignId, "profiling");
  const profiles = await loadProfiles(orgId, targetListId);

  const out = await runPipelineToApproval({
    profiles,
    brief,
    rejectionFeedback,
    targetLanguage,
  });

  await clearSegmentsAndVariants(orgId, campaignId);

  for (let i = 0; i < out.segments.length; i++) {
    const seg = out.segments[i];
    const variant = out.variants[i];
    const segDoc = await db.createDocument(
      DATABASE_ID,
      COLLECTION.segments,
      ID.unique(),
      {
        workspaceId: orgId,
        campaignId,
        label: seg.label,
        criteriaJson: jsonAttr(seg.criteria),
        customerIds: seg.customerIds.slice(0, 5000),
        sendTime: seg.sendTime,
        predictedOpenRate: seg.predictedOpenRate,
        predictedClickRate: seg.predictedClickRate,
      },
    );
    if (variant) {
      await db.createDocument(DATABASE_ID, COLLECTION.variants, ID.unique(), {
        workspaceId: orgId,
        segmentId: segDoc.$id,
        externalCampaignId: null,
        subject: variant.subject,
        body: variant.body,
        hasEmoji: variant.hasEmoji,
        hasUrl: variant.hasUrl,
        fontStylesJson: jsonAttr(variant.fontStyles),
        sentCount: 0,
        openCount: 0,
        clickCount: 0,
      });
    }
  }

  await writeAgentLogs(orgId, campaignId, out.logs);

  const checkpoint = {
    brief,
    iteration: 1,
    next_strategy: "",
    optimization_history: [] as unknown[],
    llm_used: out.llmUsed,
    graph_version: GRAPH_VERSION,
    model_used: pipelineModelLabel(),
    target_language: targetLanguage,
  };
  await setStatus(campaignId, "pending_approval", {
    stateCheckpointJson: jsonAttr(checkpoint),
  });
}

// ── generateCampaign ─────────────────────────────────────────────────────────

/**
 * Kick off a new campaign from a natural-language brief (parity with
 * POST /campaigns/generate). Validates the audience + template, creates the
 * campaign, and runs the pipeline inline to pending_approval. Future-dated
 * campaigns are left in `scheduled` (a campaign-scheduler fn would run them).
 */
export async function generateCampaign(
  input: GenerateCampaignInput,
): Promise<GenerateCampaignResult> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();

  const brief = (input.brief ?? "").trim();
  const targetLanguage = normalizeLanguageCode(input.targetLanguage);
  if (!brief) {
    throw new ForbiddenError("A campaign brief is required.");
  }

  // Audience validation (port of generate_campaign).
  if (input.targetListId) {
    const list = await db
      .getDocument(DATABASE_ID, COLLECTION.contactLists, input.targetListId)
      .catch(() => null);
    assertOwned(ctx.orgId, list as (Doc & { workspaceId?: string }) | null);
    const members = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.contactListMembers,
      withTenant(ctx.orgId, [
        Query.equal("listId", input.targetListId),
        Query.limit(1),
      ]),
    );
    if (members.total === 0) {
      throw new GatedError("The selected list has no contacts.");
    }
  } else {
    const anyContact = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.contacts,
      withTenant(ctx.orgId, [Query.limit(1)]),
    );
    if (anyContact.total === 0) {
      throw new GatedError(
        "Add some contacts (or import a CSV) before launching a campaign.",
      );
    }
  }

  // Optional approved template.
  if (input.templateId) {
    const tmpl = (await db
      .getDocument(DATABASE_ID, COLLECTION.templates, input.templateId)
      .catch(() => null)) as (Doc & { workspaceId?: string; status?: string }) | null;
    assertOwned(ctx.orgId, tmpl);
    if (tmpl?.status !== "approved") {
      throw new GatedError(
        "Template must be approved before it can be sent.",
      );
    }
  }

  // Optional scheduling — a future datetime defers to the scheduler.
  let scheduledAt: string | null = null;
  let isFuture = false;
  if (input.scheduledAt) {
    const ts = Date.parse(input.scheduledAt);
    if (Number.isNaN(ts)) {
      throw new ForbiddenError("scheduledAt must be an ISO 8601 datetime.");
    }
    scheduledAt = new Date(ts).toISOString();
    isFuture = ts > Date.now();
  }

  const campaign = await db.createDocument(
    DATABASE_ID,
    COLLECTION.campaigns,
    ID.unique(),
    {
      workspaceId: ctx.orgId,
      name: input.name ?? null,
      brief,
      targetListId: input.targetListId ?? null,
      templateId: input.templateId ?? null,
      scheduledAt,
      status: isFuture ? "scheduled" : "profiling",
      stateCheckpointJson: isFuture
        ? jsonAttr({
            brief,
            target_language: targetLanguage,
            graph_version: GRAPH_VERSION,
            model_used: pipelineModelLabel(),
          })
        : null,
      rejectionFeedback: null,
    },
  );

  if (!isFuture) {
    await runAndPersist({
      orgId: ctx.orgId,
      campaignId: campaign.$id,
      brief,
      rejectionFeedback: null,
      targetListId: input.targetListId ?? null,
      targetLanguage,
    });
  }

  revalidatePath("/");
  const finalStatus: CampaignStatus = isFuture ? "scheduled" : "pending_approval";
  return { campaignId: campaign.$id, status: finalStatus };
}

// ── approveCampaign ──────────────────────────────────────────────────────────

/** Owned campaign doc or throw (404). */
async function ownedCampaign(orgId: string, campaignId: string): Promise<Doc> {
  const db = adminDatabases();
  const doc = await db.getDocument(DATABASE_ID, COLLECTION.campaigns, campaignId);
  return assertOwned(orgId, doc as Doc & { workspaceId?: string });
}

/**
 * Approve a pending_approval campaign (parity with POST /approve). Runs the
 * deterministic analyst → optimizer pass over the persisted segments/variants
 * and flips status to completed. Real WhatsApp sends are NOT performed here;
 * the outbox-worker fn owns sends (and the send-cap), keeping the action sync.
 */
export async function approveCampaign(
  campaignId: string,
): Promise<{ campaignId: string; status: CampaignStatus }> {
  const ctx = await requirePermission(PERM);
  const db = adminDatabases();
  const campaign = await ownedCampaign(ctx.orgId, campaignId);

  if (campaign.status !== "pending_approval") {
    throw new GatedError(
      `Campaign is in '${campaign.status as string}' state — cannot approve.`,
    );
  }

  await setStatus(campaignId, "approved");

  // Analyst input: cached per-variant counts grouped by segment.
  const segs = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.segments,
    withTenant(ctx.orgId, [Query.equal("campaignId", campaignId), Query.limit(100)]),
  );
  const metricsInput: SegmentMetricsInput[] = [];
  for (const seg of segs.documents as Doc[]) {
    const vars = await db.listDocuments(
      DATABASE_ID,
      COLLECTION.variants,
      withTenant(ctx.orgId, [Query.equal("segmentId", seg.$id), Query.limit(100)]),
    );
    metricsInput.push({
      segmentId: seg.$id,
      segmentLabel: (seg.label as string) ?? "",
      variants: (vars.documents as Doc[]).map((v) => ({
        variantId: v.$id,
        totalSent: (v.sentCount as number) ?? 0,
        openCount: (v.openCount as number) ?? 0,
        clickCount: (v.clickCount as number) ?? 0,
      })),
    });
  }

  const checkpoint = parseCheckpoint(campaign.stateCheckpointJson);
  const iteration = typeof checkpoint.iteration === "number" ? checkpoint.iteration : 1;

  await setStatus(campaignId, "monitoring");
  const { analysis, log: analystLog } = analyzeMetrics(metricsInput);
  await setStatus(campaignId, "optimizing");
  const { nextStrategy, log: optLog } = optimizeStrategy(analysis, iteration);

  await writeAgentLogs(ctx.orgId, campaignId, [analystLog, optLog]);

  const nextCheckpoint = {
    ...checkpoint,
    iteration: iteration + 1,
    next_strategy: nextStrategy,
    optimization_history: [
      ...(Array.isArray(checkpoint.optimization_history)
        ? checkpoint.optimization_history
        : []),
      { iteration, next_strategy: nextStrategy },
    ],
  };
  await setStatus(campaignId, "completed", {
    stateCheckpointJson: jsonAttr(nextCheckpoint),
  });

  revalidatePath(`/campaigns/${campaignId}/dashboard`);
  revalidatePath(`/campaigns/${campaignId}/approval`);
  revalidatePath("/");
  return { campaignId, status: "completed" };
}

function parseCheckpoint(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// ── rejectCampaign ───────────────────────────────────────────────────────────

/**
 * Reject a pending_approval campaign with optional feedback (parity with
 * POST /reject → reject_handler → planner). Records the feedback and re-plans
 * by re-running the pipeline with the feedback injected, back to pending_approval.
 */
export async function rejectCampaign(
  campaignId: string,
  feedback?: string | null,
): Promise<{ campaignId: string; status: CampaignStatus }> {
  const ctx = await requirePermission(PERM);
  const campaign = await ownedCampaign(ctx.orgId, campaignId);

  if (campaign.status !== "pending_approval") {
    throw new GatedError(
      `Campaign is in '${campaign.status as string}' state — cannot reject.`,
    );
  }

  const fb = (feedback ?? "").trim() || null;
  await setStatus(campaignId, "rejected", { rejectionFeedback: fb });

  // Re-plan: inject feedback into the brief and re-run to a fresh draft.
  const brief = (campaign.brief as string) ?? "";
  const checkpoint = parseCheckpoint(campaign.stateCheckpointJson);
  await runAndPersist({
    orgId: ctx.orgId,
    campaignId,
    brief,
    rejectionFeedback: fb,
    targetListId: (campaign.targetListId as string) ?? null,
    targetLanguage:
      typeof checkpoint.target_language === "string"
        ? checkpoint.target_language
        : null,
  });

  revalidatePath(`/campaigns/${campaignId}/approval`);
  revalidatePath("/");
  return { campaignId, status: "pending_approval" };
}

// Surface AppwriteException for callers that need to special-case races.
export { AppwriteException };
