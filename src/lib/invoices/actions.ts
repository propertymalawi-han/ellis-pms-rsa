"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import { QUANTITY } from "@/lib/invoices/calc";
import {
  INVOICES_BUCKET,
  MAX_INVOICE_FILE_BYTES,
  PLACEHOLDER_INVOICE_NUMBER,
  SIGNED_URL_SECONDS,
} from "@/lib/invoices/labels";
import { renderInvoicePdf } from "@/lib/invoices/pdf";
import {
  buildPdfPath,
  buildPropertyFilePath,
  isPropertyFilePath,
  resolveInvoiceContentType,
} from "@/lib/invoices/files";
import { getInvoice } from "@/lib/invoices/queries";
import {
  firstIssue,
  invoiceFormSchema,
  paymentFormSchema,
  type InvoiceFormValues,
  type PaymentFormValues,
} from "@/lib/invoices/schema";
import { johannesburgYearMonth, monthBounds } from "@/lib/invoices/period";
import { MONEY, decimalColumn } from "@/lib/money";
import { getBusinessSettings } from "@/lib/settings/queries";
import type { Json } from "@/types/database";

type ReadyActor = Extract<Actor, { ok: true }>;
type Failure = { error: string };

/**
 * Invoice, line, and payment changes are written to activity_log by database
 * triggers. These actions do not insert a second log row.
 */

export async function createInvoice(
  values: InvoiceFormValues,
): Promise<{ id: string; warning?: string } | Failure> {
  const parsed = invoiceFormSchema.safeParse(values);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const lease = await loadLease(actor, parsed.data.leaseId);

  if (!lease) {
    return { error: "Lease not found." };
  }

  const { data, error } = await actor.supabase
    .from("invoices")
    .insert({
      invoice_number: PLACEHOLDER_INVOICE_NUMBER,
      property_id: lease.property_id,
      lease_id: lease.id,
      tenant_id: lease.tenant_id,
      issue_date: parsed.data.issueDate,
      due_date: parsed.data.dueDate,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      notes: blankToNull(parsed.data.notes),
      issued: false,
      created_by: actor.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: mutationMessage(error, "Could not create the invoice.") };
  }

  const lines = lineRows(data.id, parsed.data.lines);

  if (!lines.ok) {
    await actor.supabase.from("invoices").delete().eq("id", data.id);
    return { error: lines.error };
  }

  const inserted = await actor.supabase.from("invoice_items").insert(lines.rows);

  if (inserted.error) {
    await actor.supabase.from("invoices").delete().eq("id", data.id);
    return { error: mutationMessage(inserted.error, "Could not save the invoice lines.") };
  }

  revalidateInvoice(data.id, lease.property_id);
  const pdf = await saveInvoicePdf(actor, data.id);

  return pdf.ok ? { id: data.id } : { id: data.id, warning: pdf.error };
}

export async function updateInvoice(
  invoiceId: string,
  values: InvoiceFormValues,
): Promise<{ warning?: string } | Failure> {
  const parsedId = z.uuid().safeParse(invoiceId);
  const parsed = invoiceFormSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadInvoiceRow(actor, parsedId.data);

  if (!existing) {
    return { error: "Invoice not found." };
  }

  if (existing.lease_id !== parsed.data.leaseId) {
    return { error: "The lease on an invoice cannot be changed." };
  }

  const locked = Number(existing.amount_paid) > 0;

  if (!locked) {
    const payload = linePayload(parsed.data.lines);

    if ("error" in payload) {
      return payload;
    }

    const replaced = await actor.supabase.rpc("replace_invoice_lines", {
      p_invoice_id: parsedId.data,
      p_lines: payload.lines,
    });

    if (replaced.error) {
      return { error: mutationMessage(replaced.error, "Could not save the invoice lines.") };
    }
  }

  const { error } = await actor.supabase
    .from("invoices")
    .update({
      issue_date: parsed.data.issueDate,
      due_date: parsed.data.dueDate,
      period_start: parsed.data.periodStart,
      period_end: parsed.data.periodEnd,
      notes: blankToNull(parsed.data.notes),
    })
    .eq("id", parsedId.data);

  if (error) {
    return { error: mutationMessage(error, "Could not save the invoice.") };
  }

  revalidateInvoice(parsedId.data, existing.property_id);
  const pdf = await saveInvoicePdf(actor, parsedId.data);

  return pdf.ok ? {} : { warning: pdf.error };
}

