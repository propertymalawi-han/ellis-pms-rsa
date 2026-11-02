"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FileUpload } from "@/components/documents/file-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { uploadInvoiceFile } from "@/lib/invoices/browser-upload";
import {
  discardUploadedInvoiceFile,
  recordPayment,
  startProofUpload,
} from "@/lib/invoices/actions";
import { paymentMethodLabels, paymentMethods } from "@/lib/invoices/labels";
import { paymentFormSchema, type PaymentFormValues } from "@/lib/invoices/schema";

export function RecordPaymentDialog({
  invoiceId,
  defaultAmount,
  defaultDate,
}: {
  invoiceId: string;
  defaultAmount: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: defaultAmount,
      paymentDate: defaultDate,
      method: "eft",
      reference: "",
    },
  });

  async function onSubmit(values: PaymentFormValues) {
    let proofPath: string | null = null;

    if (file) {
      setProgress({ value: 0, label: "Uploading proof of payment…" });
      const started = await startProofUpload({
        invoiceId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });

      if ("error" in started) {
        setProgress(null);
        form.setError("root", { message: started.error });
        return;
      }

      try {
        await uploadInvoiceFile(started.path, file, started.contentType, (value) => {
          setProgress({ value, label: "Uploading proof of payment…" });
        });
        proofPath = started.path;
      } catch (error) {
        setProgress(null);
        form.setError("root", {
          message: error instanceof Error ? error.message : "Could not upload the file.",
        });
        return;
      }
    }

    const saved = await recordPayment(invoiceId, values, proofPath);
    setProgress(null);

    if ("error" in saved) {
      if (proofPath) {
        await discardUploadedInvoiceFile(proofPath);
      }

      form.setError("root", { message: saved.error });
      return;
    }

    if ("warning" in saved && saved.warning) {
      toast.warning(saved.warning);
    } else {
      toast.success("Payment recorded.");
    }

    setOpen(false);
    setFile(null);
    form.reset({
      amount: "",
      paymentDate: defaultDate,
      method: "eft",
      reference: "",
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Part payments are allowed. The balance updates as soon as the payment is saved.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Method</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentMethods.map((method) => (
                        <SelectItem key={method} value={method}>
                          {paymentMethodLabels[method]}
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
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reference</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2">
              <p className="text-sm font-medium">Proof of payment</p>
              <FileUpload
                file={file}
                onFileChange={setFile}
                disabled={form.formState.isSubmitting}
                progress={progress}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save payment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
