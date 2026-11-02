import { z } from "zod";

import type { BusinessSettings, BusinessSettingsValues } from "@/lib/settings/types";

function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the settings and try again.";
}

export function settingsIssue(error: z.ZodError): string {
  return firstMessage(error);
}

const optionalEmail = z.string().trim().superRefine((value, ctx) => {
  if (value === "") {
    return;
  }

  if (value.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    ctx.addIssue("Enter a valid email address.");
  }
});

export const businessSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, "Enter the business name.")
    .max(200, "Business name must be 200 characters or fewer."),
  address: z.string().trim().max(500, "Address must be 500 characters or fewer."),
  phone: z.string().trim().max(40, "Phone must be 40 characters or fewer."),
  email: optionalEmail,
  bankName: z.string().trim().max(120, "Bank name must be 120 characters or fewer."),
  accountName: z
    .string()
    .trim()
    .max(200, "Account name must be 200 characters or fewer."),
  accountNumber: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value !== "" && !/^[0-9]{1,20}$/.test(value)) {
        ctx.addIssue("Account number must be 1 to 20 digits.");
      }
    }),
  branchCode: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value !== "" && !/^[0-9]{1,10}$/.test(value)) {
        ctx.addIssue("Branch code must be 1 to 10 digits.");
      }
    }),
  vatNumber: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value !== "" && !/^[0-9]{10}$/.test(value)) {
        ctx.addIssue("VAT number must be 10 digits.");
      }
    }),
  paymentTermsDays: z.string().trim().superRefine((value, ctx) => {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(value)) {
      ctx.addIssue("Enter payment terms from 0 to 365 days.");
      return;
    }

    const days = Number(value);

    if (days > 365) {
      ctx.addIssue("Enter payment terms from 0 to 365 days.");
    }
  }),
});

export function settingsToFormValues(settings: BusinessSettings): BusinessSettingsValues {
  return {
    businessName: settings.businessName,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    bankName: settings.bankName,
    accountName: settings.accountName,
    accountNumber: settings.accountNumber,
    branchCode: settings.branchCode,
    vatNumber: settings.vatNumber ?? "",
    paymentTermsDays: String(settings.paymentTermsDays),
  };
}
