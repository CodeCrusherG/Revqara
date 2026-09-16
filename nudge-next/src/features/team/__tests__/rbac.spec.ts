/**
 * Pure RBAC decision tests (no real Clerk, no Appwrite).
 *
 * Covers the logic Clerk can't express natively and that team.py encodes:
 *   - canManageRole matrix (rank comparison + owner-grant restriction)
 *   - hasPermission per role (verbatim ROLE_PERMISSIONS grants)
 *   - activeOwnerCount / assertNotLastOwner over a MOCKED membership list
 *
 * The guard functions call `clerkClient()`; we mock `@clerk/nextjs/server` so
 * the test exercises the pure counting/exclusion logic only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `lib/auth/guards.ts` starts with `import "server-only"`, which throws outside
// an RSC bundle. Stub it so the pure guard logic is testable under vitest.
vi.mock("server-only", () => ({}));

import {
  canManageRole,
  hasPermission,
  permissionsForRole,
  ROLE_RANK,
} from "@/lib/auth/rbac";
import type { Role } from "@/types/roles";

// ── Mock Clerk Backend API for the guard tests ───────────────────────────────
type MockMember = {
  role: Role;
  publicMetadata: { status?: string };
  publicUserData: { userId: string };
};

let MOCK_MEMBERS: MockMember[] = [];

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({
        limit = 100,
        offset = 0,
      }: {
        organizationId: string;
        limit?: number;
        offset?: number;
      }) => {
        const data = MOCK_MEMBERS.slice(offset, offset + limit);
        return { data, totalCount: MOCK_MEMBERS.length };
      },
    },
  }),
}));

// Imported after the mock is registered.
import { activeOwnerCount, assertNotLastOwner } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/auth/errors";

const OWNER: Role = "org:owner";
const ADMIN: Role = "org:admin";
const MANAGER: Role = "org:manager";
const AGENT: Role = "org:agent";
const VIEWER: Role = "org:viewer";

function member(
  userId: string,
  role: Role,
  status: "active" | "disabled" = "active",
): MockMember {
  return { role, publicMetadata: { status }, publicUserData: { userId } };
}

describe("ROLE_RANK", () => {
  it("orders owner > admin > manager > agent > viewer", () => {
    expect(ROLE_RANK[OWNER]).toBe(4);
    expect(ROLE_RANK[ADMIN]).toBe(3);
    expect(ROLE_RANK[MANAGER]).toBe(2);
    expect(ROLE_RANK[AGENT]).toBe(1);
    expect(ROLE_RANK[VIEWER]).toBe(0);
  });
});

describe("hasPermission per role", () => {
  it("owner has every permission (special-cased)", () => {
    for (const perm of permissionsForRole(ADMIN)) {
      expect(hasPermission(OWNER, perm)).toBe(true);
    }
    expect(hasPermission(OWNER, "org:billing:manage")).toBe(true);
    expect(hasPermission(OWNER, "org:workspace:delete")).toBe(true);
  });

  it("admin grants: team/campaigns/templates/settings/contacts/leads/reports", () => {
    expect(hasPermission(ADMIN, "org:team:manage")).toBe(true);
    expect(hasPermission(ADMIN, "org:campaigns:manage")).toBe(true);
    expect(hasPermission(ADMIN, "org:templates:manage")).toBe(true);
    expect(hasPermission(ADMIN, "org:settings:manage")).toBe(true);
    expect(hasPermission(ADMIN, "org:contacts:manage")).toBe(true);
    expect(hasPermission(ADMIN, "org:leads:view_all")).toBe(true);
    expect(hasPermission(ADMIN, "org:leads:assign")).toBe(true);
    expect(hasPermission(ADMIN, "org:reports:view")).toBe(true);
    // Admin is NOT owner: no billing / workspace edit/delete.
    expect(hasPermission(ADMIN, "org:billing:manage")).toBe(false);
    expect(hasPermission(ADMIN, "org:workspace:edit")).toBe(false);
    expect(hasPermission(ADMIN, "org:workspace:delete")).toBe(false);
  });

  it("manager grants: leads view_all/assign, reports, contacts — not team", () => {
    expect(hasPermission(MANAGER, "org:leads:view_all")).toBe(true);
    expect(hasPermission(MANAGER, "org:leads:assign")).toBe(true);
    expect(hasPermission(MANAGER, "org:reports:view")).toBe(true);
    expect(hasPermission(MANAGER, "org:contacts:manage")).toBe(true);
    expect(hasPermission(MANAGER, "org:team:manage")).toBe(false);
    expect(hasPermission(MANAGER, "org:campaigns:manage")).toBe(false);
  });

  it("agent has no granted permissions (assigned-only)", () => {
    expect(hasPermission(AGENT, "org:leads:view_all")).toBe(false);
    expect(hasPermission(AGENT, "org:reports:view")).toBe(false);
    expect(hasPermission(AGENT, "org:team:manage")).toBe(false);
    expect([...permissionsForRole(AGENT)]).toHaveLength(0);
  });

  it("viewer has reports only", () => {
    expect(hasPermission(VIEWER, "org:reports:view")).toBe(true);
    expect(hasPermission(VIEWER, "org:leads:view_all")).toBe(false);
    expect(hasPermission(VIEWER, "org:contacts:manage")).toBe(false);
    expect([...permissionsForRole(VIEWER)]).toEqual(["org:reports:view"]);
  });

  it("null/unknown role grants nothing", () => {
    expect(hasPermission(null, "org:reports:view")).toBe(false);
    expect(hasPermission(undefined, "org:reports:view")).toBe(false);
  });
});

describe("canManageRole matrix", () => {
  it("requires team.manage — agent/viewer/manager cannot manage anyone", () => {
    expect(canManageRole(AGENT, AGENT)).toBe(false);
    expect(canManageRole(VIEWER, VIEWER)).toBe(false);
    // Manager lacks team.manage entirely.
    expect(canManageRole(MANAGER, AGENT)).toBe(false);
    expect(canManageRole(MANAGER, VIEWER)).toBe(false);
  });

  it("can manage members at or below own rank (verbatim ROLE_RANK >=)", () => {
    // team.py uses `actor_rank >= target_rank`, so EQUAL rank is allowed:
    // an admin may manage another admin (e.g. demote a peer).
    expect(canManageRole(ADMIN, ADMIN)).toBe(true);
    // ...but never an owner (rank above + owner-grant restriction).
    expect(canManageRole(ADMIN, OWNER)).toBe(false);
    // And freely manage strictly-below roles.
    expect(canManageRole(ADMIN, MANAGER)).toBe(true);
    expect(canManageRole(ADMIN, AGENT)).toBe(true);
    expect(canManageRole(ADMIN, VIEWER)).toBe(true);
  });

  it("only owners may grant or manage the owner role", () => {
    expect(canManageRole(ADMIN, OWNER)).toBe(false);
    expect(canManageRole(OWNER, OWNER)).toBe(true);
  });

  it("owner can manage every role (incl. another owner)", () => {
    expect(canManageRole(OWNER, ADMIN)).toBe(true);
    expect(canManageRole(OWNER, MANAGER)).toBe(true);
    expect(canManageRole(OWNER, AGENT)).toBe(true);
    expect(canManageRole(OWNER, VIEWER)).toBe(true);
    expect(canManageRole(OWNER, OWNER)).toBe(true);
  });

  it("null actor/target are handled safely", () => {
    // No actor role ⇒ no team.manage ⇒ false.
    expect(canManageRole(null, AGENT)).toBe(false);
    // Verbatim port: a null target gets sentinel rank 99, so even an owner
    // cannot "manage" an unknown role (actorRank 4 >= 99 is false).
    expect(canManageRole(OWNER, null)).toBe(false);
  });
});

describe("activeOwnerCount / assertNotLastOwner (mocked membership list)", () => {
  beforeEach(() => {
    MOCK_MEMBERS = [];
  });

  it("counts only active owners", async () => {
    MOCK_MEMBERS = [
      member("u1", OWNER, "active"),
      member("u2", OWNER, "disabled"),
      member("u3", ADMIN, "active"),
      member("u4", OWNER, "active"),
    ];
    expect(await activeOwnerCount("org_1")).toBe(2);
  });

  it("excludes the target user from the count", async () => {
    MOCK_MEMBERS = [member("u1", OWNER, "active"), member("u2", ADMIN)];
    expect(
      await activeOwnerCount("org_1", { excludeUserId: "u1" }),
    ).toBe(0);
  });

  it("assertNotLastOwner throws when removing the only active owner", async () => {
    MOCK_MEMBERS = [member("u1", OWNER, "active"), member("u2", AGENT)];
    await expect(assertNotLastOwner("org_1", "u1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("assertNotLastOwner passes when another active owner remains", async () => {
    MOCK_MEMBERS = [
      member("u1", OWNER, "active"),
      member("u2", OWNER, "active"),
    ];
    await expect(assertNotLastOwner("org_1", "u1")).resolves.toBeUndefined();
  });

  it("a disabled co-owner does NOT save the last active owner", async () => {
    MOCK_MEMBERS = [
      member("u1", OWNER, "active"),
      member("u2", OWNER, "disabled"),
    ];
    await expect(assertNotLastOwner("org_1", "u1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
