import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { isDocumentCategory } from "@/lib/documents/labels";
import type { DocumentListItem } from "@/lib/documents/types";
import type { Tables } from "@/types/database";

const listColumns =
  "id, property_id, property_name, category, name, file_size, created_at, uploaded_by_name";

function mapDocument(row: Tables<"documents_list">): DocumentListItem | null {
  if (
    !row.id ||
    !row.property_id ||
    !row.property_name ||
    !row.name ||
    !row.category ||
    !row.created_at ||
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
  };
}

export async function listPropertyDocuments(
  propertyId: string,
): Promise<
  | { ok: true; documents: DocumentListItem[] }
  | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load documents." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("documents_list")
    .select(listColumns)
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load documents." };
  }

  return {
    ok: true,
    documents: data.flatMap((row) => {
      const item = mapDocument(row);
      return item ? [item] : [];
    }),
  };
}

export async function listAccessibleDocuments(): Promise<
  | { ok: true; isAdmin: boolean; documents: DocumentListItem[] }
  | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("documents_list")
    .select(listColumns)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load documents." };
  }

  return {
    ok: true,
    isAdmin: actor.isAdmin,
    documents: data.flatMap((row) => {
      const item = mapDocument(row);
      return item ? [item] : [];
    }),
  };
}
