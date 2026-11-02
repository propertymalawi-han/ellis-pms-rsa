"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatZAR } from "@/lib/format";
import { centsToMoney } from "@/lib/invoices/calc";
import { decimalToInput } from "@/lib/money";
import {
  calculatedNetCents,
  canonicalSigned,
  netMismatch,
  NET_TOLERANCE_CENTS,
} from "@/lib/statements/calc";
import { statementStatusLabels, statementStatuses } from "@/lib/statements/labels";
import {
  statementFormSchema,
  type StatementFormValues,
} from "@/lib/statements/schema";

export function StatementForm({
  defaultValues,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  defaultValues: StatementFormValues;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: StatementFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<StatementFormValues>({
    resolver: zodResolver(statementFormSchema),
    defaultValues,
  });
  const grossIncome = form.watch("grossIncome");
  const platformFees = form.watch("platformFees");
  const managementFee = form.watch("managementFee");
  const cleaningFees = form.watch("cleaningFees");
  const otherDeductions = form.watch("otherDeductions");
  const vatOnFees = form.watch("vatOnFees");
  const netPayout = form.watch("netPayout");
  const calculated = useMemo(
    () =>
      calculatedNetCents({
        grossIncome,
        platformFees,
        managementFee,
        cleaningFees,
        otherDeductions,
        vatOnFees,
      }),
    [cleaningFees, grossIncome, managementFee, otherDeductions, platformFees, vatOnFees],
  );
  const [overridden, setOverridden] = useState(() => {
    if (calculated === null) {
      return false;
    }

    const entered = canonicalSigned(defaultValues.netPayout);

    return entered !== null && entered !== centsToMoney(calculated);
  });

  useEffect(() => {
    if (overridden || calculated === null) {
      return;
    }

    const next = decimalToInput(centsToMoney(calculated));

    if (form.getValues("netPayout") !== next) {
      form.setValue("netPayout", next, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
  }, [calculated, form, overridden]);

  const differs =
    overridden && calculated !== null && netMismatch(netPayout, calculated);

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="periodMonth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month</FormLabel>
                <FormControl>
                  <Input {...field} type="month" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="statementDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Statement date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="managerName"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Manager</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="nightsBooked"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nights booked</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="bookingsCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bookings</FormLabel>
                <FormControl>
                  <Input {...field} inputMode="numeric" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MoneyField name="grossIncome" label="Gross income" pending={pending} />
          <MoneyField name="platformFees" label="Platform fees" pending={pending} />
          <MoneyField name="managementFee" label="Management fee" pending={pending} />
          <MoneyField name="cleaningFees" label="Cleaning fees" pending={pending} />
          <MoneyField name="otherDeductions" label="Other deductions" pending={pending} />
          <MoneyField name="vatOnFees" label="VAT on fees" pending={pending} />
        </div>
        <FormField
          control={form.control}
          name="netPayout"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Net payout</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  inputMode="decimal"
                  disabled={pending}
                  onChange={(event) => {
                    setOverridden(true);
                    field.onChange(event);
                  }}
                />
              </FormControl>
              <p className="text-sm text-muted-foreground">
                Calculated from gross minus deductions:{" "}
                {calculated === null ? "—" : formatZAR(centsToMoney(calculated))}
              </p>
              {differs && calculated !== null ? (
                <p className="text-sm text-destructive" role="status">
                  Net payout differs from the calculated figure of{" "}
                  {formatZAR(centsToMoney(calculated))} by more than{" "}
                  {formatZAR(centsToMoney(NET_TOLERANCE_CENTS))}.
                </p>
              ) : null}
              {overridden ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending || calculated === null}
                  onClick={() => {
                    if (calculated === null) {
                      return;
                    }

                    setOverridden(false);
                    form.setValue("netPayout", decimalToInput(centsToMoney(calculated)), {
                      shouldDirty: true,
                      shouldValidate: form.formState.isSubmitted,
                    });
                  }}
                >
                  Use calculated
                </Button>
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="payoutDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payout date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Status</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={pending}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {statementStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {statementStatusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save statement"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function MoneyField({
  name,
  label,
  pending,
}: {
  name:
    | "grossIncome"
    | "platformFees"
    | "managementFee"
    | "cleaningFees"
    | "otherDeductions"
    | "vatOnFees";
  label: string;
  pending: boolean;
}) {
  const form = useFormContext<StatementFormValues>();

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} inputMode="decimal" disabled={pending} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
