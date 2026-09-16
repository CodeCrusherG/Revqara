"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Languages, Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VerticalIcon } from "@/components/marketing/vertical-icon";
import { DecisionPanel } from "@/components/demo/decision-panel";
import {
  MARKETING_VERTICALS,
  getMarketingVertical,
} from "@/lib/marketing/verticals";
import { INDIAN_LANGUAGES } from "@/lib/india-languages";
import type { DemoResponse, DemoErrorResponse } from "@/app/api/demo/route";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * NO-AUTH demo playground. Pick a vertical, fire a sample (or custom) WhatsApp
 * message, and watch the real universal AI graph classify intent, capture
 * fields, advance the pipeline, reply on-brand, and hand off on risk.
 * Calls the public `/api/demo` route handler. No persistence.
 */
export function DemoPlayground() {
  const [slug, setSlug] = useState<string>(MARKETING_VERTICALS[0]!.slug);
  const [message, setMessage] = useState<string>("");
  const [language, setLanguage] = useState<string>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DemoResponse | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const vertical = getMarketingVertical(slug) ?? MARKETING_VERTICALS[0]!;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setLastSent(trimmed);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vertical: slug, message: trimmed, language }),
      });
      const json = (await res.json()) as DemoResponse | DemoErrorResponse;
      if (!res.ok || !json.ok) {
        setError(
          json.ok === false ? json.error : "Something went wrong. Try again.",
        );
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError("Network error — please try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function onSelectVertical(next: string) {
    setSlug(next);
    setData(null);
    setError(null);
    setLastSent(null);
    setMessage("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      {/* Left: controls */}
      <Card className="flex flex-col gap-5 p-5 md:p-6">
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Languages className="h-4 w-4" />
            </span>
            <div>
              <label className="block text-sm font-semibold">AI language</label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Choose the language for the AI reply, or let Revqara detect it
                from the customer message.
              </p>
            </div>
          </div>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-full bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect from message</SelectItem>
              {INDIAN_LANGUAGES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label} ({item.nativeLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Business type
          </label>
          <Select value={slug} onValueChange={onSelectVertical}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKETING_VERTICALS.map((v) => (
                <SelectItem key={v.slug} value={v.slug}>
                  <span className="flex items-center gap-2">
                    <VerticalIcon name={v.icon} className="h-4 w-4 text-primary" />
                    {v.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">{vertical.tagline}</p>
        </div>

        {/* Sample prompts */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Try sending
          </div>
          <div className="flex flex-col gap-2">
            {vertical.prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={loading}
                className="group flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
              >
                <Send className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary opacity-70 transition-opacity group-hover:opacity-100" />
                <span className="text-foreground/90">{p}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom message */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Or write your own
          </div>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a WhatsApp message a customer might send…"
            rows={3}
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send(message);
              }
            }}
          />
          <Button
            className="mt-3 w-full gap-2"
            onClick={() => void send(message)}
            disabled={loading || message.trim().length === 0}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {loading ? "Running the AI graph…" : "Send to the AI"}
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            No signup. No persistence. ⌘/Ctrl + Enter to send.
          </p>
        </div>
      </Card>

      {/* Right: live decision */}
      <div className="min-h-[20rem]">
        <AnimatePresence mode="wait">
          {error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="flex h-full min-h-[20rem] items-center justify-center p-8 text-center text-sm text-destructive">
                {error}
              </Card>
            </motion.div>
          ) : data ? (
            <motion.div
              key={`${data.vertical}-${lastSent}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="space-y-3"
            >
              {lastSent ? (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground shadow-sm">
                    {lastSent}
                  </p>
                </div>
              ) : null}
              <DecisionPanel data={data} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-3 p-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </span>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Pick a business type and send a message. The same universal AI
                  graph adapts its pipeline, captured fields, replies, and
                  escalation rules to that vertical.
                </p>
                <span className="flex items-center gap-1 text-xs font-medium text-primary">
                  Tap a sample to start <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
