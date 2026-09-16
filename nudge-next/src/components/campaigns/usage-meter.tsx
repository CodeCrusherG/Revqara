"use client";

/**
 * UsageMeter — Brief-home usage panel. Shows the active plan's contact / list
 * usage as hand-rolled progress bars (no shadcn progress primitive installed)
 * plus the plan's daily send cap. CSS-var driven, with a destructive accent
 * above 90% (parity with the PlanUsageWidget styling).
 */

import Link from "next/link";
import { Gauge, Users, Layers, Zap } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface UsageMeterProps {
  planName: string;
  contactCount: number;
  maxContacts: number;
  maxSends: number;
  listCount: number;
  maxLists: number;
}

function Bar({
  icon,
  label,
  used,
  limit,
}: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const danger = pct >= 90;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </span>
        <span className="tabular-nums">
          {used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            danger ? "bg-destructive" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeter({
  planName,
  contactCount,
  maxContacts,
  maxSends,
  listCount,
  maxLists,
}: UsageMeterProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Usage
          </CardTitle>
          <CardDescription>Live against your plan limits.</CardDescription>
        </div>
        <Badge variant="secondary">{planName}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Bar
          icon={<Users className="h-3.5 w-3.5" />}
          label="Contacts"
          used={contactCount}
          limit={maxContacts}
        />
        <Bar
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Lists"
          used={listCount}
          limit={maxLists}
        />
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-primary" />
            Sends / day
          </span>
          <span className="tabular-nums font-medium">
            {maxSends.toLocaleString("en-IN")}
          </span>
        </div>
        <Button variant="outline" size="sm" className="w-full" asChild>
          <Link href="/billing">Manage plan</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
