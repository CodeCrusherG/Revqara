"use client";

/**
 * Conversation list pane. Port of the left column in InboxPage.jsx — filter
 * tabs (All · Mine · Unassigned), avatar + last message, unread dot, and an
 * AI/Human badge driven by `autoReply`.
 */

import { Bot, Inbox as InboxIcon, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ConversationListItem,
  InboxAssignedFilter,
} from "@/features/inbox/queries";

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

const FILTERS: Array<[InboxAssignedFilter, string]> = [
  ["all", "All"],
  ["me", "Mine"],
  ["unassigned", "Unassigned"],
];

export interface ConversationListProps {
  conversations: ConversationListItem[];
  activeId: string | null;
  filter: InboxAssignedFilter;
  loading: boolean;
  onFilterChange: (f: InboxAssignedFilter) => void;
  onSelect: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  filter,
  loading,
  onFilterChange,
  onSelect,
}: ConversationListProps) {
  return (
    <div className="custom-scrollbar h-full overflow-y-auto border-r border-border">
      <div className="sticky top-0 z-10 flex gap-1 border-b border-border bg-card/80 p-2 backdrop-blur">
        {FILTERS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => onFilterChange(v)}
            className={cn(
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              filter === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-1 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <InboxIcon className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            They appear here as customers message your WhatsApp number.
          </p>
        </div>
      ) : (
        <div className="p-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                activeId === c.id ? "bg-accent" : "hover:bg-muted/60",
              )}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {initials(c.customerName || c.customerWaId)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {c.customerName || c.customerWaId}
                  </span>
                  {c.unread && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {c.lastMessage ?? "—"}
                </p>
                <div className="mt-1.5">
                  <Badge
                    variant={c.autoReply ? "secondary" : "outline"}
                    className={cn(
                      "gap-1 px-1.5 py-0 text-[10px]",
                      !c.autoReply &&
                        "border-amber-300 text-amber-600 dark:border-amber-900/60 dark:text-amber-400",
                    )}
                  >
                    {c.autoReply ? (
                      <Bot className="h-2.5 w-2.5" />
                    ) : (
                      <User className="h-2.5 w-2.5" />
                    )}
                    {c.autoReply ? "AI" : "Human"}
                  </Badge>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
