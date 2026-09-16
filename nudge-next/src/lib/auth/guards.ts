import "server-only";

/**
 * Last-owner guard (plan §4 rule 2 / port of `_active_owner_count` in team.py).
 *
 * A workspace must always retain at least one ACTIVE owner. Before demoting,
 * disabling, or removing an owner, callers run `assertNotLastOwner(...)`, which
 * counts active owners via the Clerk Backend API — excluding the member being
 * mutated — and throws {@link ForbiddenError} if that count would hit zero.
 *
 * "Active owner" = membership `role === "org:owner"` AND
 * `publicMetadata.status` is not `"disabled"` (absent/`"active"` ⇒ active),
 * mirroring how disabled members are kept (not removed) with a status flag.
 */

import { clerkClient } from "@clerk/nextjs/server";

import { ForbiddenError } from "@/lib/auth/errors";

const PAGE_SIZE = 100;

function isActiveStatus(meta: unknown): boolean {
  const status = (meta as { status?: unknown } | null | undefined)?.status;
  return status !== "disabled";
}

/**
 * Count active owners of `orgId`, optionally excluding one member by `userId`
 * (the member about to be demoted/disabled/removed). Paginates the full
 * membership list. Counts `role === "org:owner" && status !== "disabled"`.
 */
export async function activeOwnerCount(
  orgId: string,
  opts: { excludeUserId?: string } = {},
): Promise<number> {
  const client = await clerkClient();
  let offset = 0;
  let count = 0;

  // Paginate until we've seen every membership.
  // `totalCount` is returned alongside `data` on each page.
  for (;;) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: PAGE_SIZE,
      offset,
    });

    for (const m of page.data) {
      const memberUserId = m.publicUserData?.userId;
      if (opts.excludeUserId && memberUserId === opts.excludeUserId) {
        continue;
      }
      if (m.role === "org:owner" && isActiveStatus(m.publicMetadata)) {
        count += 1;
      }
    }

    offset += page.data.length;
    if (page.data.length < PAGE_SIZE || offset >= page.totalCount) {
      break;
    }
  }

  return count;
}

/**
 * Throw {@link ForbiddenError} if mutating `targetUserId` (a current owner)
 * would leave the workspace with zero active owners. No-op when the target is
 * not the last active owner. `targetUserId` is excluded from the count because
 * the mutation in progress removes it from the active-owner set.
 */
export async function assertNotLastOwner(
  orgId: string,
  targetUserId: string,
  message = "A workspace must keep at least one active owner.",
): Promise<void> {
  const remaining = await activeOwnerCount(orgId, {
    excludeUserId: targetUserId,
  });
  if (remaining === 0) {
    throw new ForbiddenError(message);
  }
}
