"use client";

/**
 * Invite-member dialog. Backed by Clerk Organization Invitations via the
 * `inviteMember` server action (which enforces org:team:manage +
 * canManageRole). Only roles the actor may assign are offered.
 */

import * as React from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/types/roles";
import { inviteMember } from "@/features/team/actions";
import { ROLE_LABEL } from "./team-table";

const ROLE_DESC: Record<Role, string> = {
  "org:owner": "Full control incl. billing",
  "org:admin": "Manage team, campaigns, settings",
  "org:manager": "See all leads, assign, reports",
  "org:agent": "Only assigned leads & inbox",
  "org:viewer": "Read-only dashboards",
};

export interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignableRoles: Role[];
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  assignableRoles,
}: InviteMemberDialogProps) {
  const defaultRole: Role =
    assignableRoles.find((r) => r === "org:agent") ??
    assignableRoles[assignableRoles.length - 1] ??
    "org:agent";

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>(defaultRole);
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setRole(defaultRole);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    setSending(true);
    try {
      const res = await inviteMember({ email: email.trim(), role });
      toast.success(`Invite sent to ${res.email}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not create invite",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email invitation to join this workspace with the
            role you pick.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    <span>{ROLE_LABEL[r]}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      · {ROLE_DESC[r]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={send}
            disabled={!email.trim() || sending}
            className="gap-2"
          >
            <Mail className="h-4 w-4" /> Send invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
