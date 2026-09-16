"use client";

/**
 * Conversation thread pane. Port of the centre column in InboxPage.jsx:
 *   - header: customer + 24h-window hint + auto-reply toggle (AI ⇆ Human)
 *   - vertical-aware lead context strip (intent/stage badges + extracted fields)
 *   - chat bubbles (inbound left; bot = primary, agent = emerald, right) with
 *     framer enter animation + popLayout reordering
 *   - reply box (Enter to send); a handoff/empty hint when appropriate
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, MessageSquare, Send, Target, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConversationThread as Thread } from "@/features/inbox/queries";

function initials(name: string): string {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  );
}

const humanize = (s: string | null | undefined) => (s ?? "").replace(/_/g, " ");

export interface ConversationThreadProps {
  thread: Thread | null;
  canReply: boolean;
  sending: boolean;
  onSendReply: (text: string) => void;
  onToggleAutoReply: (next: boolean) => void;
}

export function ConversationThreadPane({
  thread,
  canReply,
  sending,
  onSendReply,
  onToggleAutoReply,
}: ConversationThreadProps) {
  const [reply, setReply] = React.useState("");
  const bottomRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages.length, thread?.id]);

  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-muted/30 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MessageSquare className="h-7 w-7" />
        </span>
        <p className="text-sm font-medium">Select a conversation</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a chat from the list to view the thread.
        </p>
      </div>
    );
  }

  function send() {
    const text = reply.trim();
    if (!text || !canReply) return;
    setReply("");
    onSendReply(text);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/30">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-6 py-3.5">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(thread.customerName || thread.customerWaId)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold">
              {thread.customerName || thread.customerWaId}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {thread.customerWaId} ·{" "}
              {thread.within24hWindow
                ? "within 24h window"
                : "outside 24h window"}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant={thread.autoReply ? "default" : "outline"}
          onClick={() => onToggleAutoReply(!thread.autoReply)}
          disabled={!canReply}
          className={cn(
            "gap-2",
            !thread.autoReply &&
              "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400",
          )}
        >
          {thread.autoReply ? (
            <>
              <Bot className="h-4 w-4" /> AI replying
            </>
          ) : (
            <>
              <User className="h-4 w-4" /> Human takeover
            </>
          )}
        </Button>
      </div>

      {/* Lead context */}
      {thread.lead && (
        <div className="shrink-0 border-b border-border bg-muted/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-primary" /> Lead
            </span>
            {thread.lead.intent && (
              <Badge variant="secondary" className="capitalize">
                {humanize(thread.lead.intent)}
              </Badge>
            )}
            {thread.lead.stage && (
              <Badge variant="outline" className="capitalize">
                {humanize(thread.lead.stage)}
              </Badge>
            )}
            {thread.verticalLabel && (
              <span className="text-[11px] text-muted-foreground">
                · {thread.verticalLabel}
              </span>
            )}
          </div>
          {thread.verticalFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {thread.verticalFields.map((f) => {
                const val = thread.lead?.fields?.[f];
                return (
                  <span
                    key={f}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px]",
                      val
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <span className="capitalize text-muted-foreground">
                      {humanize(f)}:
                    </span>{" "}
                    {val || "—"}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-6">
        <AnimatePresence initial={false} mode="popLayout">
          {thread.messages.map((m) => {
            const inbound = m.direction === "inbound";
            const isBot = m.sender === "bot";
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={cn("flex", inbound ? "justify-start" : "justify-end")}
              >
                <div
                  className={cn(
                    "max-w-[72%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                    inbound
                      ? "rounded-tl-sm border border-border bg-card text-card-foreground"
                      : isBot
                        ? "rounded-tr-sm bg-primary text-primary-foreground"
                        : "rounded-tr-sm bg-emerald-600 text-white",
                  )}
                >
                  {!inbound && (
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                      {isBot ? (
                        <>
                          <Bot className="h-3 w-3" /> AI
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3" /> Agent
                        </>
                      )}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card p-4">
        <Input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          disabled={!canReply}
          placeholder={
            canReply
              ? thread.autoReply
                ? "Reply as agent (this takes over from the bot)…"
                : "Reply as agent…"
              : "You don't have permission to reply."
          }
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={!reply.trim() || sending || !canReply}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
