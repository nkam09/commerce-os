"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import type { PMSpaceData } from "@/lib/services/pm-service";

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  orderDate: string;
};

type PMSidebarProps = {
  spaces: PMSpaceData[];
  selectedListId: string | null;
  selectedOrderId: string | null;
  ordersBySpace: Record<string, OrderSummary[]>;
  onSelectList: (listId: string) => void;
  onSelectOrder: (orderId: string, spaceId: string) => void;
  onCreateSpace: (name: string) => void;
  onCreateList: (name: string, spaceId: string) => void;
  onCreateOrder: (spaceId: string) => void;
  onDeleteSpace: (spaceId: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameSpace: (spaceId: string, name: string) => void;
  onRenameList: (listId: string, name: string) => void;
  onSelectSpace?: (spaceId: string) => void;
};

export function PMSidebar({
  spaces,
  selectedListId,
  selectedOrderId,
  ordersBySpace,
  onSelectList,
  onSelectOrder,
  onCreateSpace,
  onCreateList,
  onCreateOrder,
  onDeleteSpace,
  onDeleteList,
  onRenameSpace,
  onRenameList,
  onSelectSpace,
}: PMSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(
    () => new Set(spaces.map((s) => s.id))
  );
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [addingListForSpace, setAddingListForSpace] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [addingSpace, setAddingSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const toggleSpace = useCallback((spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        "border-r border-border bg-card flex-shrink-0 overflow-y-auto transition-all duration-200 flex flex-col",
        collapsed ? "w-0 overflow-hidden" : "w-60"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Projects</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
          title="Collapse sidebar"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      </div>

      {/* Expand button when collapsed — rendered outside the sidebar */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="absolute left-1 top-3 z-10 rounded p-1 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
          title="Expand sidebar"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      )}

      {/* Spaces list */}
      <div className="flex-1 py-2">
        {spaces.map((space) => {
          const isExpanded = expandedSpaces.has(space.id);
          return (
            <div key={space.id}>
              {/* Space header */}
              <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-elevated/50 transition">
                <button
                  type="button"
                  onClick={() => {
                    toggleSpace(space.id);
                    onSelectSpace?.(space.id);
                  }}
                  className="rounded p-0.5 hover:bg-elevated transition text-muted-foreground"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className={cn(
                      "h-3 w-3 transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  >
                    <path d="M6 4l4 4-4 4" />
                  </svg>
                </button>
                <div
                  className="h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: space.color }}
                />
                {renamingId === space.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim() && renameValue !== space.name) {
                        onRenameSpace(space.id, renameValue.trim());
                      }
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (renameValue.trim() && renameValue !== space.name) {
                          onRenameSpace(space.id, renameValue.trim());
                        }
                        setRenamingId(null);
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    autoFocus
                    className="text-xs font-medium text-foreground bg-elevated border border-border rounded px-1 outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0"
                  />
                ) : (
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {space.name}
                  </span>
                )}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingListForSpace(space.id);
                      setNewListName("");
                      setExpandedSpaces((prev) => new Set([...prev, space.id]));
                    }}
                    className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
                    title="Add list"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateOrder(space.id);
                      setExpandedSpaces((prev) => new Set([...prev, space.id]));
                    }}
                    className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
                    title="Add order"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
                      <rect x="3" y="2" width="10" height="12" rx="1" />
                      <path d="M6 6h4M6 9h4" />
                    </svg>
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen(menuOpen === space.id ? null : space.id)}
                      className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
                      title="More options"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                        <circle cx="4" cy="8" r="1.2" />
                        <circle cx="8" cy="8" r="1.2" />
                        <circle cx="12" cy="8" r="1.2" />
                      </svg>
                    </button>
                    {menuOpen === space.id && (
                      <SpaceMenu
                        onClose={() => setMenuOpen(null)}
                        onRename={() => {
                          setRenamingId(space.id);
                          setRenameValue(space.name);
                          setMenuOpen(null);
                        }}
                        onDelete={() => {
                          onDeleteSpace(space.id);
                          setMenuOpen(null);
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Lists under space */}
              {isExpanded && (
                <div className="ml-4">
                  {space.lists.map((list) => (
                    <div key={list.id} className="relative group">
                      {renamingId === list.id ? (
                        <div className="flex items-center gap-2 px-4 py-1.5">
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 flex-shrink-0 text-muted-foreground">
                            <path d="M2 4h12M2 8h12M2 12h8" />
                          </svg>
                          <input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim() && renameValue !== list.name) {
                                onRenameList(list.id, renameValue.trim());
                              }
                              setRenamingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (renameValue.trim() && renameValue !== list.name) {
                                  onRenameList(list.id, renameValue.trim());
                                }
                                setRenamingId(null);
                              } else if (e.key === "Escape") {
                                setRenamingId(null);
                              }
                            }}
                            autoFocus
                            className="text-xs text-foreground bg-elevated border border-border rounded px-1 outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectList(list.id)}
                          className={cn(
                            "flex items-center gap-2 w-full px-4 py-1.5 text-left transition rounded-r-md",
                            selectedListId === list.id
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-elevated/50"
                          )}
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 flex-shrink-0">
                            <path d="M2 4h12M2 8h12M2 12h8" />
                          </svg>
                          <span className="text-xs truncate flex-1">{list.name}</span>
                          <span className="text-2xs text-tertiary tabular-nums">{list.taskCount}</span>
                        </button>
                      )}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition">
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setMenuOpen(menuOpen === list.id ? null : list.id)}
                            className="rounded p-0.5 hover:bg-elevated text-muted-foreground hover:text-foreground transition"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <circle cx="4" cy="8" r="1.2" />
                              <circle cx="8" cy="8" r="1.2" />
                              <circle cx="12" cy="8" r="1.2" />
                            </svg>
                          </button>
                          {menuOpen === list.id && (
                            <ListMenu
                              onClose={() => setMenuOpen(null)}
                              onRename={() => {
                                setRenamingId(list.id);
                                setRenameValue(list.name);
                                setMenuOpen(null);
                              }}
                              onDelete={() => {
                                onDeleteList(list.id);
                                setMenuOpen(null);
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Orders under space */}
                  {(ordersBySpace[space.id] ?? []).length > 0 && (
                    <div className="mt-1 mb-1">
                      <div className="px-4 py-1 text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                        Orders
                        <span className="ml-1 text-tertiary tabular-nums">
                          {(ordersBySpace[space.id] ?? []).length}
                        </span>
                      </div>
                      {(ordersBySpace[space.id] ?? []).map((order) => (
                        <button
                          key={order.id}
                          type="button"
                          onClick={() => onSelectOrder(order.id, space.id)}
                          className={cn(
                            "flex items-center gap-2 w-full px-4 py-1.5 text-left transition rounded-r-md",
                            selectedOrderId === order.id
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-elevated/50"
                          )}
                        >
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 flex-shrink-0">
                            <rect x="3" y="2" width="10" height="12" rx="1" />
                            <path d="M6 6h4M6 9h4" />
                          </svg>
                          <span className="text-xs truncate flex-1">
                            {order.orderNumber.length > 15
                              ? order.orderNumber.slice(0, 15) + "..."
                              : order.orderNumber}
                          </span>
                          <StatusDot status={order.status} />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Inline new list input */}
                  {addingListForSpace === space.id && (
                    <form
                      className="flex items-center gap-2 px-4 py-1.5"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newListName.trim()) {
                          onCreateList(newListName.trim(), space.id);
                          setNewListName("");
                          setAddingListForSpace(null);
                        }
                      }}
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 flex-shrink-0 text-muted-foreground">
                        <path d="M2 4h12M2 8h12M2 12h8" />
                      </svg>
                      <input
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onBlur={() => {
                          if (!newListName.trim()) setAddingListForSpace(null);
                        }}
                        placeholder="List name..."
                        autoFocus
                        className="text-xs text-foreground bg-elevated border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-primary flex-1 min-w-0"
                      />
                    </form>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Space button / inline input */}
      <div className="px-3 py-3 border-t border-border">
        {addingSpace ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newSpaceName.trim()) {
                onCreateSpace(newSpaceName.trim());
                setNewSpaceName("");
                setAddingSpace(false);
              }
            }}
          >
            <input
              value={newSpaceName}
              onChange={(e) => setNewSpaceName(e.target.value)}
              onBlur={() => {
                if (!newSpaceName.trim()) setAddingSpace(false);
              }}
              placeholder="Space name..."
              autoFocus
              className="flex-1 rounded-md border border-border bg-elevated px-2.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={!newSpaceName.trim()}
              className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAddingSpace(true);
              setNewSpaceName("");
            }}
            className="flex items-center gap-2 w-full rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated transition"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add Space
          </button>
        )}
      </div>
    </div>
  );
}

function SpaceMenu({ onClose, onRename, onDelete }: { onClose: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-6 z-50 w-36 rounded-md border border-border bg-card shadow-lg py-1">
        <button
          type="button"
          onClick={onRename}
          className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-elevated transition"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-elevated transition"
        >
          Delete
        </button>
      </div>
    </>
  );
}

const STATUS_DOT_COLORS: Record<string, string> = {
  Pending: "bg-yellow-500",
  "In Production": "bg-blue-500",
  Shipped: "bg-purple-500",
  Delivered: "bg-green-500",
  Cancelled: "bg-red-500",
};

function StatusDot({ status }: { status: string }) {
  return (
    <div
      className={cn(
        "h-1.5 w-1.5 rounded-full flex-shrink-0",
        STATUS_DOT_COLORS[status] ?? "bg-muted-foreground"
      )}
      title={status}
    />
  );
}

function ListMenu({ onClose, onRename, onDelete }: { onClose: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-6 z-50 w-36 rounded-md border border-border bg-card shadow-lg py-1">
        <button
          type="button"
          onClick={onRename}
          className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-elevated transition"
        >
          Rename
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-elevated transition"
        >
          Delete
        </button>
      </div>
    </>
  );
}
