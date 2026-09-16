"use client";

/**
 * New-template dialog. Mirrors the NewTemplateModal in TemplatesPage.jsx
 * (name, category, body). The `create` server action is injected.
 */

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import type {
  Template,
  TemplateCategory,
} from "@/features/templates/queries";
import type { CreateTemplateInput } from "@/features/templates/actions";

const CATEGORIES: TemplateCategory[] = [
  "marketing",
  "utility",
  "authentication",
  "service",
];

interface FormState {
  name: string;
  category: TemplateCategory;
  body: string;
}

const EMPTY: FormState = { name: "", category: "marketing", body: "" };

export interface NewTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (created: Template) => void;
  create: (input: CreateTemplateInput) => Promise<Template>;
}

export function NewTemplateDialog({
  open,
  onOpenChange,
  onSaved,
  create,
}: NewTemplateDialogProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const created = await create({
        name: form.name,
        category: form.category,
        body: form.body,
      });
      toast.success("Draft template created");
      onSaved(created);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not create template",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> New template
          </DialogTitle>
          <DialogDescription>
            Create a reusable message template for business-initiated sends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input
              id="tpl-name"
              placeholder="e.g. festive_offer"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-category">Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, category: v as TemplateCategory }))
              }
            >
              <SelectTrigger id="tpl-category" className="capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpl-body">Message body</Label>
            <Textarea
              id="tpl-body"
              rows={4}
              placeholder="Hi {{1}}, here's a special offer just for you…"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Use {"{{1}}"}, {"{{2}}"} for variables. Marketing templates need
              approval before business-initiated sends.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={save}
            disabled={saving || !form.name.trim() || !form.body.trim()}
            className="w-full"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
