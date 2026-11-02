"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath, navItemsForRole } from "@/lib/navigation";
import type { UserRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export function SidebarNav({
  role,
  onNavigate,
}: {
  role: UserRole | null;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
