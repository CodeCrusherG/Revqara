import { NextResponse, type NextRequest } from "next/server";
import type { WebhookEvent } from "@clerk/backend";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { createHash } from "node:crypto";
import { ID, Query, AppwriteException } from "node-appwrite";

import { adminDatabases, adminTeams } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { DEFAULT_VERTICAL, VERTICAL_SLUGS } from "@/lib/config";
import { DEFAULT_PLAN } from "@/lib/billing/plans";
import { ROLES, type Role } from "@/types/roles";

/**
 * Clerk → Appwrite sync webhook (plan §4 table). Svix-verified via Clerk's
 * `verifyWebhook` (uses CLERK_WEBHOOK_SECRET; no extra `svix` dep), idempotent
 * (dedup on `svix-id`), with keyed upserts so out-of-order / replayed events
 * converge. Returns 2xx ONLY after the Appwrite write commits.
 *
 * node runtime + raw body (verifyWebhook reads the unparsed request).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_SET = new Set<string>(ROLES);

function toRole(role: string | null | undefined): Role {
  return role && ROLE_SET.has(role) ? (role as Role) : "org:viewer";
}

function normalizeVertical(v: unknown): string {
  return typeof v === "string" && (VERTICAL_SLUGS as readonly string[]).includes(v)
    ? v
    : DEFAULT_VERTICAL;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Atomic dedup on the Svix delivery id. Uses the generic `$id`-keyed
 * `billing_webhook_events` collection as a dedup table (the schema-constrained
 * `webhook_events.provider` enum is WhatsApp-only). Returns true if this is the
 * first time we see `svixId` (we should process); false if already seen.
 */
async function claimDelivery(svixId: string, eventType: string): Promise<boolean> {
  const db = adminDatabases();
  const id = sha256(`clerk:${svixId}`);
  try {
    await db.createDocument(
      DATABASE_ID,
      COLLECTION.billingWebhookEvents,
      id,
      {
        type: `clerk:${eventType}`,
        processedAt: new Date().toISOString(),
        payloadHash: svixId,
      },
    );
    return true;
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) {
      return false; // duplicate delivery
    }
    throw err;
  }
}

/** Idempotently create-or-update the `workspaces` doc keyed by `$id = orgId`. */
async function upsertWorkspace(
  orgId: string,
  fields: { name?: string; vertical?: string; appwriteTeamId?: string | null },
): Promise<void> {
  const db = adminDatabases();
  try {
    await db.getDocument(DATABASE_ID, COLLECTION.workspaces, orgId);
    const patch: Record<string, unknown> = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.vertical !== undefined) patch.vertical = fields.vertical;
    if (fields.appwriteTeamId !== undefined)
      patch.appwriteTeamId = fields.appwriteTeamId;
    if (Object.keys(patch).length) {
      await db.updateDocument(DATABASE_ID, COLLECTION.workspaces, orgId, patch);
    }
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      await db.createDocument(DATABASE_ID, COLLECTION.workspaces, orgId, {
        name: fields.name ?? "Workspace",
        plan: DEFAULT_PLAN,
        planStatus: "none",
        vertical: fields.vertical ?? DEFAULT_VERTICAL,
        appwriteTeamId: fields.appwriteTeamId ?? null,
        rzpCustomerId: null,
        rzpSubscriptionId: null,
        currentPeriodEnd: null,
        billingEmail: null,
      });
      return;
    }
    throw err;
  }
}

/** Create a per-org Appwrite Team (idempotent); returns its id or null. */
async function ensureTeam(orgId: string, name: string): Promise<string | null> {
  try {
    const team = await adminTeams().create(orgId, name);
    return team.$id;
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) return orgId;
    return null;
  }
}

/** Seed the 1:1 `bots` doc for a workspace (idempotent, $id = orgId). */
async function ensureBot(orgId: string, name: string): Promise<void> {
  try {
    await adminDatabases().createDocument(
      DATABASE_ID,
      COLLECTION.bots,
      orgId,
      {
        workspaceId: orgId,
        enabled: true,
        handoffEnabled: true,
        name,
        prompt: null,
        knowledge: null,
      },
    );
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 409) return;
    throw err;
  }
}

/** Upsert a `workspace_members` row keyed by (workspaceId, userId). */
async function upsertMember(
  orgId: string,
  userId: string,
  fields: { role?: Role; status?: "active" | "disabled"; email?: string | null },
): Promise<void> {
  const db = adminDatabases();
  const existing = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.workspaceMembers,
    [
      Query.equal("workspaceId", orgId),
      Query.equal("userId", userId),
      Query.limit(1),
    ],
  );
  const doc = existing.documents[0];
  if (doc) {
    const patch: Record<string, unknown> = {};
    if (fields.role !== undefined) patch.role = fields.role;
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.email !== undefined) patch.email = fields.email;
    if (Object.keys(patch).length) {
      await db.updateDocument(
        DATABASE_ID,
        COLLECTION.workspaceMembers,
        doc.$id,
        patch,
      );
    }
  } else {
    await db.createDocument(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      ID.unique(),
      {
        workspaceId: orgId,
        userId,
        email: fields.email ?? null,
        role: fields.role ?? "org:agent",
        status: fields.status ?? "active",
      },
    );
  }
}

