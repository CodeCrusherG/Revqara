"use client";

/**
 * ⌘K command palette. Combines static nav quick-actions with DYNAMIC,
 * tenant-scoped, RBAC-aware search across contacts / leads / conversations via
 * the `globalSearch` Server Action (debounced ~250ms on the client). Exposes a
 * context so the TopBar's search affordance and any leaf can open it; binds the
 * global ⌘K / Ctrl+K shortcut.
 *
 * The cmdk `<CommandInput>` filters the *static* groups client-side; the dynamic
 * results are fetched server-side per keystroke (debounced) and rendered with
 * `forceMount`-style raw items (we disable cmdk's own filtering for them by
 * giving each a unique value so they always show while a query is active).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  FileText,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MessageSquare,
  Network,
  Send,
  Settings,
  Target,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  globalSearch,
  type SearchResult,
  type SearchEntity,
} from "@/features/search/actions";

type Action = { label: string; href: string; icon: LucideIcon; keywords?: string };
type ActionGroup = { heading: string; actions: Action[] };

const ACTION_GROUPS: ActionGroup[] = [
  {
    heading: "Campaigns",
    actions: [
      { label: "New Campaign", href: "/", icon: Send, keywords: "brief create" },
      { label: "Analytics", href: "/dashboard", icon: LayoutDashboard, keywords: "reports metrics" },
    ],
  },
  {
    heading: "Conversations",
    actions: [
      { label: "Inbox", href: "/inbox", icon: MessageSquare, keywords: "chat messages threads" },
      { label: "Leads", href: "/leads", icon: Target, keywords: "pipeline kanban" },
    ],
  },
  {
    heading: "Team",
    actions: [
      { label: "Members", href: "/team", icon: UsersRound, keywords: "invite roles" },
      { label: "Sales Teams", href: "/sales-teams", icon: Network },
    ],
  },
  {
    heading: "Audience",
    actions: [
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Lists", href: "/lists", icon: ListChecks },
      { label: "Templates", href: "/templates", icon: FileText },
    ],
  },
  {
    heading: "Account",
    actions: [
      { label: "Billing", href: "/billing", icon: CreditCard, keywords: "plan subscription usage" },
      { label: "Settings", href: "/settings", icon: Settings, keywords: "vertical bot whatsapp" },
    ],
  },
];

const ENTITY_ICON: Record<SearchEntity, LucideIcon> = {
  contact: User,
  lead: Target,
  conversation: MessageSquare,
};

const ENTITY_HEADING: Record<SearchEntity, string> = {
  contact: "Contacts",
  lead: "Leads",
  conversation: "Conversations",
};

type CommandMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const CommandMenuContext = React.createContext<CommandMenuContextValue | null>(
  null,
);

export function useCommandMenu() {
  const ctx = React.useContext(CommandMenuContext);
  if (!ctx) {
    throw new Error("useCommandMenu must be used within <CommandMenuProvider>.");
  }
  return ctx;
}

export function CommandMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  const toggle = React.useCallback(() => setOpen((o) => !o), []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Reset transient search state whenever the palette closes.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSearching(false);
    }
  }, [open]);

  // Debounced server search (~250ms). A request token guards against
  // out-of-order responses overwriting newer results.
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      globalSearch(q)
        .then((res) => {
          if (!cancelled && res.query === query.trim()) setResults(res.results);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const value = React.useMemo(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  );

  // Group dynamic results by entity, preserving the contacts→leads→convos order.
  const grouped = React.useMemo(() => {
    const order: SearchEntity[] = ["contact", "lead", "conversation"];
    return order
      .map((entity) => ({
        entity,
        items: results.filter((r) => r.entity === entity),
      }))
      .filter((g) => g.items.length > 0);
  }, [results]);

  const hasQuery = query.trim().length >= 2;

  return (
    <CommandMenuContext.Provider value={value}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        {/* The palette's internal filter hides any item whose `value` doesn't
            match the typed text. Dynamic result items below are given the live
            query as their `value` so they always pass that filter while a search
            is active; static actions keep their keyword values. */}
        <CommandInput
          placeholder="Search contacts, leads, chats — or jump to…"
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {searching ? "Searching…" : "No results found."}
          </CommandEmpty>

          {/* Dynamic, tenant-scoped, RBAC-aware results. */}
          {hasQuery && grouped.length > 0 && (
            <>
              {grouped.map((group) => (
                <CommandGroup
                  key={group.entity}
                  heading={ENTITY_HEADING[group.entity]}
                >
                  {group.items.map((r) => {
                    const Icon = ENTITY_ICON[r.entity];
                    return (
                      <CommandItem
                        key={`${r.entity}-${r.id}`}
                        // Use the live query as the value so the palette's
                        // internal substring filter always keeps server results
                        // visible (they are pre-filtered server-side already).
                        value={query}
                        onSelect={() => go(r.href)}
                      >
                        <Icon />
                        <span className="truncate">{r.title}</span>
                        {r.subtitle && (
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {r.subtitle}
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
              <CommandSeparator />
            </>
          )}

          {hasQuery && searching && grouped.length === 0 && (
            <div
              className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Searching your workspace…
            </div>
          )}

          {/* Static nav quick-actions (always available). */}
          {ACTION_GROUPS.map((group, i) => (
            <React.Fragment key={group.heading}>
              {i > 0 && <CommandSeparator />}
              <CommandGroup heading={group.heading}>
                {group.actions.map((action) => (
                  <CommandItem
                    key={action.href + action.label}
                    value={`${action.label} ${action.keywords ?? ""}`}
                    onSelect={() => go(action.href)}
                  >
                    <action.icon />
                    <span>{action.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          ))}
        </CommandList>
      </CommandDialog>
    </CommandMenuContext.Provider>
  );
}

/** Standalone export kept for parity with the screen inventory naming. */
export function CommandMenu() {
  return null;
}
