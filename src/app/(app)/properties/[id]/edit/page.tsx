import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { PropertyForm } from "@/components/properties/property-form";
import { propertyToFormValues } from "@/lib/properties/map";
import { getProperty } from "@/lib/properties/queries";

type EditPropertyPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: EditPropertyPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status !== "ok") {
    return { title: "Edit property" };
  }

  return { title: `Edit ${result.property.name}` };
}

export default async function EditPropertyPage({ params }: EditPropertyPageProps) {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader
          title="Edit property"
          description="Update details, finance and status."
        />
        <p className="text-sm text-destructive">{result.message}</p>
      </div>
    );
  }

  if (!result.isAdmin || !result.property.finance) {
    redirect(`/properties/${id}`);
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={`Edit ${result.property.name}`}
        description="Update details, finance and status."
      />
      <PropertyForm
        mode="edit"
        propertyId={result.property.id}
        defaultValues={propertyToFormValues(result.property)}
        cancelHref={`/properties/${result.property.id}`}
      />
    </div>
  );
}
