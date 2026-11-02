import { z } from "zod";

import {
  QUANTITY,
  canonicalMoney,
  canonicalQuantity,
  moneyToCents,
  priceCanonicalLines,
} from "@/lib/invoices/calc";
import { MONEY, decimalToInput, parseDecimal } from "@/lib/money";
import type { InvoiceDetail } from "@/lib/invoices/types";
import type { DecimalSpec } from "@/lib/money";

function requiredDecimal(spec: DecimalSpec, emptyMessage: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue(emptyMessage);
      return;
    }

    const parsed = parseDecimal(value, spec);

    if (!parsed.ok) {
      ctx.addIssue(parsed.message);
    }
  });
}

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
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

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the invoice and try again.";
}

const lineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Enter a description.")
    .max(200, "Description must be 200 characters or fewer."),
  quantity: requiredDecimal(QUANTITY, "Enter a quantity."),
  unitPrice: requiredDecimal(MONEY, "Enter a unit price."),
  vatApplicable: z.boolean(),
});

export const invoiceFormSchema = z
  .object({
    leaseId: z.uuid("Select a lease."),
    issueDate: requiredDate("Enter an issue date.", "Enter a valid issue date."),
    dueDate: requiredDate("Enter a due date.", "Enter a valid due date."),
    periodStart: requiredDate("Enter the period start.", "Enter a valid period start."),
    periodEnd: requiredDate("Enter the period end.", "Enter a valid period end."),
    notes: z.string().trim().max(5000, "Notes must be 5 000 characters or fewer."),
    lines: z
      .array(lineSchema)
      .min(1, "Add at least one line.")
      .max(30, "An invoice can have at most 30 lines."),
  })
  .superRefine((value, ctx) => {
    if (
      isRealIsoDate(value.periodStart) &&
      isRealIsoDate(value.periodEnd) &&
      value.periodEnd < value.periodStart
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Period end must be on or after the period start.",
        path: ["periodEnd"],
        input: value.periodEnd,
      });
    }

    const canonical = value.lines.flatMap((line) => {
      const quantity = canonicalQuantity(line.quantity);
      const unitPrice = canonicalMoney(line.unitPrice);

      if (!quantity || unitPrice === null) {
        return [];
      }

      return [
        {
          description: line.description,
          quantity,
          unitPrice,
          vatApplicable: line.vatApplicable,
        },
      ];
    });

    value.lines.forEach((line, index) => {
      if (canonicalQuantity(line.quantity) === null && line.quantity.trim() !== "") {
        const parsed = parseDecimal(line.quantity, QUANTITY);

        if (parsed.ok) {
          ctx.addIssue({
            code: "custom",
            message: "Enter a quantity greater than zero.",
            path: ["lines", index, "quantity"],
            input: line.quantity,
          });
        }
      }
    });

    if (canonical.length === value.lines.length) {
      const priced = priceCanonicalLines(canonical);
      const tooLarge =
        MONEY.max !== undefined && moneyToCents(priced.total) > MONEY.max;

      if (priced.total === "0.00") {
        ctx.addIssue({
          code: "custom",
          message: "The invoice total must be more than zero.",
          path: ["lines"],
          input: value.lines,
        });
      }

      if (tooLarge) {
        ctx.addIssue({
          code: "custom",
          message: "The invoice total is too large.",
          path: ["lines"],
          input: value.lines,
        });
      }
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export function invoiceToFormValues(invoice: InvoiceDetail): InvoiceFormValues {
  return {
    leaseId: invoice.leaseId,
    issueDate: invoice.issueDate.slice(0, 10),
    dueDate: invoice.dueDate.slice(0, 10),
    periodStart: invoice.periodStart.slice(0, 10),
    periodEnd: invoice.periodEnd.slice(0, 10),
    notes: invoice.notes ?? "",
    lines:
      invoice.lines.length > 0
        ? invoice.lines.map((line) => ({
            description: line.description,
            quantity: decimalToInput(line.quantity),
            unitPrice: decimalToInput(line.unitPrice),
            vatApplicable: line.vatApplicable,
          }))
        : emptyInvoiceFormValues().lines,
  };
}

export function emptyInvoiceFormValues(): InvoiceFormValues {
  return {
    leaseId: "",
    issueDate: "",
    dueDate: "",
    periodStart: "",
    periodEnd: "",
    notes: "",
    lines: [
      {
        description: "Rent",
        quantity: "1",
        unitPrice: "",
        vatApplicable: false,
      },
    ],
  };
}

export const paymentFormSchema = z.object({
  amount: requiredDecimal(MONEY, "Enter the amount received."),
  paymentDate: requiredDate("Enter the payment date.", "Enter a valid payment date."),
  method: z.enum(["eft", "cash", "card", "other"], "Select how the tenant paid."),
  reference: z.string().trim().max(120, "Reference must be 120 characters or fewer."),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
