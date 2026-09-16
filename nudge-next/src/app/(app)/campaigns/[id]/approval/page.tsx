/**
 * Campaign approval — RSC shell. Loads the full tenant-scoped campaign detail
 * (draft + segments + variants + agent logs) and hands it to the ApprovalReview
 * client island. Ported from frontend/src/pages/ApprovalPage.jsx.
 *
 * RBAC: any member can view the draft; approve/reject affordances are gated by
 * `org:campaigns:manage` (re-checked in the server actions). A non-owned id
 * surfaces as notFound() (assertOwned throws a 404-status error).
 *
 * BUILD-SAFETY: (app) group layout is force-dynamic — never prerendered.
 */

import { notFound } from "next/navigation";

import { getRequestContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/rbac";
import { getCampaignDetail } from "@/features/campaigns/queries";
import { ApprovalReview } from "@/components/campaigns/approval-review";

export const dynamic = "force-dynamic";

export default async function CampaignApprovalPage({
  params,
}: {
  params: { id: string };
}) {
  const ctx = await getRequestContext();
  const canManage = hasPermission(ctx.role, "org:campaigns:manage");

  let campaign;
  try {
    campaign = await getCampaignDetail(params.id);
  } catch {
    notFound();
  }

  return <ApprovalReview campaign={campaign} canManage={canManage} />;
}
