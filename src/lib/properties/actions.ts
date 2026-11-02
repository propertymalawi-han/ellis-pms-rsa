"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { toPropertyWrite } from "@/lib/properties/map";
import { firstIssue, propertyFormSchema } from "@/lib/properties/schema";
import type { PropertyFormValues } from "@/lib/properties/schema";

/**
 * Property inserts and updates are written to activity_log by the
 * properties_log_activity trigger. Archive is a status update, so it is
 * logged the same way. The app does not insert a second log row.
 */

export async function createProperty(
  values: PropertyFormValues,
): Promise<{ error: string } | void> {
  const parsed = propertyFormSchema.safeParse(values);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to add a property." };
  }

  const written = writeRow(parsed.data);

  if ("error" in written) {
    return written;
  }

  const { data, error } = await actor.supabase
    .from("properties")
    .insert({ ...written.row, created_by: actor.userId })
    .select("id")
    .single();

  if (error || !data) {
    return { error: mutationMessage(error, "Could not add the property.") };
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${data.id}`);
  redirect(`/properties/${data.id}`);
}

export async function updateProperty(
  id: string,
  values: PropertyFormValues,
): Promise<{ error: string } | void> {
  const parsedId = z.uuid().safeParse(id);
  const parsed = propertyFormSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Property not found." };
  }

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to edit this property." };
  }

  const written = writeRow(parsed.data);

  if ("error" in written) {
    return written;
  }

  const { data, error } = await actor.supabase
    .from("properties")
    .update(written.row)
    .eq("id", parsedId.data)
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: mutationMessage(error, "Could not save the property.") };
  }

  if (!data) {
    return { error: "Property not found." };
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${data.id}`);
  revalidatePath(`/properties/${data.id}/edit`);
  redirect(`/properties/${data.id}`);
}

export async function archiveProperty(
  id: string,
): Promise<{ error: string } | void> {
  const parsedId = z.uuid().safeParse(id);

  if (!parsedId.success) {
    return { error: "Property not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  if (!actor.isAdmin) {
    return { error: "You do not have access to archive this property." };
  }

  const { data: existing, error: readError } = await actor.supabase
    .from("properties")
    .select("id, status")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (readError) {
    return { error: mutationMessage(readError, "Could not archive the property.") };
  }

  if (!existing) {
    return { error: "Property not found." };
  }

  if (existing.status === "sold") {
    return { error: "This property is already marked as sold." };
  }

  const { data: updated, error } = await actor.supabase
    .from("properties")
    .update({ status: "sold" })
    .eq("id", existing.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: mutationMessage(error, "Could not archive the property.") };
  }

  if (!updated) {
    return { error: "This property is already marked as sold." };
  }

  revalidatePath("/properties");
  revalidatePath(`/properties/${existing.id}`);
  revalidatePath(`/properties/${existing.id}/edit`);
}

function writeRow(
  values: PropertyFormValues,
): { row: ReturnType<typeof toPropertyWrite> } | { error: string } {
  try {
    return { row: toPropertyWrite(values) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Check the form and try again.",
    };
  }
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
    return "You do not have access to do that.";
  }

  if (error.code === "23514") {
    if (error.message.includes("must stay a long-term rental")) {
      return "This property has leases, so it must stay a long-term rental.";
    }

    return "A value is outside the allowed range.";
  }

  return fallback;
}
