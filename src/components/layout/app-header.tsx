"use client";

import { usePathname } from "next/navigation";

import type { SessionUser } from "@/lib/auth/session";
import { navItems } from "@/lib/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";

function pageTitle(pathname: string): string {
  const match = navItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  return match?.label ?? "Ellis Properties";
}

export function AppHeader({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
      <MobileNav role={user?.role ?? null} />
      <h1 className="text-sm font-medium lg:hidden">{pageTitle(pathname)}</h1>
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </header>
  );
}
