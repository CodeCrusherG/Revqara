"use client";

/**
 * Sales Teams screen (client). Mirrors frontend/src/pages/SalesTeamsPage.jsx:
 * a card grid of teams with member chips, a member-picker, delete, and a
 * "New team" dialog.
 *
 * All mutating affordances are gated by `org:team:manage`; server actions
 * re-check. The workspace roster (humans, from Clerk) is passed from the server
 * so the picker can show names, not raw user ids.
 */

import * as React from "react";
import { toast } from "sonner";
import { Network, Plus, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { RoleGate, useHasPermission } from "@/components/layout/role-gate";
import {
  addSalesTeamMember,
  createSalesTeam,
  deleteSalesTeam,
  removeSalesTeamMember,
} from "@/features/salesTeams/actions";
import type {
  SalesTeam,
  SalesTeamMember,
} from "@/features/salesTeams/queries";
import { NewSalesTeamDialog } from "./new-sales-team-dialog";

const PERM = "org:team:manage";

export interface RosterMember {
  userId: string;
  fullName: string | null;
  email: string | null;
}

export interface SalesTeamsGridProps {
  initialTeams: SalesTeam[];
  roster: RosterMember[];
}

function memberLabel(m: { fullName: string | null; email: string | null }) {
  return m.fullName || m.email || "Unknown";
}

export function SalesTeamsGrid({ initialTeams, roster }: SalesTeamsGridProps) {
  const canManage = useHasPermission(PERM);
  const [teams, setTeams] = React.useState<SalesTeam[]>(initialTeams);
  const [showNew, setShowNew] = React.useState(false);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setTeams(initialTeams), [initialTeams]);

  const onCreated = (team: SalesTeam) => {
    setTeams((prev) => [team, ...prev]);
    setShowNew(false);
  };

  const onDelete = (t: SalesTeam) => {
    if (!window.confirm(`Delete ${t.name}?`)) return;
    startTransition(async () => {
      try {
        await deleteSalesTeam(t.id);
        setTeams((prev) => prev.filter((x) => x.id !== t.id));
        toast.success("Team deleted");
      } catch (err) {
        toast.error(errMsg(err, "Could not delete team"));
      }
    });
  };

  const onAddMember = (t: SalesTeam, userId: string) => {
    const human = roster.find((r) => r.userId === userId);
    startTransition(async () => {
      try {
        await addSalesTeamMember(t.id, userId);
        setTeams((prev) =>
          prev.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  members: [
                    ...x.members,
                    {
                      userId,
                      fullName: human?.fullName ?? null,
                      email: human?.email ?? null,
                    },
                  ],
                  memberCount: x.memberCount + 1,
                }
              : x,
          ),
        );
      } catch (err) {
        toast.error(errMsg(err, "Could not add member"));
      }
    });
  };

  const onRemoveMember = (t: SalesTeam, userId: string) => {
    startTransition(async () => {
      try {
        await removeSalesTeamMember(t.id, userId);
        setTeams((prev) =>
          prev.map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  members: x.members.filter((m) => m.userId !== userId),
                  memberCount: Math.max(0, x.memberCount - 1),
                }
              : x,
          ),
        );
      } catch (err) {
        toast.error(errMsg(err, "Could not remove member"));
      }
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
            <Network className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              Sales Teams
            </h1>
            <p className="text-sm text-muted-foreground">
              Group agents so leads can be routed to a team.
            </p>
          </div>
        </div>
        <RoleGate perm={PERM}>
          <Button className="gap-2" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4" /> New team
          </Button>
        </RoleGate>
      </header>

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Network className="h-6 w-6" />
            </span>
            <h3 className="text-base font-semibold text-foreground">
              No sales teams yet
            </h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Create a team to route leads to a group of agents instead of one
              person.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((t) => {
            const inTeam = new Set(t.members.map((m) => m.userId));
            const candidates = roster.filter((m) => !inTeam.has(m.userId));
            return (
              <Card key={t.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    {t.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                    </Badge>
                    <RoleGate perm={PERM}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => onDelete(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </RoleGate>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {t.members.length === 0 && (
                      <span className="text-xs text-muted-foreground">
                        No members yet.
                      </span>
                    )}
                    {t.members.map((m: SalesTeamMember) => (
                      <span
                        key={m.userId}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                      >
                        {memberLabel(m)}
                        {canManage && (
                          <button
                            onClick={() => onRemoveMember(t, m.userId)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${memberLabel(m)}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {canManage && candidates.length > 0 && (
                    <Select
                      value=""
                      onValueChange={(v) => onAddMember(t, v)}
                    >
                      <SelectTrigger className="h-8">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserPlus className="h-3.5 w-3.5" /> Add member
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {memberLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NewSalesTeamDialog
        open={showNew}
        onOpenChange={setShowNew}
        onCreated={onCreated}
        create={createSalesTeam}
      />
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
