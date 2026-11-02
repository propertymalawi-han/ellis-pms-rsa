"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

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
import { Textarea } from "@/components/ui/textarea";
import { addMoney, canonicalMoney, subtractMoney, vatFromExcl } from "@/lib/expenses/calc";
import { expenseRecurrences, recurrenceLabels } from "@/lib/expenses/labels";
import {
  expenseFormSchema,
  type ExpenseFormValues,
} from "@/lib/expenses/schema";
import type { ExpenseCategory, ExpenseProperty } from "@/lib/expenses/types";
import { decimalToInput } from "@/lib/money";

export function ExpenseForm({
  categories,
  properties,
  lockProperty,
  propertyLabel,
  onPropertyIdChange,
  defaultValues,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  categories: ExpenseCategory[];
  properties: ExpenseProperty[];
  lockProperty: boolean;
  propertyLabel?: string;
  onPropertyIdChange?: (propertyId: string) => void;
  defaultValues: ExpenseFormValues;
  pending: boolean;
  serverError: string | null;
  onSubmit: (values: ExpenseFormValues) => void;
  onCancel: () => void;
}) {
  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues,
  });
  const excl = form.watch("amountExclVat");
  const vat = form.watch("vatAmount");
  const recurring = form.watch("recurring");
  const [applyVat, setApplyVat] = useState(() => startsWithVat(defaultValues));
  const [vatTouched, setVatTouched] = useState(() => startsWithCustomVat(defaultValues));
  const [totalTouched, setTotalTouched] = useState(false);

  useEffect(() => {
    const exclCanonical = canonicalMoney(excl);

    if (!exclCanonical) {
      return;
    }

    if (!applyVat) {
      if (!vatTouched && form.getValues("vatAmount") !== "0") {
        form.setValue("vatAmount", "0", {
          shouldDirty: true,
          shouldValidate: form.formState.isSubmitted,
        });
      }

      return;
    }

    if (vatTouched) {
      return;
    }

    const nextVat = decimalToInput(vatFromExcl(exclCanonical));

    if (form.getValues("vatAmount") !== nextVat) {
      form.setValue("vatAmount", nextVat, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
  }, [applyVat, excl, form, vatTouched]);

  useEffect(() => {
    if (totalTouched) {
      return;
    }

    const exclCanonical = canonicalMoney(excl);
    const vatCanonical = canonicalMoney(vat);

    if (!exclCanonical || !vatCanonical) {
      return;
    }

    const nextTotal = decimalToInput(addMoney(exclCanonical, vatCanonical));

    if (form.getValues("total") !== nextTotal) {
      form.setValue("total", nextTotal, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
  }, [excl, form, totalTouched, vat]);

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
            name="categoryId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Category</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
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
            name="supplier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoiceNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice number</FormLabel>
                <FormControl>
                  <Input {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} disabled={pending} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="invoiceDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invoice date</FormLabel>
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
          <FormField
            control={form.control}
            name="amountExclVat"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount excl. VAT</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="decimal"
                    disabled={pending}
                    onChange={(event) => {
                      setTotalTouched(false);
                      field.onChange(event);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-end">
            <Button
              type="button"
              variant={applyVat ? "default" : "outline"}
              aria-pressed={applyVat}
              disabled={pending}
              onClick={() => {
                const next = !applyVat;
                setApplyVat(next);
                setVatTouched(false);
                setTotalTouched(false);

                if (!next) {
                  form.setValue("vatAmount", "0", {
                    shouldDirty: true,
                    shouldValidate: form.formState.isSubmitted,
                  });
                }
              }}
            >
              15% VAT
            </Button>
          </div>
          <FormField
            control={form.control}
            name="vatAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>VAT</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="decimal"
                    disabled={pending}
                    onChange={(event) => {
                      setVatTouched(true);
                      setTotalTouched(false);
                      field.onChange(event);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="total"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    inputMode="decimal"
                    disabled={pending}
                    onChange={(event) => {
                      setTotalTouched(true);
                      setVatTouched(true);
                      field.onChange(event);
                      const exclCanonical = canonicalMoney(form.getValues("amountExclVat"));
                      const totalCanonical = canonicalMoney(event.target.value);

                      if (!exclCanonical || !totalCanonical) {
                        return;
                      }

                      const nextVat = subtractMoney(totalCanonical, exclCanonical);

                      if (nextVat === null) {
                        return;
                      }

                      form.setValue("vatAmount", decimalToInput(nextVat), {
                        shouldDirty: true,
                        shouldValidate: form.formState.isSubmitted,
                      });
                    }}
                  />
                </FormControl>
                <p className="text-sm text-muted-foreground">
                  {applyVat
                    ? "Calculated from the excl. amount. You can edit VAT or the total."
                    : "Turn on 15% VAT to calculate VAT and the total."}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="recurring"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={field.value}
                    disabled={pending}
                    onChange={(event) => {
                      field.onChange(event.target.checked);

                      if (event.target.checked && form.getValues("recurrence") === "") {
                        form.setValue("recurrence", "monthly", {
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }

                      if (!event.target.checked) {
                        form.setValue("recurrence", "", {
                          shouldValidate: form.formState.isSubmitted,
                        });
                      }
                    }}
                  />
                  Recurring expense
                </label>
                <FormMessage />
              </FormItem>
            )}
          />
          {recurring ? (
            <FormField
              control={form.control}
              name="recurrence"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Repeats</FormLabel>
                  <Select
                    value={field.value === "" ? "monthly" : field.value}
                    onValueChange={field.onChange}
                    disabled={pending}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {expenseRecurrences.map((recurrence) => (
                        <SelectItem key={recurrence} value={recurrence}>
                          {recurrenceLabels[recurrence]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </div>
        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save expense"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function startsWithVat(values: ExpenseFormValues): boolean {
  const vat = canonicalMoney(values.vatAmount);
  return vat !== null && vat !== "0.00";
}

function startsWithCustomVat(values: ExpenseFormValues): boolean {
  const excl = canonicalMoney(values.amountExclVat);
  const vat = canonicalMoney(values.vatAmount);

  if (!excl || !vat || vat === "0.00") {
    return false;
  }

  return vat !== vatFromExcl(excl);
}
