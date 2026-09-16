"use client";

/**
 * New-sales-team dialog. Mirrors the create modal in SalesTeamsPage.jsx
 * (name + optional description). The `create` server action is injected; the
 * returned summary is expanded to an empty-membership SalesTeam for the grid.
 */

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type { SalesTeam } from "@/features/salesTeams/queries";
import type { SalesTeamSummary } from "@/features/salesTeams/actions";

export interface NewSalesTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (team: SalesTeam) => void;
  create: (input: {
    name: string;
    description?: string | null;
  }) => Promise<SalesTeamSummary>;
}

export function NewSalesTeamDialog({
  open,
  onOpenChange,
  onCreated,
  create,
}: NewSalesTeamDialogProps) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const createTeam = async () => {
    setSaving(true);
    try {
      const summary = await create({
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success("Sales team created");
      onCreated({
        ...summary,
        members: [],
        memberCount: 0,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not create team",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a sales team</DialogTitle>
          <DialogDescription>
            Leads can be assigned to a whole team, not just one agent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              placeholder="North Zone, Inbound, Enterprise…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Description (optional)</Label>
            <Textarea
              id="team-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={createTeam} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
