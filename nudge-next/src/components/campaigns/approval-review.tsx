"use client";

/**
 * ApprovalReview — the HITL review screen body. Ported from
 * frontend/src/pages/ApprovalPage.jsx: shows the draft (brief), the planned
 * segments, the generated variants with predictions, the AI activity timeline,
 * and approve / reject (with feedback) actions.
 *
 * approve/reject call server actions (gated by org:campaigns:manage server-side).
 * Reject reuses the brief + feedback to re-plan, so the draft refreshes.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  MessageSquareWarning,
  Sparkles,
  X,
} from "lucide-react";

import { approveCampaign, rejectCampaign } from "@/features/campaigns/actions";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentTable } from "./segment-table";
import { VariantCard } from "./variant-card";
import { AgentTimeline } from "./agent-timeline";
import type { CampaignDetail } from "@/features/campaigns/types";

export interface ApprovalReviewProps {
  campaign: CampaignDetail;
  canManage: boolean;
}

export function ApprovalReview({ campaign, canManage }: ApprovalReviewProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"approve" | "reject" | null>(
    null,
  );
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [feedback, setFeedback] = React.useState("");

  const variantBySegment = React.useMemo(() => {
    const m = new Map<string, CampaignDetail["segments"][number]["variants"][number]>();
    for (const seg of campaign.segments) {
      if (seg.variants[0]) m.set(seg.id, seg.variants[0]);
    }
    return m;
  }, [campaign.segments]);

  async function onApprove() {
    setPending("approve");
    try {
      await approveCampaign(campaign.id);
      toast.success("Approved — campaign executed and analysed.");
      router.push(`/campaigns/${campaign.id}/dashboard`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Approval failed.");
      setPending(null);
    }
  }

  async function onReject() {
    setPending("reject");
    try {
      await rejectCampaign(campaign.id, feedback.trim() || null);
      toast.success("Feedback sent — the AI re-planned the campaign.");
      setRejectOpen(false);
      setFeedback("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed.");
    } finally {
      setPending(null);
    }
  }

  const isPending = campaign.status === "pending_approval";

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {campaign.name?.trim() || "Campaign review"}
            </h1>
            <Badge
              variant="secondary"
              className="bg-primary/15 text-primary"
            >
              {isPending ? "Awaiting approval" : campaign.status}
            </Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {campaign.brief}
          </p>
          {campaign.rejectionFeedback ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Last feedback: {campaign.rejectionFeedback}
            </p>
          ) : null}
        </div>

        {canManage && isPending ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(true)}
              disabled={pending !== null}
              className="gap-1.5"
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={onApprove}
              disabled={pending !== null}
              className="gap-1.5"
            >
              {pending === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve &amp; send
            </Button>
          </div>
        ) : null}
      </div>

      {/* Segments */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Planned segments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentTable segments={campaign.segments} />
        </CardContent>
      </Card>

      {/* Variants */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Generated messages</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaign.segments.map((seg) => {
            const v = variantBySegment.get(seg.id);
            if (!v) return null;
            return (
              <VariantCard
                key={seg.id}
                segmentLabel={seg.label}
                variant={v}
                prediction={
                  seg.predictedOpenRate !== null ||
                  seg.predictedClickRate !== null
                    ? {
                        openRate: seg.predictedOpenRate ?? 0,
                        clickRate: seg.predictedClickRate ?? 0,
                        confidence: confidenceFor(seg.predictedOpenRate),
                      }
                    : null
                }
              />
            );
          })}
        </div>
      </section>

      {/* AI activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI activity</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentTimeline logs={campaign.agentLogs} />
        </CardContent>
      </Card>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send feedback to the AI</DialogTitle>
            <DialogDescription>
              Tell the AI what to change. It re-plans the segments and rewrites
              the copy with your feedback in mind.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g. Tone is too formal — make it punchier and lead with the discount."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={pending === "reject"}
            >
              Cancel
            </Button>
            <Button onClick={onReject} disabled={pending === "reject"} className="gap-1.5">
              {pending === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Re-plan with feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Map a predicted open rate to a confidence chip (mirrors scoreSegment). */
function confidenceFor(
  openRate: number | null,
): "High" | "Medium" | "Low" {
  if (openRate === null) return "Low";
  if (openRate > 0.2) return "High";
  if (openRate > 0.12) return "Medium";
  return "Low";
}
