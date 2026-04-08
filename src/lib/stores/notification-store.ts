"use client";

import { create } from "zustand";

export type AINotification = {
  id: string;
  title: string;
  message: string;
  page: string;
  read: boolean;
  createdAt: number;
};

interface NotificationState {
  notifications: AINotification[];
  unreadCount: number;
  addNotification: (n: Omit<AINotification, "id" | "read" | "createdAt">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
}

function computeUnread(notifications: AINotification[]): number {
  return notifications.filter((n) => !n.read).length;
}

const INITIAL_NOTIFICATIONS: AINotification[] = [
  {
    id: "notif-1",
    title: "Refund Spike Detected",
    message: "100-pack refund rate jumped to 10.71% — AI task created",
    page: "/projects",
    read: false,
    createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2h ago
  },
  {
    id: "notif-2",
    title: "ACOS Alert",
    message: "Bowl cover campaign at 47% ACOS — consider pausing",
    page: "/ppc",
    read: false,
    createdAt: Date.now() - 5 * 60 * 60 * 1000, // 5h ago
  },
  {
    id: "notif-3",
    title: "Restock Urgency",
    message: "50-pack has only 19 days of stock remaining",
    page: "/inventory",
    read: false,
    createdAt: Date.now() - 24 * 60 * 60 * 1000, // 1d ago
  },
];

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: INITIAL_NOTIFICATIONS,
  unreadCount: computeUnread(INITIAL_NOTIFICATIONS),

  addNotification: (n) =>
    set((state) => {
      const newNotif: AINotification = {
        ...n,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        read: false,
        createdAt: Date.now(),
      };
      const notifications = [newNotif, ...state.notifications];
      return { notifications, unreadCount: computeUnread(notifications) };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  markRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: computeUnread(notifications) };
    }),

  dismiss: (id) =>
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id);
      return { notifications, unreadCount: computeUnread(notifications) };
    }),
}));
