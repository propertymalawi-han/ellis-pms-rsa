import { z } from "zod";

import {
  buildExpenseStoragePath,
  isExpenseStoragePath,
  mimeFromExpensePath,
  propertyIdFromExpensePath,
  resolveContentType,
} from "@/lib/expenses/schema";
import { billTypes, MAX_BILL_FILE_BYTES, type BillType } from "@/lib/bills/labels";
import type { RatesBill } from "@/lib/bills/types";
import { decimalToInput, MONEY, parseDecimal } from "@/lib/money";
import type { PropertyType } from "@/lib/properties/labels";

export {
  buildExpenseStoragePath as buildBillStoragePath,
  isExpenseStoragePath as isBillStoragePath,
  mimeFromExpensePath as mimeFromBillPath,
  propertyIdFromExpensePath as propertyIdFromBillPath,
  resolveContentType,
};

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the bill and try again.";
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

function optionalMoney(invalid: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    const parsed = parseDecimal(value, MONEY);

    if (!parsed.ok) {
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

export const billFormSchema = z.object({
  propertyId: z.uuid("Select a property."),
  billType: z.enum(billTypes, "Select the bill type."),
  issuerName: z
    .string()
    .trim()
    .min(1, "Enter the issuer name.")
    .max(200, "Issuer name must be 200 characters or fewer."),
  accountNumber: z
    .string()
    .trim()
    .max(100, "Account number must be 100 characters or fewer."),
  periodMonth: z.string().trim().superRefine((value, ctx) => {
    const match = /^(\d{4})-(\d{2})$/.exec(value);

    if (!match?.[1] || !match[2]) {
      ctx.addIssue("Enter the bill month.");
      return;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);

    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      ctx.addIssue("Enter a valid bill month.");
    }
  }),
  statementDate: optionalDate("Enter a valid statement date."),
  dueDate: requiredDate("Enter the due date.", "Enter a valid due date."),
  levy: optionalMoney("Enter a valid levy."),
  specialLevy: optionalMoney("Enter a valid special levy."),
  municipalRates: optionalMoney("Enter a valid municipal rates amount."),
  water: optionalMoney("Enter a valid water amount."),
  electricity: optionalMoney("Enter a valid electricity amount."),
  refuse: optionalMoney("Enter a valid refuse amount."),
  sewerage: optionalMoney("Enter a valid sewerage amount."),
  otherCharges: optionalMoney("Enter a valid other charges amount."),
  arrears: optionalMoney("Enter a valid arrears amount."),
  interest: optionalMoney("Enter a valid interest amount."),
  totalDue: requiredMoney("Enter the total due."),
});

export type BillFormValues = z.infer<typeof billFormSchema>;

export const billPaymentSchema = z.object({
  paidDate: requiredDate("Enter the payment date.", "Enter a valid payment date."),
  amountPaid: requiredMoney("Enter the amount paid."),
});

export type BillPaymentValues = z.infer<typeof billPaymentSchema>;

export const startBillUploadSchema = z.object({
  propertyId: z.uuid("Property not found."),
  fileName: z.string().trim().min(1, "Choose a file to upload.").max(255),
  fileSize: z
    .number("Choose a file to upload.")
    .int("Choose a file to upload.")
    .positive("Choose a file to upload.")
    .max(MAX_BILL_FILE_BYTES, "Files must be 20 MB or smaller."),
  contentType: z.string().trim().max(200),
});

export const billFileSchema = z.object({
  propertyId: z.uuid("Property not found."),
  path: z.string().trim().min(1).max(300),
});

export const billDefaultsSchema = z.object({
  propertyId: z.uuid("Property not found."),
  billType: z.enum(billTypes, "Select the bill type."),
  periodMonth: z.string().trim(),
});

export function defaultBillType(propertyType: PropertyType): BillType {
  return propertyType === "sectional_title" ? "levy" : "municipal";
}

export function emptyBillFormValues(
  propertyId: string,
  billType: BillType,
  periodMonth: string,
): BillFormValues {
  return {
    propertyId,
    billType,
    issuerName: "",
    accountNumber: "",
    periodMonth,
    statementDate: "",
    dueDate: "",
    levy: "",
    specialLevy: "",
    municipalRates: "",
    water: "",
    electricity: "",
    refuse: "",
    sewerage: "",
    otherCharges: "",
    arrears: "",
    interest: "",
    totalDue: "",
  };
}

function moneyInput(canonical: string): string {
  return canonical === "0.00" ? "" : decimalToInput(canonical);
}

export function billToFormValues(bill: RatesBill): BillFormValues {
  return {
    propertyId: bill.propertyId,
    billType: bill.billType,
    issuerName: bill.issuerName,
    accountNumber: bill.accountNumber ?? "",
    periodMonth: bill.periodMonth.slice(0, 7),
    statementDate: bill.statementDate ?? "",
    dueDate: bill.dueDate,
    levy: moneyInput(bill.levy),
    specialLevy: moneyInput(bill.specialLevy),
    municipalRates: moneyInput(bill.municipalRates),
    water: moneyInput(bill.water),
    electricity: moneyInput(bill.electricity),
    refuse: moneyInput(bill.refuse),
    sewerage: moneyInput(bill.sewerage),
    otherCharges: moneyInput(bill.otherCharges),
    arrears: moneyInput(bill.arrears),
    interest: moneyInput(bill.interest),
    totalDue: decimalToInput(bill.totalDue),
  };
}

export function billPaymentDefaults(bill: RatesBill, today: string): BillPaymentValues {
  return {
    paidDate: today,
    amountPaid: decimalToInput(bill.totalDue),
  };
}
