"use client";

/**
 * Plan usage meter — presentational client leaf.
 *
 * Renders the live sends/day progress bar. The server `(app)/layout.tsx` fetches
 * `usageSummary(ctx)` (lib/billing/entitlements) once per request and passes the
 * `sendsToday` count + the effective-plan `sendsLimit` down through the shell —
 * so this component does NO data fetching (build-safe; the layout is
 * force-dynamic). `destructive` styling kicks in at >=90%. If live props are
 * absent (e.g. usage read failed) it falls back to the static plan limit + 0.
 */

import * as React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { planDef } from "@/lib/billing/plans";

export interface PlanUsageWidgetProps {
  plan: string;
  /** Live sends-today count from usageSummary (defaults to 0 if unavailable). */
  sendsToday?: number;
  /** Live effective-plan sends/day limit (defaults to the static plan limit). */
  sendsLimit?: number;
}

export function PlanUsageWidget({
  plan,
  sendsToday = 0,
  sendsLimit,
}: PlanUsageWidgetProps) {
  const def = planDef(plan);
  const limit = sendsLimit ?? def.maxSends;
  const used = Math.max(0, sendsToday);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const danger = pct >= 90;

  return (
    <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 text-sidebar-foreground">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Zap className="size-3.5 text-primary" />
          Sends today
        </span>
        <span className="tabular-nums text-muted-foreground">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-sidebar-border"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <Link
        href="/billing"
        className="mt-2 inline-block text-[11px] text-muted-foreground hover:text-foreground"
      >
        <span className="capitalize">{def.name}</span> plan · Manage
      </Link>
    </div>
  );
}
