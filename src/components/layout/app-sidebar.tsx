import { Building2 } from "lucide-react";

import { QuickAdd } from "@/components/layout/quick-add";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { APP_NAME } from "@/lib/constants";
import type { UserRole } from "@/lib/auth/session";

export function AppSidebar({ role }: { role: UserRole | null }) {
  return (
    <aside className="hidden w-60 shrink-0 bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
      <div className="px-3 pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-sidebar">
            <Building2 className="size-4" />
          </div>
          <p className="truncate text-sm font-semibold text-white">{APP_NAME}</p>
        </div>
        <div className="mt-3">
          <QuickAdd role={role} />
        </div>
      </div>
      <div className="mt-4 flex-1 overflow-y-auto pb-4">
        <SidebarNav role={role} />
      </div>
    </aside>
  );
}
