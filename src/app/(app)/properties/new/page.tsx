import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { getActor } from "@/lib/auth/access";
import { emptyPropertyFormValues } from "@/lib/properties/schema";

export const metadata = {
  title: "Add property",
};

export default async function NewPropertyPage() {
  const actor = await getActor();

  if (!actor.ok) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Add property"
          description="Add a long-term or short-term rental."
        />
        <p className="text-sm text-destructive">{actor.message}</p>
      </div>
    );
  }

  if (!actor.isAdmin) {
    redirect("/properties");
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Add property"
        description="Add a long-term or short-term rental."
      />
      <PropertyForm
        mode="create"
        defaultValues={emptyPropertyFormValues}
        cancelHref="/properties"
      />
    </div>
  );
}
