import { Constants, type Database } from "@/types/database";

export const invoiceStatuses = Constants.public.Enums.invoice_status;
export const paymentMethods = Constants.public.Enums.payment_method;

export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  eft: "EFT",
  cash: "Cash",
  card: "Card",
  other: "Other",
};

export const statusFilterOptions = [
  { value: "all", label: "All statuses" },
  ...invoiceStatuses.map((status) => ({
    value: status,
    label: invoiceStatusLabels[status],
  })),
];

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (invoiceStatuses as readonly string[]).includes(value);
}

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (paymentMethods as readonly string[]).includes(value);
}

export const INVOICES_BUCKET = "invoices";

export const MAX_INVOICE_FILE_BYTES = 20 * 1024 * 1024;

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const SIGNED_URL_SECONDS = 10 * 60;

export const PLACEHOLDER_INVOICE_NUMBER = "INV-2000-0000";

export const LINE_PRESETS = ["Water", "Electricity recovery", "Late fee"] as const;
