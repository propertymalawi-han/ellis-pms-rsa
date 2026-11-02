"use client";

import { useEffect, useMemo, useRef } from "react";
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
import {
  formatLineTotal,
  lineItemsCents,
  totalDueMismatch,
} from "@/lib/bills/calc";
import {
  TOTAL_TOLERANCE_CENTS,
  billTypeLabels,
  billTypes,
  type BillType,
} from "@/lib/bills/labels";
import { billFormSchema, type BillFormValues } from "@/lib/bills/schema";
import type { BillFieldDefaults, BillProperty } from "@/lib/bills/types";
import { formatZAR } from "@/lib/format";
import { centsToMoney } from "@/lib/invoices/calc";

export function BillForm({
  properties,
  lockProperty,
  propertyLabel,
  suggestFields,
  suggestions,
  onContextChange,
  onPropertyIdChange,
  defaultValues,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  properties: BillProperty[];
  lockProperty: boolean;
  propertyLabel?: string;
  suggestFields: boolean;
  suggestions: BillFieldDefaults;
  onContextChange: (context: {
    propertyId: string;
    billType: BillType;
    periodMonth: string;
  }) => void;
  onPropertyIdChange?: (propertyId: string) => void;
  defaultValues: BillFormValues;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: BillFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues,
  });
  const propertyId = form.watch("propertyId");
  const billType = form.watch("billType");
  const periodMonth = form.watch("periodMonth");
  const levy = form.watch("levy");
  const specialLevy = form.watch("specialLevy");
  const municipalRates = form.watch("municipalRates");
  const water = form.watch("water");
  const electricity = form.watch("electricity");
  const refuse = form.watch("refuse");
  const sewerage = form.watch("sewerage");
  const otherCharges = form.watch("otherCharges");
  const arrears = form.watch("arrears");
  const interest = form.watch("interest");
  const totalDue = form.watch("totalDue");
  const appliedIssuer = useRef(defaultValues.issuerName);
  const appliedAccount = useRef(defaultValues.accountNumber);
  const lineCents = useMemo(
    () =>
      lineItemsCents({
        levy,
        specialLevy,
        municipalRates,
        water,
        electricity,
        refuse,
        sewerage,
        otherCharges,
        arrears,
        interest,
      }),
    [
      arrears,
      electricity,
      interest,
      levy,
      municipalRates,
      otherCharges,
      refuse,
      sewerage,
      specialLevy,
      water,
    ],
  );
  const differs = lineCents !== null && totalDueMismatch(totalDue, lineCents);

  useEffect(() => {
    if (!suggestFields) {
      return;
    }

    onContextChange({ propertyId, billType, periodMonth });
  }, [billType, onContextChange, periodMonth, propertyId, suggestFields]);

  useEffect(() => {
    if (!suggestFields) {
      return;
    }

    const current = form.getValues("issuerName");

    if (current !== "" && current !== appliedIssuer.current) {
      return;
    }

    appliedIssuer.current = suggestions.issuerName;
    form.setValue("issuerName", suggestions.issuerName, { shouldDirty: false });
  }, [form, suggestFields, suggestions.issuerName]);

  useEffect(() => {
    if (!suggestFields) {
      return;
    }

    const current = form.getValues("accountNumber");

    if (current !== "" && current !== appliedAccount.current) {
      return;
    }

    appliedAccount.current = suggestions.accountNumber;
    form.setValue("accountNumber", suggestions.accountNumber, { shouldDirty: false });
  }, [form, suggestFields, suggestions.accountNumber]);

  const issuerLabel =
    billType === "municipal"
      ? "Municipality"
      : billType === "levy"
        ? "Body corporate"
        : "Issuer";
  const accountLabel =
    billType === "municipal" ? "Municipal account number" : "Account number";

  return (
    <Form {...form}>
      <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {lockProperty ? (
            <p className="text-sm sm:col-span-2">
              <span className="text-muted-foreground">Property: </span>
              {propertyLabel}
            </p>
          ) : (
            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Property</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      onPropertyIdChange?.(value);
                    }}
                    disabled={pending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {properties.map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="billType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bill type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {billTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {billTypeLabels[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
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
            name="issuerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{issuerLabel}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="accountNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{accountLabel}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} />
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
            name="dueDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Due date</FormLabel>
                <FormControl>
                  <Input {...field} type="date" disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MoneyField name="levy" label="Levy" pending={pending} />
          <MoneyField name="specialLevy" label="Special levy" pending={pending} />
          <MoneyField name="municipalRates" label="Municipal rates" pending={pending} />
          <MoneyField name="water" label="Water" pending={pending} />
          <MoneyField name="electricity" label="Electricity" pending={pending} />
          <MoneyField name="refuse" label="Refuse" pending={pending} />
          <MoneyField name="sewerage" label="Sewerage" pending={pending} />
          <MoneyField name="otherCharges" label="Other charges" pending={pending} />
          <MoneyField name="arrears" label="Arrears" pending={pending} />
          <MoneyField name="interest" label="Interest" pending={pending} />
        </div>
        <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
          <p className="text-sm" aria-live="polite">
            <span className="text-muted-foreground">Line items: </span>
            {lineCents === null ? "Enter each amount as a number." : formatZAR(formatLineTotal(lineCents))}
          </p>
          {differs && lineCents !== null ? (
            <p className="text-sm text-destructive" role="status">
              Line items add up to {formatZAR(formatLineTotal(lineCents))} and total due differs by
              more than {formatZAR(centsToMoney(TOTAL_TOLERANCE_CENTS))}. Arrears often explain
              that when they are not included in the lines above. You can still save the bill.
            </p>
          ) : null}
        </div>
        <FormField
          control={form.control}
          name="totalDue"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Total due</FormLabel>
              <FormControl>
                <Input {...field} inputMode="decimal" disabled={pending} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-sm text-muted-foreground">
          Saving also updates Levies, Special levy, Municipal rates, and Water & electricity on
          the expense list. Refuse, sewerage, other charges and interest are recorded as Other.
          Arrears stay on this bill only, so an earlier month is not counted twice.
        </p>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save bill"}
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
    | "levy"
    | "specialLevy"
    | "municipalRates"
    | "water"
    | "electricity"
    | "refuse"
    | "sewerage"
    | "otherCharges"
    | "arrears"
    | "interest";
  label: string;
  pending: boolean;
}) {
  const form = useFormContext<BillFormValues>();

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
