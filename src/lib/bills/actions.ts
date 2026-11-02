"use server";

import { revalidatePath } from "next/cache";

import { revalidatePropertyTabs } from "@/lib/properties/revalidate";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import { moneyOrZero, prefillIssuerAndAccount } from "@/lib/bills/calc";
import {
  BILLS_BUCKET,
  MAX_BILL_FILE_BYTES,
  SIGNED_URL_SECONDS,
  type BillType,
} from "@/lib/bills/labels";
import type { BillFieldDefaults, BillFileKind } from "@/lib/bills/types";
import {
  billDefaultsSchema,
  billFileSchema,
  billFormSchema,
  billPaymentSchema,
  buildBillStoragePath,
  firstIssue,
  isBillStoragePath,
  mimeFromBillPath,
  propertyIdFromBillPath,
  resolveContentType,
  startBillUploadSchema,
  type BillFormValues,
  type BillPaymentValues,
} from "@/lib/bills/schema";
import { decimalColumn, MONEY } from "@/lib/money";

type ActionError = { error: string };
type ReadyActor = Extract<Actor, { ok: true }>;

/**
 * Bill inserts and updates are written to activity_log by
 * rates_levies_bills_log_activity. Saving a bill also creates or updates the
 * linked expenses. These actions do not insert a second log row.
 */

