import { Building2 } from "lucide-react";

import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Brand({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "inverse";
}) {
  const inverse = tone === "inverse";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-full",
          inverse ? "bg-white text-sidebar" : "bg-primary text-primary-foreground",
        )}
      >
        <Building2 className="size-4" />
      </div>
      <div className="leading-tight">
        <p className={cn("text-sm font-semibold", inverse && "text-white")}>{APP_NAME}</p>
        <p className={cn("text-xs", inverse ? "text-white/55" : "text-muted-foreground")}>
          Property management
        </p>
      </div>
    </div>
  );
}
