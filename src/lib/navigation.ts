import type { LucideIcon } from "lucide-react";

import type { UserRole } from "@/lib/auth/session";
import {
  Building2,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/properties", label: "Properties", icon: Building2 },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/income", label: "Income", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/rates-levies", label: "Rates & Levies", icon: Landmark },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Owners and partners. Property managers do not get the portfolio dashboard. */
export function canSeeDashboard(role: UserRole | null): boolean {
  return role === "owner" || role === "partner";
}

export function navItemsForRole(role: UserRole | null): NavItem[] {
  if (canSeeDashboard(role)) {
    return navItems;
  }

  return navItems.filter((item) => item.href !== "/dashboard");
}
