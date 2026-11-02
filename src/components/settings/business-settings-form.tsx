"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { uploadInvoiceFile } from "@/lib/invoices/browser-upload";
import { logoContentType } from "@/lib/invoices/files";
import { MAX_LOGO_BYTES } from "@/lib/invoices/labels";
import {
  discardLogoUpload,
  saveBusinessSettings,
  startLogoUpload,
} from "@/lib/settings/actions";
import { businessSettingsSchema } from "@/lib/settings/schema";
import type { BusinessSettingsValues } from "@/lib/settings/types";

export function BusinessSettingsForm({
  defaultValues,
  logoUrl,
}: {
  defaultValues: BusinessSettingsValues;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const form = useForm<BusinessSettingsValues>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues,
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  function onLogo(file: File | null) {
    if (!file) {
      setLogo(null);
      return;
    }

    const contentType = logoContentType(file);

    if (!contentType) {
      toast.error("Use a JPG or PNG logo.");
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Logo must be 2 MB or smaller.");
      return;
    }

    setLogo(file);
    setRemoveLogo(false);
  }

  async function onSubmit(values: BusinessSettingsValues) {
    let logoPath: string | null = null;

    if (logo) {
      setProgress("Uploading logo…");
      const started = await startLogoUpload({
        fileName: logo.name,
        fileType: logo.type,
        fileSize: logo.size,
      });

      if ("error" in started) {
        setProgress(null);
        form.setError("root", { message: started.error });
        return;
      }

      try {
        await uploadInvoiceFile(started.path, logo, started.contentType, () => undefined);
        logoPath = started.path;
      } catch (error) {
        setProgress(null);
        form.setError("root", {
          message: error instanceof Error ? error.message : "Could not upload the logo.",
        });
        return;
      }
    }

    setProgress("Saving…");
    const saved = await saveBusinessSettings({
      values,
      logoPath,
      removeLogo: removeLogo && !logo,
    });
    setProgress(null);

    if (saved?.error) {
      if (logoPath) {
        await discardLogoUpload(logoPath);
      }

      form.setError("root", { message: saved.error });
      return;
    }

    toast.success("Business settings saved.");
    setLogo(null);
    setRemoveLogo(false);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-2xl gap-4">
        {form.formState.errors.root ? (
          <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
        ) : null}
        <TextField form={form} name="businessName" label="Business name" />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="phone" label="Phone" />
          <TextField form={form} name="email" label="Email" />
          <TextField form={form} name="bankName" label="Bank" />
          <TextField form={form} name="accountName" label="Account name" />
          <TextField form={form} name="accountNumber" label="Account number" />
          <TextField form={form} name="branchCode" label="Branch code" />
          <TextField form={form} name="vatNumber" label="VAT number" />
          <TextField form={form} name="paymentTermsDays" label="Payment terms (days)" />
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium">Logo</p>
          {logoUrl && !removeLogo && !logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Current logo" className="h-16 w-auto object-contain" />
          ) : null}
          <Input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(event) => onLogo(event.target.files?.[0] ?? null)}
          />
          <p className="text-sm text-muted-foreground">JPG or PNG, up to 2 MB.</p>
          {logoUrl ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => {
                setRemoveLogo(true);
                setLogo(null);
              }}
            >
              Remove logo
            </Button>
          ) : null}
        </div>
        <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>
          {progress ?? "Save settings"}
        </Button>
      </form>
    </Form>
  );
}

function TextField({
  form,
  name,
  label,
}: {
  form: ReturnType<typeof useForm<BusinessSettingsValues>>;
  name: keyof BusinessSettingsValues;
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
            <Input {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
