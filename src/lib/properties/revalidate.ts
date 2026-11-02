import { revalidatePath } from "next/cache";

import { propertyTabPath, type PropertyTabSegment } from "@/lib/properties/paths";

export function revalidatePropertyTab(propertyId: string, tab: PropertyTabSegment): void {
  revalidatePath(propertyTabPath(propertyId, tab));
}

export function revalidatePropertyTabs(
  propertyId: string,
  tabs: readonly PropertyTabSegment[],
): void {
  for (const tab of tabs) {
    revalidatePropertyTab(propertyId, tab);
  }
}

/** Header and every tab under this property. Use when the property row itself changes. */
export function revalidatePropertyLayout(propertyId: string): void {
  revalidatePath(`/properties/${propertyId}`, "layout");
}
