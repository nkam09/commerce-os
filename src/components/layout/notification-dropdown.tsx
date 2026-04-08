"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useNotificationStore, type AINotification } from "@/lib/stores/notification-store";

type NotificationDropdownProps = {
  onClose: () => void;
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, markRead, dismiss } =
    useNotificationStore();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function handleNotifClick(notif: AINotification) {
    markRead(notif.id);
    router.push(notif.page);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-80 animate-fade-in rounded-lg border border-border bg-card shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ai px-1 text-2xs font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="text-2xs font-medium text-ai transition hover:text-ai/80"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              className="group relative flex cursor-pointer gap-3 px-4 py-3 transition hover:bg-elevated"
              onClick={() => handleNotifClick(notif)}
            >
              {/* Unread dot */}
              <div className="flex flex-shrink-0 pt-1">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    notif.read ? "bg-transparent" : "bg-purple-500"
                  )}
                />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-xs",
                    notif.read ? "font-normal text-muted-foreground" : "font-semibold text-foreground"
                  )}
                >
                  {notif.title}
                </p>
                <p className="mt-0.5 text-2xs leading-relaxed text-tertiary">
                  {notif.message}
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">{timeAgo(notif.createdAt)}</p>
              </div>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismiss(notif.id);
                }}
                className="flex-shrink-0 self-start opacity-0 transition group-hover:opacity-100"
                title="Dismiss"
              >
                <svg viewBox="0 0 12 12" fill="currentColor" className="h-3 w-3 text-muted-foreground hover:text-foreground" aria-hidden="true">
                  <path d="M3.05 3.05a.5.5 0 0 1 .707 0L6 5.293l2.243-2.243a.5.5 0 0 1 .707.707L6.707 6l2.243 2.243a.5.5 0 0 1-.707.707L6 6.707 3.757 8.95a.5.5 0 0 1-.707-.707L5.293 6 3.05 3.757a.5.5 0 0 1 0-.707Z" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