export async function markInvoiceSent(invoiceId: string): Promise<Failure | void> {
  const parsedId = z.uuid().safeParse(invoiceId);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadInvoiceRow(actor, parsedId.data);

  if (!existing) {
    return { error: "Invoice not found." };
  }

  if (Number(existing.total) <= 0) {
    return { error: "Add invoice lines before marking it sent." };
  }

  const { error } = await actor.supabase
    .from("invoices")
    .update({ issued: true })
    .eq("id", parsedId.data)
    .eq("issued", false);

  if (error) {
    return { error: mutationMessage(error, "Could not mark the invoice as sent.") };
  }

  revalidateInvoice(parsedId.data, existing.property_id);
  await saveInvoicePdf(actor, parsedId.data);
}

export async function deleteInvoice(invoiceId: string): Promise<Failure | void> {
  const parsedId = z.uuid().safeParse(invoiceId);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadInvoiceRow(actor, parsedId.data);

  if (!existing) {
    return { error: "Invoice not found." };
  }

  if (existing.issued || Number(existing.amount_paid) > 0) {
    return { error: "Only an unpaid draft can be deleted." };
  }

  const { data, error } = await actor.supabase
    .from("invoices")
    .delete()
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: mutationMessage(error, "Could not delete the invoice.") };
  }

  if (existing.pdf_path) {
    await actor.supabase.storage.from(INVOICES_BUCKET).remove([existing.pdf_path]);
  }

  revalidateInvoice(parsedId.data, existing.property_id);
}

export async function generateMonthlyRentInvoices(): Promise<
  { created: number; skipped: number; pdfFailed: number } | Failure
> {
  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const { year, month } = johannesburgYearMonth();
  const bounds = monthBounds(year, month);
  const { data, error } = await actor.supabase.rpc("generate_monthly_rent_invoices", {
    p_period_start: bounds.start,
    p_period_end: bounds.end,
  });

  if (error) {
    return { error: mutationMessage(error, "Could not generate rent invoices.") };
  }

  const run = parseRun(data);

  if (!run) {
    return { error: "Could not generate rent invoices." };
  }

  let pdfFailed = 0;

  for (const invoiceId of run.ids) {
    const pdf = await saveInvoicePdf(actor, invoiceId);

    if (!pdf.ok) {
      pdfFailed += 1;
    }
  }

  revalidatePath("/invoices");
  revalidatePath("/properties", "layout");

  return { created: run.ids.length, skipped: run.skipped, pdfFailed };
}

