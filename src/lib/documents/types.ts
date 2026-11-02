import type { DocumentCategory } from "@/lib/documents/labels";

export type DocumentListItem = {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  category: DocumentCategory;
  fileSize: number | null;
  createdAt: string;
  uploadedByName: string;
};

export type DocumentPropertyOption = {
  id: string;
  name: string;
};
