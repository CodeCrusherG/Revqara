"use client";

/**
 * Team screen (client). Mirrors frontend/src/pages/TeamPage.jsx: a members
 * table with an RBAC-gated role select, status badge, disable/enable, remove,
 * and an Invite dialog backed by Clerk Organization Invitations.
 *
 * RBAC is enforced two ways:
 *   - the whole management column is shown only when the actor holds
 *     `org:team:manage` (RoleGate);
 *   - per-row, `canManageRole(myRole, targetRole)` decides whether a specific
 *     member is editable, and the role select only offers roles the actor may
 *     assign (canManageRole(myRole, candidateRole)).
 * Server actions (changeMemberRole/setMemberStatus/removeMember) re-check all of
 * this, so the UI gating is convenience only.
 */

import * as React from "react";
import { toast } from "sonner";
import { Ban, RotateCcw, Trash2, UserPlus, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RoleGate } from "@/components/layout/role-gate";
import { canManageRole } from "@/lib/auth/rbac";
import type { Role } from "@/types/roles";
import { ROLES } from "@/types/roles";
import {
  changeMemberRole,
  removeMember,
  setMemberStatus,
  type TeamMember,
} from "@/features/team/actions";
import { InviteMemberDialog } from "./invite-member-dialog";

const PERM = "org:team:manage";

export const ROLE_LABEL: Record<Role, string> = {
  "org:owner": "Owner",
  "org:admin": "Admin",
  "org:manager": "Manager",
  "org:agent": "Agent",
  "org:viewer": "Viewer",
};

export interface TeamTableProps {
  initialMembers: TeamMember[];
  myUserId: string;
  myRole: Role;
}

export function TeamTable({
  initialMembers,
  myUserId,
  myRole,
}: TeamTableProps) {
  const [members, setMembers] = React.useState<TeamMember[]>(initialMembers);
  const [showInvite, setShowInvite] = React.useState(false);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setMembers(initialMembers), [initialMembers]);

  // Roles this actor may assign (at/below own rank; owner only by owner).
  const assignableRoles = React.useMemo(
    () => ROLES.filter((r) => canManageRole(myRole, r)),
    [myRole],
  );

  const onChangeRole = (m: TeamMember, role: Role) => {
    startTransition(async () => {
      try {
        const updated = await changeMemberRole({ userId: m.userId, role });
        setMembers((prev) =>
          prev.map((x) => (x.userId === m.userId ? updated : x)),
        );
        toast.success("Role updated");
      } catch (err) {
        toast.error(errMsg(err, "Could not update role"));
      }
    });
  };

  const onToggleStatus = (m: TeamMember) => {
    const next = m.status === "active" ? "disabled" : "active";
    startTransition(async () => {
      try {
        const updated = await setMemberStatus({ userId: m.userId, status: next });
        setMembers((prev) =>
          prev.map((x) => (x.userId === m.userId ? updated : x)),
        );
        toast.success(next === "disabled" ? "Member disabled" : "Member enabled");
      } catch (err) {
        toast.error(errMsg(err, "Could not update member"));
      }
    });
  };

  const onRemove = (m: TeamMember) => {
    if (!window.confirm(`Remove ${m.fullName || m.email || "this member"}?`))
      return;
    startTransition(async () => {
      try {
        await removeMember({ userId: m.userId });
        setMembers((prev) => prev.filter((x) => x.userId !== m.userId));
        toast.success("Member removed");
      } catch (err) {
        toast.error(errMsg(err, "Could not remove member"));
      }
    });
  };

  const columns: DataTableColumn<TeamMember>[] = [
    {
      id: "member",
      header: "Member",
      sortable: true,
      searchable: true,
      accessor: (m) => m.fullName ?? m.email ?? m.userId,
      cell: (m) => (
        <div>
          <div className="font-medium text-foreground">
            {m.fullName || m.email || m.userId}
            {m.userId === myUserId && (
              <span className="ml-1 text-xs text-muted-foreground">(you)</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{m.email}</div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      accessor: (m) => ROLE_LABEL[m.role],
      cell: (m) => {
        const editable =
          canManageRole(myRole, m.role) && m.userId !== myUserId;
        if (!editable) {
          return (
            <Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge>
          );
        }
        return (
          <Select
            value={m.role}
            onValueChange={(v) => onChangeRole(m, v as Role)}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Always include the member's current role so it renders, even
                  if it's outside the actor's normally-assignable set. */}
              {Array.from(new Set([m.role, ...assignableRoles])).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      accessor: (m) => m.status,
      cell: (m) => (
        <Badge
          variant={m.status === "active" ? "success" : "outline"}
          className="capitalize"
        >
          {m.status}
        </Badge>
      ),
    },
  ];

  const manageColumn: DataTableColumn<TeamMember> = {
    id: "actions",
    header: "",
    headerClassName: "w-24 text-right",
    className: "text-right",
    cell: (m) => {
      const manageable =
        canManageRole(myRole, m.role) && m.userId !== myUserId;
      if (!manageable) return null;
      return (
        <div className="flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => onToggleStatus(m)}
              >
                {m.status === "active" ? (
                  <Ban className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {m.status === "active" ? "Disable member" : "Enable member"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onRemove(m)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove member</TooltipContent>
          </Tooltip>
        </div>
      );
    },
  };

  const canManage = assignableRoles.length > 0;
  const allColumns = canManage ? [...columns, manageColumn] : columns;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25">
              <UsersRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Team
              </h1>
              <p className="text-sm text-muted-foreground">
                Members and roles for this workspace.
              </p>
            </div>
          </div>
          <RoleGate perm={PERM}>
            <Button className="gap-2" onClick={() => setShowInvite(true)}>
              <UserPlus className="h-4 w-4" /> Invite member
            </Button>
          </RoleGate>
        </header>

        <DataTable
          columns={allColumns}
          data={members}
          rowKey={(m) => m.userId}
          searchPlaceholder="Search members…"
          pageSize={25}
        />

        <InviteMemberDialog
          open={showInvite}
          onOpenChange={setShowInvite}
          assignableRoles={assignableRoles}
        />
      </div>
    </TooltipProvider>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
