import { Building2 } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Building2 className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-medium">{APP_NAME}</p>
        <p className="text-xs text-muted-foreground">Property management</p>
      </div>
    </div>
  );
}
