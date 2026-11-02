import { z } from "zod";

import { leaseStatuses } from "@/lib/leases/labels";
import { MONEY, PERCENT, parseDecimal } from "@/lib/money";
import type { DecimalSpec } from "@/lib/money";

function optionalText(max: number, message: string) {
  return z.string().trim().max(max, message);
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

function optionalDate(invalid: string) {
  return z.string().trim().superRefine((value, ctx) => {
    if (value === "") {
      return;
    }

    if (!isRealIsoDate(value)) {
      ctx.addIssue(invalid);
    }
  });
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the lease and try again.";
}

export const leaseFormSchema = z
  .object({
    propertyId: z.uuid("Property not found."),
    mode: z.enum(["create", "edit"]),
    tenantChoice: z.enum(["existing", "new"]),
    tenantId: z.string().trim(),
    fullName: z
      .string()
      .trim()
      .max(200, "Name must be 200 characters or fewer."),
    idNumber: optionalText(20, "ID number must be 20 characters or fewer."),
    email: z
      .string()
      .trim()
      .max(200, "Email must be 200 characters or fewer.")
      .superRefine((value, ctx) => {
        if (value === "") {
          return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          ctx.addIssue("Enter a valid email address.");
        }
      }),
    phone: optionalText(40, "Phone must be 40 characters or fewer."),
    notes: optionalText(5000, "Notes must be 5 000 characters or fewer."),
    startDate: requiredDate("Enter a start date.", "Enter a valid start date."),
    endDate: requiredDate("Enter an end date.", "Enter a valid end date."),
    monthlyRent: requiredDecimal(MONEY, "Enter the monthly rent."),
    depositAmount: requiredDecimal(
      MONEY,
      "Enter the deposit. Use 0 if there is none.",
    ),
    depositHeldBy: z
      .string()
      .trim()
      .min(1, "Enter who holds the deposit.")
      .max(120, "Must be 120 characters or fewer."),
    escalationPercent: optionalDecimal(PERCENT),
    escalationDate: optionalDate("Enter a valid escalation date."),
    rentDueDay: z.string().trim().superRefine((value, ctx) => {
      if (!/^\d{1,2}$/.test(value)) {
        ctx.addIssue("Enter a day from 1 to 31.");
        return;
      }

      const day = Number(value);

      if (day < 1 || day > 31) {
        ctx.addIssue("Enter a day from 1 to 31.");
      }
    }),
    status: z.union([z.literal(""), z.enum(leaseStatuses)]),
  })
  .superRefine((value, ctx) => {
    if (value.tenantChoice === "new") {
      if (value.fullName === "") {
        ctx.addIssue({
          code: "custom",
          message: "Enter the tenant's name.",
          path: ["fullName"],
          input: value.fullName,
        });
      }
    } else if (!z.uuid().safeParse(value.tenantId).success) {
      ctx.addIssue({
        code: "custom",
        message: "Select a tenant.",
        path: ["tenantId"],
        input: value.tenantId,
      });
    } else if (value.mode === "edit" && value.fullName === "") {
      ctx.addIssue({
        code: "custom",
        message: "Enter the tenant's name.",
        path: ["fullName"],
        input: value.fullName,
      });
    }

    if (value.mode === "edit" && value.status !== "active" && value.status !== "ended") {
      ctx.addIssue({
        code: "custom",
        message: "Select a status.",
        path: ["status"],
        input: value.status,
      });
    }

    if (
      isRealIsoDate(value.startDate) &&
      isRealIsoDate(value.endDate) &&
      value.endDate < value.startDate
    ) {
      ctx.addIssue({
        code: "custom",
        message: "End date must be on or after the start date.",
        path: ["endDate"],
        input: value.endDate,
      });
    }

    if (
      value.escalationDate !== "" &&
      isRealIsoDate(value.startDate) &&
      isRealIsoDate(value.escalationDate) &&
      value.escalationDate < value.startDate
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Escalation date must be on or after the start date.",
        path: ["escalationDate"],
        input: value.escalationDate,
      });
    }
  });

export type LeaseFormValues = z.infer<typeof leaseFormSchema>;

export function emptyLeaseFormValues(propertyId: string): LeaseFormValues {
  return {
    propertyId,
    mode: "create",
    tenantChoice: "new",
    tenantId: "",
    fullName: "",
    idNumber: "",
    email: "",
    phone: "",
    notes: "",
    startDate: "",
    endDate: "",
    monthlyRent: "",
    depositAmount: "",
    depositHeldBy: "",
    escalationPercent: "",
    escalationDate: "",
    rentDueDay: "1",
    status: "active",
  };
}
