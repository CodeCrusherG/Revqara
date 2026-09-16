"use client";

/**
 * InboxView — the interactive 3-pane Inbox (client island).
 *
 * Layout: on desktop a resizable 3-pane (conversation list · thread · AI
 * timeline + assignment). On mobile the thread + AI panes move into a Sheet
 * (the list is the base layer), matching the responsive intent in the plan.
 *
 * Live data: the active thread + the conversation list are polled every ~3s via
 * the inbox poll Server Actions (RBAC-scoped server-side). Reply / auto-reply /
 * assignment go through the inbox Server Actions, then the thread is re-fetched.
 *
 * Stats header (Chats · Leads · Unresolved) mirrors InboxPage.jsx.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

import { ConversationList } from "./conversation-list";
import { ConversationThreadPane } from "./conversation-thread";
import { AiTimeline } from "./ai-timeline";
import type { OwnerMember, OwnerTeam } from "@/components/leads/owner-select";
import type {
  ConversationListItem,
  ConversationThread,
  InboxAssignedFilter,
  InboxStats,
} from "@/features/inbox/queries";
import {
  fetchConversations,
  fetchConversation,
  fetchInboxStats,
} from "@/features/inbox/poll";
import {
  sendReply,
  setAutoReply,
  assignConversation,
} from "@/features/inbox/actions";

const POLL_MS = 3000;

export interface InboxViewProps {
  initialConversations: ConversationListItem[];
  initialStats: InboxStats;
  initialActiveId: string | null;
  initialThread: ConversationThread | null;
  members: OwnerMember[];
  teams: OwnerTeam[];
  canAssign: boolean;
  canReply: boolean;
}

export function InboxView({
  initialConversations,
  initialStats,
  initialActiveId,
  initialThread,
  members,
  teams,
  canAssign,
  canReply,
}: InboxViewProps) {
  const router = useRouter();

  const [filter, setFilter] = React.useState<InboxAssignedFilter>("all");
  const [conversations, setConversations] = React.useState(
    initialConversations,
  );
  const [stats, setStats] = React.useState(initialStats);
  const [activeId, setActiveId] = React.useState<string | null>(
    initialActiveId,
  );
  const [thread, setThread] = React.useState<ConversationThread | null>(
    initialThread,
  );
  const [sending, setSending] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const loadConvos = React.useCallback(
    async (f: InboxAssignedFilter) => {
      try {
        const [c, s] = await Promise.all([
          fetchConversations(f),
          fetchInboxStats(),
        ]);
        setConversations(c);
        setStats(s);
      } catch {
        /* keep last good data */
      }
    },
    [],
  );

  const loadThread = React.useCallback(async (id: string | null) => {
    if (!id) {
      setThread(null);
      return;
    }
    try {
      setThread(await fetchConversation(id));
    } catch {
      /* keep last good thread */
    }
  }, []);

  // Re-load list when the filter changes.
  React.useEffect(() => {
    void loadConvos(filter);
  }, [filter, loadConvos]);

  // Poll the active thread + list while a conversation is open.
  React.useEffect(() => {
    if (!activeId) return;
    void loadThread(activeId);
    const t = setInterval(() => {
      void loadThread(activeId);
      void loadConvos(filter);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [activeId, filter, loadThread, loadConvos]);

  function selectConversation(id: string) {
    setActiveId(id);
    setMobileOpen(true);
    // Keep the URL shareable without a full navigation.
    window.history.replaceState(null, "", `/inbox/${id}`);
  }

  async function onSendReply(text: string) {
    if (!activeId) return;
    setSending(true);
    try {
      await sendReply({ conversationId: activeId, text });
      await loadThread(activeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    } finally {
      setSending(false);
    }
  }

  async function onToggleAutoReply(next: boolean) {
    if (!activeId) return;
    try {
      await setAutoReply({ conversationId: activeId, enabled: next });
      toast.success(next ? "AI is now replying" : "Switched to human takeover");
      await loadThread(activeId);
      await loadConvos(filter);
    } catch {
      toast.error("Could not change auto-reply");
    }
  }

  async function onAssign(next: {
    userId?: string | null;
    teamId?: string | null;
  }) {
    if (!activeId) return;
    try {
      await assignConversation({
        conversationId: activeId,
        userId: next.userId ?? null,
        teamId: next.teamId ?? null,
      });
      toast.success("Lead reassigned");
      await loadThread(activeId);
      await loadConvos(filter);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not assign");
    }
  }

  const threadPane = (
    <ConversationThreadPane
      thread={thread}
      canReply={canReply}
      sending={sending}
      onSendReply={onSendReply}
      onToggleAutoReply={onToggleAutoReply}
    />
  );

  const aiPane = thread ? (
    <AiTimeline
      thread={thread}
      members={members}
      teams={teams}
      canAssign={canAssign}
      onAssign={onAssign}
      className="h-full w-full"
    />
  ) : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-none tracking-tight">
              Inbox
            </h1>
            <p className="mt-1 hidden truncate text-xs text-muted-foreground md:block">
              Live WhatsApp conversations · AI replies + human takeover
            </p>
          </div>
        </div>
        <div className="hidden items-center divide-x divide-border rounded-lg border bg-card xl:flex">
          {(
            [
              ["Chats", stats.totalChats],
              ["Leads", stats.leads],
              ["Unresolved", stats.unresolved],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="px-3.5 py-1 text-center">
              <div className="text-sm font-bold leading-none tabular-nums">
                {v}
              </div>
              <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                {k}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Desktop: resizable 3-pane */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <ResizablePanelGroup defaultSizes={[26, 50, 24]}>
          <ResizablePanel defaultSize={26} minSize={18}>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              filter={filter}
              loading={false}
              onFilterChange={setFilter}
              onSelect={(id) => {
                setActiveId(id);
                window.history.replaceState(null, "", `/inbox/${id}`);
              }}
            />
          </ResizablePanel>
          <ResizableHandle handleIndex={0} withHandle />
          <ResizablePanel defaultSize={50} minSize={30}>
            {threadPane}
          </ResizablePanel>
          {thread?.lead && (
            <>
              <ResizableHandle handleIndex={1} withHandle />
              <ResizablePanel defaultSize={24} minSize={16}>
                {aiPane}
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Mobile: list + thread/AI in a Sheet */}
      <div className="flex min-h-0 flex-1 md:hidden">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          filter={filter}
          loading={false}
          onFilterChange={setFilter}
          onSelect={selectConversation}
        />
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="right"
            className="flex w-full max-w-full flex-col gap-0 p-0 sm:max-w-md"
          >
            <div className="flex min-h-0 flex-1 flex-col">{threadPane}</div>
            {thread?.lead && (
              <details className="border-t border-border">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground">
                  <PanelRightOpen className="h-3.5 w-3.5" /> AI analysis
                </summary>
                <div className="max-h-[40vh] overflow-y-auto">{aiPane}</div>
              </details>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
