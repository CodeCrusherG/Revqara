"use client";

/**
 * Manage-members dialog for a contact list. Mirrors the AddMembersModal in the
 * old ListsPage.jsx: searchable contact picker, multi-select add, inline remove.
 *
 * The full contact set is passed from the server (the parent already loaded it);
 * current membership is resolved via the `loadListMemberIds` server action.
 * Viewers (no `org:contacts:manage`) see a read-only roster.
 */

import * as React from "react";
import { toast } from "sonner";
import { Check, Loader2, Search, UserPlus, Users } from "lucide-react";

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addListMembers,
  removeListMember,
  loadListMemberIds,
} from "@/features/lists/actions";
import type { ContactList } from "@/features/lists/queries";
import type { Contact } from "@/features/contacts/types";

function initials(name: string | null, fallback: string): string {
  const src = (name || fallback || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface ManageMembersDialogProps {
  list: ContactList;
  allContacts: Contact[];
  canManage: boolean;
  onClose: () => void;
  onMembersChanged: (listId: string, memberCount: number) => void;
}

export function ManageMembersDialog({
  list,
  allContacts,
  canManage,
  onClose,
  onMembersChanged,
}: ManageMembersDialogProps) {
  const [members, setMembers] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const refreshMembers = React.useCallback(async () => {
    setLoading(true);
    try {
      const ids = await loadListMemberIds(list.id);
      setMembers(new Set(ids));
    } catch {
      toast.error("Could not load contacts for this list.");
    } finally {
      setLoading(false);
    }
  }, [list.id]);

  React.useEffect(() => {
    void refreshMembers();
  }, [refreshMembers]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addSelected = async () => {
    setSaving(true);
    try {
      const ids = [...selected];
      await addListMembers(list.id, ids);
      setSelected(new Set());
      const nextMembers = new Set(members);
      ids.forEach((id) => nextMembers.add(id));
      setMembers(nextMembers);
      onMembersChanged(list.id, nextMembers.size);
      toast.success(
        `Added ${ids.length} contact${ids.length === 1 ? "" : "s"} to ${list.name}.`,
      );
    } catch (err) {
      toast.error(errMsg(err, "Could not add contacts to the list."));
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (id: string) => {
    try {
      await removeListMember(list.id, id);
      const nextMembers = new Set(members);
      nextMembers.delete(id);
      setMembers(nextMembers);
      onMembersChanged(list.id, nextMembers.size);
      toast.success("Contact removed from list.");
    } catch (err) {
      toast.error(errMsg(err, "Could not remove the contact."));
    }
  };

  const filtered = React.useMemo(
    () =>
      allContacts.filter((c) =>
        `${c.fullName ?? ""} ${c.whatsappNumber}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [allContacts, q],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            {list.name}
          </DialogTitle>
          <DialogDescription>
            {canManage
              ? "Search and select contacts, then add them to this audience."
              : "Contacts currently in this audience."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contacts…"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <ScrollArea className="custom-scrollbar mt-3 h-[44vh] px-3">
          <div className="space-y-1 px-3 pb-2">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No contacts match “{q}”.
              </div>
            ) : (
              filtered.map((c) => {
                const isMember = members.has(c.id);
                const isSel = selected.has(c.id);
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                      isSel
                        ? "border-primary/40 bg-primary/5"
                        : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex flex-1 items-center gap-3 text-left disabled:cursor-default"
                      onClick={() => canManage && !isMember && toggle(c.id)}
                      disabled={!canManage || isMember}
                    >
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                          {initials(c.fullName, c.whatsappNumber)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.fullName || c.whatsappNumber}
                        </p>
                        <p className="truncate text-xs tabular-nums text-muted-foreground">
                          {c.whatsappNumber}
                        </p>
                      </div>
                    </button>
                    {isMember ? (
                      canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => removeMember(c.id)}
                        >
                          Remove
                        </Button>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground/60">
                          In list
                        </span>
                      )
                    ) : isSel ? (
                      <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" />
                      </span>
                    ) : canManage ? (
                      <span className="text-xs font-medium text-muted-foreground/60">
                        Tap
                      </span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {canManage && (
          <>
            <Separator />
            <DialogFooter className="p-6 pt-4">
              <Button
                onClick={addSelected}
                disabled={selected.size === 0 || saving}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Add {selected.size || ""} to list
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
