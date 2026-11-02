import { z } from "zod";

import { INTEREST_RATE, MONEY, parseDecimal } from "@/lib/money";
import type { DecimalSpec } from "@/lib/money";
import {
  propertyStatuses,
  propertyTypes,
  provinces,
  rentalTypes,
} from "@/lib/properties/labels";

function optionalText(max: number, message: string) {
  return z.string().trim().max(max, message);
}

function optionalDecimal(spec: DecimalSpec) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
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
    year >= 1900 &&
    year <= 2100
  );
}

export const propertyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a property name.")
    .max(200, "Name must be 200 characters or fewer."),
  rentalType: z.enum(rentalTypes, "Select a rental type."),
  propertyType: z.enum(propertyTypes, "Select a property type."),
  status: z.enum(propertyStatuses, "Select a status."),
  addressLine1: optionalText(200, "Street must be 200 characters or fewer."),
  addressLine2: optionalText(
    200,
    "Address line 2 must be 200 characters or fewer.",
  ),
  suburb: optionalText(120, "Suburb must be 120 characters or fewer."),
  city: optionalText(120, "City must be 120 characters or fewer."),
  province: z.union([z.literal(""), z.enum(provinces)]),
  postalCode: z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    if (!/^\d{4}$/.test(value)) {
      ctx.addIssue("Enter a 4-digit postal code.");
    }
  }),
  erfNumber: optionalText(80, "Erf number must be 80 characters or fewer."),
  unitNumber: optionalText(80, "Unit number must be 80 characters or fewer."),
  schemeNumber: optionalText(
    80,
    "Scheme number must be 80 characters or fewer.",
  ),
  purchasePrice: optionalDecimal(MONEY),
  purchaseDate: z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    if (!isRealIsoDate(value)) {
      ctx.addIssue("Enter a valid purchase date.");
    }
  }),
  transferCosts: optionalDecimal(MONEY),
  improvementCosts: optionalDecimal(MONEY),
  currentValue: optionalDecimal(MONEY),
  bondBank: optionalText(120, "Bond bank must be 120 characters or fewer."),
  bondAmount: optionalDecimal(MONEY),
  bondMonthlyPayment: optionalDecimal(MONEY),
  bondInterestRate: optionalDecimal(INTEREST_RATE),
  bodyCorporateName: optionalText(
    200,
    "Body corporate name must be 200 characters or fewer.",
  ),
  municipalAccountNumber: optionalText(
    80,
    "Municipal account number must be 80 characters or fewer.",
  ),
  notes: optionalText(5000, "Notes must be 5 000 characters or fewer."),
});

export type PropertyFormValues = z.infer<typeof propertyFormSchema>;

export const emptyPropertyFormValues: PropertyFormValues = {
  name: "",
  rentalType: "long_term",
  propertyType: "freehold",
  status: "active",
  addressLine1: "",
  addressLine2: "",
  suburb: "",
  city: "",
  province: "",
  postalCode: "",
  erfNumber: "",
  unitNumber: "",
  schemeNumber: "",
  purchasePrice: "",
  purchaseDate: "",
  transferCosts: "",
  improvementCosts: "",
  currentValue: "",
  bondBank: "",
  bondAmount: "",
  bondMonthlyPayment: "",
  bondInterestRate: "",
  bodyCorporateName: "",
  municipalAccountNumber: "",
  notes: "",
};

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
