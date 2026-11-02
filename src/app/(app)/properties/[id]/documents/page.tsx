import { notFound } from "next/navigation";

import { PropertyDocuments } from "@/components/properties/property-documents";
import { listPropertyDocuments } from "@/lib/documents/queries";
import { parsePage } from "@/lib/pagination";
import { getProperty } from "@/lib/properties/queries";

type DocumentsPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function PropertyDocumentsPage({
  params,
  searchParams,
}: DocumentsPageProps) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const [result, documents] = await Promise.all([
    getProperty(id),
    listPropertyDocuments(id, page),
  ]);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  if (!documents.ok) {
    return <p className="text-sm text-destructive">{documents.message}</p>;
  }

  return (
    <PropertyDocuments
      propertyId={id}
      documents={documents.documents}
      isAdmin={result.isAdmin}
      page={documents.page}
      pageCount={documents.pageCount}
    />
  );
}
