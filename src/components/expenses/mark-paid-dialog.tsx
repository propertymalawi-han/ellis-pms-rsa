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
import { uploadExpenseFile } from "@/lib/expenses/browser-upload";
import {
  discardExpenseUpload,
  markExpensePaid,
  openUploadedExpenseFile,
  startExpenseUpload,
} from "@/lib/expenses/actions";
import { paymentMethodLabels, paymentMethods } from "@/lib/expenses/labels";
import { paymentDefaults, paymentFormSchema, type PaymentFormValues } from "@/lib/expenses/schema";
import type { Expense } from "@/lib/expenses/types";

export function MarkPaidDialog({
  expense,
  today,
}: {
  expense: Expense;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: paymentDefaults(expense, today),
  });

  async function onSubmit(values: PaymentFormValues) {
    let proofPath: string | null = null;

    if (file) {
      setProgress({ value: 0, label: "Uploading proof of payment" });
      const started = await startExpenseUpload({
        propertyId: expense.propertyId,
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
        await uploadExpenseFile(started.path, file, started.contentType, (value) => {
          setProgress({ value, label: "Uploading proof of payment" });
        });
      } catch (error) {
        setProgress(null);
        form.setError("root", {
          message: error instanceof Error ? error.message : "Could not upload the file.",
        });
        return;
      }

      const opened = await openUploadedExpenseFile({
        propertyId: expense.propertyId,
        path: started.path,
      });

      if ("error" in opened) {
        await discardExpenseUpload(started.path);
        setProgress(null);
        form.setError("root", { message: opened.error });
        return;
      }

      proofPath = started.path;
    }

    const saved = await markExpensePaid(expense.id, values, proofPath);
    setProgress(null);

    if ("error" in saved) {
      if (proofPath) {
        await discardExpenseUpload(proofPath);
      }

      form.setError("root", { message: saved.error });
      return;
    }

    toast.success("Expense marked as paid.");
    setOpen(false);
    setFile(null);
    form.reset(paymentDefaults(expense, today));
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (!next) {
          form.reset(paymentDefaults(expense, today));
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
            Record the payment date, the amount paid, and a proof of payment if you have one.
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
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment method</FormLabel>
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
            <div className="grid gap-2">
              <p className="text-sm font-medium">Proof of payment</p>
              <FileUpload
                id={`proof-${expense.id}`}
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
