/**
 * Contact Lists — RSC shell. Reads the tenant-scoped audiences plus the full
 * contact set (for the member-picker dialog) on the server, then renders the
 * client grid island.
 *
 * RBAC: any member may view; create/delete/manage are gated client-side by
 * RoleGate('org:contacts:manage') and re-checked in the server actions.
 */

import { listLists } from "@/features/lists/queries";
import { listContacts } from "@/features/contacts/queries";
import { ListsGrid } from "@/components/lists/lists-grid";

export const dynamic = "force-dynamic";

export default async function ListsPage() {
  const [lists, contacts] = await Promise.all([
    listLists(),
    listContacts({ limit: 500 }),
  ]);

  return <ListsGrid initialLists={lists} allContacts={contacts.contacts} />;
}
