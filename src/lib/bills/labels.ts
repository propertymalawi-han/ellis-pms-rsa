import { Constants, type Database } from "@/types/database";

export const billTypes = Constants.public.Enums.bill_type;
export const billStatuses = Constants.public.Enums.bill_status;

export type BillType = Database["public"]["Enums"]["bill_type"];
export type BillStatus = Database["public"]["Enums"]["bill_status"];

export const billTypeLabels: Record<BillType, string> = {
  levy: "Levy",
  municipal: "Municipal",
  combined: "Combined",
};

export const billStatusLabels: Record<BillStatus, string> = {
  due: "Due",
  paid: "Paid",
  overdue: "Overdue",
};

export const BILLS_BUCKET = "bills";

export const MAX_BILL_FILE_BYTES = 20 * 1024 * 1024;

export const SIGNED_URL_SECONDS = 10 * 60;

/** More than this, and the typed lines are treated as not matching total due. */
export const TOTAL_TOLERANCE_CENTS = BigInt(500);

export function isBillType(value: string): value is BillType {
  return (billTypes as readonly string[]).includes(value);
}

export function isBillStatus(value: string): value is BillStatus {
  return (billStatuses as readonly string[]).includes(value);
}
