"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { usePathname } from "next/navigation";

import type { SessionUser } from "@/lib/auth/session";
import { navItems } from "@/lib/navigation";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";

function pageTitle(pathname: string): string {
  const match = navItems.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
  );

  return match?.label ?? "Ellis Properties";
}

export function AppHeader({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();

  return (
    <header className="flex items-center gap-2 px-4 pt-4 sm:px-6 lg:px-8">
      <MobileNav role={user?.role ?? null} />
      <p className="text-sm font-semibold lg:hidden">{pageTitle(pathname)}</p>
      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Settings">
          <Link href="/settings">
            <Settings />
          </Link>
        </Button>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
