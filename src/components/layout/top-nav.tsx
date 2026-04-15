"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect, useCallback, Component, type ErrorInfo, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/lib/stores/ui-store";
import { useNotificationStore } from "@/lib/stores/notification-store";
import { NotificationDropdown } from "@/components/layout/notification-dropdown";
import { BrandSelector } from "@/components/layout/brand-selector";

const UserButton = dynamic(
  () => import("@clerk/nextjs").then((m) => m.UserButton),
  { ssr: false }
);

/** Swallows errors from Clerk components when no ClerkProvider is present (e.g. preview). */
class ClerkSafe extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(_: Error, __: ErrorInfo) { /* silently swallow */ }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-2xs font-bold text-muted-foreground">
          U
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Navigation structure ─────────────────────────────── */

type SubTab = { label: string; href: string; query?: string };

type NavTab = {
  label: string;
  href: string;
  matchPrefixes?: string[];
  children?: SubTab[];
};

const NAV_TABS: NavTab[] = [
  {
    label: "Dashboard",
    href: "/overview",
    matchPrefixes: ["/overview", "/command-center"],
    children: [
      { label: "Tiles", href: "/overview", query: "view=tiles" },
      { label: "Chart", href: "/overview", query: "view=chart" },
      { label: "P&L", href: "/overview", query: "view=pl" },
      { label: "Trends", href: "/overview", query: "view=trends" },
    ],
  },
  { label: "PPC", href: "/ppc", matchPrefixes: ["/ppc"] },
  { label: "Keywords", href: "/keywords", matchPrefixes: ["/keywords"] },
  {
    label: "Inventory",
    href: "/inventory",
    matchPrefixes: ["/inventory", "/reorder-queue"],
    children: [
      { label: "Planner", href: "/inventory" },
      { label: "Restock Forecasting", href: "/reorder-queue" },
    ],
  },
  { label: "Products", href: "/products", matchPrefixes: ["/products"] },
  { label: "Expenses", href: "/expenses", matchPrefixes: ["/expenses"] },
  { label: "Reports", href: "/reports", matchPrefixes: ["/reports"] },
  { label: "Cashflow", href: "/cash-flow", matchPrefixes: ["/cash-flow"] },
  { label: "Projects", href: "/projects", matchPrefixes: ["/projects"] },
];

function isTabActive(tab: NavTab, pathname: string) {
  if (tab.matchPrefixes) {
    return tab.matchPrefixes.some((p) =>
      p === "/" ? pathname === "/" : pathname.startsWith(p)
    );
  }
  return pathname.startsWith(tab.href);
}

/* ─── Component ──────────────────────────────────────────── */

