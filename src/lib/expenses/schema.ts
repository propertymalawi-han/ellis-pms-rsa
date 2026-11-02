import { z } from "zod";

import {
  buildDocumentStoragePath,
  resolveContentType,
  validateUploadFile,
} from "@/lib/documents/schema";
import { addMoney, canonicalMoney } from "@/lib/expenses/calc";
import {
  expenseRecurrences,
  isExpenseRecurrence,
  MAX_EXPENSE_FILE_BYTES,
} from "@/lib/expenses/labels";
import type { Expense } from "@/lib/expenses/types";
import { paymentMethods } from "@/lib/invoices/labels";
import { decimalToInput, MONEY, parseDecimal } from "@/lib/money";

export {
  buildDocumentStoragePath as buildExpenseStoragePath,
  resolveContentType,
  validateUploadFile,
};

const expensePathPattern =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9]{4})\/([0-9]{13}-[A-Za-z0-9._-]{1,80})$/i;

const extensionTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the expense and try again.";
}

export function isExpenseStoragePath(propertyId: string, path: string): boolean {
  const match = expensePathPattern.exec(path);

  if (!match?.[1] || !match[2]) {
    return false;
  }

  if (match[1].toLowerCase() !== propertyId.toLowerCase()) {
    return false;
  }

  const year = Number(match[2]);
  return year >= 2000 && year <= 2100;
}

export function propertyIdFromExpensePath(path: string): string | null {
  const match = expensePathPattern.exec(path);
  return match?.[1]?.toLowerCase() ?? null;
}

export function mimeFromExpensePath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return extensionTypes[extension] ?? null;
}

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match?.[1] || !match[2] || !match[3]) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 2000 &&
    year <= 2100
  );
}

function optionalDate(invalid: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value !== "" && !isRealIsoDate(value)) {
      ctx.addIssue(invalid);
    }
  });
}

function requiredDate(empty: string, invalid: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue(empty);
      return;
    }

    if (!isRealIsoDate(value)) {
      ctx.addIssue(invalid);
    }
  });
}

function requiredMoney(empty: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue(empty);
      return;
    }

    const parsed = parseDecimal(value, MONEY);

    if (!parsed.ok) {
      ctx.addIssue(parsed.message);
    }
  });
}

export const expenseFormSchema = z
  .object({
    propertyId: z.uuid("Select a property."),
    categoryId: z.uuid("Select a category."),
    supplier: z.string().trim().max(200, "Supplier must be 200 characters or fewer."),
    description: z
      .string()
      .trim()
      .max(2000, "Description must be 2 000 characters or fewer."),
    invoiceNumber: z
      .string()
      .trim()
      .max(100, "Invoice number must be 100 characters or fewer."),
    invoiceDate: optionalDate("Enter a valid invoice date."),
    dueDate: requiredDate("Enter the due date.", "Enter a valid due date."),
    amountExclVat: requiredMoney("Enter the amount excluding VAT."),
    vatAmount: requiredMoney("Enter the VAT amount."),
    total: requiredMoney("Enter the total."),
    recurring: z.boolean(),
    recurrence: z.union([z.literal(""), z.enum(expenseRecurrences)]),
  })
  .superRefine((value, ctx) => {
    const excl = canonicalMoney(value.amountExclVat);
    const vat = canonicalMoney(value.vatAmount);
    const total = canonicalMoney(value.total);

    if (excl && vat && total && addMoney(excl, vat) !== total) {
      ctx.addIssue({
        code: "custom",
        message: "Total must equal the amount excluding VAT plus VAT.",
        path: ["total"],
        input: value.total,
      });
    }

    if (value.recurring && !isExpenseRecurrence(value.recurrence)) {
      ctx.addIssue({
        code: "custom",
        message: "Select how often this expense repeats.",
        path: ["recurrence"],
        input: value.recurrence,
      });
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export const paymentFormSchema = z.object({
  paidDate: requiredDate("Enter the payment date.", "Enter a valid payment date."),
  amountPaid: requiredMoney("Enter the amount paid."),
  paymentMethod: z.enum(paymentMethods, "Select a payment method."),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const startExpenseUploadSchema = z.object({
  propertyId: z.uuid("Property not found."),
  fileName: z.string().trim().min(1, "Choose a file to upload.").max(255),
  fileSize: z
    .number("Choose a file to upload.")
    .int("Choose a file to upload.")
    .positive("Choose a file to upload.")
    .max(MAX_EXPENSE_FILE_BYTES, "Files must be 20 MB or smaller."),
  contentType: z.string().trim().max(200),
});

export const expenseFileSchema = z.object({
  propertyId: z.uuid("Property not found."),
  path: z.string().trim().min(1).max(300),
});

export function emptyExpenseFormValues(
  today: string,
  propertyId: string,
  categoryId: string,
): ExpenseFormValues {
  return {
    propertyId,
    categoryId,
    supplier: "",
    description: "",
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: today,
    amountExclVat: "",
    vatAmount: "",
    total: "",
    recurring: false,
    recurrence: "",
  };
}

export function expenseToFormValues(expense: Expense): ExpenseFormValues {
  return {
    propertyId: expense.propertyId,
    categoryId: expense.categoryId,
    supplier: expense.supplier ?? "",
    description: expense.description ?? "",
    invoiceNumber: expense.invoiceNumber ?? "",
    invoiceDate: expense.invoiceDate ?? "",
    dueDate: expense.dueDate,
    amountExclVat: decimalToInput(expense.amountExclVat),
    vatAmount: decimalToInput(expense.vatAmount),
    total: decimalToInput(expense.total),
    recurring: expense.recurring,
    recurrence: expense.recurrence ?? "",
  };
}

export function paymentDefaults(expense: Expense, today: string): PaymentFormValues {
  return {
    paidDate: today,
    amountPaid: decimalToInput(expense.total),
    paymentMethod: expense.paymentMethod ?? "eft",
  };
}
