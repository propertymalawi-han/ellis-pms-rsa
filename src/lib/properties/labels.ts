import { Constants, type Database } from "@/types/database";

export const rentalTypes = Constants.public.Enums.rental_type;
export const propertyTypes = Constants.public.Enums.property_type;
export const propertyStatuses = Constants.public.Enums.property_status;
export const provinces = Constants.public.Enums.sa_province;

export type RentalType = Database["public"]["Enums"]["rental_type"];
export type PropertyType = Database["public"]["Enums"]["property_type"];
export type PropertyStatus = Database["public"]["Enums"]["property_status"];
export type Province = Database["public"]["Enums"]["sa_province"];

export const rentalTypeLabels: Record<RentalType, string> = {
  long_term: "Long-term",
  short_term: "Short-term",
};

export const propertyTypeLabels: Record<PropertyType, string> = {
  freehold: "Freehold",
  sectional_title: "Sectional title",
};

export const propertyStatusLabels: Record<PropertyStatus, string> = {
  active: "Active",
  sold: "Sold",
};

export const provinceLabels: Record<Province, string> = {
  eastern_cape: "Eastern Cape",
  free_state: "Free State",
  gauteng: "Gauteng",
  kwazulu_natal: "KwaZulu-Natal",
  limpopo: "Limpopo",
  mpumalanga: "Mpumalanga",
  northern_cape: "Northern Cape",
  north_west: "North West",
  western_cape: "Western Cape",
};

export function optionList<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): { value: T; label: string }[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export function locationLabel(
  suburb: string | null,
  city: string | null,
): string | null {
  const parts = [suburb, city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

export function displayValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}
