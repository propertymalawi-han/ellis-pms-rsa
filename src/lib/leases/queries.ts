import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { isLeaseStatus } from "@/lib/leases/labels";
import type { LeaseRecord, TenantRecord } from "@/lib/leases/types";
import { MONEY, PERCENT, parseDecimal } from "@/lib/money";
import type { DecimalSpec } from "@/lib/money";

const leaseSelect =
  "id, property_id, tenant_id, start_date, end_date, monthly_rent, deposit_amount, deposit_held_by, escalation_percent, escalation_date, rent_due_day, status, tenants(id, full_name, id_number, email, phone, notes)";

type TenantRow = {
  id: string;
  full_name: string;
  id_number: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export async function loadLeaseDesk(propertyId: string): Promise<
  | { ok: true; leases: LeaseRecord[]; tenants: TenantRecord[] }
  | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load leases." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const [leasesResult, tenantsResult] = await Promise.all([
    actor.supabase
      .from("leases")
      .select(leaseSelect)
      .eq("property_id", propertyId)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false }),
    actor.supabase
      .from("tenants")
      .select("id, full_name, id_number, email, phone, notes")
      .order("full_name", { ascending: true }),
  ]);

  if (leasesResult.error) {
    console.error(leasesResult.error.message);
    return { ok: false, message: "Could not load leases." };
  }

  if (tenantsResult.error) {
    console.error(tenantsResult.error.message);
    return { ok: false, message: "Could not load tenants." };
  }

  const leases = leasesResult.data.flatMap((row) => {
    const lease = mapLease(row);
    return lease ? [lease] : [];
  });

  return {
    ok: true,
    leases,
    tenants: tenantsResult.data.map(mapTenant),
  };
}

function mapTenant(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    idNumber: row.id_number,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
  };
}

function mapLease(row: {
  id: string;
  property_id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  monthly_rent: number | string;
  deposit_amount: number | string;
  deposit_held_by: string;
  escalation_percent: number | string | null;
  escalation_date: string | null;
  rent_due_day: number;
  status: string;
  tenants: TenantRow | TenantRow[] | null;
}): LeaseRecord | null {
  const tenantRow = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants;
  const monthlyRent = canonicalDecimal(row.monthly_rent, MONEY);
  const depositAmount = canonicalDecimal(row.deposit_amount, MONEY);
  const escalationPercent =
    row.escalation_percent === null
      ? null
      : canonicalDecimal(row.escalation_percent, PERCENT);

  if (
    !tenantRow ||
    !isLeaseStatus(row.status) ||
    !monthlyRent ||
    !depositAmount ||
    (row.escalation_percent !== null && !escalationPercent) ||
    !Number.isInteger(row.rent_due_day)
  ) {
    return null;
  }

  return {
    id: row.id,
    propertyId: row.property_id,
    tenantId: row.tenant_id,
    tenant: mapTenant(tenantRow),
    startDate: row.start_date,
    endDate: row.end_date,
    monthlyRent,
    depositAmount,
    depositHeldBy: row.deposit_held_by,
    escalationPercent,
    escalationDate: row.escalation_date,
    rentDueDay: row.rent_due_day,
    status: row.status,
  };
}

function canonicalDecimal(value: number | string, spec: DecimalSpec): string | null {
  const raw = typeof value === "number" ? value.toFixed(spec.scale) : value;
  const parsed = parseDecimal(raw, spec);
  return parsed.ok ? parsed.canonical : null;
}
