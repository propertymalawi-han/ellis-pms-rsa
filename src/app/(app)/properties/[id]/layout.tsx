import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PropertyFrame } from "@/components/properties/property-frame";
import { PageHeader } from "@/components/layout/page-header";
import { getProperty } from "@/lib/properties/queries";

type PropertyLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PropertyLayoutProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status !== "ok") {
    return { title: "Property" };
  }

  return { title: result.property.name };
}

export default async function PropertyLayout({ children, params }: PropertyLayoutProps) {
  const { id } = await params;
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <div>
        <PageHeader title="Property" description="Could not load this property." />
        <p className="text-sm text-destructive">{result.message}</p>
      </div>
    );
  }

  return (
    <PropertyFrame property={result.property} isAdmin={result.isAdmin}>
      {children}
    </PropertyFrame>
  );
}
