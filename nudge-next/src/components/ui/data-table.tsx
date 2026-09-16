"use client";

/**
 * DataTable — a lightweight, dependency-free data table built on the existing
 * shadcn `Table` primitive. Deliberately NOT @tanstack/react-table (not a
 * dependency); the column API is hand-rolled and intentionally small.
 *
 * Features:
 *   - column definitions (header, cell render, optional accessor + sortable)
 *   - client-side text search across searchable columns
 *   - client-side single-column sorting (click header to toggle asc/desc/none)
 *   - simple page-size pagination with prev/next + page indicator
 *   - loading skeleton, empty state, and optional row click handler
 *
 * It owns only presentation/interaction over an in-memory array of rows; data
 * fetching and mutations live in the feature layer. Used by Contacts / Team and
 * available to any CRUD screen needing a sortable, searchable list.
 */

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** A single column definition. */
export interface DataTableColumn<T> {
  /** Stable id (also the default sort key when `accessor` is omitted). */
  id: string;
  /** Header label or node. */
  header: React.ReactNode;
  /** Cell renderer. Receives the row. */
  cell: (row: T) => React.ReactNode;
  /**
   * Value accessor for sorting/searching. If omitted the column is not
   * sortable/searchable on its own (use `sortable`/`searchable` to opt-in with
   * a custom accessor).
   */
  accessor?: (row: T) => string | number | null | undefined;
  /** Allow clicking the header to sort by this column (needs `accessor`). */
  sortable?: boolean;
  /** Include this column's accessor value in the search filter. */
  searchable?: boolean;
  /** Optional className applied to header + body cells. */
  className?: string;
  /** Header-only className (e.g. text-right, w-10). */
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Stable React key for a row. */
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Number of skeleton rows while loading. */
  skeletonRows?: number;
  /** Search box placeholder; omit to hide the search box. */
  searchPlaceholder?: string;
  /** Rows per page; <=0 disables pagination. */
  pageSize?: number;
  /** Empty-state node (when not loading and there are zero rows). */
  empty?: React.ReactNode;
  /** Optional row click handler. */
  onRowClick?: (row: T) => void;
  /** Extra toolbar content rendered to the right of the search box. */
  toolbar?: React.ReactNode;
  className?: string;
}

type SortState = { id: string; dir: "asc" | "desc" } | null;

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return 0;
  if (an) return 1; // empties sort last
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 6,
  searchPlaceholder,
  pageSize = 25,
  empty,
  onRowClick,
  toolbar,
  className,
}: DataTableProps<T>) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortState>(null);
  const [page, setPage] = React.useState(0);

  const searchCols = React.useMemo(
    () => columns.filter((c) => c.searchable && c.accessor),
    [columns],
  );

  // Filter (client-side, across searchable columns).
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || searchCols.length === 0) return data;
    return data.filter((row) =>
      searchCols.some((c) => {
        const v = c.accessor!(row);
        return v !== null && v !== undefined && String(v).toLowerCase().includes(q);
      }),
    );
  }, [data, query, searchCols]);

  // Sort (client-side, single column).
  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.accessor) return filtered;
    const acc = col.accessor;
    const copy = [...filtered];
    copy.sort((ra, rb) => {
      const cmp = compareValues(acc(ra), acc(rb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sort, columns]);

  // Reset to first page when the result set shrinks past the current page.
  const usePaging = pageSize > 0;
  const pageCount = usePaging ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  React.useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [page, pageCount]);

  const visible = React.useMemo(() => {
    if (!usePaging) return sorted;
    const start = page * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, usePaging, page, pageSize]);

  const toggleSort = (id: string) => {
    setSort((prev) => {
      if (!prev || prev.id !== id) return { id, dir: "asc" };
      if (prev.dir === "asc") return { id, dir: "desc" };
      return null; // third click clears
    });
  };

  const showToolbar = !!searchPlaceholder || !!toolbar;

  return (
    <div className={cn("space-y-3", className)}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="pl-9"
              />
            </div>
          )}
          {toolbar && <div className="ml-auto flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => {
                const isSorted = sort?.id === col.id;
                const canSort = col.sortable && !!col.accessor;
                return (
                  <TableHead
                    key={col.id}
                    className={cn(col.className, col.headerClassName)}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.id)}
                        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left font-medium outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {col.header}
                        {isSorted ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      <Skeleton className="h-4 w-full max-w-[12rem]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 p-0">
                  {empty ?? (
                    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                      No results.
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                >
                  {columns.map((col) => (
                    <TableCell key={col.id} className={col.className}>
                      {col.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {usePaging && !loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground tabular-nums">
            {sorted.length === 0
              ? "0 results"
              : `${page * pageSize + 1}–${Math.min(
                  (page + 1) * pageSize,
                  sorted.length,
                )} of ${sorted.length.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              Page {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
