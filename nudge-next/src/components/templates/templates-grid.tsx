"use client";

/**
 * Message Templates screen (client). Mirrors frontend/src/pages/TemplatesPage.jsx:
 * a card grid of templates with status badges, a "New template" dialog, submit
 * for approval, and delete. (The legacy "Send test" affordance is a WhatsApp
 * send concern owned elsewhere and is intentionally omitted here.)
 *
 * All mutating affordances are gated by `org:templates:manage`; server actions
 * re-check.
 */

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RoleGate, useHasPermission } from "@/components/layout/role-gate";
import {
  createTemplate,
  deleteTemplate,
  submitTemplate,
} from "@/features/templates/actions";
import type { Template, TemplateStatus } from "@/features/templates/queries";
import { NewTemplateDialog } from "./new-template-dialog";

const PERM = "org:templates:manage";

const STATUS_BADGE: Record<
  TemplateStatus,
  {
    variant: "success" | "secondary" | "destructive";
    icon: typeof CheckCircle2;
    label: string;
  }
> = {
  approved: { variant: "success", icon: CheckCircle2, label: "Approved" },
  draft: { variant: "secondary", icon: FileText, label: "Draft" },
  // No `warning` badge variant ships; pending uses `secondary` + Clock icon.
  pending: { variant: "secondary", icon: Clock, label: "Pending" },
  rejected: { variant: "destructive", icon: XCircle, label: "Rejected" },
};

function StatusBadge({ status }: { status: TemplateStatus }) {
  const cfg = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1 capitalize">
      <Icon className="h-3 w-3" /> {cfg.label}
    </Badge>
  );
}

export interface TemplatesGridProps {
  initialTemplates: Template[];
}

export function TemplatesGrid({ initialTemplates }: TemplatesGridProps) {
  const canManage = useHasPermission(PERM);
  const [items, setItems] = React.useState<Template[]>(initialTemplates);
  const [showNew, setShowNew] = React.useState(false);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => setItems(initialTemplates), [initialTemplates]);

  const submit = (id: string) => {
    startTransition(async () => {
      try {
        const updated = await submitTemplate(id);
        setItems((prev) => prev.map((t) => (t.id === id ? updated : t)));
        toast.success("Submitted for approval");
      } catch (err) {
        toast.error(errMsg(err, "Could not submit template"));
      }
    });
  };

  const del = (id: string) => {
    if (!window.confirm("Delete template?")) return;
    startTransition(async () => {
      try {
        await deleteTemplate(id);
        setItems((prev) => prev.filter((t) => t.id !== id));
        toast.success("Template deleted");
      } catch (err) {
        toast.error(errMsg(err, "Could not delete template"));
      }
    });
  };

  const onSaved = (created: Template) => {
    setItems((prev) => [created, ...prev]);
    setShowNew(false);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-foreground">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </span>
            Message Templates
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pre-approved templates for business-initiated messages, required
            outside the 24-hour window.
          </p>
        </div>
        <RoleGate perm={PERM}>
          <Button onClick={() => setShowNew(true)} className="shrink-0">
            <Plus className="h-4 w-4" /> New template
          </Button>
        </RoleGate>
      </header>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 border-dashed py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <MessageSquare className="h-7 w-7" />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              No templates yet
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Create one, then submit it for approval to use in marketing sends.
            </p>
          </div>
          <RoleGate perm={PERM}>
            <Button
              onClick={() => setShowNew(true)}
              variant="outline"
              className="mt-2"
            >
              <Plus className="h-4 w-4" /> Create your first template
            </Button>
          </RoleGate>
        </Card>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {items.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
              >
                <Card className="flex h-full flex-col gap-4 p-6 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="truncate font-semibold text-foreground">
                        {t.name}
                      </div>
                      <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                        {t.category} · {t.language}
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  <p className="min-h-[3.5rem] whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm text-foreground/90">
                    {t.body}
                  </p>

                  {canManage && (
                    <>
                      <Separator />
                      <div className="flex items-center gap-2">
                        {t.status !== "approved" && t.status !== "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-primary hover:text-primary"
                            onClick={() => submit(t.id)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Submit for
                            approval
                          </Button>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-auto text-muted-foreground hover:text-destructive"
                              onClick={() => del(t.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete template</TooltipContent>
                        </Tooltip>
                      </div>
                    </>
                  )}
                </Card>
              </motion.div>
            ))}
          </div>
        </TooltipProvider>
      )}

      <NewTemplateDialog
        open={showNew}
        onOpenChange={setShowNew}
        onSaved={onSaved}
        create={createTemplate}
      />
    </div>
  );
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
