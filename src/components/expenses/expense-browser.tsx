"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FileUpload } from "@/components/documents/file-upload";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { ExpensePreview } from "@/components/expenses/expense-preview";
import { ExpenseStatusBadge } from "@/components/expenses/expense-status-badge";
import { MarkPaidDialog } from "@/components/expenses/mark-paid-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadExpenseFile } from "@/lib/expenses/browser-upload";
import {
  categoryTotals,
  effectiveStatus,
  expenseTaxDate,
  grandTotals,
  inTaxYear,
  isUpcoming,
} from "@/lib/expenses/calc";
import {
  createExpense,
  discardExpenseUpload,
  generateRecurringExpenses,
  openSavedExpenseFile,
  openUploadedExpenseFile,
  startExpenseUpload,
  updateExpense,
} from "@/lib/expenses/actions";
import {
  expenseStatusLabels,
  expenseStatuses,
  recurrenceLabels,
} from "@/lib/expenses/labels";
import {
  emptyExpenseFormValues,
  expenseToFormValues,
  type ExpenseFormValues,
} from "@/lib/expenses/schema";
import type { Expense, ExpenseCategory, ExpensePreview as PreviewFile, ExpenseProperty } from "@/lib/expenses/types";
import { formatDateOnly, formatZAR, taxYearForIso } from "@/lib/format";
import { cn } from "@/lib/utils";

type Editor =
  | { mode: "list" }
  | { mode: "add"; preview: PreviewFile | null; propertyId: string }
  | { mode: "edit"; expense: Expense; preview: PreviewFile | null };

