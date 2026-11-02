import Link from "next/link";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PropertyBrowser } from "@/components/properties/property-browser";
import { buttonVariants } from "@/components/ui/button";
import { listProperties } from "@/lib/properties/queries";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Properties",
};

export default async function PropertiesPage() {
  const result = await listProperties();

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Long-term and short-term rentals."
        actions={
          result.ok && result.isAdmin ? (
            <Link href="/properties/new" className={cn(buttonVariants())}>
              <Plus />
              Add property
            </Link>
          ) : null
        }
      />
      {result.ok ? (
        <PropertyBrowser properties={result.properties} isAdmin={result.isAdmin} />
      ) : (
        <p className="text-sm text-destructive">{result.message}</p>
      )}
    </div>
  );
}
