"use client";

import Link from "next/link";
import { Building2, FileText, FolderOpen, Landmark, Plus, Receipt } from "lucide-react";

import type { UserRole } from "@/lib/auth/session";
import { canSeeDashboard } from "@/lib/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function QuickAdd({ role }: { role: UserRole | null }) {
  const items = canSeeDashboard(role)
    ? [
        { href: "/properties/new", label: "Property", icon: Building2 },
        { href: "/invoices/new", label: "Invoice", icon: FileText },
        { href: "/expenses", label: "Expense", icon: Receipt },
        { href: "/rates-levies", label: "Rates & levies", icon: Landmark },
      ]
    : [
        { href: "/expenses", label: "Expense", icon: Receipt },
        { href: "/rates-levies", label: "Rates & levies", icon: Landmark },
        { href: "/documents", label: "Document", icon: FolderOpen },
      ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-white text-sm font-medium text-sidebar shadow-sm outline-none transition-colors hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-white/40">
        <Plus className="size-4" />
        Quick add
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52" align="start">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href}>
                <Icon />
                {item.label}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
