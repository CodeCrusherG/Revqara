"use server";

/**
 * Team management Server Actions (port of backend/api/team.py).
 *
 * Workspace == active Clerk Organization; members == Clerk org memberships.
 * Clerk is the authority for role/identity; the Appwrite `workspace_members`
 * collection is a mirror for tenant-side joins. Every mutation re-mirrors the
 * affected row so the two stay consistent (the membership webhook is the
 * eventual backstop).
 *
 * RBAC rules preserved verbatim from team.py:
 *   - All mutations require `org:team:manage`.
 *   - canManageRole(actor, target): may only touch members at/below own rank;
 *     only owners may manage the owner role.
 *   - Role changes additionally require canManageRole(actor, newRole).
 *   - Last-active-owner guard on demote / disable / remove.
 *   - Disabled members are kept (status flag in publicMetadata), not removed,
 *     and still appear in listMembers.
 */

import { clerkClient } from "@clerk/nextjs/server";
import { Query, AppwriteException } from "node-appwrite";

import { requirePermission } from "@/lib/auth/require";
import { getRequestContext, type AuthRole } from "@/lib/auth/context";
import { ForbiddenError } from "@/lib/auth/errors";
import { assertNotLastOwner } from "@/lib/auth/guards";
import { canManageRole } from "@/lib/auth/rbac";
import { adminDatabases } from "@/lib/appwrite/admin";
import { DATABASE_ID, COLLECTION } from "@/lib/appwrite/collections";
import { ROLES } from "@/types/roles";

const ROLE_SET = new Set<string>(ROLES);

export type MemberStatus = "active" | "disabled";

export interface TeamMember {
  userId: string;
  role: AuthRole;
  status: MemberStatus;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
}

function membershipStatus(meta: unknown): MemberStatus {
  const status = (meta as { status?: unknown } | null | undefined)?.status;
  return status === "disabled" ? "disabled" : "active";
}

function isOrgRole(role: string): role is AuthRole {
  return ROLE_SET.has(role);
}

/** Mirror a member's role+status into Appwrite `workspace_members`. */
async function mirrorMember(
  orgId: string,
  userId: string,
  fields: { role?: AuthRole; status?: MemberStatus; email?: string | null },
): Promise<void> {
  const db = adminDatabases();
  try {
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
      await db.updateDocument(
        DATABASE_ID,
        COLLECTION.workspaceMembers,
        doc.$id,
        fields,
      );
    } else {
      const { ID } = await import("node-appwrite");
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
  } catch (err) {
    // Mirroring is best-effort; Clerk remains the source of truth. Swallow
    // Appwrite-not-configured / transient errors so the Clerk mutation still
    // succeeds and the webhook reconciles the mirror.
    if (!(err instanceof AppwriteException)) throw err;
  }
}

async function removeMirror(orgId: string, userId: string): Promise<void> {
  const db = adminDatabases();
  try {
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
  } catch (err) {
    if (!(err instanceof AppwriteException)) throw err;
  }
}

/** Look up the Clerk membership of `userId` in `orgId`; null if not a member. */
async function findMembership(orgId: string, userId: string) {
  const client = await clerkClient();
  const PAGE = 100;
  let offset = 0;
  for (;;) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: PAGE,
      offset,
    });
    const hit = page.data.find((m) => m.publicUserData?.userId === userId);
    if (hit) return hit;
    offset += page.data.length;
    if (page.data.length < PAGE || offset >= page.totalCount) return null;
  }
}

/**
 * List every member of the active workspace (including disabled ones), oldest
 * first. Readable by any member (no extra permission), matching team.py.
 */
export async function listMembers(): Promise<TeamMember[]> {
  const ctx = await getRequestContext();
  const client = await clerkClient();

  const out: TeamMember[] = [];
  const PAGE = 100;
  let offset = 0;
  for (;;) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: ctx.orgId,
      limit: PAGE,
      offset,
    });
    for (const m of page.data) {
      const pud = m.publicUserData;
      const fullName =
        [pud?.firstName, pud?.lastName].filter(Boolean).join(" ") || null;
      out.push({
        userId: pud?.userId ?? "",
        role: isOrgRole(m.role) ? m.role : "org:viewer",
        status: membershipStatus(m.publicMetadata),
        email: pud?.identifier ?? null,
        fullName,
        createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
      });
    }
    offset += page.data.length;
    if (page.data.length < PAGE || offset >= page.totalCount) break;
  }

  // Oldest first (team.py orders by created_at asc).
  out.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  return out;
}

export interface InviteMemberInput {
  email: string;
  role?: string;
}

/**
 * Invite a member via a Clerk Organization Invitation. Requires
 * `org:team:manage` + canManageRole(actor, invitedRole). Ports create_invite.
 */
export async function inviteMember(
  input: InviteMemberInput,
): Promise<{ invitationId: string; email: string; role: AuthRole }> {
  const ctx = await requirePermission("org:team:manage");

  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new ForbiddenError("A valid email is required.");
  }
  const role = input.role ?? "org:agent";
  if (!isOrgRole(role)) {
    throw new ForbiddenError(`Role must be one of ${ROLES.join(", ")}.`);
  }
  if (!canManageRole(ctx.role, role)) {
    throw new ForbiddenError(
      "You can't invite a member at or above your own role.",
    );
  }

  const client = await clerkClient();
  const invitation =
    await client.organizations.createOrganizationInvitation({
      organizationId: ctx.orgId,
      emailAddress: email,
      role,
      inviterUserId: ctx.userId,
    });

  return { invitationId: invitation.id, email, role };
}

