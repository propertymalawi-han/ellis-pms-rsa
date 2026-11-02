"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FileUpload } from "@/components/documents/file-upload";
import { Button } from "@/components/ui/button";
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
import { uploadPropertyDocumentFile } from "@/lib/documents/browser-upload";
import {
  discardPropertyDocumentUpload,
  finishPropertyDocumentUpload,
  startPropertyDocumentUpload,
} from "@/lib/documents/actions";
import { DOCUMENT_FILE_RULES } from "@/lib/documents/labels";
import {
  displayNameFromFile,
  documentNameSchema,
  firstIssue as documentIssue,
  validateUploadFile,
} from "@/lib/documents/schema";
import { createLease, updateLease } from "@/lib/leases/actions";
import { leaseStatusLabels, leaseStatuses } from "@/lib/leases/labels";
import {
  leaseFormSchema,
  type LeaseFormValues,
} from "@/lib/leases/schema";
import type { TenantRecord } from "@/lib/leases/types";

export function LeaseForm({
  propertyId,
  leaseId,
  tenants,
  defaultValues,
  onCancel,
  onSaved,
}: {
  propertyId: string;
  leaseId: string | null;
  tenants: TenantRecord[];
  defaultValues: LeaseFormValues;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const form = useForm<LeaseFormValues>({
    resolver: zodResolver(leaseFormSchema),
    defaultValues,
  });
  const [file, setFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(
    null,
  );
  const tenantChoice = form.watch("tenantChoice");
  const tenantId = form.watch("tenantId");
  const mode = defaultValues.mode;
  const selectedTenant = tenants.find((tenant) => tenant.id === tenantId) ?? null;
  const showTenantFields = tenantChoice === "new" || mode === "edit";

  function onTenantPick(next: string) {
    if (next === "new") {
      form.setValue("tenantChoice", "new");
      form.setValue("tenantId", "");
      form.setValue("fullName", "");
      form.setValue("idNumber", "");
      form.setValue("email", "");
      form.setValue("phone", "");
      form.setValue("notes", "");
      return;
    }

    const tenant = tenants.find((item) => item.id === next);
    form.setValue("tenantChoice", "existing");
    form.setValue("tenantId", next);

    if (!tenant) {
      return;
    }

    form.setValue("fullName", tenant.fullName);
    form.setValue("idNumber", tenant.idNumber ?? "");
    form.setValue("email", tenant.email ?? "");
    form.setValue("phone", tenant.phone ?? "");
    form.setValue("notes", tenant.notes ?? "");
  }

  function onFileChange(next: File | null) {
    setFile(next);

    if (next && !nameTouched) {
      setDocumentName(displayNameFromFile(next.name));
    }
  }

  async function onSubmit(values: LeaseFormValues) {
    const saved =
      values.mode === "create"
        ? await createLease(values)
        : await updateLease(leaseId ?? "", values);

    if (saved?.error) {
      form.setError("root", { message: saved.error });
      return;
    }

    if (file) {
      setProgress({ value: 0, label: "Uploading signed lease…" });
      const uploaded = await uploadSignedLease(propertyId, file, documentName, (value) => {
        setProgress({ value, label: "Uploading signed lease…" });
      });
      setProgress(null);

      if (uploaded.error) {
        toast.warning(
          `The lease was saved, but the signed copy was not uploaded. ${uploaded.error}`,
        );
        router.refresh();
        onSaved();
        return;
      }
    }

    toast.success(values.mode === "create" ? "Lease added." : "Lease saved.");
    router.refresh();
    onSaved();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <input type="hidden" {...form.register("propertyId")} />
        <input type="hidden" {...form.register("mode")} />
        <input type="hidden" {...form.register("tenantChoice")} />
        <Card>
          <CardHeader>
            <CardTitle>{mode === "create" ? "Add lease" : "Edit lease"}</CardTitle>
            <CardDescription>
              Amounts in rand. Use a comma or point for cents, for example 12
              500,00.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <LabelText>Tenant</LabelText>
              <Select
                value={tenantChoice === "new" ? "new" : tenantId}
                onValueChange={onTenantPick}
                disabled={form.formState.isSubmitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                  <SelectItem value="new">New tenant</SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenantLabel(tenant)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.tenantId ? (
                <p className="text-sm text-destructive">
                  {form.formState.errors.tenantId.message}
                </p>
              ) : null}
            </div>

            {showTenantFields ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {mode === "edit" && tenantChoice === "existing" ? (
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    Saving updates this tenant&apos;s contact details.
                  </p>
                ) : null}
                <TextInput control={form.control} name="fullName" label="Full name" />
                <TextInput
                  control={form.control}
                  name="idNumber"
                  label="ID number"
                  description="Optional."
                />
                <TextInput
                  control={form.control}
                  name="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                />
                <TextInput
                  control={form.control}
                  name="phone"
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : selectedTenant ? (
              <p className="text-sm text-muted-foreground">
                {contactSummary(selectedTenant)}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput control={form.control} name="startDate" label="Start date" type="date" />
              <TextInput control={form.control} name="endDate" label="End date" type="date" />
              <TextInput
                control={form.control}
                name="monthlyRent"
                label="Monthly rent"
                inputMode="decimal"
              />
              <TextInput
                control={form.control}
                name="depositAmount"
                label="Deposit"
                inputMode="decimal"
              />
              <TextInput
                control={form.control}
                name="depositHeldBy"
                label="Deposit held by"
                placeholder="Owner, agent, or attorney"
                className="sm:col-span-2"
              />
              <TextInput
                control={form.control}
                name="escalationPercent"
                label="Escalation %"
                inputMode="decimal"
                description="Optional. Leave blank if there is no escalation."
              />
              <TextInput
                control={form.control}
                name="escalationDate"
                label="Escalation date"
                type="date"
              />
              <TextInput
                control={form.control}
                name="rentDueDay"
                label="Rent due day"
                inputMode="numeric"
                description="Day of the month, from 1 to 31."
              />
              {mode === "edit" ? (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        value={field.value === "" ? undefined : field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" onBlur={field.onBlur}>
                            <SelectValue placeholder="Select a status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                          {leaseStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {leaseStatusLabels[status]}
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

            <div className="grid gap-2">
              <LabelText htmlFor="signed-lease-name">Signed lease</LabelText>
              <p className="text-sm text-muted-foreground">
                Optional. {DOCUMENT_FILE_RULES} Saved with this property&apos;s
                documents in the Lease category.
              </p>
              {file ? (
                <Input
                  id="signed-lease-name"
                  value={documentName}
                  onChange={(event) => {
                    setNameTouched(true);
                    setDocumentName(event.target.value);
                  }}
                  autoComplete="off"
                  placeholder="Document name"
                />
              ) : null}
              <FileUpload
                file={file}
                onFileChange={onFileChange}
                progress={progress}
                disabled={form.formState.isSubmitting}
              />
            </div>
          </CardContent>
        </Card>
        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? (progress?.label ?? "Saving…")
              : mode === "create"
                ? "Add lease"
                : "Save lease"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={form.formState.isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function LabelText({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  );
}

function TextInput({
  control,
  name,
  label,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  description,
  className,
}: {
  control: ReturnType<typeof useForm<LeaseFormValues>>["control"];
  name: keyof LeaseFormValues;
  label: string;
  type?: "text" | "email" | "tel" | "date";
  inputMode?: "decimal" | "numeric" | "text";
  autoComplete?: string;
  placeholder?: string;
  description?: string;
  className?: string;
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
              type={type}
              inputMode={inputMode}
              autoComplete={autoComplete}
              placeholder={placeholder}
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function tenantLabel(tenant: TenantRecord): string {
  const extra = tenant.idNumber ?? tenant.email;
  return extra ? `${tenant.fullName} · ${extra}` : tenant.fullName;
}

function contactSummary(tenant: TenantRecord): string {
  const parts = [tenant.email, tenant.phone, tenant.idNumber].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : "No contact details on file.";
}

async function uploadSignedLease(
  propertyId: string,
  file: File,
  name: string,
  onProgress: (value: number) => void,
): Promise<{ error: string | null }> {
  const named = documentNameSchema.safeParse(name);

  if (!named.success) {
    return { error: documentIssue(named.error) };
  }

  const checked = validateUploadFile(file);

  if (!checked.ok) {
    return { error: checked.message };
  }

  const started = await startPropertyDocumentUpload({
    propertyId,
    name: named.data,
    category: "lease",
    fileName: checked.file.name,
    fileSize: checked.file.size,
    contentType: checked.contentType,
  });

  if ("error" in started) {
    return { error: started.error };
  }

  try {
    await uploadPropertyDocumentFile(
      started.path,
      checked.file,
      started.contentType,
      onProgress,
    );
  } catch (error) {
    await discardPropertyDocumentUpload(started.path);
    return {
      error: error instanceof Error ? error.message : "Could not upload the file.",
    };
  }

  const finished = await finishPropertyDocumentUpload({
    propertyId,
    name: named.data,
    category: "lease",
    path: started.path,
  });

  if (finished?.error) {
    return { error: finished.error };
  }

  return { error: null };
}