export function TopNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme, toggleTheme, toggleAiPanel, aiPanelOpen } = useUIStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownTimeout = useRef<ReturnType<typeof setTimeout>>();
  const closeNotif = useCallback(() => setNotifOpen(false), []);

  /* Close mobile menu on navigation */
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, searchParams]);

  /* Lock body scroll when mobile menu is open */
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!openDropdown) return;
    const handle = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-nav-dropdown]")) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [openDropdown]);

  /* Find active tab for sub-tabs bar */
  const activeTab = NAV_TABS.find((t) => isTabActive(t, pathname));
  const showSubTabs = activeTab?.children && activeTab.children.length > 0;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-md">
        {/* ── Main nav row ───────────────────────────── */}
        <div className="flex h-14 items-center gap-1 px-4 md:px-6">
          {/* Hamburger – mobile only */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((p) => !p)}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-elevated hover:text-foreground md:hidden"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>

          {/* Logo */}
          <Link href="/overview" className="mr-6 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              CO
            </div>
            <span className="hidden text-sm font-bold tracking-tight text-foreground sm:inline">
              Commerce OS
            </span>
          </Link>

          {/* Center nav tabs – hidden on mobile */}
          <nav className="hidden items-center gap-0.5 md:flex">
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab, pathname);
              const hasDropdown = tab.children && tab.children.length > 0;

              if (hasDropdown) {
                return (
                  <div
                    key={tab.label}
                    data-nav-dropdown
                    className="relative"
                    onMouseEnter={() => {
                      clearTimeout(dropdownTimeout.current);
                      setOpenDropdown(tab.label);
                    }}
                    onMouseLeave={() => {
                      dropdownTimeout.current = setTimeout(() => setOpenDropdown(null), 150);
                    }}
                  >
                    <Link
                      href={tab.href}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                      )}
                    >
                      {tab.label}
                      <DropdownChevron />
                    </Link>
                    {openDropdown === tab.label && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-48 animate-fade-in rounded-lg border border-border bg-card py-1 shadow-xl">
                        {tab.children!.map((sub) => {
                          const subActive = sub.query
                            ? pathname === sub.href && searchParams.get("view") === sub.query.split("=")[1]
                            : pathname === sub.href && !sub.query;
                          const subHref = sub.query ? `${sub.href}?${sub.query}` : sub.href;
                          return (
                            <Link
                              key={sub.label}
                              href={subHref}
                              onClick={() => setOpenDropdown(null)}
                              className={cn(
                                "block px-3 py-2 text-xs transition hover:bg-elevated",
                                subActive
                                  ? "font-semibold text-primary"
                                  : "text-foreground"
                              )}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Brand filter */}
            <BrandSelector />

            {/* AI Chat toggle */}
            <button
              type="button"
              onClick={toggleAiPanel}
              aria-pressed={aiPanelOpen}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md transition",
                aiPanelOpen
                  ? "bg-ai/10 text-ai"
                  : "text-muted-foreground hover:bg-elevated hover:text-foreground"
              )}
              title="Toggle AI chat"
            >
              <SparkleIcon className="h-4 w-4" />
            </button>

            {/* Theme toggle – hidden on mobile (moved to mobile menu) */}
            <button
              type="button"
              onClick={toggleTheme}
              className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-elevated hover:text-foreground md:flex"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((p) => !p)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition",
                  notifOpen
                    ? "bg-elevated text-foreground"
                    : "text-muted-foreground hover:bg-elevated hover:text-foreground"
                )}
                title="Notifications"
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-purple-500" />
                )}
              </button>
              {notifOpen && <NotificationDropdown onClose={closeNotif} />}
            </div>

            {/* Account – hidden on mobile (moved to mobile menu) */}
            <div className="ml-1 hidden h-8 w-8 items-center justify-center rounded-md md:flex">
              <ClerkSafe>
                <UserButton afterSignOutUrl="/" />
              </ClerkSafe>
            </div>
          </div>
        </div>

        {/* ── Sub-tabs row (Dashboard / Inventory) – desktop only ── */}
        {showSubTabs && (
          <div className="hidden items-center gap-0.5 border-t border-border px-6 py-1.5 md:flex">
            {activeTab!.children!.map((sub) => {
              const subActive = sub.query
                ? pathname === sub.href && searchParams.get("view") === sub.query.split("=")[1]
                : pathname === sub.href && !searchParams.get("view");
              const subHref = sub.query ? `${sub.href}?${sub.query}` : sub.href;
              return (
                <Link
                  key={sub.label}
                  href={subHref}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition",
                    subActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {sub.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* ── Mobile menu overlay – OUTSIDE header to avoid sticky/fixed conflict on iOS ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-14 z-40 overflow-y-auto bg-card md:hidden">
          <nav className="flex flex-col px-4 py-4">
            {NAV_TABS.map((tab) => {
              const active = isTabActive(tab, pathname);
              const hasChildren = tab.children && tab.children.length > 0;
              return (
                <div key={tab.label}>
                  <Link
                    href={tab.href}
                    className={cn(
                      "flex items-center rounded-lg px-3 py-3 text-sm font-medium transition",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-elevated"
                    )}
                  >
                    {tab.label}
                  </Link>
                  {hasChildren && (
                    <div className="ml-4 flex flex-col border-l border-border pl-3">
                      {tab.children!.map((sub) => {
                        const subHref = sub.query ? `${sub.href}?${sub.query}` : sub.href;
                        const subActive = sub.query
                          ? pathname === sub.href && searchParams.get("view") === sub.query.split("=")[1]
                          : pathname === sub.href && !sub.query;
                        return (
                          <Link
                            key={sub.label}
                            href={subHref}
                            className={cn(
                              "rounded-md px-3 py-2.5 text-xs font-medium transition",
                              subActive
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {sub.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Divider */}
            <div className="my-3 border-t border-border" />

            {/* Theme toggle in mobile menu */}
            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground transition hover:bg-elevated"
            >
              {theme === "dark" ? <MoonIcon /> : <SunIcon />}
              <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
            </button>

            {/* Account in mobile menu */}
            <div className="flex items-center gap-3 rounded-lg px-3 py-3">
              <ClerkSafe>
                <UserButton afterSignOutUrl="/" />
              </ClerkSafe>
              <span className="text-sm text-muted-foreground">Account</span>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

/* ─── Icons ──────────────────────────────────────────────── */

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M2 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 4Zm0 4a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8Zm.5 3.5a.5.5 0 0 0 0 1h11a.5.5 0 0 0 0-1h-11Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function DropdownChevron() {
  return (
    <svg viewBox="0 0 12 12" fill="currentColor" className="h-2.5 w-2.5 opacity-60">
      <path d="M3.22 4.72a.75.75 0 0 1 1.06 0L6 6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-2.25 2.25a.75.75 0 0 1-1.06 0L3.22 5.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className}>
      <path d="M8 0a.5.5 0 0 1 .5.5v2.036a5.5 5.5 0 0 1 4.964 4.964H15.5a.5.5 0 0 1 0 1h-2.036a5.5 5.5 0 0 1-4.964 4.964V15.5a.5.5 0 0 1-1 0v-2.036A5.5 5.5 0 0 1 2.536 8.5H.5a.5.5 0 0 1 0-1h2.036A5.5 5.5 0 0 1 7.5 2.536V.5A.5.5 0 0 1 8 0Zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M6.2 1.058a.5.5 0 0 1 .109.546A6 6 0 0 0 14.396 9.69a.5.5 0 0 1 .654.654A7.001 7.001 0 0 1 5.656 1.168a.5.5 0 0 1 .544-.11Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M8 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 1Zm0 11a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 8 12Zm7-4a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1 0-1h1A.5.5 0 0 1 15 8ZM3.5 8a.5.5 0 0 1-.5.5H2a.5.5 0 0 1 0-1h1a.5.5 0 0 1 .5.5ZM13.07 2.93a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 1 1-.707-.707l.707-.707a.5.5 0 0 1 .707 0ZM4.343 11.657a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707-.707l.707-.707a.5.5 0 0 1 .707 0ZM13.07 13.07a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 .707-.707l.707.707a.5.5 0 0 1 0 .707ZM4.343 4.343a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 1 1 .707-.707l.707.707a.5.5 0 0 1 0 .707ZM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
      <path d="M8 1.918a5.085 5.085 0 0 0-4.075 2.037 5.085 5.085 0 0 0-.887 2.9c0 1.107-.28 2.373-.794 3.455-.252.531-.528.98-.83 1.314a.5.5 0 0 0 .377.83h10.418a.5.5 0 0 0 .377-.831c-.302-.333-.578-.782-.83-1.313-.514-1.082-.794-2.348-.794-3.455 0-1.077-.314-2.1-.887-2.9A5.085 5.085 0 0 0 8 1.918ZM6.146 14.2a.5.5 0 0 1 .708.042A1.87 1.87 0 0 0 8 14.8a1.87 1.87 0 0 0 1.146-.558.5.5 0 1 1 .75.666A2.87 2.87 0 0 1 8 15.8a2.87 2.87 0 0 1-1.896-.892.5.5 0 0 1 .042-.708Z" />
    </svg>
  );
}
