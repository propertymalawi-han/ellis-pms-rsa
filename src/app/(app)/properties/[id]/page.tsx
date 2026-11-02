import { redirect } from "next/navigation";

import { propertyTabFromQuery, propertyTabPath } from "@/lib/properties/paths";

type PropertyIndexProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function PropertyIndex({ params, searchParams }: PropertyIndexProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  redirect(propertyTabPath(id, propertyTabFromQuery(tab)));
}
