"use client";

/**
 * Contact Lists screen (client). Mirrors frontend/src/pages/ListsPage.jsx:
 * a create-list field + a card grid of audiences with member counts and a
 * "Manage contacts" modal.
 *
 * Mutating affordances (create field, delete, manage) are gated by
 * `org:contacts:manage`; server actions re-check.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ListChecks, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RoleGate, useHasPermission } from "@/components/layout/role-gate";
import { createList, deleteList } from "@/features/lists/actions";
import type { ContactList } from "@/features/lists/queries";
import type { Contact } from "@/features/contacts/types";
import { ManageMembersDialog } from "./manage-members-dialog";

const PERM = "org:contacts:manage";

export interface ListsGridProps {
  initialLists: ContactList[];
  allContacts: Contact[];
}

export function ListsGrid({ initialLists, allContacts }: ListsGridProps) {
  const canManage = useHasPermission(PERM);
  const [lists, setLists] = React.useState<ContactList[]>(initialLists);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ContactList | null>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setLists(initialLists), [initialLists]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const res = await createList({ name: trimmed });
      setLists((prev) => [
        {
          id: res.id,
          name: res.name,
          description: res.description,
          memberCount: 0,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setName("");
      toast.success("List created.");
    } catch (err) {
      toast.error(errMsg(err, "Could not create list."));
    } finally {
      setCreating(false);
    }
  };

  const del = (l: ContactList) => {
    if (!window.confirm("Delete this list?")) return;
    startTransition(async () => {
      try {
        await deleteList(l.id);
        setLists((prev) => prev.filter((x) => x.id !== l.id));
        toast.success("List deleted.");
      } catch (err) {
        toast.error(errMsg(err, "Could not delete the list."));
      }
    });
  };

  const onMembersChanged = (listId: string, memberCount: number) => {
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, memberCount } : l)),
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <ListChecks className="size-5" />
          </span>
          Contact Lists
        </h1>
        <p className="text-muted-foreground">
          Group contacts into audiences you can target with a campaign.
        </p>
      </header>

      <RoleGate perm={PERM}>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="New list name…"
              className="sm:max-w-sm"
            />
            <Button
              onClick={create}
              disabled={creating || !name.trim()}
              className="sm:w-auto"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create list
            </Button>
          </CardContent>
        </Card>
      </RoleGate>

      {lists.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <ListChecks className="size-6" />
            </span>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">No lists yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first audience using the field above.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {lists.map((l, i) => (
              <motion.div
                key={l.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
              >
                <Card className="group h-full transition-shadow hover:shadow-md">
                  <CardContent className="flex h-full flex-col gap-4 p-6">
                    <div className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Users className="size-5" />
                      </span>
                      <RoleGate perm={PERM}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                              onClick={() => del(l)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete list</TooltipContent>
                        </Tooltip>
                      </RoleGate>
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">{l.name}</h3>
                      <Badge
                        variant="secondary"
                        className="font-medium tabular-nums"
                      >
                        {l.memberCount} contact{l.memberCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="mt-auto pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setEditing(l)}
                      >
                        <UserPlus className="size-4" />
                        {canManage ? "Manage contacts" : "View contacts"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TooltipProvider>
      )}

      {editing && (
        <ManageMembersDialog
          list={editing}
          allContacts={allContacts}
          canManage={canManage}
          onClose={() => setEditing(null)}
          onMembersChanged={onMembersChanged}
        />
      )}
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