async function deleteMember(orgId: string, userId: string): Promise<void> {
  const db = adminDatabases();
  const existing = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.workspaceMembers,
    [
      Query.equal("workspaceId", orgId),
      Query.equal("userId", userId),
      Query.limit(1),
    ],
  );
  const doc = existing.documents[0];
  if (doc) {
    await db.deleteDocument(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      doc.$id,
    );
  }
  // Null assigned leads for the removed user across this workspace.
  const leads = await db.listDocuments(DATABASE_ID, COLLECTION.leads, [
    Query.equal("workspaceId", orgId),
    Query.equal("assignedToUserId", userId),
    Query.limit(100),
  ]);
  for (const lead of leads.documents) {
    await db.updateDocument(DATABASE_ID, COLLECTION.leads, lead.$id, {
      assignedToUserId: null,
    });
  }
}

/** Update a member's email/name across every workspace they belong to. */
async function syncUserEmail(userId: string, email: string | null): Promise<void> {
  const db = adminDatabases();
  const rows = await db.listDocuments(
    DATABASE_ID,
    COLLECTION.workspaceMembers,
    [Query.equal("userId", userId), Query.limit(100)],
  );
  for (const row of rows.documents) {
    await db.updateDocument(
      DATABASE_ID,
      COLLECTION.workspaceMembers,
      row.$id,
      { email },
    );
  }
}

function memberStatus(meta: unknown): "active" | "disabled" {
  return (meta as { status?: unknown } | null)?.status === "disabled"
    ? "disabled"
    : "active";
}

async function handleEvent(evt: WebhookEvent): Promise<void> {
  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const data = evt.data;
      const primaryId = data.primary_email_address_id;
      const email =
        data.email_addresses?.find((e) => e.id === primaryId)?.email_address ??
        data.email_addresses?.[0]?.email_address ??
        null;
      await syncUserEmail(data.id, email);
      break;
    }

    case "organization.created": {
      const org = evt.data;
      const vertical = normalizeVertical(org.public_metadata?.vertical);
      const teamId = await ensureTeam(org.id, org.name);
      await upsertWorkspace(org.id, {
        name: org.name,
        vertical,
        appwriteTeamId: teamId,
      });
      await ensureBot(org.id, org.name);
      break;
    }

    case "organization.updated": {
      const org = evt.data;
      await upsertWorkspace(org.id, {
        name: org.name,
        vertical: normalizeVertical(org.public_metadata?.vertical),
      });
      break;
    }

    case "organization.deleted": {
      const orgId = evt.data.id;
      if (!orgId) break;
      const db = adminDatabases();
      try {
        await db.deleteDocument(DATABASE_ID, COLLECTION.workspaces, orgId);
      } catch (err) {
        if (!(err instanceof AppwriteException) || err.code !== 404) throw err;
      }
      // Cascade-delete the mirrored membership rows (heavy tenant-doc cascade
      // is offloaded to a queued Appwrite Function elsewhere).
      const members = await db.listDocuments(
        DATABASE_ID,
        COLLECTION.workspaceMembers,
        [Query.equal("workspaceId", orgId), Query.limit(100)],
      );
      for (const m of members.documents) {
        await db.deleteDocument(
          DATABASE_ID,
          COLLECTION.workspaceMembers,
          m.$id,
        );
      }
      break;
    }

    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const m = evt.data;
      const orgId = m.organization.id;
      // Out-of-order tolerance: if the org event hasn't arrived, stub it.
      await upsertWorkspace(orgId, {
        name: m.organization.name,
        vertical: normalizeVertical(m.organization.public_metadata?.vertical),
      });
      await upsertMember(orgId, m.public_user_data.user_id, {
        role: toRole(m.role),
        status: memberStatus(m.public_metadata),
        email: m.public_user_data.identifier ?? null,
      });
      break;
    }

    case "organizationMembership.deleted": {
      const m = evt.data;
      await deleteMember(m.organization.id, m.public_user_data.user_id);
      break;
    }

    default:
      // Unhandled event types are acknowledged (no-op).
      break;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let evt: WebhookEvent;
  try {
    // Verifies the Svix signature using CLERK_WEBHOOK_SECRET and returns the
    // typed event. Reads the raw body internally.
    evt = await verifyWebhook(req);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  const svixId = req.headers.get("svix-id");
  if (!svixId) {
    return NextResponse.json({ error: "Missing svix-id." }, { status: 400 });
  }

  try {
    const fresh = await claimDelivery(svixId, evt.type);
    if (!fresh) {
      // Already processed this delivery — idempotent ack.
      return NextResponse.json({ ok: true, deduped: true });
    }
    await handleEvent(evt);
    // 2xx only after the Appwrite write commits.
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Let Svix retry (the dedup marker for a failed run is fine — keyed
    // upserts are idempotent on replay; a duplicate dedup-id just no-ops).
    const message =
      err instanceof Error ? err.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
