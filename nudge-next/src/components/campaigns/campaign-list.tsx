"use client";

/**
 * CampaignList — recent campaigns with status, brief preview, and a deep link to
 * approval (pending review) or dashboard (executed). Ported from
 * frontend/src/components/CampaignList.jsx. Pure presentational; data comes from
 * features/campaigns/queries.listCampaigns.
 */

import Link from "next/link";
import { ArrowRight, Layers, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cn } from "@/lib/utils";
import type { CampaignStatus, CampaignSummary } from "@/features/campaigns/types";

export interface CampaignListProps {
  campaigns: CampaignSummary[];
  className?: string;
}

/** status → label + chip color (CSS-var driven for light/dark). */
const STATUS_META: Record<CampaignStatus, { label: string; cls: string }> = {
  profiling: { label: "Profiling", cls: "bg-muted text-muted-foreground" },
  planning: { label: "Planning", cls: "bg-muted text-muted-foreground" },
  generating: { label: "Generating", cls: "bg-primary/15 text-primary" },
  pending_approval: {
    label: "Needs review",
    cls: "bg-primary/15 text-primary",
  },
  approved: { label: "Approved", cls: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
  executing: { label: "Executing", cls: "bg-primary/15 text-primary" },
  monitoring: { label: "Monitoring", cls: "bg-muted text-muted-foreground" },
  optimizing: { label: "Optimizing", cls: "bg-primary/15 text-primary" },
  completed: {
    label: "Completed",
    cls: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive" },
  scheduled: { label: "Scheduled", cls: "bg-muted text-muted-foreground" },
};

/** Where a campaign card links to, based on whether it still needs review. */
function hrefFor(c: CampaignSummary): string {
  return c.hasPendingReview
    ? `/campaigns/${c.id}/approval`
    : `/campaigns/${c.id}/dashboard`;
}

export function CampaignList({ campaigns, className }: CampaignListProps) {
  if (campaigns.length === 0) {
    return (
      <Card className={cn("p-8 text-center", className)}>
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">No campaigns yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Write a brief above and let the AI plan your first campaign.
        </p>
      </Card>
    );
  }

  return (
    <Stagger className={cn("space-y-3", className)}>
      {campaigns.map((c) => {
        const meta = STATUS_META[c.status];
        return (
          <StaggerItem key={c.id}>
            <Link href={hrefFor(c)} className="group block">
              <Card className="lift flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {c.name?.trim() || "Untitled campaign"}
                    </span>
                    <Badge
                      variant="secondary"
                      className={cn("border-0 text-[10px]", meta.cls)}
                    >
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                    {c.brief}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />
                      {c.segmentCount} segments · {c.variantCount} variants
                    </span>
                    <span className="tabular-nums">
                      {new Date(c.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Card>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
