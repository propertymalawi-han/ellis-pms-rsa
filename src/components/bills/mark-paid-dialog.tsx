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
import { uploadBillFile } from "@/lib/bills/browser-upload";
import {
  discardBillUpload,
  markBillPaid,
  openUploadedBillFile,
  startBillUpload,
} from "@/lib/bills/actions";
import {
  billPaymentDefaults,
  billPaymentSchema,
  type BillPaymentValues,
} from "@/lib/bills/schema";
import type { RatesBill } from "@/lib/bills/types";

export function MarkBillPaidDialog({ bill, today }: { bill: RatesBill; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const form = useForm<BillPaymentValues>({
    resolver: zodResolver(billPaymentSchema),
    defaultValues: billPaymentDefaults(bill, today),
  });

  async function onSubmit(values: BillPaymentValues) {
    let proofPath: string | null = null;

    if (file) {
      setProgress({ value: 0, label: "Uploading proof of payment" });
      const started = await startBillUpload({
        propertyId: bill.propertyId,
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
      });

      if ("error" in started) {
        setProgress(null);
        form.setError("root", { message: started.error });
        return;
      }

      try {
        await uploadBillFile(started.path, file, started.contentType, (value) => {
          setProgress({ value, label: "Uploading proof of payment" });
        });
      } catch (error) {
        setProgress(null);
        form.setError("root", {
          message: error instanceof Error ? error.message : "Could not upload the file.",
        });
        return;
      }

      const opened = await openUploadedBillFile({
        propertyId: bill.propertyId,
        path: started.path,
      });

      if ("error" in opened) {
        await discardBillUpload(started.path);
        setProgress(null);
        form.setError("root", { message: opened.error });
        return;
      }

      proofPath = started.path;
    }

    const saved = await markBillPaid(bill.id, values, proofPath);
    setProgress(null);

    if ("error" in saved) {
      if (proofPath) {
        await discardBillUpload(proofPath);
      }

      form.setError("root", { message: saved.error });
      return;
    }

    toast.success("Bill marked as paid.");
    setOpen(false);
    setFile(null);
    form.reset(billPaymentDefaults(bill, today));
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          form.reset(billPaymentDefaults(bill, today));
          form.clearErrors();
          setFile(null);
          setProgress(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Mark as paid
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as paid</DialogTitle>
          <DialogDescription>
            Record the payment date, the amount paid, and a proof of payment if you have one. The
            matching expenses are marked paid as well.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            {form.formState.errors.root ? (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            ) : null}
            <FormField
              control={form.control}
              name="paidDate"
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
              name="amountPaid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount paid</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="decimal" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-2">
              <p className="text-sm font-medium">Proof of payment</p>
              <FileUpload
                id={`bill-proof-${bill.id}`}
                file={file}
                onFileChange={setFile}
                disabled={form.formState.isSubmitting}
                progress={progress}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Mark as paid"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
