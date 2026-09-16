/**
 * Campaign dashboard — RSC shell. Loads the tenant-scoped campaign detail,
 * funnel analytics, and cached per-variant metrics on the server, then hands
 * them to the DashboardView client island (KPIs + funnel + charts + segments).
 * Ported from frontend/src/pages/DashboardPage.jsx.
 *
 * RBAC: any member can view analytics (read-only). A non-owned id → notFound().
 *
 * BUILD-SAFETY: (app) group layout is force-dynamic — never prerendered.
 */

import { notFound } from "next/navigation";

import {
  getCampaignAnalytics,
  getCampaignDetail,
  getCampaignMetrics,
} from "@/features/campaigns/queries";
import { DashboardView } from "@/components/campaigns/dashboard-view";

export const dynamic = "force-dynamic";

export default async function CampaignDashboardPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const [campaign, analytics, metrics] = await Promise.all([
      getCampaignDetail(params.id),
      getCampaignAnalytics(params.id),
      getCampaignMetrics(params.id),
    ]);
    return (
      <DashboardView
        campaign={campaign}
        analytics={analytics}
        metrics={metrics}
      />
    );
  } catch {
    notFound();
  }
}
