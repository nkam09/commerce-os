"use client";

import { UserButton } from "@clerk/nextjs";

type AppTopbarProps = {
  title?: string;
  actions?: React.ReactNode;
};

export function AppTopbar({ title, actions }: AppTopbarProps) {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        {title && (
          <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        )}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
