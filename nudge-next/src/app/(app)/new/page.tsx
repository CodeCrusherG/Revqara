/**
 * Brief (New Campaign) — the (app) home. RSC shell: reads tenant-scoped lists,
 * approved templates, recent campaigns, and live usage on the server, then hands
 * serializable data to the BriefForm + CampaignList client islands.
 *
 * Ported from frontend/src/pages/BriefPage.jsx (+ DashboardPage's recent list).
 *
 * RBAC: any member can view recents/usage; the brief composer is gated by
 * `org:campaigns:manage` (owner/admin) — viewers/agents/managers see the recents
 * but not the generator. The generateCampaign action re-checks the permission.
 *
 * BUILD-SAFETY: the (app) group layout is force-dynamic, so this never runs at
 * build time (no Clerk/Appwrite needed during `next build`).
 */

import { Sparkles } from "lucide-react";

import { getRequestContext } from "@/lib/auth/context";
import { listCampaigns } from "@/features/campaigns/queries";
import { listLists } from "@/features/lists/queries";
import { listTemplates } from "@/features/templates/queries";
import { countContacts } from "@/features/contacts/queries";
import { planDef } from "@/lib/billing/plans";
import { VERTICAL_LABELS, type VerticalSlug } from "@/lib/config";
import { hasPermission } from "@/lib/auth/rbac";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BriefForm } from "@/components/campaigns/brief-form";
import { CampaignList } from "@/components/campaigns/campaign-list";
import { UsageMeter } from "@/components/campaigns/usage-meter";

export const dynamic = "force-dynamic";

export default async function BriefHomePage() {
  const ctx = await getRequestContext();
  const canManage = hasPermission(ctx.role, "org:campaigns:manage");

  const [campaigns, lists, templates, contactCount] = await Promise.all([
    listCampaigns(20),
    listLists(),
    listTemplates(),
    countContacts(),
  ]);

  const plan = planDef(ctx.plan);
  const verticalLabel =
    VERTICAL_LABELS[(ctx.vertical as VerticalSlug)] ?? "your business";
  const approvedTemplates = templates.filter((t) => t.status === "approved");

  return (
    <div className="container max-w-6xl space-y-8 py-6">
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: composer (gated) or read-only notice. */}
        <div className="space-y-6">
          {canManage ? (
            <BriefForm
              verticalLabel={verticalLabel}
              lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              templates={approvedTemplates.map((t) => ({
                id: t.id,
                name: t.name,
              }))}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center gap-3 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium">Campaigns are managed by owners</p>
                  <p className="text-sm text-muted-foreground">
                    You can review recent campaigns below. Ask an owner or admin
                    to launch a new one.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: usage. */}
        <div className="space-y-6">
          <UsageMeter
            planName={plan.name}
            contactCount={contactCount}
            maxContacts={plan.maxContacts}
            maxSends={plan.maxSends}
            listCount={lists.length}
            maxLists={plan.maxLists}
          />
        </div>
      </div>

      {/* Recents. */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          <Badge variant="secondary" className="tabular-nums">
            {campaigns.length}
          </Badge>
        </div>
        <CampaignList campaigns={campaigns} />
      </section>
    </div>
  );
}
