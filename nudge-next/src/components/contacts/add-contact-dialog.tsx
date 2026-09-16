"use client";

/**
 * Add-contact dialog. Mirrors the AddContactDialog in the old ContactsPage.jsx
 * (full name, number, email, city, income, existing-customer). The `create`
 * server action is injected so the dialog stays a pure presentation island.
 */

import * as React from "react";
import { toast } from "sonner";
import { Loader2, UserPlus } from "lucide-react";

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
import type { Contact, CreateContactInput } from "@/features/contacts/types";

interface FormState {
  fullName: string;
  whatsappNumber: string;
  email: string;
  city: string;
  monthlyIncome: string;
  existingCustomer: string;
}

const EMPTY: FormState = {
  fullName: "",
  whatsappNumber: "",
  email: "",
  city: "",
  monthlyIncome: "",
  existingCustomer: "",
};

export interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (created: Contact) => void;
  create: (input: CreateContactInput) => Promise<Contact>;
}

export function AddContactDialog({
  open,
  onOpenChange,
  onSaved,
  create,
}: AddContactDialogProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set =
    (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const created = await create({
        fullName: form.fullName || null,
        whatsappNumber: form.whatsappNumber,
        email: form.email || null,
        city: form.city || null,
        monthlyIncome: form.monthlyIncome
          ? parseInt(form.monthlyIncome, 10)
          : null,
        existingCustomer: form.existingCustomer || null,
      });
      toast.success("Contact added");
      onSaved(created);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not save contact.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Add contact</DialogTitle>
              <DialogDescription>
                Manually add a single contact to your workspace.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              placeholder="Priya Sharma"
              value={form.fullName}
              onChange={set("fullName")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp_number">WhatsApp number</Label>
            <Input
              id="whatsapp_number"
              placeholder="919876543210"
              value={form.whatsappNumber}
              onChange={set("whatsappNumber")}
              className="tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">
              Email{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="priya@example.com"
              value={form.email}
              onChange={set("email")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="Mumbai"
                value={form.city}
                onChange={set("city")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monthly_income">Monthly income</Label>
              <Input
                id="monthly_income"
                inputMode="numeric"
                placeholder="50000"
                value={form.monthlyIncome}
                onChange={set("monthlyIncome")}
                className="tabular-nums"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Existing customer?</Label>
            <Select
              value={form.existingCustomer}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, existingCustomer: v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Y">Yes</SelectItem>
                <SelectItem value="N">No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.whatsappNumber.trim()}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