export interface ChangeMemberRoleInput {
  userId: string;
  role: string;
}

/**
 * Change a member's role. Requires `org:team:manage`,
 * canManageRole(actor, currentRole) AND canManageRole(actor, newRole), and
 * the last-owner guard when demoting an owner. Ports update_member (role).
 */
export async function changeMemberRole(
  input: ChangeMemberRoleInput,
): Promise<TeamMember> {
  const ctx = await requirePermission("org:team:manage");

  const newRole = input.role;
  if (!isOrgRole(newRole)) {
    throw new ForbiddenError(`Role must be one of ${ROLES.join(", ")}.`);
  }

  const membership = await findMembership(ctx.orgId, input.userId);
  if (!membership) {
    throw new ForbiddenError("Member not found.");
  }
  const currentRole: AuthRole = isOrgRole(membership.role)
    ? membership.role
    : "org:viewer";

  // May only manage members at/below own rank (and only owners touch owners).
  if (!canManageRole(ctx.role, currentRole)) {
    throw new ForbiddenError(
      "You can't manage a member at or above your own role.",
    );
  }
  // May only assign a role at/below own rank.
  if (!canManageRole(ctx.role, newRole)) {
    throw new ForbiddenError("You can't assign a role at or above your own.");
  }
  // Don't demote the last active owner.
  if (currentRole === "org:owner" && newRole !== "org:owner") {
    await assertNotLastOwner(
      ctx.orgId,
      input.userId,
      "A workspace must keep at least one owner.",
    );
  }

  const client = await clerkClient();
  const updated = await client.organizations.updateOrganizationMembership({
    organizationId: ctx.orgId,
    userId: input.userId,
    role: newRole,
  });

  const status = membershipStatus(updated.publicMetadata);
  await mirrorMember(ctx.orgId, input.userId, { role: newRole, status });

  const pud = updated.publicUserData;
  return {
    userId: input.userId,
    role: newRole,
    status,
    email: pud?.identifier ?? null,
    fullName:
      [pud?.firstName, pud?.lastName].filter(Boolean).join(" ") || null,
    createdAt: updated.createdAt
      ? new Date(updated.createdAt).toISOString()
      : null,
  };
}

export interface SetMemberStatusInput {
  userId: string;
  status: MemberStatus;
}

/**
 * Enable/disable a member (kept, not removed) via membership publicMetadata.
 * Requires `org:team:manage`, canManageRole(actor, targetRole), and the
 * last-active-owner guard when disabling an owner. Ports update_member (status).
 */
export async function setMemberStatus(
  input: SetMemberStatusInput,
): Promise<TeamMember> {
  const ctx = await requirePermission("org:team:manage");

  if (input.status !== "active" && input.status !== "disabled") {
    throw new ForbiddenError("Status must be 'active' or 'disabled'.");
  }

  const membership = await findMembership(ctx.orgId, input.userId);
  if (!membership) {
    throw new ForbiddenError("Member not found.");
  }
  const targetRole: AuthRole = isOrgRole(membership.role)
    ? membership.role
    : "org:viewer";

  if (!canManageRole(ctx.role, targetRole)) {
    throw new ForbiddenError(
      "You can't manage a member at or above your own role.",
    );
  }
  // Disabling the last active owner is forbidden.
  if (input.status === "disabled" && targetRole === "org:owner") {
    await assertNotLastOwner(
      ctx.orgId,
      input.userId,
      "A workspace must keep at least one active owner.",
    );
  }

  const client = await clerkClient();
  // Preserve any existing publicMetadata; just flip `status`.
  const nextMeta = {
    ...(membership.publicMetadata as Record<string, unknown>),
    status: input.status,
  };
  const updated =
    await client.organizations.updateOrganizationMembershipMetadata({
      organizationId: ctx.orgId,
      userId: input.userId,
      publicMetadata: nextMeta,
    });

  await mirrorMember(ctx.orgId, input.userId, { status: input.status });

  const pud = updated.publicUserData;
  return {
    userId: input.userId,
    role: targetRole,
    status: input.status,
    email: pud?.identifier ?? null,
    fullName:
      [pud?.firstName, pud?.lastName].filter(Boolean).join(" ") || null,
    createdAt: updated.createdAt
      ? new Date(updated.createdAt).toISOString()
      : null,
  };
}

export interface RemoveMemberInput {
  userId: string;
}

/**
 * Remove a member from the workspace. Requires `org:team:manage`,
 * canManageRole(actor, targetRole), and the last-owner guard. Ports
 * remove_member.
 */
export async function removeMember(
  input: RemoveMemberInput,
): Promise<{ ok: true }> {
  const ctx = await requirePermission("org:team:manage");

  const membership = await findMembership(ctx.orgId, input.userId);
  if (!membership) {
    throw new ForbiddenError("Member not found.");
  }
  const targetRole: AuthRole = isOrgRole(membership.role)
    ? membership.role
    : "org:viewer";

  if (!canManageRole(ctx.role, targetRole)) {
    throw new ForbiddenError(
      "You can't remove a member at or above your own role.",
    );
  }
  if (targetRole === "org:owner") {
    await assertNotLastOwner(
      ctx.orgId,
      input.userId,
      "A workspace must keep at least one owner.",
    );
  }

  const client = await clerkClient();
  await client.organizations.deleteOrganizationMembership({
    organizationId: ctx.orgId,
    userId: input.userId,
  });

  await removeMirror(ctx.orgId, input.userId);
  return { ok: true };
}
