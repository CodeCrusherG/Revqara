"use client";

/**
 * DashboardView — campaign analytics. Ported from
 * frontend/src/pages/DashboardPage.jsx + components/MetricsChart.jsx: KPI cards
 * (AnimatedNumber), the delivery funnel, the segment table, and hand-rolled
 * SVG/div charts for per-variant open/click rates and the prediction trend
 * (NO recharts).
 */

import * as React from "react";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  IndianRupee,
  MessageCircle,
  Users,
  XCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { BarChart } from "./chart";
import { SegmentTable } from "./segment-table";
import { AgentTimeline } from "./agent-timeline";
import type {
  CampaignAnalytics,
  CampaignDetail,
  VariantMetric,
} from "@/features/campaigns/types";

export interface DashboardViewProps {
  campaign: CampaignDetail;
  analytics: CampaignAnalytics;
  metrics: VariantMetric[];
}

const PRIMARY = "hsl(var(--primary))";
const SUCCESS = "hsl(var(--success))";

export function DashboardView({
  campaign,
  analytics,
  metrics,
}: DashboardViewProps) {
  // Per-variant open/click bar chart (actual if executed, else predicted).
  const variantBars = React.useMemo(() => {
    if (metrics.length > 0) {
      return {
        groups: metrics.map((m) => m.segmentLabel || m.variantId.slice(0, 6)),
        open: metrics.map((m) => m.openRate / 100),
        click: metrics.map((m) => m.clickRate / 100),
      };
    }
    // No executed metrics → fall back to the segment predictions.
    return {
      groups: campaign.segments.map((s) => s.label),
      open: campaign.segments.map((s) => s.predictedOpenRate ?? 0),
      click: campaign.segments.map((s) => s.predictedClickRate ?? 0),
    };
  }, [metrics, campaign.segments]);

  const hasActuals = metrics.length > 0;

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {campaign.name?.trim() || "Campaign dashboard"}
          </h1>
          <p className="mt-0.5 line-clamp-1 max-w-2xl text-sm text-muted-foreground">
            {campaign.brief}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
        >
          {campaign.status}
        </Badge>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Recipients"
          value={analytics.recipients}
        />
        <Kpi
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Delivered"
          value={analytics.delivered}
        />
        <Kpi
          icon={<Eye className="h-4 w-4" />}
          label="Read rate"
          value={analytics.readRate}
          suffix="%"
          decimals={1}
        />
        <Kpi
          icon={<MessageCircle className="h-4 w-4" />}
          label="Replies"
          value={analytics.replies}
        />
      </div>

      {/* Funnel + cost */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" />
              Delivery funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Funnel analytics={analytics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Stat
              icon={<MessageCircle className="h-4 w-4" />}
              label="Reply rate"
              value={`${analytics.replyRate.toFixed(1)}%`}
            />
            <Stat
              icon={<Users className="h-4 w-4" />}
              label="Leads created"
              value={analytics.leads.toLocaleString("en-IN")}
            />
            <Stat
              icon={<XCircle className="h-4 w-4" />}
              label="Unsubscribes"
              value={analytics.unsubscribes.toLocaleString("en-IN")}
            />
            <Stat
              icon={<IndianRupee className="h-4 w-4" />}
              label="Est. cost"
              value={`₹${analytics.estimatedCostInr.toLocaleString("en-IN")}`}
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts + segments + activity */}
      <Tabs defaultValue="variants">
        <TabsList>
          <TabsTrigger value="variants">
            {hasActuals ? "Variant performance" : "Predicted performance"}
          </TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="activity">AI activity</TabsTrigger>
        </TabsList>

        <TabsContent value="variants">
          <Card>
            <CardContent className="pt-6">
              <BarChart
                groups={variantBars.groups}
                series={[
                  { label: "Open", values: variantBars.open, color: PRIMARY },
                  { label: "Click", values: variantBars.click, color: SUCCESS },
                ]}
              />
              {!hasActuals ? (
                <p className="mt-4 text-xs text-muted-foreground">
                  Showing the AI&apos;s predicted rates — actuals appear once the
                  campaign has sent and engagement lands.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments">
          <Card>
            <CardContent className="pt-6">
              <SegmentTable segments={campaign.segments} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardContent className="pt-6">
              <AgentTimeline logs={campaign.agentLogs} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  suffix,
  decimals = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <div className="mt-1 text-3xl font-bold tracking-tight">
          <AnimatedNumber
            value={Number.isFinite(value) ? value : 0}
            decimals={decimals}
            suffix={suffix ?? ""}
            startOnView={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** Delivery funnel as stacked horizontal bars scaled to recipients. */
function Funnel({ analytics }: { analytics: CampaignAnalytics }) {
  const total = Math.max(1, analytics.recipients);
  const steps = [
    { label: "Sent", value: analytics.sent, color: PRIMARY },
    { label: "Delivered", value: analytics.delivered, color: PRIMARY },
    { label: "Read", value: analytics.read, color: SUCCESS },
    { label: "Clicked", value: analytics.clicked, color: SUCCESS },
    { label: "Replied", value: analytics.replies, color: SUCCESS },
  ];
  return (
    <div className="space-y-3">
      {steps.map((s) => {
        const pct = Math.round((s.value / total) * 100);
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{s.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {s.value.toLocaleString("en-IN")}{" "}
                <span className="text-[10px]">({pct}%)</span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: s.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
