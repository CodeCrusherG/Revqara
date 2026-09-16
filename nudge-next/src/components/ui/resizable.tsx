"use client";

/**
 * Resizable panels — a minimal, dependency-free horizontal splitter.
 *
 * Hand-written (no react-resizable-panels dependency) to keep package.json
 * unchanged. Supports a horizontal `ResizablePanelGroup` with two or more
 * `ResizablePanel`s separated by draggable `ResizableHandle`s. Sizes are
 * percentages that sum to 100; dragging a handle shifts size between the panels
 * on either side (respecting each panel's `minSize`). Pointer-capture based, so
 * it works with mouse, pen and touch.
 *
 * This covers the Inbox 3-pane desktop layout; on mobile the Inbox swaps the
 * thread/AI panes into a Sheet instead of resizing (see components/inbox/*).
 */

import * as React from "react";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";

interface PanelConfig {
  id: string;
  defaultSize: number;
  minSize: number;
}

interface GroupContextValue {
  sizes: number[];
  register: (config: PanelConfig) => number; // returns panel index
  startDrag: (handleIndex: number, clientX: number) => void;
}

const GroupContext = React.createContext<GroupContextValue | null>(null);

export interface ResizablePanelGroupProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Persisted default sizes (percent, summing ~100) in panel order. */
  defaultSizes?: number[];
}

const ResizablePanelGroup = React.forwardRef<
  HTMLDivElement,
  ResizablePanelGroupProps
>(({ className, children, defaultSizes, ...props }, ref) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const panelsRef = React.useRef<PanelConfig[]>([]);
  const [sizes, setSizes] = React.useState<number[]>(defaultSizes ?? []);
  const dragRef = React.useRef<{
    handleIndex: number;
    startX: number;
    startSizes: number[];
  } | null>(null);

  const register = React.useCallback((config: PanelConfig): number => {
    const existing = panelsRef.current.findIndex((p) => p.id === config.id);
    if (existing !== -1) return existing;
    panelsRef.current.push(config);
    const index = panelsRef.current.length - 1;
    setSizes((prev) => {
      const next = [...prev];
      if (next[index] === undefined) next[index] = config.defaultSize;
      return next;
    });
    return index;
  }, []);

  const onPointerMove = React.useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const width = container.getBoundingClientRect().width || 1;
    const deltaPct = ((event.clientX - drag.startX) / width) * 100;

    const i = drag.handleIndex; // panel before the handle
    const j = drag.handleIndex + 1; // panel after the handle
    const before = drag.startSizes[i] ?? 0;
    const after = drag.startSizes[j] ?? 0;
    const minBefore = panelsRef.current[i]?.minSize ?? 0;
    const minAfter = panelsRef.current[j]?.minSize ?? 0;

    let applied = deltaPct;
    if (before + applied < minBefore) applied = minBefore - before;
    if (after - applied < minAfter) applied = after - minAfter;

    const next = [...drag.startSizes];
    next[i] = before + applied;
    next[j] = after - applied;
    setSizes(next);
  }, []);

  const stopDrag = React.useCallback(() => {
    dragRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  }, [onPointerMove]);

  const startDrag = React.useCallback(
    (handleIndex: number, clientX: number) => {
      dragRef.current = {
        handleIndex,
        startX: clientX,
        startSizes: [...sizes],
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDrag);
    },
    [sizes, onPointerMove, stopDrag],
  );

  React.useEffect(() => () => stopDrag(), [stopDrag]);

  const setRefs = (node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <GroupContext.Provider value={{ sizes, register, startDrag }}>
      <div
        ref={setRefs}
        className={cn("flex h-full w-full", className)}
        {...props}
      >
        {children}
      </div>
    </GroupContext.Provider>
  );
});
ResizablePanelGroup.displayName = "ResizablePanelGroup";

export interface ResizablePanelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  defaultSize?: number;
  minSize?: number;
}

const ResizablePanel = React.forwardRef<HTMLDivElement, ResizablePanelProps>(
  ({ className, defaultSize = 33, minSize = 10, children, ...props }, ref) => {
    const ctx = React.useContext(GroupContext);
    const id = React.useId();
    const [index, setIndex] = React.useState<number | null>(null);

    React.useEffect(() => {
      if (!ctx) return;
      setIndex(ctx.register({ id, defaultSize, minSize }));
      // register once per panel id
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const size =
      index !== null && ctx?.sizes[index] !== undefined
        ? ctx.sizes[index]
        : defaultSize;

    return (
      <div
        ref={ref}
        className={cn("min-w-0 overflow-hidden", className)}
        style={{ flexBasis: `${size}%`, flexGrow: 0, flexShrink: 1 }}
        {...props}
      >
        {children}
      </div>
    );
  },
);
ResizablePanel.displayName = "ResizablePanel";

export interface ResizableHandleProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Zero-based index of the panel to the LEFT of this handle. */
  handleIndex: number;
  withHandle?: boolean;
}

const ResizableHandle = React.forwardRef<HTMLDivElement, ResizableHandleProps>(
  ({ className, handleIndex, withHandle, ...props }, ref) => {
    const ctx = React.useContext(GroupContext);
    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation="vertical"
        onPointerDown={(e) => {
          e.preventDefault();
          ctx?.startDrag(handleIndex, e.clientX);
        }}
        className={cn(
          "relative flex w-px shrink-0 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          className,
        )}
        {...props}
      >
        {withHandle && (
          <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border bg-border">
            <GripVertical className="h-3 w-3" />
          </div>
        )}
      </div>
    );
  },
);
ResizableHandle.displayName = "ResizableHandle";

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