export function ExpenseBrowser({
  expenses,
  categories,
  properties,
  today,
  lockedProperty,
  heading,
}: {
  expenses: Expense[];
  categories: ExpenseCategory[];
  properties: ExpenseProperty[];
  today: string;
  lockedProperty?: { id: string; name: string };
  heading?: string;
}) {
  const router = useRouter();
  const currentTaxYear = taxYearForIso(today) ?? "";
  const [propertyId, setPropertyId] = useState(lockedProperty?.id ?? "all");
  const [categoryId, setCategoryId] = useState("all");
  const [status, setStatus] = useState("all");
  const [taxYear, setTaxYear] = useState(currentTaxYear);
  const [editor, setEditor] = useState<Editor>({ mode: "list" });
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; url: string; mimeType: string } | null>(
    null,
  );

  const taxYears = useMemo(() => {
    const labels = new Set<string>();

    if (currentTaxYear) {
      labels.add(currentTaxYear);
    }

    for (const expense of expenses) {
      const label = taxYearForIso(expenseTaxDate(expense));

      if (label) {
        labels.add(label);
      }
    }

    return [...labels].sort((left, right) => right.localeCompare(left));
  }, [currentTaxYear, expenses]);

  const scopedPropertyId = lockedProperty?.id ?? propertyId;

  const filtered = useMemo(() => {
    return expenses
      .filter((expense) => {
        if (scopedPropertyId !== "all" && expense.propertyId !== scopedPropertyId) {
          return false;
        }

        if (categoryId !== "all" && expense.categoryId !== categoryId) {
          return false;
        }

        if (status !== "all" && effectiveStatus(expense, today) !== status) {
          return false;
        }

        return taxYear === "" || inTaxYear(expense, taxYear);
      })
      .sort((left, right) => compareExpenses(left, right, today));
  }, [categoryId, expenses, scopedPropertyId, status, taxYear, today]);

  const totals = useMemo(
    () => categoryTotals(filtered, categories),
    [categories, filtered],
  );
  const totalsSum = grandTotals(totals);

  const preview = editor.mode === "list" ? null : editor.preview;
  const formPropertyId =
    editor.mode === "edit"
      ? editor.expense.propertyId
      : editor.mode === "add"
        ? editor.propertyId
        : "";
  const propertyLabel =
    editor.mode === "edit"
      ? editor.expense.propertyName
      : lockedProperty?.name ?? properties.find((property) => property.id === formPropertyId)?.name;

  async function upload(file: File | null) {
    if (!file || editor.mode === "list") {
      return;
    }

    const propertyForFile =
      editor.mode === "edit" ? editor.expense.propertyId : formPropertyId;

    if (!propertyForFile) {
      toast.error("Select a property before uploading an invoice.");
      return;
    }

    setUploading(true);
    setProgress({ value: 0, label: "Uploading invoice" });
    const started = await startExpenseUpload({
      propertyId: propertyForFile,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type,
    });

    if ("error" in started) {
      toast.error(started.error);
      setUploading(false);
      setProgress(null);
      return;
    }

    try {
      await uploadExpenseFile(started.path, file, started.contentType, (value) => {
        setProgress({ value, label: "Uploading invoice" });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the file.");
      setUploading(false);
      setProgress(null);
      return;
    }

    const opened = await openUploadedExpenseFile({
      propertyId: propertyForFile,
      path: started.path,
    });

    if ("error" in opened) {
      await discardExpenseUpload(started.path);
      toast.error(opened.error);
      setUploading(false);
      setProgress(null);
      return;
    }

    const previous = editor.preview;

    setEditor((current) => {
      if (current.mode === "list") {
        void discardExpenseUpload(started.path);
        return current;
      }

      return {
        ...current,
        preview: {
          path: started.path,
          url: opened.url,
          mimeType: opened.mimeType,
          persisted: false,
        },
      };
    });

    if (previous && !previous.persisted && previous.path !== started.path) {
      await discardExpenseUpload(previous.path);
    }

    setUploading(false);
    setProgress(null);
  }

  function removePreview() {
    if (editor.mode === "list" || !editor.preview) {
      return;
    }

    if (!editor.preview.persisted) {
      void discardExpenseUpload(editor.preview.path);
    }

    setEditor((current) =>
      current.mode === "list" ? current : { ...current, preview: null },
    );
  }

  function cancel() {
    const current = editor.mode === "list" ? null : editor.preview;

    if (current && !current.persisted) {
      void discardExpenseUpload(current.path);
    }

    setServerError(null);
    setEditor({ mode: "list" });
  }

  function save(values: ExpenseFormValues) {
    if (editor.mode === "list") {
      return;
    }

    const path = editor.preview?.path ?? null;
    const editing = editor.mode === "edit" ? editor.expense : null;

    startTransition(async () => {
      const result = editing
        ? await updateExpense({ ...values, path, expenseId: editing.id })
        : await createExpense({ ...values, path });

      if ("error" in result) {
        setServerError(result.error);
        return;
      }

      setServerError(null);
      setEditor({ mode: "list" });
      router.refresh();
    });
  }

  function changeDraftProperty(nextPropertyId: string) {
    setEditor((current) => {
      if (current.mode !== "add" || current.propertyId === nextPropertyId) {
        return current;
      }

      if (current.preview && !current.preview.persisted) {
        void discardExpenseUpload(current.preview.path);
      }

      return { ...current, propertyId: nextPropertyId, preview: null };
    });
  }

  function generate() {
    const scope = lockedProperty?.id ?? (propertyId === "all" ? null : propertyId);

    setGenerating(true);
    startTransition(async () => {
      try {
        const result = await generateRecurringExpenses(scope);

        if ("error" in result) {
          toast.error(result.error);
          return;
        }

        if (result.created === 0) {
          toast.message("No recurring expenses were due for this month.");
          return;
        }

        toast.success(
          result.created === 1
            ? "Created 1 expense for this month."
            : `Created ${result.created} expenses for this month.`,
        );
        router.refresh();
      } finally {
        setGenerating(false);
      }
    });
  }

  async function viewFile(expense: Expense, kind: "invoice" | "proof") {
    const opened = await openSavedExpenseFile(expense.id, kind);

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setViewer({
      title: kind === "invoice" ? "Invoice" : "Proof of payment",
      url: opened.url,
      mimeType: opened.mimeType,
    });
  }

  async function openEditor(expense: Expense) {
    if (!expense.filePath) {
      setServerError(null);
      setEditor({ mode: "edit", expense, preview: null });
      return;
    }

    const opened = await openSavedExpenseFile(expense.id, "invoice");

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setServerError(null);
    setEditor({
      mode: "edit",
      expense,
      preview: {
        path: expense.filePath,
        url: opened.url,
        mimeType: opened.mimeType,
        persisted: true,
      },
    });
  }

  if (editor.mode !== "list") {
    return (
      <section className="grid gap-4">
        <h2 className="font-heading text-lg font-medium">
          {editor.mode === "edit" ? "Edit expense" : "Add expense"}
        </h2>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <ExpenseForm
              key={editor.mode === "edit" ? editor.expense.id : "new"}
              categories={categories}
              properties={properties}
              lockProperty={Boolean(lockedProperty) || editor.mode === "edit"}
              propertyLabel={propertyLabel}
              onPropertyIdChange={changeDraftProperty}
              defaultValues={
                editor.mode === "edit"
                  ? expenseToFormValues(editor.expense)
                  : emptyExpenseFormValues(today, formPropertyId, categories[0]?.id ?? "")
              }
              pending={pending || uploading}
              serverError={serverError}
              onSubmit={save}
              onCancel={cancel}
            />
          </div>
          <div className="order-1 grid gap-4 lg:sticky lg:top-4 lg:order-2">
            {preview ? (
              <ExpensePreview url={preview.url} mimeType={preview.mimeType} title="Invoice" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload the invoice if you have one. It stays beside the form so you can read the
                supplier, dates and amounts while you type them in.
              </p>
            )}
            <FileUpload
              file={null}
              onFileChange={(file) => {
                if (file) {
                  void upload(file);
                }
              }}
              disabled={uploading || pending || !formPropertyId}
              progress={progress}
            />
            {preview ? (
              <Button
                type="button"
                variant="outline"
                disabled={uploading || pending}
                onClick={removePreview}
              >
                Remove invoice
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {heading ? <h2 className="font-heading text-lg font-medium">{heading}</h2> : <div />}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={generate}>
            {generating ? "Generating…" : "Generate recurring expenses for this month"}
          </Button>
          <Button
            type="button"
            disabled={categories.length === 0 || properties.length === 0}
            onClick={() => {
              setServerError(null);
              setEditor({
                mode: "add",
                preview: null,
                propertyId:
                  lockedProperty?.id ??
                  (propertyId !== "all" ? propertyId : properties[0]?.id ?? ""),
              });
            }}
          >
            Add expense
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {lockedProperty ? null : (
          <Select value={propertyId} onValueChange={setPropertyId}>
            <SelectTrigger className="w-full sm:max-w-xs" aria-label="Property">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map((property) => (
                <SelectItem key={property.id} value={property.id}>
                  {property.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {expenseStatuses.map((item) => (
              <SelectItem key={item} value={item}>
                {expenseStatusLabels[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-full sm:max-w-xs" aria-label="Tax year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taxYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          onClick={() => downloadCsv(exportRows(expenses, scopedPropertyId, taxYear), categories, taxYear, today)}
        >
          Export tax year CSV
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Overdue rows are red. Rows due in the next 14 days are highlighted. The tax year uses the
        invoice date, or the due date when there is no invoice date. The CSV lists every category
        for the selected property and tax year.
      </p>
      {totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No category totals for this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Excl. VAT</TableHead>
                <TableHead className="text-right">VAT</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {totals.map((row) => (
                <TableRow key={row.categoryId}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.excl)}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.vat)}</TableCell>
                  <TableCell className="text-right">{formatZAR(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatZAR(totalsSum.excl)}</TableCell>
                <TableCell className="text-right">{formatZAR(totalsSum.vat)}</TableCell>
                <TableCell className="text-right">{formatZAR(totalsSum.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No expenses for this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Due</TableHead>
                {lockedProperty ? null : <TableHead>Property</TableHead>}
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((expense) => {
                const displayStatus = effectiveStatus(expense, today);
                const upcoming = isUpcoming(expense, today);

                return (
                  <TableRow
                    key={expense.id}
                    className={cn(
                      displayStatus === "overdue" && "bg-destructive/10 hover:bg-destructive/15",
                      upcoming && "bg-amber-500/15 hover:bg-amber-500/25",
                    )}
                  >
                    <TableCell>{formatDateOnly(expense.dueDate)}</TableCell>
                    {lockedProperty ? null : <TableCell>{expense.propertyName}</TableCell>}
                    <TableCell>
                      <div>{expense.categoryName}</div>
                      {expense.recurrence ? (
                        <p className="text-xs text-muted-foreground">
                          {recurrenceLabels[expense.recurrence]}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>{expense.supplier ?? "—"}</div>
                      {expense.description ? (
                        <p className="max-w-xs truncate text-xs text-muted-foreground">
                          {expense.description}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{formatZAR(expense.total)}</TableCell>
                    <TableCell>
                      <ExpenseStatusBadge status={displayStatus} upcoming={upcoming} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {expense.filePath ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void viewFile(expense, "invoice")}
                          >
                            Invoice
                          </Button>
                        ) : null}
                        {expense.proofFilePath ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void viewFile(expense, "proof")}
                          >
                            Proof
                          </Button>
                        ) : null}
                        {expense.billId ? (
                          <p className="max-w-44 text-right text-xs text-muted-foreground">
                            Edit this on the rates and levies bill
                          </p>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void openEditor(expense)}
                            >
                              Edit
                            </Button>
                            {displayStatus === "paid" ? null : (
                              <MarkPaidDialog expense={expense} today={today} />
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <Dialog
        open={viewer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewer(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>{viewer?.title ?? "File"}</DialogTitle>
            <DialogDescription>Saved with this expense.</DialogDescription>
          </DialogHeader>
          {viewer ? (
            <ExpensePreview url={viewer.url} mimeType={viewer.mimeType} title={viewer.title} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function compareExpenses(left: Expense, right: Expense, today: string): number {
  const rank = (expense: Expense) => {
    const current = effectiveStatus(expense, today);

    if (current === "overdue") {
      return 0;
    }

    if (current === "due") {
      return 1;
    }

    return 2;
  };
  const difference = rank(left) - rank(right);

  if (difference !== 0) {
    return difference;
  }

  if (rank(left) === 2) {
    return (right.paidDate ?? "").localeCompare(left.paidDate ?? "");
  }

  return left.dueDate.localeCompare(right.dueDate);
}

function exportRows(expenses: Expense[], propertyId: string, taxYear: string): Expense[] {
  return expenses.filter((expense) => {
    if (propertyId !== "all" && expense.propertyId !== propertyId) {
      return false;
    }

    return taxYear === "" || inTaxYear(expense, taxYear);
  });
}

function downloadCsv(
  expenses: Expense[],
  categories: ExpenseCategory[],
  taxYear: string,
  today: string,
) {
  const totals = categoryTotals(expenses, categories, true);
  const grand = grandTotals(totals);
  const lines = [
    ["Category", "Amount excl. VAT", "VAT", "Total"],
    ...totals.map((row) => [
      row.name,
      displayMoney(row.excl),
      displayMoney(row.vat),
      displayMoney(row.total),
    ]),
    ["Total", displayMoney(grand.excl), displayMoney(grand.vat), displayMoney(grand.total)],
    [],
    [
      "Date",
      "Property",
      "Category",
      "Supplier",
      "Description",
      "Invoice number",
      "Amount excl. VAT",
      "VAT",
      "Total",
      "Status",
    ],
    ...expenses.map((expense) => [
      formatDateOnly(expenseTaxDate(expense)),
      expense.propertyName,
      expense.categoryName,
      expense.supplier ?? "",
      expense.description ?? "",
      expense.invoiceNumber ?? "",
      displayMoney(expense.amountExclVat),
      displayMoney(expense.vatAmount),
      displayMoney(expense.total),
      expenseStatusLabels[effectiveStatus(expense, today)],
    ]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expenses-${taxYear.replace("/", "-") || "tax-year"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function displayMoney(amount: string): string {
  return formatZAR(amount).replace(/[\u00a0\u202f]/g, " ");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}
