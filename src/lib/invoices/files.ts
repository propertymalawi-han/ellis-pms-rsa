import { getJohannesburgYear } from "@/lib/format";
import { MAX_INVOICE_FILE_BYTES, MAX_LOGO_BYTES } from "@/lib/invoices/labels";
import { sanitizeFileName } from "@/lib/documents/schema";

const propertyPathPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9]{4})\/([0-9]{13}-[A-Za-z0-9._-]{1,80})$/i;

const brandingPathPattern = /^branding\/[0-9]{13}-[A-Za-z0-9._-]{1,80}$/;

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

export function resolveInvoiceContentType(file: {
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

export function buildPropertyFilePath(
  propertyId: string,
  originalName: string,
  now = new Date(),
): string {
  const year = getJohannesburgYear(now);

  return `${propertyId.toLowerCase()}/${year}/${now.getTime()}-${sanitizeFileName(originalName)}`;
}

export function buildPdfPath(
  propertyId: string,
  invoiceNumber: string,
  createdAt: string,
): string {
  const created = new Date(createdAt);
  const year = getJohannesburgYear(created);
  const stamp = created.getTime();

  return `${propertyId.toLowerCase()}/${year}/${stamp}-${sanitizeFileName(`${invoiceNumber}.pdf`)}`;
}

export function isPropertyFilePath(propertyId: string, path: string): boolean {
  const match = propertyPathPattern.exec(path);

  return Boolean(match?.[1] && match[1].toLowerCase() === propertyId.toLowerCase());
}

export function isBrandingPath(path: string): boolean {
  return brandingPathPattern.test(path);
}

export function logoContentType(file: { name: string; type: string }): string | null {
  const contentType = resolveInvoiceContentType(file);

  if (contentType === "image/jpeg" || contentType === "image/png") {
    return contentType;
  }

  return null;
}

export function assertFileSize(size: number, maxBytes: number, label: string): string | null {
  if (size <= 0 || size > maxBytes) {
    return maxBytes === MAX_LOGO_BYTES
      ? "Logo must be 2 MB or smaller."
      : `${label} must be ${MAX_INVOICE_FILE_BYTES / (1024 * 1024)} MB or smaller.`;
  }

  return null;
}
