import { Constants, type Database } from "@/types/database";

import { paymentMethodLabels, paymentMethods } from "@/lib/invoices/labels";

export { paymentMethodLabels, paymentMethods };

export const expenseStatuses = Constants.public.Enums.expense_status;
export const expenseRecurrences = Constants.public.Enums.expense_recurrence;

export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];
export type ExpenseRecurrence = Database["public"]["Enums"]["expense_recurrence"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export const expenseStatusLabels: Record<ExpenseStatus, string> = {
  due: "Due",
  paid: "Paid",
  overdue: "Overdue",
};

export const recurrenceLabels: Record<ExpenseRecurrence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

export const BILLS_BUCKET = "bills";

export const MAX_EXPENSE_FILE_BYTES = 20 * 1024 * 1024;

export const SIGNED_URL_SECONDS = 10 * 60;

export const UPCOMING_DAYS = 14;

export function isExpenseStatus(value: string): value is ExpenseStatus {
  return (expenseStatuses as readonly string[]).includes(value);
}

export function isExpenseRecurrence(value: string): value is ExpenseRecurrence {
  return (expenseRecurrences as readonly string[]).includes(value);
}
