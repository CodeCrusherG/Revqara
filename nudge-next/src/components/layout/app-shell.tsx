"use client";

/**
 * Authenticated app shell (client). Composes the collapsible sidebar, the
 * sticky topbar, and the scrollable content region, and provides the
 * permission + command-menu contexts to all descendants.
 *
 * Receives a serializable subset of the SHARED CONTRACT RequestContext from the
 * server `(app)/layout.tsx` — `perms` is passed as a string[] (a Set is not
 * serializable across the server→client boundary) and re-hydrated here.
 */

import * as React from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { CommandMenuProvider } from "@/components/layout/command-menu";
import { PermissionProvider } from "@/components/layout/role-gate";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export interface AppShellContext {
  userId: string;
  orgId: string;
  role: string;
  perms: string[];
  vertical: string;
  plan: string;
  status: "active" | "disabled";
  workspaceName?: string;
  /** Live sends-today count for the PlanUsageWidget (from usageSummary). */
  sendsToday?: number;
  /** Live effective-plan sends/day limit for the PlanUsageWidget. */
  sendsLimit?: number;
}

export interface AppShellProps {
  ctx: AppShellContext;
  /** Initial sidebar open state from the persisted cookie (read on the server). */
  defaultSidebarOpen?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  ctx,
  defaultSidebarOpen = true,
  children,
}: AppShellProps) {
  const perms = React.useMemo(() => new Set(ctx.perms), [ctx.perms]);

  return (
    <PermissionProvider perms={perms}>
      <CommandMenuProvider>
        <SidebarProvider defaultOpen={defaultSidebarOpen}>
          <AppSidebar
            perms={perms}
            plan={ctx.plan}
            workspaceName={ctx.workspaceName}
            sendsToday={ctx.sendsToday}
            sendsLimit={ctx.sendsLimit}
          />
          <SidebarInset>
            <TopBar />
            <main className="flex-1 overflow-y-auto custom-scrollbar">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </CommandMenuProvider>
    </PermissionProvider>
  );
}
