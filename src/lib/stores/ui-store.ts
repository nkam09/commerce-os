"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  /* Theme */
  theme: "dark" | "light";
  toggleTheme: () => void;

  /* AI Chat Panel */
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;

  /* Notifications panel */
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

function applyThemeToDOM(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.add("light");
  } else {
    html.classList.remove("light");
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        applyThemeToDOM(next);
        set({ theme: next });
      },

      aiPanelOpen: false,
      setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
      toggleAiPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),

      notificationsOpen: false,
      setNotificationsOpen: (open) => set({ notificationsOpen: open }),
    }),
    {
      name: "commerce-os-ui",
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeToDOM(state.theme);
      },
    }
  )
);
