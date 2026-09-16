"use server";

/**
 * Workspace lifecycle Server Actions (port of backend/api/workspaces.py).
 *
 * The Clerk Organization IS the workspace; `org.id === workspaceId`.
 *
 *   - createWorkspace  → `clerkClient.organizations.createOrganization`
 *                        (creator becomes `org:owner`), then mirror a
 *                        `workspaces` doc + seed a `bots` doc into Appwrite.
 *   - updateWorkspace  → rename / change vertical, gated by
 *                        requirePermission('org:workspace:edit').
 *   - switchWorkspace  → CLIENT-side via Clerk `setActive` (see note below);
 *                        no server action needed — Clerk verifies membership.
 *
 * Tenancy/role authority is Clerk; Appwrite is the mirror used for joins. The
 * `organization.created` webhook also upserts these docs, so the writes here
 * are get-or-create / idempotent (out-of-order tolerant).
 */

import { clerkClient } from "@clerk/nextjs/server";
import { AppwriteException } from "node-appwrite";

import { getRequestContext } from "@/lib/auth/context";
import { requirePermission } from "@/lib/auth/require";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { VERTICAL_SLUGS, DEFAULT_VERTICAL } from "@/lib/config";
import { DEFAULT_PLAN } from "@/lib/billing/plans";

function normalizeVertical(v: string | null | undefined): string {
  return v && (VERTICAL_SLUGS as readonly string[]).includes(v)
    ? v
    : DEFAULT_VERTICAL;
}

/**
 * Idempotently create-or-update a `workspaces` doc keyed by `$id = orgId`.
 * On 404 (not found) it creates; otherwise it patches the provided fields.
 */
async function upsertWorkspaceDoc(
  orgId: string,
  fields: { name?: string; vertical?: string },
): Promise<void> {
  const db = adminDatabases();
  try {
    await db.getDocument(DATABASE_ID, COLLECTION.workspaces, orgId);
    await db.updateDocument(DATABASE_ID, COLLECTION.workspaces, orgId, fields);
  } catch (err) {
    if (err instanceof AppwriteException && err.code === 404) {
      await db.createDocument(DATABASE_ID, COLLECTION.workspaces, orgId, {
        name: fields.name ?? "Workspace",
        plan: DEFAULT_PLAN,
        planStatus: "none",
        vertical: fields.vertical ?? DEFAULT_VERTICAL,
        appwriteTeamId: null,
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

/** Seed the 1:1 `bots` doc for a new workspace if it doesn't exist. */
async function ensureBotDoc(orgId: string, name: string): Promise<void> {
  const db = adminDatabases();
  try {
    await db.createDocument(DATABASE_ID, COLLECTION.bots, orgId, {
      workspaceId: orgId,
      enabled: true,
      handoffEnabled: true,
      name,
      prompt: null,
      knowledge: null,
    });
  } catch (err) {
    // 409 ⇒ already seeded (webhook raced us). Anything else propagates.
    if (err instanceof AppwriteException && err.code === 409) return;
    throw err;
  }
}

export interface CreateWorkspaceInput {
  name: string;
  vertical?: string;
}

export interface WorkspaceResult {
  id: string;
  name: string;
  vertical: string;
  role: "org:owner";
}

/**
 * Create a new workspace. The current user becomes its owner (Clerk
 * `createdBy`), then the Appwrite `workspaces` + `bots` docs are mirrored.
 */
export async function createWorkspace(
  input: CreateWorkspaceInput,
): Promise<WorkspaceResult> {
  // Any authenticated user may create a workspace (they become its owner).
  const { userId } = await getRequestContext().catch(async () => {
    // No active org yet is fine for creation; fall back to raw auth.
    const { auth } = await import("@clerk/nextjs/server");
    const a = await auth();
    if (!a.userId) {
      const { UnauthorizedError } = await import("@/lib/auth/errors");
      throw new UnauthorizedError("You must be signed in.");
    }
    return { userId: a.userId } as { userId: string };
  });

  const name = (input.name ?? "").trim();
  if (!name) {
    const { ForbiddenError } = await import("@/lib/auth/errors");
    throw new ForbiddenError("Workspace name is required.");
  }
  const vertical = normalizeVertical(input.vertical);

  const client = await clerkClient();
  const org = await client.organizations.createOrganization({
    name,
    createdBy: userId,
    publicMetadata: { vertical, plan: DEFAULT_PLAN },
  });

  // Mirror into Appwrite (idempotent; webhook may also fire).
  await upsertWorkspaceDoc(org.id, { name, vertical });
  await ensureBotDoc(org.id, name);

  return { id: org.id, name, vertical, role: "org:owner" };
}

export interface UpdateWorkspaceInput {
  name?: string;
  vertical?: string;
}

/**
 * Rename / change the vertical of the active workspace. Requires
 * `org:workspace:edit` (owner-only per ROLE_PERMISSIONS).
 */
export async function updateWorkspace(
  input: UpdateWorkspaceInput,
): Promise<WorkspaceResult> {
  const ctx = await requirePermission("org:workspace:edit");

  const patch: { name?: string; vertical?: string } = {};
  let nextName: string | undefined;
  let nextVertical: string | undefined;

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) {
      const { ForbiddenError } = await import("@/lib/auth/errors");
      throw new ForbiddenError("Workspace name cannot be empty.");
    }
    patch.name = name;
    nextName = name;
  }
  if (input.vertical !== undefined) {
    if (!(VERTICAL_SLUGS as readonly string[]).includes(input.vertical)) {
      const { ForbiddenError } = await import("@/lib/auth/errors");
      throw new ForbiddenError(
        `Unknown vertical. Choose one of: ${VERTICAL_SLUGS.join(", ")}`,
      );
    }
    patch.vertical = input.vertical;
    nextVertical = input.vertical;
  }

  const client = await clerkClient();
  // Keep Clerk org name + publicMetadata.vertical authoritative.
  await client.organizations.updateOrganization(ctx.orgId, {
    ...(nextName ? { name: nextName } : {}),
    ...(nextVertical
      ? { publicMetadata: { vertical: nextVertical } }
      : {}),
  });

  await upsertWorkspaceDoc(ctx.orgId, patch);

  return {
    id: ctx.orgId,
    name: nextName ?? "",
    vertical: nextVertical ?? ctx.vertical,
    role: "org:owner",
  };
}

/**
 * Switching the active workspace is a CLIENT-side operation — there is no
 * server action. In a client component, call Clerk's `setActive`:
 *
 * ```tsx
 * "use client";
 * import { useClerk } from "@clerk/nextjs";
 * const { setActive } = useClerk();
 * await setActive({ organization: orgId }); // Clerk verifies membership
 * ```
 *
 * This replaces the old `POST /workspaces/{id}/switch`. Clerk server-verifies
 * that the user is a member of `orgId`, so the old "403 if not a member" guard
 * is automatic. Prefer the `<OrganizationSwitcher />` component in the AppShell.
 *
 * Documentation only — intentionally not a server action. (A "use server"
 * module may only export async functions, so this note is a module-local const
 * rather than an export.)
 */
const SWITCH_WORKSPACE_NOTE =
  "Switch workspaces client-side via Clerk setActive({ organization }) or <OrganizationSwitcher />.";
void SWITCH_WORKSPACE_NOTE;
