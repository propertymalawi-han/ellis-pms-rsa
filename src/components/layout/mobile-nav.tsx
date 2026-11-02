"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Brand } from "@/components/layout/brand";
import { QuickAdd } from "@/components/layout/quick-add";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { UserRole } from "@/lib/auth/session";

export function MobileNav({ role }: { role: UserRole | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&_[data-slot=sheet-close]]:text-sidebar-foreground [&_[data-slot=sheet-close]]:hover:bg-white/10"
      >
        <SheetHeader className="border-b border-white/10">
          <SheetTitle className="text-left text-sidebar-foreground">
            <Brand tone="inverse" />
          </SheetTitle>
        </SheetHeader>
        <div className="px-3">
          <QuickAdd role={role} />
        </div>
        <div className="py-3">
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
