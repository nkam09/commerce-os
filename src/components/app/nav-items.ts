export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/overview", icon: "layout-dashboard" },
  { label: "Products", href: "/products", icon: "package" },
  { label: "Inventory", href: "/inventory", icon: "boxes" },
  { label: "Cash Flow", href: "/cash-flow", icon: "trending-up" },
  { label: "Purchase Orders", href: "/purchase-orders", icon: "shopping-cart" },
  { label: "Shipments", href: "/shipments", icon: "truck" },
  { label: "Expenses", href: "/expenses", icon: "receipt" },
  { label: "Projects", href: "/projects", icon: "clipboard-list" },
  { label: "Sync Health", href: "/sync-health", icon: "activity" },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Settings", href: "/settings", icon: "settings" },
];
