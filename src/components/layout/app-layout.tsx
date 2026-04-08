"use client";

import { Suspense } from "react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/lib/stores/ui-store";
import { TopNav } from "./top-nav";
import { AIChatPanel } from "./ai-chat-panel";

type AppLayoutProps = {
  children: React.ReactNode;
};

/**
 * Main application layout shell.
 * Spec §2: Top bar (sticky) + Main content + AI Chat slide-over.
 */
export function AppLayout({ children }: AppLayoutProps) {
  const aiPanelOpen = useUIStore((s) => s.aiPanelOpen);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header: nav + controls */}
      <Suspense>
        <TopNav />
      </Suspense>
      {/* Main content area */}
      <main
        className={cn(
          "px-3 py-3 md:px-6 md:py-5 transition-[margin] duration-300 overflow-x-hidden",
          aiPanelOpen && "lg:mr-[400px]"
        )}
      >
        {children}
      </main>

      {/* AI Chat slide-over */}
      <AIChatPanel />
    </div>
  );
}
