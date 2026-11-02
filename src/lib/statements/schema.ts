import { z } from "zod";

import {
  buildDocumentStoragePath,
  isDocumentStoragePath,
  propertyIdFromDocumentPath,
  resolveContentType,
  validateUploadFile,
} from "@/lib/documents/schema";
import { decimalToInput, MONEY, SIGNED_MONEY, parseDecimal, type DecimalSpec } from "@/lib/money";
import { canonicalSigned, daysInPeriod } from "@/lib/statements/calc";
import {
  MAX_STATEMENT_BYTES,
  statementStatuses,
} from "@/lib/statements/labels";
import type { OwnerStatement } from "@/lib/statements/types";

export {
  buildDocumentStoragePath as buildStatementStoragePath,
  isDocumentStoragePath as isStatementStoragePath,
  propertyIdFromDocumentPath as propertyIdFromStatementPath,
  resolveContentType,
  validateUploadFile,
};

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the statement and try again.";
}

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

function requiredCount(empty: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (!/^\d+$/.test(value)) {
      ctx.addIssue(empty);
    }
  });
}

export const statementFormSchema = z
  .object({
    periodMonth: z.string().trim().superRefine((value, ctx) => {
      const match = /^(\d{4})-(\d{2})$/.exec(value);

      if (!match?.[1] || !match[2]) {
        ctx.addIssue("Enter the statement month.");
        return;
      }

      const year = Number(match[1]);
      const month = Number(match[2]);

      if (month < 1 || month > 12 || year < 2000 || year > 2100) {
        ctx.addIssue("Enter a valid statement month.");
      }
    }),
    statementDate: optionalDate("Enter a valid statement date."),
    managerName: z
      .string()
      .trim()
      .max(200, "Manager name must be 200 characters or fewer."),
    nightsBooked: requiredCount("Enter the nights booked."),
    bookingsCount: requiredCount("Enter the number of bookings."),
    grossIncome: requiredDecimal(MONEY, "Enter the gross income."),
    platformFees: requiredDecimal(MONEY, "Enter the platform fees."),
    managementFee: requiredDecimal(MONEY, "Enter the management fee."),
    cleaningFees: requiredDecimal(MONEY, "Enter the cleaning fees."),
    otherDeductions: requiredDecimal(MONEY, "Enter the other deductions."),
    vatOnFees: requiredDecimal(MONEY, "Enter the VAT on fees."),
    netPayout: requiredDecimal(SIGNED_MONEY, "Enter the net payout."),
    payoutDate: optionalDate("Enter a valid payout date."),
    status: z.enum(statementStatuses, "Select a status."),
  })
  .superRefine((value, ctx) => {
    const days = daysInPeriod(value.periodMonth);

    if (
      days !== null &&
      /^\d+$/.test(value.nightsBooked) &&
      Number(value.nightsBooked) > days
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Nights booked cannot be more than the days in that month.",
        path: ["nightsBooked"],
        input: value.nightsBooked,
      });
    }

    if (/^\d+$/.test(value.bookingsCount) && Number(value.bookingsCount) > 9999) {
      ctx.addIssue({
        code: "custom",
        message: "Bookings must be 9 999 or fewer.",
        path: ["bookingsCount"],
        input: value.bookingsCount,
      });
    }

    const net = canonicalSigned(value.netPayout);

    if (net !== null && MONEY.max !== undefined) {
      const units = BigInt(net.replace("-", "").replace(".", ""));

      if (units > MONEY.max) {
        ctx.addIssue({
          code: "custom",
          message: "Net payout is too large.",
          path: ["netPayout"],
          input: value.netPayout,
        });
      }
    }
  });

export type StatementFormValues = z.infer<typeof statementFormSchema>;

export const statementFileSchema = z.object({
  propertyId: z.uuid("Property not found."),
  path: z.string().trim().min(1, "Upload the statement first.").max(300),
});

export const startStatementUploadSchema = z.object({
  propertyId: z.uuid("Property not found."),
  fileName: z.string().trim().min(1, "Choose a file to upload.").max(255),
  fileSize: z
    .number("Choose a file to upload.")
    .int("Choose a file to upload.")
    .positive("Choose a file to upload.")
    .max(MAX_STATEMENT_BYTES, "Files must be 20 MB or smaller."),
  contentType: z.string().trim().max(200),
});

export function emptyStatementFormValues(today: string): StatementFormValues {
  return {
    periodMonth: today.slice(0, 7),
    statementDate: "",
    managerName: "",
    nightsBooked: "0",
    bookingsCount: "0",
    grossIncome: "0",
    platformFees: "0",
    managementFee: "0",
    cleaningFees: "0",
    otherDeductions: "0",
    vatOnFees: "0",
    netPayout: "0",
    payoutDate: "",
    status: "expected",
  };
}

export function statementToFormValues(statement: OwnerStatement): StatementFormValues {
  return {
    periodMonth: statement.periodMonth.slice(0, 7),
    statementDate: statement.statementDate ?? "",
    managerName: statement.managerName ?? "",
    nightsBooked: String(statement.nightsBooked),
    bookingsCount: String(statement.bookingsCount),
    grossIncome: decimalToInput(statement.grossIncome),
    platformFees: decimalToInput(statement.platformFees),
    managementFee: decimalToInput(statement.managementFee),
    cleaningFees: decimalToInput(statement.cleaningFees),
    otherDeductions: decimalToInput(statement.otherDeductions),
    vatOnFees: decimalToInput(statement.vatOnFees),
    netPayout: decimalToInput(statement.netPayout),
    payoutDate: statement.payoutDate ?? "",
    status: statement.status,
  };
}

const extensionTypes: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function mimeFromStatementPath(path: string): string | null {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return extensionTypes[extension] ?? null;
}
