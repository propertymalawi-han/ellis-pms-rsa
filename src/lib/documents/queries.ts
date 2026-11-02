import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { isDocumentCategory } from "@/lib/documents/labels";
import { signDocumentPreviews } from "@/lib/documents/signing";
import type { DocumentListItem } from "@/lib/documents/types";
import { PAGE_SIZE, pageBounds, pageCountFor } from "@/lib/pagination";
import type { Tables } from "@/types/database";

const listColumns =
  "id, property_id, property_name, category, name, file_path, thumbnail_path, mime_type, file_size, created_at, uploaded_by_name";

type ListRow = Tables<"documents_list">;

export type DocumentPage = {
  ok: true;
  isAdmin: boolean;
  documents: DocumentListItem[];
  page: number;
  pageCount: number;
};

function mapDocument(
  row: ListRow,
  preview: { previewUrl: string | null; thumbnailUrl: string | null; previewExpiresAt: string },
): DocumentListItem | null {
  if (
    !row.id ||
    !row.property_id ||
    !row.property_name ||
    !row.name ||
    !row.category ||
    !row.created_at ||
    !row.file_path ||
    !isDocumentCategory(row.category)
  ) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: row.property_name,
    name: row.name,
    category: row.category,
    fileSize: row.file_size,
    createdAt: row.created_at,
    uploadedByName: row.uploaded_by_name?.trim() || "Unknown",
    mimeType: row.mime_type,
    previewUrl: preview.previewUrl,
    thumbnailUrl: preview.thumbnailUrl,
    previewExpiresAt: preview.previewExpiresAt,
  };
}

async function pageDocuments(
  rows: ListRow[],
  total: number | null,
  page: number,
  isAdmin: boolean,
  sign: Parameters<typeof signDocumentPreviews>[0],
): Promise<DocumentPage | { ok: false; message: string }> {
  const signable = rows.flatMap((row) => {
    if (!row.id || !row.file_path) {
      return [];
    }

    return [{ id: row.id, filePath: row.file_path, thumbnailPath: row.thumbnail_path }];
  });
  const previews = await signDocumentPreviews(sign, signable);
  const emptyPreview = {
    previewUrl: null,
    thumbnailUrl: null,
    previewExpiresAt: new Date(0).toISOString(),
  };

  return {
    ok: true,
    isAdmin,
    page,
    pageCount: pageCountFor(total ?? rows.length),
    documents: rows.flatMap((row) => {
      const preview = (row.id && previews.get(row.id)) || emptyPreview;
      const item = mapDocument(row, preview);
      return item ? [item] : [];
    }),
  };
}

export async function listPropertyDocuments(
  propertyId: string,
  page: number,
): Promise<DocumentPage | { ok: false; message: string }> {
  if (!z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load documents." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const bounds = pageBounds(page);
  const { data, error, count } = await actor.supabase
    .from("documents_list")
    .select(listColumns, { count: "exact" })
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .range(bounds.from, bounds.to);

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load documents." };
  }

  return pageDocuments(data, count, page, actor.isAdmin, actor.supabase);
}

export async function listAccessibleDocuments(
  page: number,
): Promise<DocumentPage | { ok: false; message: string }> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const bounds = pageBounds(page);
  const { data, error, count } = await actor.supabase
    .from("documents_list")
    .select(listColumns, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(bounds.from, bounds.to);

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load documents." };
  }

  return pageDocuments(data, count, page, actor.isAdmin, actor.supabase);
}

export { PAGE_SIZE };
