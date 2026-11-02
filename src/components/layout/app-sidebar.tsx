import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Separator } from "@/components/ui/separator";
import type { UserRole } from "@/lib/auth/session";

export function AppSidebar({ role }: { role: UserRole | null }) {
  return (
    <aside className="hidden w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
      <div className="px-4 py-4">
        <Brand />
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav role={role} />
      </div>
    </aside>
  );
}
