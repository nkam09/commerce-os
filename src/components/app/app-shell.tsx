"use client";

import { AppLayout } from "@/components/layout/app-layout";

type AppShellProps = {
  children: React.ReactNode;
};

/**
 * Root shell wrapper for the (app) layout group.
 * Delegates to AppLayout which provides: top nav, global controls, AI panel.
 */
export function AppShell({ children }: AppShellProps) {
  return <AppLayout>{children}</AppLayout>;
}
