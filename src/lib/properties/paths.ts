export const propertyTabSegments = [
  "overview",
  "tenants",
  "income",
  "expenses",
  "rates-levies",
  "documents",
] as const;

export type PropertyTabSegment = (typeof propertyTabSegments)[number];

const legacyTabs: Record<string, PropertyTabSegment> = {
  overview: "overview",
  tenants: "tenants",
  income: "income",
  expenses: "expenses",
  rates: "rates-levies",
  "rates-levies": "rates-levies",
  documents: "documents",
};

export function propertyTabPath(propertyId: string, tab: PropertyTabSegment): string {
  return `/properties/${propertyId}/${tab}`;
}

export function propertyTabFromQuery(tab: string | undefined): PropertyTabSegment {
  if (!tab) {
    return "overview";
  }

  return legacyTabs[tab] ?? "overview";
}
