import { z } from "zod";

import { MAX_DOCUMENT_BYTES, documentCategories } from "@/lib/documents/labels";
import { getJohannesburgYear } from "@/lib/format";

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const extensionTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const documentPathPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9]{4})\/([0-9]{13}-[A-Za-z0-9._-]{1,80})$/i;

export function isAllowedDocumentMime(mimeType: string): boolean {
  return allowedTypes.has(mimeType);
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the document and try again.";
}

export const documentNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a document name.")
  .max(200, "Name must be 200 characters or fewer.");

export const documentFieldsSchema = z.object({
  propertyId: z.uuid("Property not found."),
  name: documentNameSchema,
  category: z.enum(documentCategories, "Select a category."),
});

export const startUploadSchema = documentFieldsSchema.extend({
  fileName: z
    .string()
    .trim()
    .min(1, "Choose a file to upload.")
    .max(255, "Choose a file to upload."),
  fileSize: z
    .number("Choose a file to upload.")
    .int("Choose a file to upload.")
    .positive("Choose a file to upload.")
    .max(MAX_DOCUMENT_BYTES, "Files must be 20 MB or smaller."),
  contentType: z.string().trim().max(200),
});

export const finishUploadSchema = documentFieldsSchema.extend({
  path: z.string().trim().min(1, "Could not save the document.").max(300),
});

export function resolveContentType(file: {
  name: string;
  type: string;
}): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fromExtension = extensionTypes[extension] ?? null;
  const declared = file.type.trim().toLowerCase();
  const fromType = declared === "image/jpg" ? "image/jpeg" : declared;

  if (fromExtension && allowedTypes.has(fromType) && fromExtension !== fromType) {
    return null;
  }

  if (allowedTypes.has(fromType)) {
    return fromExtension ?? fromType;
  }

  if (fromType !== "" && fromType !== "application/octet-stream") {
    return null;
  }

  return fromExtension;
}

export function validateUploadFile(
  file: unknown,
): { ok: true; file: File; contentType: string } | { ok: false; message: string } {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, message: "Choose a file to upload." };
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: "Files must be 20 MB or smaller." };
  }

  const contentType = resolveContentType(file);

  if (!contentType) {
    return { ok: false, message: "Upload a PDF, JPG, PNG or WebP file." };
  }

  return { ok: true, file, contentType };
}

export function displayNameFromFile(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "";
  const withoutExtension = base.replace(/\.[^.]+$/, "").trim();
  return withoutExtension.slice(0, 200);
}

export function sanitizeFileName(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? "document";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return cleaned.length > 0 ? cleaned : "document";
}

export function buildDocumentStoragePath(
  propertyId: string,
  originalName: string,
  now = new Date(),
): string {
  const year = getJohannesburgYear(now);
  const stamp = now.getTime();
  return `${propertyId.toLowerCase()}/${year}/${stamp}-${sanitizeFileName(originalName)}`;
}

export function isDocumentStoragePath(propertyId: string, path: string): boolean {
  const match = documentPathPattern.exec(path);

  if (!match?.[1] || !match[2]) {
    return false;
  }

  if (match[1].toLowerCase() !== propertyId.toLowerCase()) {
    return false;
  }

  const year = Number(match[2]);
  const currentYear = getJohannesburgYear();
  return year === currentYear || year === currentYear - 1;
}

export function propertyIdFromDocumentPath(path: string): string | null {
  const match = documentPathPattern.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}
