"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getActor, type Actor } from "@/lib/auth/access";
import { isLeaseStatus } from "@/lib/leases/labels";
import { firstIssue, leaseFormSchema } from "@/lib/leases/schema";
import type { LeaseFormValues } from "@/lib/leases/schema";
import { MONEY, PERCENT, decimalColumn } from "@/lib/money";
import type { TablesInsert } from "@/types/database";

type ActionError = { error: string };
type ReadyActor = Extract<Actor, { ok: true }>;

/**
 * Tenant and lease inserts, updates and deletes are written to activity_log
 * by database triggers. These actions do not insert a second log row.
 */

export async function createLease(values: LeaseFormValues): Promise<ActionError | void> {
  const parsed = leaseFormSchema.safeParse(values);

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (parsed.data.mode !== "create") {
    return { error: "Could not add the lease." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const property = await requireLongTermProperty(actor, parsed.data.propertyId);

  if (!property.ok) {
    return { error: property.message };
  }

  const tenant = await resolveTenant(actor, parsed.data);

  if ("error" in tenant) {
    return tenant;
  }

  const written = leaseRow(parsed.data, tenant.id, actor.userId, "active");

  if ("error" in written) {
    await removeCreatedTenant(actor, tenant);
    return written;
  }

  const { error } = await actor.supabase.from("leases").insert(written.row);

  if (error) {
    await removeCreatedTenant(actor, tenant);
    return { error: mutationMessage(error, "Could not add the lease.") };
  }

  revalidateProperty(parsed.data.propertyId);
}

export async function updateLease(
  leaseId: string,
  values: LeaseFormValues,
): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(leaseId);
  const parsed = leaseFormSchema.safeParse(values);

  if (!parsedId.success) {
    return { error: "Lease not found." };
  }

  if (!parsed.success) {
    return { error: firstIssue(parsed.error) };
  }

  if (parsed.data.mode !== "edit" || !isLeaseStatus(parsed.data.status)) {
    return { error: "Could not save the lease." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadLease(actor, parsedId.data);

  if (!existing || existing.property_id !== parsed.data.propertyId) {
    return { error: "Lease not found." };
  }

  const property = await requireLongTermProperty(actor, existing.property_id);

  if (!property.ok) {
    return { error: property.message };
  }

  const tenant = await resolveTenant(actor, parsed.data);

  if ("error" in tenant) {
    return tenant;
  }

  const written = leaseRow(
    parsed.data,
    tenant.id,
    existing.created_by,
    parsed.data.status,
  );

  if ("error" in written) {
    await removeCreatedTenant(actor, tenant);
    return written;
  }

  const { data, error } = await actor.supabase
    .from("leases")
    .update({
      tenant_id: written.row.tenant_id,
      start_date: written.row.start_date,
      end_date: written.row.end_date,
      monthly_rent: written.row.monthly_rent,
      deposit_amount: written.row.deposit_amount,
      deposit_held_by: written.row.deposit_held_by,
      escalation_percent: written.row.escalation_percent,
      escalation_date: written.row.escalation_date,
      rent_due_day: written.row.rent_due_day,
      status: written.row.status,
    })
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    await removeCreatedTenant(actor, tenant);

    if (error) {
      return { error: mutationMessage(error, "Could not save the lease.") };
    }

    return { error: "Lease not found." };
  }

  revalidateProperty(existing.property_id);
}

export async function endLease(leaseId: string): Promise<ActionError | void> {
  const parsedId = z.uuid().safeParse(leaseId);

  if (!parsedId.success) {
    return { error: "Lease not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { error: actor.message };
  }

  const existing = await loadLease(actor, parsedId.data);

  if (!existing) {
    return { error: "Lease not found." };
  }

  if (existing.status === "ended") {
    return { error: "This lease has already ended." };
  }

  const { data, error } = await actor.supabase
    .from("leases")
    .update({ status: "ended" })
    .eq("id", existing.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: mutationMessage(error, "Could not end the lease.") };
  }

  if (!data) {
    return { error: "This lease has already ended." };
  }

  revalidateProperty(existing.property_id);
}

function revalidateProperty(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
}

async function loadLease(actor: ReadyActor, leaseId: string) {
  const { data, error } = await actor.supabase
    .from("leases")
    .select("id, property_id, tenant_id, status, created_by")
    .eq("id", leaseId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

type ResolvedTenant = { id: string; created: boolean };

async function resolveTenant(
  actor: ReadyActor,
  values: LeaseFormValues,
): Promise<ResolvedTenant | ActionError> {
  if (values.tenantChoice === "new") {
    const { data, error } = await actor.supabase
      .from("tenants")
      .insert({
        full_name: values.fullName.trim(),
        id_number: blankToNull(values.idNumber),
        email: blankToNull(values.email),
        phone: blankToNull(values.phone),
        notes: blankToNull(values.notes),
        created_by: actor.userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: mutationMessage(error, "Could not add the tenant.") };
    }

    return { id: data.id, created: true };
  }

  const existing = await loadTenant(actor, values.tenantId);

  if (!existing) {
    return { error: "Tenant not found." };
  }

  if (values.mode === "create") {
    return { id: existing.id, created: false };
  }

  const next = {
    full_name: values.fullName.trim(),
    id_number: blankToNull(values.idNumber),
    email: blankToNull(values.email),
    phone: blankToNull(values.phone),
    notes: blankToNull(values.notes),
  };

  if (
    existing.full_name === next.full_name &&
    existing.id_number === next.id_number &&
    existing.email === next.email &&
    existing.phone === next.phone &&
    existing.notes === next.notes
  ) {
    return { id: existing.id, created: false };
  }

  const { data, error } = await actor.supabase
    .from("tenants")
    .update(next)
    .eq("id", existing.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: mutationMessage(error, "Could not save the tenant.") };
  }

  return { id: existing.id, created: false };
}

async function loadTenant(actor: ReadyActor, tenantId: string) {
  if (!z.uuid().safeParse(tenantId).success) {
    return null;
  }

  const { data, error } = await actor.supabase
    .from("tenants")
    .select("id, full_name, id_number, email, phone, notes")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return null;
  }

  return data;
}

async function removeCreatedTenant(
  actor: ReadyActor,
  tenant: ResolvedTenant,
): Promise<void> {
  if (!tenant.created) {
    return;
  }

  const { error } = await actor.supabase.from("tenants").delete().eq("id", tenant.id);

  if (error) {
    console.error(error.message);
  }
}

function leaseRow(
  values: LeaseFormValues,
  tenantId: string,
  createdBy: string | null,
  status: "active" | "ended",
): { row: TablesInsert<"leases"> } | ActionError {
  try {
    const monthlyRent = requiredMoney(values.monthlyRent);
    const depositAmount = requiredMoney(values.depositAmount);
    const rentDueDay = Number(values.rentDueDay);

    if (!Number.isInteger(rentDueDay) || rentDueDay < 1 || rentDueDay > 31) {
      return { error: "Enter a day from 1 to 31." };
    }

    return {
      row: {
        property_id: values.propertyId,
        tenant_id: tenantId,
        start_date: values.startDate,
        end_date: values.endDate,
        monthly_rent: monthlyRent,
        deposit_amount: depositAmount,
        deposit_held_by: values.depositHeldBy.trim(),
        escalation_percent: decimalColumn(values.escalationPercent, PERCENT),
        escalation_date: blankToNull(values.escalationDate),
        rent_due_day: rentDueDay,
        status,
        created_by: createdBy,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Check the lease and try again.",
    };
  }
}

function requiredMoney(raw: string): number {
  const value = decimalColumn(raw, MONEY);

  if (value === null) {
    throw new Error("Enter an amount.");
  }

  return value;
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
    if (error.message.includes("Tenant not found")) {
      return "Tenant not found.";
    }

    return "You do not have access to do that.";
  }

  if (error.code === "23505") {
    if (error.message.includes("id_number")) {
      return "A tenant with this ID number already exists.";
    }

    if (error.message.includes("one_active")) {
      return "This property already has an active lease.";
    }

    return "That record already exists.";
  }

  if (error.code === "23514") {
    if (error.message.includes("long-term")) {
      return "Leases can only be added to long-term properties.";
    }

    return "A value is outside the allowed range.";
  }

  if (error.code === "23503") {
    return "Tenant not found.";
  }

  return fallback;
}

async function requireLongTermProperty(
  actor: ReadyActor,
  propertyId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (actor.isAdmin) {
    const { data, error } = await actor.supabase
      .from("properties")
      .select("id, rental_type")
      .eq("id", propertyId)
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return { ok: false, message: "Could not save the lease." };
    }

    if (!data) {
      return { ok: false, message: "Property not found." };
    }

    if (data.rental_type !== "long_term") {
      return {
        ok: false,
        message: "Leases can only be added to long-term properties.",
      };
    }

    return { ok: true };
  }

  const { data, error } = await actor.supabase
    .from("properties_basic")
    .select("id, rental_type")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not save the lease." };
  }

  if (!data?.id) {
    return { ok: false, message: "Property not found." };
  }

  if (data.rental_type !== "long_term") {
    return {
      ok: false,
      message: "Leases can only be added to long-term properties.",
    };
  }

  return { ok: true };
}
