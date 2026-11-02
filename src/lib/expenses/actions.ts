"use server";

import { revalidatePath } from "next/cache";

import { revalidatePropertyTabs } from "@/lib/properties/revalidate";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import { canonicalMoney } from "@/lib/expenses/calc";
import {
  BILLS_BUCKET,
  MAX_EXPENSE_FILE_BYTES,
  SIGNED_URL_SECONDS,
  isExpenseRecurrence,
} from "@/lib/expenses/labels";
import type { ExpenseFileKind } from "@/lib/expenses/types";
import {
  buildExpenseStoragePath,
  expenseFileSchema,
  expenseFormSchema,
  firstIssue,
  isExpenseStoragePath,
  mimeFromExpensePath,
  paymentFormSchema,
  propertyIdFromExpensePath,
  resolveContentType,
  startExpenseUploadSchema,
  type ExpenseFormValues,
  type PaymentFormValues,
} from "@/lib/expenses/schema";
import { MONEY, parseDecimal } from "@/lib/money";

type ActionError = { error: string };
type ReadyActor = Extract<Actor, { ok: true }>;

/**
 * Expense inserts and updates are written to activity_log by expenses_log_activity.
 * These actions do not insert a second log row.
 */

export async function startExpenseUpload(input: {
  propertyId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ path: string; contentType: string } | ActionError> {
  const parsed = startExpenseUploadSchema.safeParse(input);

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

  const property = await findProperty(actor, parsed.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const path = buildExpenseStoragePath(parsed.data.propertyId, parsed.data.fileName);

  if (!isExpenseStoragePath(parsed.data.propertyId, path)) {
    return { error: "Could not upload the file." };
  }

  return { path, contentType };
}

export async function discardExpenseUpload(path: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(300).safeParse(path);

  if (!parsed.success) {
    return;
  }

  const propertyId = propertyIdFromExpensePath(parsed.data);

  if (!propertyId || !isExpenseStoragePath(propertyId, parsed.data)) {
    return;
  }

  const actor = await getActor();

  if (!actor.ok) {
    return;
  }

  await discardUnlinked(actor, parsed.data);
}

export async function openUploadedExpenseFile(input: {
  propertyId: string;
  path: string;
}): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsed = expenseFileSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (!isExpenseStoragePath(parsed.data.propertyId, parsed.data.path)) {
    return { error: "Could not open the invoice." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const stored = await readOwnFile(actor, parsed.data.path);

  if (!stored || !isAllowedMime(stored.mimeType)) {
    return { error: "Could not open the invoice." };
  }

  return signBill(actor, parsed.data.path, stored.mimeType);
}

export async function openSavedExpenseFile(
  expenseId: string,
  kind: ExpenseFileKind,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsedId = z.uuid().safeParse(expenseId);

  if (!parsedId.success || (kind !== "invoice" && kind !== "proof")) {
    return { error: "Expense not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadExpense(actor, parsedId.data);

  if (!existing) {
    return { error: "Expense not found." };
  }

  const path = kind === "invoice" ? existing.file_path : existing.proof_file_path;

  if (!path) {
    return { error: kind === "invoice" ? "No invoice file is saved." : "No proof of payment is saved." };
  }

  const mimeType = mimeFromExpensePath(path);

  if (!mimeType) {
    return { error: "Could not open the file." };
  }

  return signBill(actor, path, mimeType);
}

export async function createExpense(
  input: ExpenseFormValues & { path: string | null },
): Promise<{ id: string } | ActionError> {
  return saveExpense(input, null);
}

export async function updateExpense(
  input: ExpenseFormValues & { path: string | null; expenseId: string },
): Promise<{ id: string } | ActionError> {
  const parsedId = z.uuid().safeParse(input.expenseId);

  if (!parsedId.success) {
    return { error: "Expense not found." };
  }

  return saveExpense(input, parsedId.data);
}

export async function deleteExpense(expenseId: string): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(expenseId);

  if (!parsedId.success) {
    return { error: "Expense not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to delete expenses." };
  }

  const { data, error } = await actor.supabase
    .from("expenses")
    .select("id, property_id, rates_levies_bill_id, file_path, proof_file_path")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error) {
    return { error: saveMessage(error) };
  }

  if (!data) {
    return { error: "Expense not found." };
  }

  if (data.rates_levies_bill_id) {
    return {
      error: "This expense belongs to a rates and levies bill. Delete the bill to remove it.",
    };
  }

  const removed = await actor.supabase.from("expenses").delete().eq("id", parsedId.data).select("id");

  if (removed.error) {
    return { error: saveMessage(removed.error) };
  }

  if (!removed.data[0]) {
    return { error: "Could not delete the expense." };
  }

  const files = [data.file_path, data.proof_file_path].filter((path): path is string => Boolean(path));

  if (files.length > 0) {
    const storage = await actor.supabase.storage.from(BILLS_BUCKET).remove(files);

    if (storage.error) {
      console.error(storage.error.message);
    }
  }

  revalidateExpenses(data.property_id);
}

export async function markExpensePaid(
  expenseId: string,
  values: PaymentFormValues,
  proofPath: string | null,
): Promise<ActionError | { id: string }> {
  const parsedId = z.uuid().safeParse(expenseId);
  const form = paymentFormSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Expense not found." };
  }

  if (!form.success) {
    return { error: firstIssue(form.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadExpense(actor, parsedId.data);

  if (!existing) {
    return { error: "Expense not found." };
  }

  if (existing.paid_date) {
    return { error: "This expense is already paid." };
  }

  if (existing.rates_levies_bill_id) {
    return { error: "This expense is kept in step with its rates and levies bill." };
  }

  if (proofPath) {
    if (!isExpenseStoragePath(existing.property_id, proofPath)) {
      return { error: "Could not save the proof of payment." };
    }

    const stored = await readOwnFile(actor, proofPath);

    if (!stored || !isAllowedMime(stored.mimeType)) {
      return { error: "Upload a PDF, JPG, PNG or WebP file." };
    }

    if (stored.fileSize <= 0 || stored.fileSize > MAX_EXPENSE_FILE_BYTES) {
      return { error: "Files must be 20 MB or smaller." };
    }
  }

  const amountPaid = canonicalMoney(form.data.amountPaid);

  if (!amountPaid) {
    return { error: "Enter the amount paid." };
  }

  const { error } = await actor.supabase
    .from("expenses")
    .update({
      paid_date: form.data.paidDate,
      amount_paid: moneyColumn(amountPaid),
      payment_method: form.data.paymentMethod,
      proof_file_path: proofPath,
      status: "paid",
    })
    .eq("id", existing.id);

  if (error) {
    console.error(error.message);
    if (proofPath) {
      await discardUnlinked(actor, proofPath);
    }

    return { error: saveMessage(error) };
  }

  revalidateExpenses(existing.property_id);
  return { id: existing.id };
}

export async function generateRecurringExpenses(
  propertyId: string | null,
): Promise<{ created: number } | ActionError> {
  if (propertyId !== null && !z.uuid().safeParse(propertyId).success) {
    return { error: "Property not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (propertyId) {
    const property = await findProperty(actor, propertyId);

    if (!property.ok) {
      return { error: property.message };
    }
  }

  const { data, error } = await actor.supabase.rpc("generate_recurring_expenses", {
    p_property_id: propertyId ?? undefined,
  });

  if (error || typeof data !== "number") {
    if (error) {
      console.error(error.message);
    }

    return { error: "Could not generate recurring expenses." };
  }

  revalidateExpenses(propertyId);
  return { created: data };
}

async function saveExpense(
  input: ExpenseFormValues & { path: string | null },
  expenseId: string | null,
): Promise<{ id: string } | ActionError> {
  const form = expenseFormSchema.safeParse(input);

  if (!form.success) {
    return { error: firstIssue(form.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findProperty(actor, form.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const category = await findCategory(actor, form.data.categoryId);

  if (!category.ok) {
    return { error: category.message };
  }

  const existing = expenseId ? await loadExpense(actor, expenseId) : null;

  if (expenseId && (!existing || existing.property_id !== form.data.propertyId)) {
    return { error: "Expense not found." };
  }

  if (existing?.rates_levies_bill_id) {
    return { error: "This expense is kept in step with its rates and levies bill." };
  }

  const path = input.path?.trim() ? input.path.trim() : null;

  if (path && !isExpenseStoragePath(form.data.propertyId, path)) {
    return { error: "Could not save the invoice." };
  }

  const pathChanged = path !== (existing?.file_path ?? null);

  if (path && pathChanged) {
    const stored = await readOwnFile(actor, path);

    if (!stored || !isAllowedMime(stored.mimeType)) {
      return { error: "Upload a PDF, JPG, PNG or WebP file." };
    }

    if (stored.fileSize <= 0 || stored.fileSize > MAX_EXPENSE_FILE_BYTES) {
      return { error: "Files must be 20 MB or smaller." };
    }
  }

  const row = expenseRow(form.data, path);

  if (!row) {
    return { error: "Check the amounts and try again." };
  }

  if (existing) {
    const { error } = await actor.supabase.from("expenses").update(row).eq("id", existing.id);

    if (error) {
      console.error(error.message);
      return { error: saveMessage(error) };
    }

    if (pathChanged && existing.file_path) {
      await discardUnlinked(actor, existing.file_path);
    }

    revalidateExpenses(existing.property_id);
    return { id: existing.id };
  }

  const { data, error } = await actor.supabase
    .from("expenses")
    .insert({
      ...row,
      property_id: form.data.propertyId,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error) {
      console.error(error.message);
    }

    return { error: error ? saveMessage(error) : "Could not save the expense." };
  }

  revalidateExpenses(form.data.propertyId);
  return { id: data.id };
}

function expenseRow(values: ExpenseFormValues, path: string | null) {
  const amountExclVat = canonicalMoney(values.amountExclVat);
  const vatAmount = canonicalMoney(values.vatAmount);
  const total = canonicalMoney(values.total);

  if (!amountExclVat || !vatAmount || !total) {
    return null;
  }

  const recurrence = isExpenseRecurrence(values.recurrence) ? values.recurrence : null;

  if (values.recurring && !recurrence) {
    return null;
  }

  return {
    category_id: values.categoryId,
    supplier: values.supplier || null,
    description: values.description || null,
    invoice_number: values.invoiceNumber || null,
    invoice_date: values.invoiceDate || null,
    amount_excl_vat: moneyColumn(amountExclVat),
    vat_amount: moneyColumn(vatAmount),
    total: moneyColumn(total),
    due_date: values.dueDate,
    file_path: path,
    recurring: values.recurring && recurrence !== null,
    recurrence: values.recurring ? recurrence : null,
  };
}

function moneyColumn(canonical: string): number {
  const parsed = parseDecimal(canonical, MONEY);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.canonical as unknown as number;
}

function saveMessage(error: { code?: string; message: string }): string {
  const text = error.message;

  if (text.includes("Enter the amount paid")) {
    return "Enter the amount paid.";
  }

  if (text.includes("already saved")) {
    return "That file is already saved on another expense.";
  }

  if (text.includes("cannot be moved")) {
    return "This expense cannot be moved to another property.";
  }

  if (text.includes("kept in step")) {
    return "This expense is kept in step with its rates and levies bill.";
  }

  if (text.includes("row-level security") || error.code === "42501") {
    return "You do not have access to this property.";
  }

  if (error.code === "23514" && text.includes("total")) {
    return "Total must equal the amount excluding VAT plus VAT.";
  }

  return "Could not save the expense.";
}

function revalidateExpenses(propertyId: string | null) {
  revalidatePath("/expenses");

  if (propertyId) {
    revalidatePropertyTabs(propertyId, ["expenses", "overview"]);
  }
}

async function signBill(
  actor: ReadyActor,
  path: string,
  mimeType: string,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const signed = await actor.supabase.storage.from(BILLS_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);

  if (signed.error || !signed.data) {
    if (signed.error) {
      console.error(signed.error.message);
    }

    return { error: "Could not open the file." };
  }

  return { url: signed.data.signedUrl, mimeType };
}

async function readOwnFile(
  actor: ReadyActor,
  path: string,
): Promise<{ fileSize: number; mimeType: string } | null> {
  const { data, error } = await actor.supabase.rpc("expense_storage_file", {
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

function isAllowedMime(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/png" ||
    mimeType === "image/webp"
  );
}

async function discardUnlinked(actor: ReadyActor, path: string): Promise<void> {
  const { error } = await actor.supabase.rpc("remove_unlinked_expense_file", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
  }
}

async function loadExpense(actor: ReadyActor, expenseId: string) {
  const { data, error } = await actor.supabase
    .from("expenses")
    .select("id, property_id, file_path, proof_file_path, paid_date, rates_levies_bill_id")
    .eq("id", expenseId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function findProperty(
  actor: ReadyActor,
  propertyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const query = actor.isAdmin
    ? actor.supabase.from("properties").select("id").eq("id", propertyId).maybeSingle()
    : actor.supabase.from("properties_basic").select("id").eq("id", propertyId).maybeSingle();

  const { data, error } = await query;

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not save the expense." };
  }

  if (!data?.id) {
    return { ok: false, message: "Property not found." };
  }

  return { ok: true };
}

async function findCategory(
  actor: ReadyActor,
  categoryId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await actor.supabase
    .from("expense_categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not save the expense." };
  }

  if (!data) {
    return { ok: false, message: "Select a category." };
  }

  return { ok: true };
}
