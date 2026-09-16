"use client";

/**
 * BriefForm — the "New Campaign" composer. Ported from
 * frontend/src/pages/BriefPage.jsx: a natural-language brief + vertical hint +
 * optional target list, template, and schedule. Submitting calls the
 * generateCampaign server action (which runs the pipeline inline to a draft) and
 * routes to the approval screen.
 *
 * Gated client-side by RoleGate('org:campaigns:manage') at the page level; the
 * server action re-checks the permission, so this UI is convenience only.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Languages, Loader2, Sparkles, Wand2 } from "lucide-react";

import { generateCampaign } from "@/features/campaigns/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  INDIAN_LANGUAGES,
  type IndianLanguageCode,
} from "@/lib/india-languages";

export interface BriefFormOption {
  id: string;
  name: string;
}

export interface BriefFormProps {
  verticalLabel: string;
  lists: BriefFormOption[];
  templates: BriefFormOption[];
}

const NONE = "__none__";

/** A few starter briefs to seed the empty textarea (per the demo deck). */
const STARTERS = [
  "Re-engage customers who dropped off after onboarding with a limited-time offer.",
  "Promote our new premium deposit product to high-income, digitally active users.",
  "Win back lost leads with a personalised follow-up and a strong CTA.",
];

export function BriefForm({ verticalLabel, lists, templates }: BriefFormProps) {
  const router = useRouter();

  const [name, setName] = React.useState("");
  const [brief, setBrief] = React.useState("");
  const [listId, setListId] = React.useState<string>(NONE);
  const [templateId, setTemplateId] = React.useState<string>(NONE);
  const [targetLanguage, setTargetLanguage] =
    React.useState<IndianLanguageCode>("en");
  const [scheduledAt, setScheduledAt] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = brief.trim();
    if (!trimmed) {
      toast.error("Write a brief so the AI knows what to plan.");
      return;
    }
    setPending(true);
    try {
      const res = await generateCampaign({
        brief: trimmed,
        name: name.trim() || null,
        targetListId: listId === NONE ? null : listId,
        templateId: templateId === NONE ? null : templateId,
        targetLanguage,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      if (res.status === "scheduled") {
        toast.success("Campaign scheduled — it will run at the chosen time.");
        router.push("/");
        router.refresh();
      } else {
        toast.success("Draft ready — review the AI's plan.");
        router.push(`/campaigns/${res.campaignId}/approval`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not generate the campaign.",
      );
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wand2 className="h-5 w-5" />
        </div>
        <CardTitle className="text-2xl">New campaign</CardTitle>
        <CardDescription>
          Describe the campaign in plain language. The AI profiles your audience,
          plans A/B segments, writes the copy, and predicts engagement — tuned
          for {verticalLabel}. You approve before anything sends.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Languages className="h-4 w-4" />
              </span>
              <div>
                <Label htmlFor="c-language" className="text-base font-semibold">
                  AI language
                </Label>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Choose the language Revqara should use for generated WhatsApp
                  campaign copy.
                </p>
              </div>
            </div>
            <Select
              value={targetLanguage}
              onValueChange={(value) =>
                setTargetLanguage(value as IndianLanguageCode)
              }
              disabled={pending}
            >
              <SelectTrigger id="c-language" className="bg-background">
                <SelectValue placeholder="Choose campaign language" />
              </SelectTrigger>
              <SelectContent>
                {INDIAN_LANGUAGES.map((language) => (
                  <SelectItem key={language.code} value={language.code}>
                    {language.label} ({language.nativeLabel})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              Supports Tamil, Telugu, Gujarati, Marathi, Punjabi, Kannada,
              Malayalam, Bengali, Hindi, Urdu, and English.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-name">Campaign name (optional)</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Diwali re-engagement"
              disabled={pending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-brief">Brief</Label>
            <Textarea
              id="c-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Re-engage customers who haven't ordered in 60 days with a 15% off coupon…"
              rows={5}
              disabled={pending}
              required
            />
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setBrief(s)}
                  disabled={pending}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  {s.length > 48 ? `${s.slice(0, 48)}…` : s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-list">Target list</Label>
              <Select value={listId} onValueChange={setListId} disabled={pending}>
                <SelectTrigger id="c-list">
                  <SelectValue placeholder="All contacts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All contacts</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-template">Template (optional)</Label>
              <Select
                value={templateId}
                onValueChange={setTemplateId}
                disabled={pending}
              >
                <SelectTrigger id="c-template">
                  <SelectValue placeholder="AI writes the copy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>AI writes the copy</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="c-schedule">Schedule (optional)</Label>
            <Input
              id="c-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to generate a draft now. A future time queues the
              campaign for the scheduler.
            </p>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {pending ? "Generating plan…" : "Generate campaign"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
