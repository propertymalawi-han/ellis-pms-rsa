"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import { johannesburgDateOnly } from "@/lib/format";
import { MONEY, SIGNED_MONEY, parseDecimal } from "@/lib/money";
import { canonicalSigned, canonicalUnsigned } from "@/lib/statements/calc";
import { MAX_STATEMENT_BYTES, SIGNED_URL_SECONDS, STATEMENTS_BUCKET } from "@/lib/statements/labels";
import {
  firstIssue,
  isStatementStoragePath,
  mimeFromStatementPath,
  propertyIdFromStatementPath,
  resolveContentType,
  startStatementUploadSchema,
  statementFileSchema,
  statementFormSchema,
  buildStatementStoragePath,
  type StatementFormValues,
} from "@/lib/statements/schema";

type ActionError = { error: string };
type ReadyActor = Extract<Actor, { ok: true }>;

/**
 * Statement inserts and updates are written to activity_log by
 * owner_statements_log_activity. These actions do not insert a second log row.
 */

export async function startStatementUpload(input: {
  propertyId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}): Promise<{ path: string; contentType: string } | ActionError> {
  const parsed = startStatementUploadSchema.safeParse(input);

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

  const property = await findShortTermProperty(actor, parsed.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const path = buildStatementStoragePath(parsed.data.propertyId, parsed.data.fileName);

  if (!isStatementStoragePath(parsed.data.propertyId, path)) {
    return { error: "Could not upload the file." };
  }

  return { path, contentType };
}

export async function discardStatementUpload(path: string): Promise<void> {
  const parsed = z.string().trim().min(1).max(300).safeParse(path);

  if (!parsed.success) {
    return;
  }

  const propertyId = propertyIdFromStatementPath(parsed.data);

  if (!propertyId || !isStatementStoragePath(propertyId, parsed.data)) {
    return;
  }

  const actor = await getActor();

  if (!actor.ok) {
    return;
  }

  await discardUnlinked(actor, parsed.data);
}

export async function openUploadedStatement(input: {
  propertyId: string;
  path: string;
}): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsed = statementFileSchema.safeParse(input);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (!isStatementStoragePath(parsed.data.propertyId, parsed.data.path)) {
    return { error: "Could not open the statement." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const stored = await readOwnFile(actor, parsed.data.path);

  if (!stored) {
    return { error: "Could not open the statement." };
  }

  return signStatement(actor, parsed.data.path, stored.mimeType);
}

export async function openSavedStatement(
  statementId: string,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const parsedId = z.uuid().safeParse(statementId);

  if (!parsedId.success) {
    return { error: "Statement not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadStatement(actor, parsedId.data);

  if (!existing) {
    return { error: "Statement not found." };
  }

  const mimeType = mimeFromStatementPath(existing.file_path);

  if (!mimeType) {
    return { error: "Could not open the statement." };
  }

  return signStatement(actor, existing.file_path, mimeType);
}

export async function createOwnerStatement(
  input: StatementFormValues & { propertyId: string; path: string },
): Promise<{ id: string } | ActionError> {
  const saved = await saveStatement(input, null);

  return saved;
}

export async function updateOwnerStatement(
  input: StatementFormValues & { propertyId: string; path: string; statementId: string },
): Promise<ActionError | { id: string }> {
  const parsedId = z.uuid().safeParse(input.statementId);

  if (!parsedId.success) {
    return { error: "Statement not found." };
  }

  return saveStatement(input, parsedId.data);
}

export async function markStatementReceived(
  statementId: string,
): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(statementId);

  if (!parsedId.success) {
    return { error: "Statement not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadStatement(actor, parsedId.data);

  if (!existing) {
    return { error: "Statement not found." };
  }

  if (existing.status === "received") {
    return;
  }

  const { error } = await actor.supabase
    .from("owner_statements")
    .update({
      status: "received",
      payout_date: existing.payout_date ?? johannesburgDateOnly(),
    })
    .eq("id", existing.id);

  if (error) {
    console.error(error.message);
    return { error: "Could not mark the statement as received." };
  }

  revalidateStatements(existing.property_id);
}

async function saveStatement(
  input: StatementFormValues & { propertyId: string; path: string },
  statementId: string | null,
): Promise<{ id: string } | ActionError> {
  const form = statementFormSchema.safeParse(input);
  const file = statementFileSchema.safeParse(input);

  if (!form.success) {
    return { error: firstIssue(form.error) };
  }

  if (!file.success) {
    return { error: firstIssue(file.error) };
  }

  if (!isStatementStoragePath(file.data.propertyId, file.data.path)) {
    return { error: "Could not save the statement." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await findShortTermProperty(actor, file.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const existing = statementId ? await loadStatement(actor, statementId) : null;

  if (statementId && (!existing || existing.property_id !== file.data.propertyId)) {
    return { error: "Statement not found." };
  }

  const pathChanged = !existing || existing.file_path !== file.data.path;

  if (pathChanged) {
    const stored = await readOwnFile(actor, file.data.path);

    if (!stored || !isAllowedMime(stored.mimeType)) {
      return { error: "Upload a PDF, JPG, PNG or WebP file." };
    }

    if (stored.fileSize <= 0 || stored.fileSize > MAX_STATEMENT_BYTES) {
      return { error: "Files must be 20 MB or smaller." };
    }
  }

  const row = statementRow(form.data, file.data.path);

  if (!row) {
    return { error: "Check the amounts and try again." };
  }

  if (existing) {
    const { error } = await actor.supabase
      .from("owner_statements")
      .update(row)
      .eq("id", existing.id);

    if (error) {
      console.error(error.message);
      return { error: saveMessage(error) };
    }

    if (pathChanged) {
      await discardUnlinked(actor, existing.file_path);
    }

    revalidateStatements(file.data.propertyId);
    return { id: existing.id };
  }

  const { data, error } = await actor.supabase
    .from("owner_statements")
    .insert({
      ...row,
      property_id: file.data.propertyId,
      uploaded_by: actor.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error) {
      console.error(error.message);
    }

    return { error: error ? saveMessage(error) : "Could not save the statement." };
  }

  revalidateStatements(file.data.propertyId);
  return { id: data.id };
}

function statementRow(values: StatementFormValues, path: string) {
  const grossIncome = canonicalUnsigned(values.grossIncome);
  const platformFees = canonicalUnsigned(values.platformFees);
  const managementFee = canonicalUnsigned(values.managementFee);
  const cleaningFees = canonicalUnsigned(values.cleaningFees);
  const otherDeductions = canonicalUnsigned(values.otherDeductions);
  const vatOnFees = canonicalUnsigned(values.vatOnFees);
  const netPayout = canonicalSigned(values.netPayout);

  if (
    !grossIncome ||
    !platformFees ||
    !managementFee ||
    !cleaningFees ||
    !otherDeductions ||
    !vatOnFees ||
    !netPayout
  ) {
    return null;
  }

  return {
    period_month: `${values.periodMonth}-01`,
    statement_date: values.statementDate || null,
    manager_name: values.managerName || null,
    nights_booked: Number(values.nightsBooked),
    bookings_count: Number(values.bookingsCount),
    gross_income: moneyColumn(grossIncome),
    platform_fees: moneyColumn(platformFees),
    management_fee: moneyColumn(managementFee),
    cleaning_fees: moneyColumn(cleaningFees),
    other_deductions: moneyColumn(otherDeductions),
    vat_on_fees: moneyColumn(vatOnFees),
    net_payout: moneyColumn(netPayout),
    payout_date: values.payoutDate || null,
    status: values.status,
    file_path: path,
  };
}

function moneyColumn(canonical: string): number {
  const spec = canonical.startsWith("-") ? SIGNED_MONEY : MONEY;
  const parsed = parseDecimal(canonical, spec);

  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  return parsed.canonical as unknown as number;
}

function saveMessage(error: { code?: string; message: string; details?: string | null }): string {
  const text = `${error.message} ${error.details ?? ""}`;

  if (error.code === "23505" && text.includes("property_period")) {
    return "This property already has a statement for that month.";
  }

  if (text.includes("Nights booked")) {
    return "Nights booked cannot be more than the days in that month.";
  }

  if (text.includes("short-term")) {
    return "Owner's statements are for short-term rentals.";
  }

  return "Could not save the statement.";
}

function revalidateStatements(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/income");
}

async function loadStatement(actor: ReadyActor, statementId: string) {
  const { data, error } = await actor.supabase
    .from("owner_statements")
    .select("id, property_id, file_path, status, payout_date")
    .eq("id", statementId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function signStatement(
  actor: ReadyActor,
  path: string,
  mimeType: string,
): Promise<{ url: string; mimeType: string } | ActionError> {
  const signed = await actor.supabase.storage
    .from(STATEMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (signed.error || !signed.data) {
    if (signed.error) {
      console.error(signed.error.message);
    }

    return { error: "Could not open the statement." };
  }

  return { url: signed.data.signedUrl, mimeType };
}

async function readOwnFile(
  actor: ReadyActor,
  path: string,
): Promise<{ fileSize: number; mimeType: string } | null> {
  const { data, error } = await actor.supabase.rpc("statement_storage_file", {
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
  const { error } = await actor.supabase.rpc("remove_unlinked_statement", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
  }
}

async function findShortTermProperty(
  actor: ReadyActor,
  propertyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const query = actor.isAdmin
    ? actor.supabase.from("properties").select("id, rental_type").eq("id", propertyId).maybeSingle()
    : actor.supabase
        .from("properties_basic")
        .select("id, rental_type")
        .eq("id", propertyId)
        .maybeSingle();

  const { data, error } = await query;

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not save the statement." };
  }

  if (!data?.id) {
    return { ok: false, message: "Property not found." };
  }

  if (data.rental_type !== "short_term") {
    return { ok: false, message: "Owner's statements are for short-term rentals." };
  }

  return { ok: true };
}
