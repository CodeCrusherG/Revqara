"use client";

/**
 * Lightweight command-palette primitives in the shadcn new-york style, bound to
 * the app CSS variables. Hand-written (the `cmdk` package is intentionally not a
 * dependency): a small React context performs case-insensitive substring
 * filtering and keyboard navigation (↑/↓/Enter). API mirrors the shadcn
 * `command` surface so call-sites read identically.
 */

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

type CommandContextValue = {
  search: string;
  setSearch: (value: string) => void;
  register: (id: string, value: string, onSelect?: () => void) => void;
  unregister: (id: string) => void;
  matches: (value: string) => boolean;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  visibleIds: string[];
  setVisible: (id: string, visible: boolean) => void;
  runActive: () => void;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

function useCommand() {
  const ctx = React.useContext(CommandContext);
  if (!ctx) {
    throw new Error("Command components must be used within <Command>.");
  }
  return ctx;
}

const Command = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const [search, setSearch] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const itemsRef = React.useRef(
    new Map<string, { value: string; onSelect?: () => void }>(),
  );
  const [visible, setVisibleState] = React.useState<Record<string, boolean>>(
    {},
  );

  const matches = React.useCallback(
    (value: string) =>
      search.trim().length === 0 ||
      value.toLowerCase().includes(search.trim().toLowerCase()),
    [search],
  );

  const register = React.useCallback(
    (id: string, value: string, onSelect?: () => void) => {
      itemsRef.current.set(id, { value, onSelect });
    },
    [],
  );
  const unregister = React.useCallback((id: string) => {
    itemsRef.current.delete(id);
    setVisibleState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setVisible = React.useCallback((id: string, isVisible: boolean) => {
    setVisibleState((prev) =>
      prev[id] === isVisible ? prev : { ...prev, [id]: isVisible },
    );
  }, []);

  const visibleIds = React.useMemo(
    () => Object.keys(visible).filter((id) => visible[id]),
    [visible],
  );

  // Keep an active (highlighted) item among the visible ones.
  React.useEffect(() => {
    if (visibleIds.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !visibleIds.includes(activeId)) {
      setActiveId(visibleIds[0]);
    }
  }, [visibleIds, activeId]);

  const runActive = React.useCallback(() => {
    if (!activeId) return;
    itemsRef.current.get(activeId)?.onSelect?.();
  }, [activeId]);

  const move = React.useCallback(
    (delta: number) => {
      if (visibleIds.length === 0) return;
      const idx = activeId ? visibleIds.indexOf(activeId) : -1;
      const next =
        (idx + delta + visibleIds.length) % visibleIds.length;
      setActiveId(visibleIds[next]);
    },
    [visibleIds, activeId],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runActive();
    }
  };

  const value = React.useMemo<CommandContextValue>(
    () => ({
      search,
      setSearch,
      register,
      unregister,
      matches,
      activeId,
      setActiveId,
      visibleIds,
      setVisible,
      runActive,
    }),
    [
      search,
      register,
      unregister,
      matches,
      activeId,
      visibleIds,
      setVisible,
      runActive,
    ],
  );

  return (
    <CommandContext.Provider value={value}>
      <div
        ref={ref}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CommandContext.Provider>
  );
});
Command.displayName = "Command";

interface CommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function CommandDialog({ children, ...props }: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        <Command className="[&_[data-cmd-group-heading]]:px-2 [&_[data-cmd-group-heading]]:font-medium [&_[data-cmd-group-heading]]:text-muted-foreground [&_[data-cmd-group]:not([hidden])_~[data-cmd-group]]:pt-0 [&_[data-cmd-group]]:px-2 [&_[data-cmd-input-wrapper]_svg]:h-5 [&_[data-cmd-input-wrapper]_svg]:w-5 [&_[data-cmd-input]]:h-12 [&_[data-cmd-item]]:px-2 [&_[data-cmd-item]]:py-3 [&_[data-cmd-item]_svg]:h-5 [&_[data-cmd-item]_svg]:w-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

interface CommandInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Notified on every keystroke (lets a parent run a dynamic/server search). */
  onValueChange?: (value: string) => void;
}