export async function startProofUpload(input: {
  invoiceId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<{ path: string; contentType: string } | Failure> {
  const parsedId = z.uuid().safeParse(input.invoiceId);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  if (input.fileSize <= 0 || input.fileSize > MAX_INVOICE_FILE_BYTES) {
    return { error: "Proof of payment must be 20 MB or smaller." };
  }

  const contentType = resolveInvoiceContentType({
    name: input.fileName,
    type: input.fileType,
  });

  if (!contentType) {
    return { error: "Upload a PDF, JPG, PNG or WebP file." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const invoice = await loadInvoiceRow(actor, parsedId.data);

  if (!invoice) {
    return { error: "Invoice not found." };
  }

  const path = buildPropertyFilePath(invoice.property_id, input.fileName);

  if (!isPropertyFilePath(invoice.property_id, path)) {
    return { error: "Could not prepare the upload." };
  }

  return { path, contentType };
}

export async function discardUploadedInvoiceFile(path: string): Promise<void> {
  const actor = await getActor();

  if (!actor.ok) {
    return;
  }

  const { error } = await actor.supabase.rpc("remove_unlinked_invoice_file", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
  }
}

export async function recordPayment(
  invoiceId: string,
  values: PaymentFormValues,
  proofPath: string | null,
): Promise<{ warning?: string } | Failure> {
  const parsedId = z.uuid().safeParse(invoiceId);
  const parsed = paymentFormSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const invoice = await loadInvoiceRow(actor, parsedId.data);

  if (!invoice) {
    return { error: "Invoice not found." };
  }

  if (proofPath) {
    if (!isPropertyFilePath(invoice.property_id, proofPath)) {
      return { error: "Proof of payment does not belong to this property." };
    }

    const stored = await requireStoredFile(actor, proofPath, MAX_INVOICE_FILE_BYTES, [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

    if (!("ok" in stored)) {
      return stored;
    }
  }

  let amount: number;

  try {
    const written = decimalColumn(parsed.data.amount, MONEY);

    if (written === null) {
      return { error: "Enter the amount received." };
    }

    amount = written;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Enter the amount received.",
    };
  }

  const { error } = await actor.supabase.from("payments").insert({
    invoice_id: parsedId.data,
    amount,
    payment_date: parsed.data.paymentDate,
    method: parsed.data.method,
    reference: blankToNull(parsed.data.reference),
    proof_file_path: proofPath,
    created_by: actor.userId,
  });

  if (error) {
    return { error: mutationMessage(error, "Could not record the payment.") };
  }

  revalidateInvoice(parsedId.data, invoice.property_id);
  const pdf = await saveInvoicePdf(actor, parsedId.data);

  return pdf.ok ? {} : { warning: pdf.error };
}

export async function deletePayment(paymentId: string): Promise<Failure | void> {
  const parsedId = z.uuid().safeParse(paymentId);

  if (!parsedId.success) {
    return { error: "Payment not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to do that." };
  }

  const { data, error } = await actor.supabase
    .from("payments")
    .select("id, invoice_id, proof_file_path")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error || !data) {
    return { error: mutationMessage(error, "Payment not found.") };
  }

  const invoice = await loadInvoiceRow(actor, data.invoice_id);

  const removed = await actor.supabase.from("payments").delete().eq("id", parsedId.data);

  if (removed.error) {
    return { error: mutationMessage(removed.error, "Could not delete the payment.") };
  }

  if (data.proof_file_path) {
    await actor.supabase.storage.from(INVOICES_BUCKET).remove([data.proof_file_path]);
  }

  if (invoice) {
    revalidateInvoice(invoice.id, invoice.property_id);
    await saveInvoicePdf(actor, invoice.id);
  }
}

export async function openInvoicePdf(
  invoiceId: string,
): Promise<{ url: string } | Failure> {
  const parsedId = z.uuid().safeParse(invoiceId);

  if (!parsedId.success) {
    return { error: "Invoice not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const saved = await saveInvoicePdf(actor, parsedId.data);

  if (!saved.ok) {
    return { error: saved.error };
  }

  const invoice = await loadInvoiceRow(actor, parsedId.data);

  if (!invoice?.pdf_path) {
    return { error: "Could not open the invoice PDF." };
  }

  const signed = await actor.supabase.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(invoice.pdf_path, SIGNED_URL_SECONDS, {
      download: `${invoice.invoice_number}.pdf`,
    });

  if (signed.error || !signed.data) {
    if (signed.error) {
      console.error(signed.error.message);
    }

    return { error: "Could not open the invoice PDF." };
  }

  return { url: signed.data.signedUrl };
}

export async function openProof(paymentId: string): Promise<{ url: string } | Failure> {
  const parsedId = z.uuid().safeParse(paymentId);

  if (!parsedId.success) {
    return { error: "Payment not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const { data, error } = await actor.supabase
    .from("payments")
    .select("proof_file_path")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error || !data?.proof_file_path) {
    return { error: "Proof of payment not found." };
  }

  const signed = await actor.supabase.storage
    .from(INVOICES_BUCKET)
    .createSignedUrl(data.proof_file_path, SIGNED_URL_SECONDS);

  if (signed.error || !signed.data) {
    if (signed.error) {
      console.error(signed.error.message);
    }

    return { error: "Could not open the proof of payment." };
  }

  return { url: signed.data.signedUrl };
}

async function saveInvoicePdf(
  actor: ReadyActor,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await getInvoice(invoiceId);

  if (!loaded.ok) {
    return { ok: false, error: "Invoice saved, but the PDF could not be created." };
  }

  const settingsResult = await getBusinessSettings();
  const settings = settingsResult.ok
    ? settingsResult.settings
    : {
        businessName: "",
        address: "",
        phone: "",
        email: "",
        bankName: "",
        accountName: "",
        accountNumber: "",
        branchCode: "",
        vatNumber: null,
        logoPath: null,
        paymentTermsDays: 7,
      };
  const logoSrc = await logoDataUri(actor, settings.logoPath);

  let bytes: Buffer;

  try {
    bytes = await renderInvoicePdf(loaded.invoice, settings, logoSrc);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "PDF render failed");
    return { ok: false, error: "Invoice saved, but the PDF could not be created." };
  }

  const path =
    loaded.invoice.pdfPath ??
    buildPdfPath(
      loaded.invoice.propertyId,
      loaded.invoice.invoiceNumber,
      loaded.invoice.createdAt,
    );

  const uploaded = await actor.supabase.storage.from(INVOICES_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });

  if (uploaded.error) {
    console.error(uploaded.error.message);
    return { ok: false, error: "Invoice saved, but the PDF could not be saved." };
  }

  if (loaded.invoice.pdfPath !== path) {
    const { error } = await actor.supabase
      .from("invoices")
      .update({ pdf_path: path })
      .eq("id", invoiceId);

    if (error) {
      console.error(error.message);
      return { ok: false, error: "Invoice saved, but the PDF could not be saved." };
    }
  }

  return { ok: true };
}

async function logoDataUri(actor: ReadyActor, path: string | null): Promise<string | null> {
  if (!path) {
    return null;
  }

  const downloaded = await actor.supabase.storage.from(INVOICES_BUCKET).download(path);

  if (downloaded.error || !downloaded.data) {
    return null;
  }

  const bytes = Buffer.from(await downloaded.data.arrayBuffer());
  const mime = path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function loadLease(actor: ReadyActor, leaseId: string) {
  const { data, error } = await actor.supabase
    .from("leases")
    .select("id, property_id, tenant_id")
    .eq("id", leaseId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function loadInvoiceRow(actor: ReadyActor, invoiceId: string) {
  const { data, error } = await actor.supabase
    .from("invoices")
    .select(
      "id, invoice_number, property_id, lease_id, issued, total, amount_paid, pdf_path",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

function lineRows(
  invoiceId: string,
  lines: InvoiceFormValues["lines"],
):
  | {
      ok: true;
      rows: {
        invoice_id: string;
        description: string;
        quantity: number;
        unit_price: number;
        vat_applicable: boolean;
        position: number;
      }[];
    }
  | { ok: false; error: string } {
  try {
    return {
      ok: true,
      rows: lines.map((line, index) => ({
        invoice_id: invoiceId,
        description: line.description.trim(),
        quantity: requiredDecimal(line.quantity, QUANTITY),
        unit_price: requiredDecimal(line.unitPrice, MONEY),
        vat_applicable: line.vatApplicable,
        position: index,
      })),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Check the invoice lines.",
    };
  }
}

function linePayload(lines: InvoiceFormValues["lines"]): { lines: Json } | Failure {
  try {
    return {
      lines: lines.map((line) => ({
        description: line.description.trim(),
        quantity: canonical(line.quantity, QUANTITY),
        unit_price: canonical(line.unitPrice, MONEY),
        vat_applicable: line.vatApplicable,
      })),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Check the invoice lines.",
    };
  }
}

function requiredDecimal(raw: string, spec: typeof MONEY | typeof QUANTITY): number {
  const value = decimalColumn(raw, spec);

  if (value === null) {
    throw new Error("Check the invoice lines.");
  }

  return value;
}

function canonical(raw: string, spec: typeof MONEY | typeof QUANTITY): string {
  const value = decimalColumn(raw, spec);

  if (value === null) {
    throw new Error("Check the invoice lines.");
  }

  return value as unknown as string;
}

async function requireStoredFile(
  actor: ReadyActor,
  path: string,
  maxBytes: number,
  allowed: string[],
): Promise<{ ok: true } | Failure> {
  const { data, error } = await actor.supabase.rpc("invoice_storage_file", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
    return { error: "Could not confirm the uploaded file." };
  }

  const row = data[0];

  if (
    !row ||
    row.file_size === null ||
    row.file_size <= 0 ||
    row.file_size > maxBytes ||
    !allowed.includes(row.mime_type)
  ) {
    return { error: "Could not confirm the uploaded file." };
  }

  return { ok: true };
}

function parseRun(value: Json): { ids: string[]; skipped: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const ids = value.invoice_ids;
  const skipped = value.skipped;

  if (!Array.isArray(ids) || typeof skipped !== "number" || !Number.isInteger(skipped)) {
    return null;
  }

  if (!ids.every((id) => typeof id === "string")) {
    return null;
  }

  return { ids, skipped };
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function mutationMessage(
  error: { code?: string; message: string } | null,
  fallback: string,
): string {
  if (!error) {
    return fallback;
  }

  console.error(error.message);

  if (error.code === "42501") {
    if (error.message.includes("payments")) {
      return "This invoice has payments, so its lines cannot change.";
    }

    if (error.message.includes("draft")) {
      return "An invoice with payments cannot return to draft.";
    }

    return "You do not have access to do that.";
  }

  if (error.code === "23505") {
    if (error.message.includes("period") || error.message.includes("lease_period")) {
      return "This lease already has an invoice for that period.";
    }

    return "Could not save the invoice. Try again.";
  }

  if (error.code === "23514") {
    if (error.message.includes("balance") || error.message.includes("exceeds")) {
      return "That payment is more than the balance due.";
    }

    if (error.message.includes("30")) {
      return "An invoice can have at most 30 lines.";
    }

    if (error.message.includes("lines")) {
      return "Add invoice lines before recording a payment.";
    }

    return "A value is outside the allowed range.";
  }

  return fallback;
}

function revalidateInvoice(invoiceId: string, propertyId: string) {
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/invoices/${invoiceId}/edit`);
  revalidatePath(`/properties/${propertyId}`);
}
