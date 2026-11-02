import { cache } from "react";
import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import type { PropertyDetail, PropertyListItem } from "@/lib/properties/types";
import type { Tables } from "@/types/database";

type PropertyRow = Tables<"properties">;
type BasicRow = Tables<"properties_basic">;

export type PropertyLoadResult =
  | { status: "ok"; isAdmin: boolean; property: PropertyDetail }
  | { status: "not_found" }
  | { status: "error"; message: string };

const basicColumns =
  "id, name, rental_type, property_type, address_line1, address_line2, suburb, city, province, postal_code, erf_number, unit_number, scheme_number, body_corporate_name, municipal_account_number, notes, status, created_at, updated_at";

export async function listProperties(): Promise<
  | { ok: true; isAdmin: boolean; properties: PropertyListItem[] }
  | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  if (actor.isAdmin) {
    const { data, error } = await actor.supabase
      .from("properties")
      .select(
        "id, name, suburb, city, rental_type, property_type, status, purchase_price, current_value",
      )
      .order("name", { ascending: true });

    if (error) {
      console.error(error.message);
      return { ok: false, message: "Could not load properties." };
    }

    return {
      ok: true,
      isAdmin: true,
      properties: data.map((row) => ({
        id: row.id,
        name: row.name,
        suburb: row.suburb,
        city: row.city,
        rentalType: row.rental_type,
        propertyType: row.property_type,
        status: row.status,
        purchasePrice: row.purchase_price,
        currentValue: row.current_value,
      })),
    };
  }

  const { data, error } = await actor.supabase
    .from("properties_basic")
    .select("id, name, suburb, city, rental_type, property_type, status")
    .order("name", { ascending: true });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load properties." };
  }

  return {
    ok: true,
    isAdmin: false,
    properties: data.flatMap((row) => {
      const item = mapBasicListItem(row);
      return item ? [item] : [];
    }),
  };
}

export const getProperty = cache(async function getProperty(id: string): Promise<PropertyLoadResult> {
  if (!z.uuid().safeParse(id).success) {
    return { status: "not_found" };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { status: "error", message: actor.message };
  }

  if (actor.isAdmin) {
    const { data, error } = await actor.supabase
      .from("properties")
      .select(
        "id, name, rental_type, property_type, address_line1, address_line2, suburb, city, province, postal_code, erf_number, unit_number, scheme_number, purchase_price, purchase_date, transfer_costs, improvement_costs, current_value, bond_bank, bond_amount, bond_monthly_payment, bond_interest_rate, body_corporate_name, municipal_account_number, notes, status, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error(error.message);
      return { status: "error", message: "Could not load this property." };
    }

    if (!data) {
      return { status: "not_found" };
    }

    return { status: "ok", isAdmin: true, property: mapFullProperty(data) };
  }

  const { data, error } = await actor.supabase
    .from("properties_basic")
    .select(basicColumns)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { status: "error", message: "Could not load this property." };
  }

  if (!data) {
    return { status: "not_found" };
  }

  const property = mapBasicProperty(data);

  if (!property) {
    return { status: "not_found" };
  }

  return { status: "ok", isAdmin: false, property };
});

function mapBasicListItem(
  row: Pick<
    BasicRow,
    "id" | "name" | "suburb" | "city" | "rental_type" | "property_type" | "status"
  >,
): PropertyListItem | null {
  if (!row.id || !row.name || !row.rental_type || !row.property_type || !row.status) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    suburb: row.suburb,
    city: row.city,
    rentalType: row.rental_type,
    propertyType: row.property_type,
    status: row.status,
    purchasePrice: null,
    currentValue: null,
  };
}

type SharedSource = {
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  province: PropertyDetail["province"];
  postal_code: string | null;
  erf_number: string | null;
  unit_number: string | null;
  scheme_number: string | null;
  body_corporate_name: string | null;
  municipal_account_number: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function mapShared(row: SharedSource) {
  return {
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    erfNumber: row.erf_number,
    unitNumber: row.unit_number,
    schemeNumber: row.scheme_number,
    bodyCorporateName: row.body_corporate_name,
    municipalAccountNumber: row.municipal_account_number,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBasicProperty(
  row: SharedSource & {
    id: string | null;
    name: string | null;
    rental_type: PropertyDetail["rentalType"] | null;
    property_type: PropertyDetail["propertyType"] | null;
    status: PropertyDetail["status"] | null;
  },
): PropertyDetail | null {
  if (!row.id || !row.name || !row.rental_type || !row.property_type || !row.status) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    rentalType: row.rental_type,
    propertyType: row.property_type,
    status: row.status,
    ...mapShared(row),
    finance: null,
  };
}

function mapFullProperty(
  row: SharedSource &
    Pick<
      PropertyRow,
      | "id"
      | "name"
      | "rental_type"
      | "property_type"
      | "status"
      | "purchase_price"
      | "purchase_date"
      | "transfer_costs"
      | "improvement_costs"
      | "current_value"
      | "bond_bank"
      | "bond_amount"
      | "bond_monthly_payment"
      | "bond_interest_rate"
    >,
): PropertyDetail {
  return {
    id: row.id,
    name: row.name,
    rentalType: row.rental_type,
    propertyType: row.property_type,
    status: row.status,
    ...mapShared(row),
    finance: {
      purchasePrice: row.purchase_price,
      purchaseDate: row.purchase_date,
      transferCosts: row.transfer_costs,
      improvementCosts: row.improvement_costs,
      currentValue: row.current_value,
      bondBank: row.bond_bank,
      bondAmount: row.bond_amount,
      bondMonthlyPayment: row.bond_monthly_payment,
      bondInterestRate: row.bond_interest_rate,
    },
  };
}