const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  ({ className, onValueChange, ...props }, ref) => {
    const { search, setSearch } = useCommand();
    return (
      <div
        className="flex items-center border-b px-3"
        data-cmd-input-wrapper=""
      >
        <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
        <input
          ref={ref}
          data-cmd-input=""
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onValueChange?.(e.target.value);
          }}
          className={cn(
            "flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "max-h-[300px] overflow-y-auto overflow-x-hidden custom-scrollbar",
      className,
    )}
    {...props}
  />
));
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { visibleIds } = useCommand();
  if (visibleIds.length > 0) return null;
  return (
    <div
      ref={ref}
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  );
});
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { heading?: React.ReactNode }
>(({ className, heading, children, ...props }, ref) => {
  // The group hides itself when none of its descendant items are visible. We
  // track that via a ref count updated by child items.
  const [hasVisible, setHasVisible] = React.useState(true);
  const counts = React.useRef(new Set<string>());

  const groupCtx = React.useMemo(
    () => ({
      reportVisible: (id: string, visible: boolean) => {
        if (visible) counts.current.add(id);
        else counts.current.delete(id);
        setHasVisible(counts.current.size > 0);
      },
    }),
    [],
  );

  return (
    <CommandGroupContext.Provider value={groupCtx}>
      <div
        ref={ref}
        data-cmd-group=""
        hidden={!hasVisible}
        className={cn(
          "overflow-hidden p-1 text-foreground",
          className,
        )}
        {...props}
      >
        {heading ? (
          <div
            data-cmd-group-heading=""
            className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {heading}
          </div>
        ) : null}
        {children}
      </div>
    </CommandGroupContext.Provider>
  );
});
CommandGroup.displayName = "CommandGroup";

const CommandGroupContext = React.createContext<{
  reportVisible: (id: string, visible: boolean) => void;
} | null>(null);

const CommandSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("-mx-1 h-px bg-border", className)}
    {...props}
  />
));
CommandSeparator.displayName = "CommandSeparator";

let __cmdItemSeq = 0;

interface CommandItemProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
  value?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

const CommandItem = React.forwardRef<HTMLDivElement, CommandItemProps>(
  ({ className, value, onSelect, disabled, children, ...props }, ref) => {
    const {
      matches,
      register,
      unregister,
      setVisible,
      activeId,
      setActiveId,
    } = useCommand();
    const groupCtx = React.useContext(CommandGroupContext);
    const idRef = React.useRef<string>(`cmd-item-${++__cmdItemSeq}`);
    const id = idRef.current;
    const textRef = React.useRef<HTMLDivElement | null>(null);
    const [resolvedValue, setResolvedValue] = React.useState(value ?? "");

    // Derive a searchable value from the rendered text if none provided.
    React.useEffect(() => {
      if (!value && textRef.current) {
        setResolvedValue(textRef.current.textContent ?? "");
      } else if (value) {
        setResolvedValue(value);
      }
    }, [value, children]);

    React.useEffect(() => {
      register(id, resolvedValue, disabled ? undefined : onSelect);
      return () => unregister(id);
    }, [id, resolvedValue, onSelect, disabled, register, unregister]);

    const visible = matches(resolvedValue);
    React.useEffect(() => {
      setVisible(id, visible);
      groupCtx?.reportVisible(id, visible);
    }, [id, visible, setVisible, groupCtx]);

    if (!visible) return null;

    const isActive = activeId === id;

    return (
      <div
        ref={(node) => {
          textRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        data-cmd-item=""
        data-disabled={disabled ? "true" : undefined}
        data-selected={isActive ? "true" : undefined}
        role="option"
        aria-selected={isActive}
        onMouseEnter={() => !disabled && setActiveId(id)}
        onClick={() => {
          if (disabled) return;
          onSelect?.();
        }}
        className={cn(
          "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
          isActive && "bg-accent text-accent-foreground",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
CommandItem.displayName = "CommandItem";

const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      "ml-auto text-xs tracking-widest text-muted-foreground",
      className,
    )}
    {...props}
  />
);
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