export async function startBillUpload(input: {
  propertyId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ path: string; contentType: string } | ActionError> {
  const parsed = startBillUploadSchema.safeParse(input);

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

  if (!property) {
    return { error: "Property not found." };
  }

  const path = buildBillStoragePath(parsed.data.propertyId, parsed.data.fileName);

  if (!isBillStoragePath(parsed.data.propertyId, path)) {
    return { error: "Could not upload the file." };
  }

  return { path, contentType };
}

export async function discardBillUpload(path: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(300).safeParse(path);

  if (!parsed.success) {
    return;
  }

  const propertyId = propertyIdFromBillPath(parsed.data);

  if (!propertyId || !isBillStoragePath(propertyId, parsed.data)) {
    return;
  }

  const actor = await getActor();

  if (!actor.ok) {
    return;
  }

  await discardUnlinked(actor, parsed.data);
}

export async function openUploadedBillFile(input: {
  propertyId: string;
  path: string;
}): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsed = billFileSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (!isBillStoragePath(parsed.data.propertyId, parsed.data.path)) {
    return { error: "Could not open the bill." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const stored = await readOwnFile(actor, parsed.data.path);

  if (!stored || !isAllowedMime(stored.mimeType)) {
    return { error: "Could not open the bill." };
  }

  return signBill(actor, parsed.data.path, stored.mimeType);
}

export async function openSavedBillFile(
  billId: string,
  kind: BillFileKind,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsedId = z.uuid().safeParse(billId);

  if (!parsedId.success || (kind !== "bill" && kind !== "proof")) {
    return { error: "Bill not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadBill(actor, parsedId.data);

  if (!existing) {
    return { error: "Bill not found." };
  }

  const path = kind === "bill" ? existing.file_path : existing.proof_file_path;

  if (!path) {
    return {
      error: kind === "bill" ? "No bill file is saved." : "No proof of payment is saved.",
    };
  }

  const mimeType = mimeFromBillPath(path);

  if (!mimeType) {
    return { error: "Could not open the file." };
  }

  return signBill(actor, path, mimeType);
}

export async function billFieldDefaults(input: {
  propertyId: string;
  billType: BillType;
  periodMonth: string;
}): Promise<BillFieldDefaults | ActionError> {
  const parsed = billDefaultsSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findProperty(actor, parsed.data.propertyId);

  if (!property) {
    return { error: "Property not found." };
  }

  const period = /^(\d{4})-(\d{2})$/.exec(parsed.data.periodMonth);
  let previous: { issuerName: string | null; accountNumber: string | null } | null = null;

  if (period) {
    const { data, error } = await actor.supabase
      .from("rates_levies_bills")
      .select("issuer_name, account_number")
      .eq("property_id", parsed.data.propertyId)
      .eq("bill_type", parsed.data.billType)
      .lt("period_month", `${parsed.data.periodMonth}-01`)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return { error: "Could not load the previous bill." };
    }

    if (data) {
      previous = {
        issuerName: data.issuer_name,
        accountNumber: data.account_number,
      };
    }
  }

  return prefillIssuerAndAccount(
    parsed.data.billType,
    {
      bodyCorporateName: property.body_corporate_name,
      municipalAccountNumber: property.municipal_account_number,
    },
    previous,
  );
}

export async function createBill(
  input: BillFormValues & { path: string | null },
): Promise<{ id: string } | ActionError> {
  return saveBill(input, null);
}

export async function updateBill(
  input: BillFormValues & { path: string | null; billId: string },
): Promise<{ id: string } | ActionError> {
  const parsedId = z.uuid().safeParse(input.billId);

  if (!parsedId.success) {
    return { error: "Bill not found." };
  }

  return saveBill(input, parsedId.data);
}

export async function deleteBill(billId: string): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(billId);

  if (!parsedId.success) {
    return { error: "Bill not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to delete bills." };
  }

  const { data, error } = await actor.supabase
    .from("rates_levies_bills")
    .select("id, property_id, file_path, proof_file_path")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (error) {
    return { error: saveMessage(error) };
  }

  if (!data) {
    return { error: "Bill not found." };
  }

  const removed = await actor.supabase
    .from("rates_levies_bills")
    .delete()
    .eq("id", parsedId.data)
    .select("id");

  if (removed.error) {
    return { error: saveMessage(removed.error) };
  }

  if (!removed.data[0]) {
    return { error: "Could not delete the bill." };
  }

  const files = [data.file_path, data.proof_file_path].filter((path): path is string => Boolean(path));

  if (files.length > 0) {
    const storage = await actor.supabase.storage.from(BILLS_BUCKET).remove(files);

    if (storage.error) {
      console.error(storage.error.message);
    }
  }

  revalidateBills(data.property_id);
}

export async function markBillPaid(
  billId: string,
  values: BillPaymentValues,
  proofPath: string | null,
): Promise<{ id: string } | ActionError> {
  const parsedId = z.uuid().safeParse(billId);
  const form = billPaymentSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Bill not found." };
  }

  if (!form.success) {
    return { error: firstIssue(form.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadBill(actor, parsedId.data);

  if (!existing) {
    return { error: "Bill not found." };
  }

  if (existing.paid_date) {
    return { error: "This bill is already paid." };
  }

  if (proofPath) {
    if (!isBillStoragePath(existing.property_id, proofPath)) {
      return { error: "Could not save the proof of payment." };
    }

    const stored = await readOwnFile(actor, proofPath);

    if (!stored || !isAllowedMime(stored.mimeType)) {
      return { error: "Upload a PDF, JPG, PNG or WebP file." };
    }

    if (stored.fileSize <= 0 || stored.fileSize > MAX_BILL_FILE_BYTES) {
      return { error: "Files must be 20 MB or smaller." };
    }
  }

  const amountPaid = moneyOrZero(form.data.amountPaid);

  if (!amountPaid) {
    return { error: "Enter the amount paid." };
  }

  const { error } = await actor.supabase
    .from("rates_levies_bills")
    .update({
      paid_date: form.data.paidDate,
      amount_paid: moneyColumn(amountPaid),
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

  revalidateBills(existing.property_id);
  return { id: existing.id };
}

async function saveBill(
  input: BillFormValues & { path: string | null },
  billId: string | null,
): Promise<{ id: string } | ActionError> {
  const form = billFormSchema.safeParse(input);

  if (!form.success) {
    return { error: firstIssue(form.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findProperty(actor, form.data.propertyId);

  if (!property) {
    return { error: "Property not found." };
  }

  const existing = billId ? await loadBill(actor, billId) : null;

  if (billId && (!existing || existing.property_id !== form.data.propertyId)) {
    return { error: "Bill not found." };
  }

  const path = input.path?.trim() ? input.path.trim() : null;

  if (path && !isBillStoragePath(form.data.propertyId, path)) {
    return { error: "Could not save the bill." };
  }

  const pathChanged = path !== (existing?.file_path ?? null);

  if (path && pathChanged) {
    const stored = await readOwnFile(actor, path);

    if (!stored || !isAllowedMime(stored.mimeType)) {
      return { error: "Upload a PDF, JPG, PNG or WebP file." };
    }

    if (stored.fileSize <= 0 || stored.fileSize > MAX_BILL_FILE_BYTES) {
      return { error: "Files must be 20 MB or smaller." };
    }
  }

  const row = billRow(form.data, path);

  if (!row) {
    return { error: "Check the amounts and try again." };
  }

  if (existing) {
    const { error } = await actor.supabase
      .from("rates_levies_bills")
      .update(row)
      .eq("id", existing.id);

    if (error) {
      console.error(error.message);
      return { error: saveMessage(error) };
    }

    if (pathChanged && existing.file_path) {
      await discardUnlinked(actor, existing.file_path);
    }

    revalidateBills(existing.property_id);
    return { id: existing.id };
  }

  const { data, error } = await actor.supabase
    .from("rates_levies_bills")
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

    return { error: error ? saveMessage(error) : "Could not save the bill." };
  }

  revalidateBills(form.data.propertyId);
  return { id: data.id };
}

function billRow(values: BillFormValues, path: string | null) {
  const levy = moneyOrZero(values.levy);
  const specialLevy = moneyOrZero(values.specialLevy);
  const municipalRates = moneyOrZero(values.municipalRates);
  const water = moneyOrZero(values.water);
  const electricity = moneyOrZero(values.electricity);
  const refuse = moneyOrZero(values.refuse);
  const sewerage = moneyOrZero(values.sewerage);
  const otherCharges = moneyOrZero(values.otherCharges);
  const arrears = moneyOrZero(values.arrears);
  const interest = moneyOrZero(values.interest);
  const totalDue = moneyOrZero(values.totalDue);

  if (
    !levy ||
    !specialLevy ||
    !municipalRates ||
    !water ||
    !electricity ||
    !refuse ||
    !sewerage ||
    !otherCharges ||
    !arrears ||
    !interest ||
    !totalDue
  ) {
    return null;
  }

  return {
    bill_type: values.billType,
    issuer_name: values.issuerName,
    account_number: values.accountNumber || null,
    period_month: `${values.periodMonth}-01`,
    statement_date: values.statementDate || null,
    due_date: values.dueDate,
    levy: moneyColumn(levy),
    special_levy: moneyColumn(specialLevy),
    municipal_rates: moneyColumn(municipalRates),
    water: moneyColumn(water),
    electricity: moneyColumn(electricity),
    refuse: moneyColumn(refuse),
    sewerage: moneyColumn(sewerage),
    other_charges: moneyColumn(otherCharges),
    arrears: moneyColumn(arrears),
    interest: moneyColumn(interest),
    total_due: moneyColumn(totalDue),
    file_path: path,
  };
}

function moneyColumn(canonical: string): number {
  const value = decimalColumn(canonical, MONEY);

  if (value === null) {
    throw new Error("Enter a number.");
  }

  return value;
}

function saveMessage(error: { code?: string; message: string }): string {
  const text = error.message;

  if (text.includes("rates_levies_bills_property_period_type_key")) {
    return "A bill of this type is already saved for that month.";
  }

  if (text.includes("already saved")) {
    return "That file is already saved.";
  }

  if (text.includes("Enter the issuer")) {
    return "Enter the issuer name.";
  }

  if (text.includes("Enter the amount paid")) {
    return "Enter the amount paid.";
  }

  if (text.includes("cannot be moved")) {
    return "This bill cannot be moved to another property.";
  }

  if (text.includes("too large")) {
    return "Those amounts are too large to save as expenses.";
  }

  if (text.includes("row-level security") || error.code === "42501") {
    return "You do not have access to this property.";
  }

  return "Could not save the bill.";
}

function revalidateBills(propertyId: string | null) {
  revalidatePath("/rates-levies");
  revalidatePath("/expenses");

  if (propertyId) {
    revalidatePropertyTabs(propertyId, ["rates-levies", "expenses", "overview"]);
  }
}

async function signBill(
  actor: ReadyActor,
  path: string,
  mimeType: string,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const signed = await actor.supabase.storage
    .from(BILLS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

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

async function loadBill(actor: ReadyActor, billId: string) {
  const { data, error } = await actor.supabase
    .from("rates_levies_bills")
    .select("id, property_id, file_path, proof_file_path, paid_date")
    .eq("id", billId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function findProperty(actor: ReadyActor, propertyId: string) {
  const query = actor.isAdmin
    ? actor.supabase
        .from("properties")
        .select("id, body_corporate_name, municipal_account_number")
        .eq("id", propertyId)
        .maybeSingle()
    : actor.supabase
        .from("properties_basic")
        .select("id, body_corporate_name, municipal_account_number")
        .eq("id", propertyId)
        .maybeSingle();

  const { data, error } = await query;

  if (error) {
    console.error(error.message);
    return null;
  }

  if (!data?.id) {
    return null;
  }

  return data;
}
