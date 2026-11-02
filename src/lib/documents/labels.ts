import { Constants, type Database } from "@/types/database";

export const documentCategories = Constants.public.Enums.document_category;

export type DocumentCategory = Database["public"]["Enums"]["document_category"];

export const documentCategoryLabels: Record<DocumentCategory, string> = {
  title_deed: "Title deed",
  lease: "Lease",
  insurance: "Insurance",
  compliance_certificate: "Compliance certificate",
  municipal: "Municipal",
  body_corporate: "Body corporate",
  statement: "Statement",
  invoice: "Invoice",
  photo: "Photo",
  other: "Other",
};

export const categoryFilterOptions = [
  { value: "all", label: "All categories" },
  ...documentCategories.map((category) => ({
    value: category,
    label: documentCategoryLabels[category],
  })),
];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (documentCategories as readonly string[]).includes(value);
}

export const PROPERTY_DOCUMENTS_BUCKET = "property-documents";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const SIGNED_URL_SECONDS = 10 * 60;

export const DOCUMENT_FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

export const DOCUMENT_FILE_RULES = "PDF, JPG, PNG or WebP. 20 MB maximum.";
