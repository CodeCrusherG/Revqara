"use client";

/**
 * RoleGate — conditionally renders children based on the active member's
 * permissions. Permissions come from the SHARED CONTRACT RequestContext
 * (`ctx.perms`), passed down into a client provider by the AppShell so leaf
 * client components can gate UI without re-fetching auth.
 *
 * Usage:
 *   // anywhere under <PermissionProvider perms={ctx.perms}> (the AppShell):
 *   <RoleGate perm="org:team:manage"><InviteButton /></RoleGate>
 *
 *   // or with explicit perms (server components / outside the shell):
 *   <RoleGate perm="org:team:manage" perms={ctx.perms}>…</RoleGate>
 *
 * When the permission is absent it renders `fallback` (default: null).
 */

import * as React from "react";

import type { Permission } from "@/lib/auth/rbac";

const PermissionContext = React.createContext<ReadonlySet<string>>(new Set());

export function PermissionProvider({
  perms,
  children,
}: {
  perms: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  // Re-create the Set reference only when its contents change (stable identity
  // for an array of perms passed from a server component on each render).
  const permsKey = Array.from(perms).sort().join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = React.useMemo(() => new Set(perms), [permsKey]);
  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

/** Read the active member's permission set from context. */
export function usePermissions(): ReadonlySet<string> {
  return React.useContext(PermissionContext);
}

/** True if the active member holds `perm` (context-based). */
export function useHasPermission(perm: Permission | string): boolean {
  return usePermissions().has(perm);
}

export interface RoleGateProps {
  perm: Permission | string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Explicit perms override the context (for server-rendered call-sites). */
  perms?: ReadonlySet<string>;
}

export function RoleGate({ perm, children, fallback = null, perms }: RoleGateProps) {
  const ctxPerms = usePermissions();
  const effective = perms ?? ctxPerms;
  return <>{effective.has(perm) ? children : fallback}</>;
}
