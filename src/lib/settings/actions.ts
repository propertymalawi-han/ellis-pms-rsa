"use server";

import { revalidatePath } from "next/cache";

import { getActor } from "@/lib/auth/access";
import { MAX_LOGO_BYTES, INVOICES_BUCKET } from "@/lib/invoices/labels";
import { isBrandingPath, logoContentType } from "@/lib/invoices/files";
import { sanitizeFileName } from "@/lib/documents/schema";
import { businessSettingsSchema, settingsIssue } from "@/lib/settings/schema";
import type { BusinessSettingsValues } from "@/lib/settings/types";

type Failure = { error: string };

/**
 * Business settings updates are written to activity_log by a database trigger.
 */

export async function saveBusinessSettings(input: {
  values: BusinessSettingsValues;
  logoPath: string | null;
  removeLogo: boolean;
}): Promise<Failure | void> {
  const parsed = businessSettingsSchema.safeParse(input.values);

  if (!parsed.success) {
    return { error: settingsIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to do that." };
  }

  const { data: current, error: currentError } = await actor.supabase
    .from("business_settings")
    .select("logo_path")
    .eq("id", 1)
    .maybeSingle();

  if (currentError || !current) {
    return { error: "Could not save business settings." };
  }

  let logoPath = current.logo_path;

  if (input.logoPath) {
    if (!isBrandingPath(input.logoPath)) {
      return { error: "Could not save the logo." };
    }

    const stored = await actor.supabase.rpc("invoice_storage_file", {
      object_path: input.logoPath,
    });

    const row = stored.data?.[0];

    if (
      stored.error ||
      !row ||
      row.file_size === null ||
      row.file_size <= 0 ||
      row.file_size > MAX_LOGO_BYTES ||
      (row.mime_type !== "image/jpeg" && row.mime_type !== "image/png")
    ) {
      return { error: "Could not save the logo." };
    }

    logoPath = input.logoPath;
  } else if (input.removeLogo) {
    logoPath = null;
  }

  const { error } = await actor.supabase
    .from("business_settings")
    .update({
      business_name: parsed.data.businessName,
      address: parsed.data.address,
      phone: parsed.data.phone,
      email: parsed.data.email,
      bank_name: parsed.data.bankName,
      account_name: parsed.data.accountName,
      account_number: parsed.data.accountNumber,
      branch_code: parsed.data.branchCode,
      vat_number: parsed.data.vatNumber === "" ? null : parsed.data.vatNumber,
      logo_path: logoPath,
      payment_terms_days: Number(parsed.data.paymentTermsDays),
    })
    .eq("id", 1);

  if (error) {
    console.error(error.message);
    return { error: "Could not save business settings." };
  }

  if (current.logo_path && current.logo_path !== logoPath) {
    const removed = await actor.supabase.storage
      .from(INVOICES_BUCKET)
      .remove([current.logo_path]);

    if (removed.error) {
      console.error(removed.error.message);
    }
  }

  revalidatePath("/settings");
  revalidatePath("/invoices");
}

export async function startLogoUpload(input: {
  fileName: string;
  fileType: string;
  fileSize: number;
}): Promise<{ path: string; contentType: string } | Failure> {
  if (input.fileSize <= 0 || input.fileSize > MAX_LOGO_BYTES) {
    return { error: "Logo must be 2 MB or smaller." };
  }

  const contentType = logoContentType({
    name: input.fileName,
    type: input.fileType,
  });

  if (!contentType) {
    return { error: "Use a JPG or PNG logo." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to do that." };
  }

  const path = `branding/${Date.now()}-${sanitizeFileName(input.fileName)}`;

  if (!isBrandingPath(path)) {
    return { error: "Could not prepare the logo upload." };
  }

  return { path, contentType };
}

export async function discardLogoUpload(path: string): Promise<void> {
  if (!isBrandingPath(path)) {
    return;
  }

  const actor = await getActor();

  if (!actor.ok || !actor.isAdmin) {
    return;
  }

  const { error } = await actor.supabase.rpc("remove_unlinked_invoice_file", {
    object_path: path,
  });

  if (error) {
    console.error(error.message);
  }
}
