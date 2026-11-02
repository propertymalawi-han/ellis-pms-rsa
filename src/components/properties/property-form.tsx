"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
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
import { createProperty, updateProperty } from "@/lib/properties/actions";
import {
  optionList,
  propertyStatuses,
  propertyStatusLabels,
  propertyTypeLabels,
  propertyTypes,
  provinceLabels,
  provinces,
  rentalTypeLabels,
  rentalTypes,
} from "@/lib/properties/labels";
import {
  propertyFormSchema,
  type PropertyFormValues,
} from "@/lib/properties/schema";
import { cn } from "@/lib/utils";

const rentalOptions = optionList(rentalTypes, rentalTypeLabels);
const propertyTypeOptions = optionList(propertyTypes, propertyTypeLabels);
const statusOptions = optionList(propertyStatuses, propertyStatusLabels);
const provinceOptions = optionList(provinces, provinceLabels);

export function PropertyForm({
  mode,
  propertyId,
  defaultValues,
  cancelHref,
}: {
  mode: "create" | "edit";
  propertyId?: string;
  defaultValues: PropertyFormValues;
  cancelHref: string;
}) {
  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: { ...defaultValues },
  });

  async function onSubmit(values: PropertyFormValues) {
    const result =
      mode === "create"
        ? await createProperty(values)
        : await updateProperty(propertyId ?? "", values);

    if (result?.error) {
      form.setError("root", { message: result.error });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6"
        noValidate
      >
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <EnumField
              control={form.control}
              name="rentalType"
              label="Rental type"
              options={rentalOptions}
            />
            <EnumField
              control={form.control}
              name="propertyType"
              label="Property type"
              options={propertyTypeOptions}
            />
            <EnumField
              control={form.control}
              name="status"
              label="Status"
              options={statusOptions}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
            <CardDescription>
              Freehold properties usually have an erf number. Sectional title
              properties usually have a unit and scheme number.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="addressLine1"
              label="Street"
              className="sm:col-span-2"
              autoComplete="street-address"
            />
            <TextField
              control={form.control}
              name="addressLine2"
              label="Address line 2"
              className="sm:col-span-2"
            />
            <TextField
              control={form.control}
              name="suburb"
              label="Suburb"
              autoComplete="address-level3"
            />
            <TextField
              control={form.control}
              name="city"
              label="City"
              autoComplete="address-level2"
            />
            <EnumField
              control={form.control}
              name="province"
              label="Province"
              options={provinceOptions}
              allowEmpty
              placeholder="Select a province"
            />
            <TextField
              control={form.control}
              name="postalCode"
              label="Postal code"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={4}
            />
            <TextField control={form.control} name="erfNumber" label="Erf number" />
            <TextField control={form.control} name="unitNumber" label="Unit number" />
            <TextField
              control={form.control}
              name="schemeNumber"
              label="Scheme number"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchase & finance</CardTitle>
            <CardDescription>
              Amounts in rand. Use a comma or point for cents, for example 1
              234,56. Leave a field blank if you do not know it yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              control={form.control}
              name="purchasePrice"
              label="Purchase price"
            />
            <FormField
              control={form.control}
              name="purchaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Purchase date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <MoneyField
              control={form.control}
              name="transferCosts"
              label="Transfer costs"
            />
            <MoneyField
              control={form.control}
              name="improvementCosts"
              label="Improvement costs"
            />
            <MoneyField
              control={form.control}
              name="currentValue"
              label="Current value"
            />
            <TextField control={form.control} name="bondBank" label="Bond bank" />
            <MoneyField control={form.control} name="bondAmount" label="Bond amount" />
            <MoneyField
              control={form.control}
              name="bondMonthlyPayment"
              label="Monthly bond payment"
            />
            <FormField
              control={form.control}
              name="bondInterestRate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Interest rate</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="11,75"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Percent per year, for example 11,75.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="bodyCorporateName"
              label="Body corporate name"
            />
            <TextField
              control={form.control}
              name="municipalAccountNumber"
              label="Municipal account number"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={5} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "Saving…"
              : mode === "create"
                ? "Add property"
                : "Save changes"}
          </Button>
          <Link
            href={cancelHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
        </div>
      </form>
    </Form>
  );
}

function TextField({
  control,
  name,
  label,
  className,
  autoComplete,
  inputMode,
  maxLength,
}: {
  control: ReturnType<typeof useForm<PropertyFormValues>>["control"];
  name: keyof PropertyFormValues;
  label: string;
  className?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "decimal" | "text";
  maxLength?: number;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              autoComplete={autoComplete}
              inputMode={inputMode}
              maxLength={maxLength}
              {...field}
              value={field.value}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function MoneyField({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<PropertyFormValues>>["control"];
  name: keyof PropertyFormValues;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input inputMode="decimal" autoComplete="off" {...field} value={field.value} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function EnumField<T extends string>({
  control,
  name,
  label,
  options,
  allowEmpty = false,
  placeholder,
}: {
  control: ReturnType<typeof useForm<PropertyFormValues>>["control"];
  name: keyof PropertyFormValues;
  label: string;
  options: readonly { value: T; label: string }[];
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value === "" ? "none" : field.value}
            onValueChange={(next) => {
              field.onChange(next === "none" ? "" : next);
            }}
          >
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
              {allowEmpty ? <SelectItem value="none">Not set</SelectItem> : null}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
