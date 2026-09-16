/**
 * Message Templates — RSC shell. Reads tenant-scoped templates on the server,
 * then renders the client grid island.
 *
 * RBAC: any member may view; create/submit/delete are gated client-side by
 * RoleGate('org:templates:manage') and re-checked in the server actions.
 */

import { listTemplates } from "@/features/templates/queries";
import { TemplatesGrid } from "@/components/templates/templates-grid";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();
  return <TemplatesGrid initialTemplates={templates} />;
}
