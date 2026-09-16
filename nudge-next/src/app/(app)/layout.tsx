import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";

import { AppShell } from "@/components/layout/app-shell";
import { ClerkThemeProvider } from "@/components/providers/clerk-theme-provider";
import { getRequestContext } from "@/lib/auth/context";
import { usageSummary } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";

/**
 * Authenticated app shell.
 *
 * BUILD-SAFETY: forced dynamic so the (app) route group is never statically
 * prerendered — it depends on Clerk `auth()` + per-request workspace data, so
 * the build stays green WITHOUT real Clerk keys.
 *
 * Gating order (middleware is the primary gate; this is defense-in-depth):
 *   1. no user                 → /sign-in
 *   2. no active org           → render children WITHOUT the shell. The only
 *      (app) route that reaches here without an org is /onboarding itself —
 *      middleware redirects every other no-org request to /onboarding before
 *      this layout runs — so onboarding renders chrome-less (it has no
 *      workspace to drive the sidebar). It wraps its own ClerkProvider chrome.
 *   3. disabled member         → getRequestContext() throws 403 → root error.tsx
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // No active workspace → this is the onboarding first-run. Render the page
  // bare (inside the themed Clerk provider) so it can create the first org.
  if (!orgId) {
    return <ClerkThemeProvider>{children}</ClerkThemeProvider>;
  }

  // SHARED CONTRACT: throws 401 (no user/org) / 403 (disabled member).
  const ctx = await getRequestContext();

  const sidebarCookie = cookies().get("sidebar:state")?.value;
  const defaultSidebarOpen = sidebarCookie !== "false";

  // Live sends-today usage for the sidebar PlanUsageWidget. Tolerant: if the
  // usage read fails (e.g. Appwrite not configured), omit the live props and the
  // widget falls back to the static plan limit + 0. Never blocks rendering.
  let sendsToday: number | undefined;
  let sendsLimit: number | undefined;
  try {
    const usage = await usageSummary(ctx);
    sendsToday = usage.sendsToday.used;
    sendsLimit = usage.sendsToday.limit;
  } catch (err) {
    logger.child({ mod: "app-layout" }).warn("usageSummary failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return (
    <ClerkThemeProvider>
      <AppShell
        ctx={{
          userId: ctx.userId,
          orgId: ctx.orgId,
          role: ctx.role,
          perms: Array.from(ctx.perms),
          vertical: ctx.vertical,
          plan: ctx.plan,
          status: ctx.status,
          sendsToday,
          sendsLimit,
        }}
        defaultSidebarOpen={defaultSidebarOpen}
      >
        {children}
      </AppShell>
    </ClerkThemeProvider>
  );
}
