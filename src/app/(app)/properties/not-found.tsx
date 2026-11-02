import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PropertyNotFound() {
  return (
    <div>
      <PageHeader
        title="Property not found"
        description="This property is not available."
      />
      <Link href="/properties" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to properties
      </Link>
    </div>
  );
}
