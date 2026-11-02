import { PageHeader } from "@/components/layout/page-header";
import { DocumentBrowser } from "@/components/documents/document-browser";
import { listAccessibleDocuments } from "@/lib/documents/queries";
import type { DocumentPropertyOption } from "@/lib/documents/types";
import { listProperties } from "@/lib/properties/queries";

export const metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const [documentsResult, propertiesResult] = await Promise.all([
    listAccessibleDocuments(),
    listProperties(),
  ]);

  if (!documentsResult.ok) {
    return (
      <div>
        <PageHeader
          title="Documents"
          description="Files stored on the properties you can access."
        />
        <p className="text-sm text-destructive">{documentsResult.message}</p>
      </div>
    );
  }

  const properties: DocumentPropertyOption[] = propertiesResult.ok
    ? propertiesResult.properties.map((property) => ({
        id: property.id,
        name: property.name,
      }))
    : uniqueProperties(documentsResult.documents);

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Files stored on the properties you can access."
      />
      <DocumentBrowser
        documents={documentsResult.documents}
        properties={properties}
        isAdmin={documentsResult.isAdmin}
      />
    </div>
  );
}

function uniqueProperties(
  documents: { propertyId: string; propertyName: string }[],
): DocumentPropertyOption[] {
  const byId = new Map<string, string>();

  for (const document of documents) {
    byId.set(document.propertyId, document.propertyName);
  }

  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, "en-ZA"));
}
