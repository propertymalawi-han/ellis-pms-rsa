"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { formatZAR } from "@/lib/format";
import { createInvoice, updateInvoice } from "@/lib/invoices/actions";
import {
  canonicalMoney,
  canonicalQuantity,
  priceCanonicalLines,
} from "@/lib/invoices/calc";
import { LINE_PRESETS } from "@/lib/invoices/labels";
import { dueDateForRentDay } from "@/lib/invoices/period";
import {
  invoiceFormSchema,
  type InvoiceFormValues,
} from "@/lib/invoices/schema";
import type { LeaseOption } from "@/lib/invoices/types";
import { decimalToInput } from "@/lib/money";

export function InvoiceForm({
  invoiceId,
  leases,
  defaultValues,
  linesLocked,
}: {
  invoiceId: string | null;
  leases: LeaseOption[];
  defaultValues: InvoiceFormValues;
  linesLocked: boolean;
}) {
  const router = useRouter();
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
  });
  const lines = useFieldArray({ control: form.control, name: "lines" });
  const watched = form.watch("lines");
  const selectedLeaseId = form.watch("leaseId");
  const selectedLease = leases.find((lease) => lease.id === selectedLeaseId) ?? null;
  const preview = useMemo(() => previewTotals(watched), [watched]);

  function applyLease(leaseId: string) {
    const lease = leases.find((item) => item.id === leaseId);

    if (!lease || invoiceId) {
      return;
    }

    const periodStart = form.getValues("periodStart");
    const match = /^(\d{4})-(\d{2})/.exec(periodStart);
    const year = match?.[1] ? Number(match[1]) : Number(lease.startDate.slice(0, 4));
    const month = match?.[2] ? Number(match[2]) : Number(lease.startDate.slice(5, 7));

    form.setValue("dueDate", dueDateForRentDay(year, month, lease.rentDueDay), {
      shouldValidate: true,
    });
    form.setValue("lines.0.description", "Rent");
    form.setValue("lines.0.quantity", "1");
    form.setValue("lines.0.unitPrice", decimalToInput(lease.monthlyRent), {
      shouldValidate: true,
    });
    form.setValue("lines.0.vatApplicable", false);
  }

  function addLine(description: string) {
    if (linesLocked || lines.fields.length >= 30) {
      return;
    }

    lines.append({
      description,
      quantity: "1",
      unitPrice: "",
      vatApplicable: false,
    });
  }

  async function onSubmit(values: InvoiceFormValues) {
    const saved = invoiceId
      ? await updateInvoice(invoiceId, values)
      : await createInvoice(values);

    if ("error" in saved) {
      form.setError("root", { message: saved.error });
      return;
    }

    if ("warning" in saved && saved.warning) {
      toast.warning(saved.warning);
    } else {
      toast.success(invoiceId ? "Invoice saved." : "Invoice created.");
    }

    if ("id" in saved) {
      router.push(`/invoices/${saved.id}`);
      return;
    }

    router.push(`/invoices/${invoiceId}`);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-4xl gap-6">
        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        ) : null}
        {invoiceId ? (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Lease</p>
            <p>
              {selectedLease
                ? `${selectedLease.propertyName} · ${selectedLease.tenantName}`
                : "This lease"}
            </p>
          </div>
        ) : (
          <FormField
            control={form.control}
            name="leaseId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lease</FormLabel>
                <Select
                  value={field.value || undefined}
                  onValueChange={(value) => {
                    field.onChange(value);
                    applyLease(value);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a lease" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {leases.map((lease) => (
                      <SelectItem key={lease.id} value={lease.id}>
                        {lease.propertyName} · {lease.tenantName}
                        {lease.status === "ended" ? " (ended)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField form={form} name="issueDate" label="Issue date" />
          <DateField form={form} name="dueDate" label="Due date" />
          <DateField form={form} name="periodStart" label="Period start" />
          <DateField form={form} name="periodEnd" label="Period end" />
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Lines</h2>
            {linesLocked ? (
              <p className="text-sm text-muted-foreground">
                Lines are locked because this invoice has payments.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {LINE_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addLine(preset)}
                  >
                    {preset}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => addLine("")}>
                  Add line
                </Button>
              </div>
            )}
          </div>
          {lines.fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-xl border border-border bg-card p-3 md:grid-cols-[minmax(0,1fr)_6rem_8rem_auto_auto]"
            >
              <FormField
                control={form.control}
                name={`lines.${index}.description`}
                render={({ field: lineField }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...lineField} disabled={linesLocked} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.quantity`}
                render={({ field: lineField }) => (
                  <FormItem>
                    <FormLabel>Qty</FormLabel>
                    <FormControl>
                      <Input {...lineField} inputMode="decimal" disabled={linesLocked} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.unitPrice`}
                render={({ field: lineField }) => (
                  <FormItem>
                    <FormLabel>Unit price</FormLabel>
                    <FormControl>
                      <Input {...lineField} inputMode="decimal" disabled={linesLocked} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.vatApplicable`}
                render={({ field: lineField }) => (
                  <FormItem className="justify-end">
                    <FormLabel>15% VAT</FormLabel>
                    <FormControl>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={lineField.value}
                        onChange={(event) => lineField.onChange(event.target.checked)}
                        disabled={linesLocked}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={linesLocked || lines.fields.length === 1}
                  onClick={() => lines.remove(index)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {form.formState.errors.lines?.message || form.formState.errors.lines?.root?.message ? (
            <p className="text-sm text-destructive">
              {form.formState.errors.lines.message ?? form.formState.errors.lines.root?.message}
            </p>
          ) : null}
          <p className="text-sm">
            Subtotal {preview ? formatZAR(preview.subtotal) : "—"} · VAT{" "}
            {preview ? formatZAR(preview.vatAmount) : "—"} · Total{" "}
            {preview ? formatZAR(preview.total) : "—"}
          </p>
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Saving…" : invoiceId ? "Save invoice" : "Create invoice"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(invoiceId ? `/invoices/${invoiceId}` : "/invoices")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function DateField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<InvoiceFormValues>>;
  name: "issueDate" | "dueDate" | "periodStart" | "periodEnd";
  label: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...field} type="date" />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function previewTotals(
  lines: InvoiceFormValues["lines"] | undefined,
): { subtotal: string; vatAmount: string; total: string } | null {
  if (!lines || lines.length === 0) {
    return null;
  }

  const canonical = lines.flatMap((line) => {
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

  if (canonical.length !== lines.length) {
    return null;
  }

  return priceCanonicalLines(canonical);
}
