"use client";

/**
 * Contacts screen (client). Mirrors frontend/src/pages/ContactsPage.jsx:
 * searchable/sortable table, consent toggle, tag chips, add + import dialogs.
 *
 * Mutating affordances (Add / Import / opt-toggle / delete) are gated by
 * `org:contacts:manage` via RoleGate — viewers see a read-only table. Server
 * actions re-check the permission, so hiding the UI is convenience only.
 */

import * as React from "react";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Tag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RoleGate, useHasPermission } from "@/components/layout/role-gate";
import {
  createContact,
  deleteContact,
  optInContact,
  optOutContact,
  importContactsFromForm,
} from "@/features/contacts/actions";
import type { Contact, OptInStatus } from "@/features/contacts/types";
import { AddContactDialog } from "./add-contact-dialog";

const PERM = "org:contacts:manage";

function ConsentBadge({ status }: { status: OptInStatus }) {
  if (status === "opted_in") {
    return (
      <Badge variant="success" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> Opted in
      </Badge>
    );
  }
  if (status === "opted_out") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldX className="h-3 w-3" /> Opted out
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <ShieldQuestion className="h-3 w-3" /> Unknown
    </Badge>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-muted-foreground">—</span>;
  const shown = tags.slice(0, 3);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Tag className="h-2.5 w-2.5" /> {t}
        </span>
      ))}
      {tags.length > shown.length && (
        <span className="text-[11px] text-muted-foreground">
          +{tags.length - shown.length}
        </span>
      )}
    </div>
  );
}

export interface ContactsTableProps {
  initialContacts: Contact[];
  total: number;
  contactLimit: number | null;
}

export function ContactsTable({
  initialContacts,
  total,
  contactLimit,
}: ContactsTableProps) {
  const canManage = useHasPermission(PERM);
  const [contacts, setContacts] = React.useState<Contact[]>(initialContacts);
  const [showAdd, setShowAdd] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setContacts(initialContacts), [initialContacts]);

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        const res = await importContactsFromForm(fd);
        toast.success(
          `Imported: ${res.created} added, ${res.updated} updated, ${res.skipped} skipped.`,
        );
      } catch (err) {
        toast.error(errMsg(err, "Import failed."));
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };

  const del = (c: Contact) => {
    if (!window.confirm("Delete this contact?")) return;
    startTransition(async () => {
      try {
        await deleteContact(c.id);
        setContacts((prev) => prev.filter((x) => x.id !== c.id));
        toast.success("Contact deleted");
      } catch (err) {
        toast.error(errMsg(err, "Could not delete contact."));
      }
    });
  };

  const toggleConsent = (c: Contact) => {
    startTransition(async () => {
      try {
        const updated =
          c.optInStatus === "opted_out"
            ? await optInContact(c.id)
            : await optOutContact(c.id);
        setContacts((prev) =>
          prev.map((x) => (x.id === c.id ? updated : x)),
        );
        toast.success(
          c.optInStatus === "opted_out"
            ? "Contact opted in"
            : "Contact opted out",
        );
      } catch (err) {
        toast.error(errMsg(err, "Could not update consent."));
      }
    });
  };

  const onSaved = (created: Contact) => {
    setContacts((prev) => [created, ...prev]);
    setShowAdd(false);
  };

  const columns: DataTableColumn<Contact>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      accessor: (c) => c.fullName ?? c.whatsappNumber,
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {(c.fullName || c.whatsappNumber || "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="font-medium text-foreground">
            {c.fullName || "—"}
          </span>
        </div>
      ),
    },
    {
      id: "whatsapp",
      header: "WhatsApp",
      searchable: true,
      accessor: (c) => c.whatsappNumber,
      cell: (c) => (
        <span className="tabular-nums text-muted-foreground">
          {c.whatsappNumber}
        </span>
      ),
    },
    {
      id: "city",
      header: "City",
      sortable: true,
      accessor: (c) => c.city,
      cell: (c) =>
        c.city ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="h-3 w-3" /> {c.city}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "income",
      header: "Income",
      sortable: true,
      headerClassName: "text-right",
      className: "text-right",
      accessor: (c) => c.monthlyIncome,
      cell: (c) => (
        <span className="tabular-nums text-muted-foreground">
          {c.monthlyIncome ? `₹${c.monthlyIncome.toLocaleString()}` : "—"}
        </span>
      ),
    },
    {
      id: "tags",
      header: "Tags",
      searchable: true,
      accessor: (c) => c.tags.join(" "),
      cell: (c) => <TagChips tags={c.tags} />,
    },
    {
      id: "consent",
      header: "Consent",
      sortable: true,
      accessor: (c) => c.optInStatus,
      cell: (c) =>
        canManage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggleConsent(c)}
                disabled={pending}
                className="cursor-pointer rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <ConsentBadge status={c.optInStatus} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {c.optInStatus === "opted_out"
                ? "Click to opt in"
                : "Click to opt out"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <ConsentBadge status={c.optInStatus} />
        ),
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-10",
      className: "w-10",
      cell: (c) =>
        canManage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => del(c)}
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete contact</TooltipContent>
          </Tooltip>
        ) : null,
    },
  ];

  const pct =
    contactLimit && contactLimit > 0
      ? Math.min(100, Math.round((total / contactLimit) * 100))
      : null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </span>
              Contacts
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {total.toLocaleString()}
              </span>
              {contactLimit ? (
                <span className="tabular-nums">
                  {" "}
                  / {contactLimit.toLocaleString()}
                </span>
              ) : null}{" "}
              contacts in your workspace
              {pct != null && <span className="ml-1">· {pct}% of plan</span>}
            </p>
          </div>
          <RoleGate perm={PERM}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                hidden
                onChange={onImport}
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={pending}
              >
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4" /> Add contact
              </Button>
            </div>
          </RoleGate>
        </header>

        <DataTable
          columns={columns}
          data={contacts}
          rowKey={(c) => c.id}
          searchPlaceholder="Search name, number, email…"
          pageSize={25}
          empty={
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Users className="h-7 w-7" />
              </div>
              <p className="text-base font-semibold text-foreground">
                No contacts yet
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Add a contact or import a CSV to get your audience started.
              </p>
            </div>
          }
        />

        <AddContactDialog
          open={showAdd}
          onOpenChange={setShowAdd}
          onSaved={onSaved}
          create={createContact}
        />
      </div>
    </TooltipProvider>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
