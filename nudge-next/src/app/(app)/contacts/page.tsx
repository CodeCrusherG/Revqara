/**
 * Contacts — RSC shell. Reads the tenant-scoped contact page on the server
 * (admin client, never executed at build because the (app) group layout is
 * force-dynamic) and hands a serializable list to the client table island.
 *
 * RBAC: any member may view; mutating affordances are gated client-side by
 * RoleGate('org:contacts:manage') and re-checked in the server actions.
 */

import { getRequestContext } from "@/lib/auth/context";
import { listContacts } from "@/features/contacts/queries";
import { planDef } from "@/lib/billing/plans";
import { ContactsTable } from "@/components/contacts/contacts-table";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const ctx = await getRequestContext();
  const { contacts, total } = await listContacts({ limit: 200 });
  const limit = planDef(ctx.plan).maxContacts ?? null;

  return (
    <ContactsTable
      initialContacts={contacts}
      total={total}
      contactLimit={limit}
    />
  );
}
