"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import {
  MAX_DOCUMENT_BYTES,
  PROPERTY_DOCUMENTS_BUCKET,
  SIGNED_URL_SECONDS,
  documentCategories,
} from "@/lib/documents/labels";
import {
  buildDocumentStoragePath,
  documentNameSchema,
  finishUploadSchema,
  firstIssue,
  isAllowedDocumentMime,
  isDocumentStoragePath,
  propertyIdFromDocumentPath,
  resolveContentType,
  startUploadSchema,
} from "@/lib/documents/schema";

type ActionError = { error: string };
type ReadyActor = Extract<Actor, { ok: true }>;

/**
 * Document inserts, updates and deletes are written to activity_log by the
 * documents_log_activity trigger. These actions do not insert a second log row.
 */

export async function startPropertyDocumentUpload(input: {
  propertyId: string;
  name: string;
  category: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ path: string; contentType: string } | ActionError> {
  const parsed = startUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const contentType = resolveContentType({
    name: parsed.data.fileName,
    type: parsed.data.contentType,
  });

  if (!contentType) {
    return { error: "Upload a PDF, JPG, PNG or WebP file." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findAccessibleProperty(actor, parsed.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const path = buildDocumentStoragePath(
    parsed.data.propertyId,
    parsed.data.fileName,
  );

  if (!isDocumentStoragePath(parsed.data.propertyId, path)) {
    return { error: "Could not upload the file." };
  }

  return { path, contentType };
}

export async function finishPropertyDocumentUpload(input: {
  propertyId: string;
  name: string;
  category: string;
  path: string;
}): Promise<ActionError | void> {
  const parsed = finishUploadSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (!isDocumentStoragePath(parsed.data.propertyId, parsed.data.path)) {
    return { error: "Could not save the document." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findAccessibleProperty(actor, parsed.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const stored = await readOwnFile(actor, parsed.data.path);

  if (!stored) {
    await discardUnlinked(actor, parsed.data.path);
    return { error: "Could not save the document." };
  }

  if (!isAllowedDocumentMime(stored.mimeType)) {
    await discardUnlinked(actor, parsed.data.path);
    return { error: "Upload a PDF, JPG, PNG or WebP file." };
  }

  if (stored.fileSize <= 0 || stored.fileSize > MAX_DOCUMENT_BYTES) {
    await discardUnlinked(actor, parsed.data.path);
    return { error: "Files must be 20 MB or smaller." };
  }

  const { error } = await actor.supabase.from("documents").insert({
    property_id: parsed.data.propertyId,
    category: parsed.data.category,
    name: parsed.data.name,
    file_path: parsed.data.path,
    file_size: stored.fileSize,
    mime_type: stored.mimeType,
    uploaded_by: actor.userId,
  });

  if (error) {
    console.error(error.message);

    if (error.code !== "23505") {
      await discardUnlinked(actor, parsed.data.path);
    }

    return { error: "Could not save the document." };
  }

  revalidateDocuments(parsed.data.propertyId);
}

export async function discardPropertyDocumentUpload(path: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(300).safeParse(path);

  if (!parsed.success) {
    return;
  }

  const propertyId = propertyIdFromDocumentPath(parsed.data);

  if (!propertyId || !isDocumentStoragePath(propertyId, parsed.data)) {
    return;
  }

  const actor = await getActor();

  if (!actor.ok) {
    return;
  }

  await discardUnlinked(actor, parsed.data);
}

export async function renamePropertyDocument(
  documentId: string,
  name: string,
): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(documentId);
  const parsedName = documentNameSchema.safeParse(name);

  if (!parsedId.success) {
    return { error: "Document not found." };
  }

  if (!parsedName.success) {
    return { error: firstIssue(parsedName.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadDocument(actor, parsedId.data);

  if (!existing) {
    return { error: "Document not found." };
  }

  if (existing.name === parsedName.data) {
    return;
  }

  const { data, error } = await actor.supabase
    .from("documents")
    .update({ name: parsedName.data })
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(error.message);
    }

    return { error: "Could not rename the document." };
  }

  revalidateDocuments(existing.property_id);
}

export async function updatePropertyDocumentCategory(
  documentId: string,
  category: string,
): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(documentId);
  const parsedCategory = z
    .enum(documentCategories, "Select a category.")
    .safeParse(category);

  if (!parsedId.success) {
    return { error: "Document not found." };
  }

  if (!parsedCategory.success) {
    return { error: firstIssue(parsedCategory.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadDocument(actor, parsedId.data);

  if (!existing) {
    return { error: "Document not found." };
  }

  if (existing.category === parsedCategory.data) {
    return;
  }

  const { data, error } = await actor.supabase
    .from("documents")
    .update({ category: parsedCategory.data })
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(error.message);
    }

    return { error: "Could not change the category." };
  }

  revalidateDocuments(existing.property_id);
}

export async function deletePropertyDocument(
  documentId: string,
): Promise<ActionError | { warning: string } | void> {
  const parsedId = z.uuid().safeParse(documentId);

  if (!parsedId.success) {
    return { error: "Document not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to delete documents." };
  }

  const existing = await loadDocument(actor, parsedId.data);

  if (!existing) {
    return { error: "Document not found." };
  }

  const { data, error } = await actor.supabase
    .from("documents")
    .delete()
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(error.message);
    }

    return { error: "Could not delete the document." };
  }

  const { error: storageError } = await actor.supabase.storage
    .from(PROPERTY_DOCUMENTS_BUCKET)
    .remove([existing.file_path]);

  revalidateDocuments(existing.property_id);

  if (storageError) {
    console.error(storageError.message);
    return {
      warning:
        "The document was deleted, but the file could not be removed from storage.",
    };
  }
}

export async function getPropertyDocumentUrl(
  documentId: string,
  mode: "view" | "download",
): Promise<{ url: string } | ActionError> {
  const parsedId = z.uuid().safeParse(documentId);
  const parsedMode = z.enum(["view", "download"]).safeParse(mode);

  if (!parsedId.success || !parsedMode.success) {
    return { error: "Document not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadDocument(actor, parsedId.data);

  if (!existing) {
    return { error: "Document not found." };
  }

  const signed =
    parsedMode.data === "download"
      ? await actor.supabase.storage
          .from(PROPERTY_DOCUMENTS_BUCKET)
          .createSignedUrl(existing.file_path, SIGNED_URL_SECONDS, {
            download: attachmentName(existing.name, existing.file_path),
          })
      : await actor.supabase.storage
          .from(PROPERTY_DOCUMENTS_BUCKET)
          .createSignedUrl(existing.file_path, SIGNED_URL_SECONDS);

  if (signed.error || !signed.data) {
    if (signed.error) {
      console.error(signed.error.message);
    }

    return { error: "Could not open the document." };
  }

  return { url: signed.data.signedUrl };
}

function revalidateDocuments(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/documents");
}

async function loadDocument(actor: ReadyActor, documentId: string) {
  const { data, error } = await actor.supabase
    .from("documents")
    .select("id, name, category, property_id, file_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function readOwnFile(
  actor: ReadyActor,
  path: string,
): Promise<{ fileSize: number; mimeType: string } | null> {
  const { data, error } = await actor.supabase.rpc("property_document_file", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
    return null;
  }

  const row = data[0];

  if (!row || !Number.isSafeInteger(row.file_size)) {
    return null;
  }

  const mimeType = row.mime_type.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalized = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  if (!normalized) {
    return null;
  }

  return { fileSize: row.file_size, mimeType: normalized };
}

async function discardUnlinked(actor: ReadyActor, path: string): Promise<void> {
  const { error } = await actor.supabase.rpc("remove_unlinked_property_document", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
  }
}

function attachmentName(name: string, filePath: string): string {
  const stored = filePath.split("/").pop() ?? "";
  const extension = stored.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase();
  const safe =
    name.replace(/[\r\n"/\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) ||
    "document";

  if (!extension || safe.toLowerCase().endsWith(`.${extension}`)) {
    return safe;
  }

  return `${safe}.${extension}`;
}

async function findAccessibleProperty(
  actor: ReadyActor,
  propertyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.isAdmin) {
    const { data, error } = await actor.supabase
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return { ok: false, message: "Could not upload the file." };
    }

    if (!data) {
      return { ok: false, message: "Property not found." };
    }

    return { ok: true };
  }

  const { data, error } = await actor.supabase
    .from("properties_basic")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not upload the file." };
  }

  if (!data?.id) {
    return { ok: false, message: "Property not found." };
  }

  return { ok: true };
}
