"use client";

/**
 * OwnerSelect — the single Select control that assigns a lead to either a member
 * or a sales team. Encodes the choice as one value (`u:<userId>` / `t:<teamId>`
 * / `none`) so users and teams share one control, exactly like the React
 * LeadsPage/InboxPage. Emits `{ userId?, teamId? }` on change.
 *
 * Read-only fallback (when `canAssign` is false) renders the owner label as
 * plain text — matching the role-gated affordance in the ground-truth UX.
 */

import * as React from "react";
import { UserCog } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface OwnerMember {
  userId: string;
  name: string;
  role?: string;
}
export interface OwnerTeam {
  id: string;
  name: string;
}

export interface OwnerSelectProps {
  assignedToUserId: string | null;
  assignedToTeamId: string | null;
  ownerLabel: string;
  members: OwnerMember[];
  teams: OwnerTeam[];
  canAssign: boolean;
  align?: "start" | "end";
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  onAssign: (next: { userId?: string | null; teamId?: string | null }) => void;
}

export function encodeOwnerValue(
  assignedToUserId: string | null,
  assignedToTeamId: string | null,
): string {
  if (assignedToUserId) return `u:${assignedToUserId}`;
  if (assignedToTeamId) return `t:${assignedToTeamId}`;
  return "none";
}

export function OwnerSelect({
  assignedToUserId,
  assignedToTeamId,
  ownerLabel,
  members,
  teams,
  canAssign,
  align = "start",
  triggerClassName,
  disabled,
  onAssign,
}: OwnerSelectProps) {
  const value = encodeOwnerValue(assignedToUserId, assignedToTeamId);

  if (!canAssign) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <UserCog className="h-3.5 w-3.5" /> {ownerLabel}
      </span>
    );
  }

  function handleChange(v: string) {
    if (v === "none") onAssign({ userId: null, teamId: null });
    else if (v.startsWith("u:")) onAssign({ userId: v.slice(2), teamId: null });
    else if (v.startsWith("t:")) onAssign({ userId: null, teamId: v.slice(2) });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className={cn("h-8 w-[170px]", triggerClassName)}>
        <SelectValue>
          <span className="flex items-center gap-1.5 text-xs">
            <UserCog className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{ownerLabel}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align={align}>
        <SelectItem value="none">Unassigned</SelectItem>
        {members.length > 0 && (
          <SelectGroup>
            <SelectLabel>Agents</SelectLabel>
            {members.map((m) => (
              <SelectItem key={m.userId} value={`u:${m.userId}`}>
                {m.name}
                {m.role ? (
                  <span className="text-muted-foreground"> · {m.role}</span>
                ) : null}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {teams.length > 0 && (
          <SelectGroup>
            <SelectLabel>Teams</SelectLabel>
            {teams.map((t) => (
              <SelectItem key={t.id} value={`t:${t.id}`}>
                Team: {t.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
