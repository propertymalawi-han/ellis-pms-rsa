"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { BillForm } from "@/components/bills/bill-form";
import { ChargesChart } from "@/components/bills/charges-chart";
import { MarkBillPaidDialog } from "@/components/bills/mark-paid-dialog";
import { FileUpload } from "@/components/documents/file-upload";
import { ExpensePreview } from "@/components/expenses/expense-preview";
import { ExpenseStatusBadge } from "@/components/expenses/expense-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { uploadBillFile } from "@/lib/bills/browser-upload";
import {
  billFieldDefaults,
  createBill,
  discardBillUpload,
  openSavedBillFile,
  openUploadedBillFile,
  startBillUpload,
  updateBill,
} from "@/lib/bills/actions";
import type { BillType } from "@/lib/bills/labels";
import {
  billToFormValues,
  defaultBillType,
  emptyBillFormValues,
  type BillFormValues,
} from "@/lib/bills/schema";
import type {
  BillFieldDefaults,
  BillPreview as PreviewFile,
  BillProperty,
  RatesBill,
} from "@/lib/bills/types";
import { chargeSeries, propertyBillSummary, utilitiesCents } from "@/lib/bills/summary";
import { effectiveStatus, isUpcoming } from "@/lib/expenses/calc";
import { formatDateOnly, formatZAR } from "@/lib/format";
import { centsToMoney } from "@/lib/invoices/calc";
import { formatMonthLabel } from "@/lib/invoices/period";
import { cn } from "@/lib/utils";

type Editor =
  | { mode: "list" }
  | { mode: "add"; preview: PreviewFile | null; propertyId: string }
  | { mode: "edit"; bill: RatesBill; preview: PreviewFile | null };

const emptySuggestions: BillFieldDefaults = { issuerName: "", accountNumber: "" };

export function BillBrowser({
  bills,
  properties,
  today,
  lockedProperty,
}: {
  bills: RatesBill[];
  properties: BillProperty[];
  today: string;
  lockedProperty: { id: string; name: string };
}) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor>({ mode: "list" });
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BillFieldDefaults>(emptySuggestions);
  const [viewer, setViewer] = useState<{ title: string; url: string; mimeType: string } | null>(
    null,
  );
  const lookupId = useRef(0);

  const rows = useMemo(() => {
    return bills
      .filter((bill) => bill.propertyId === lockedProperty.id)
      .sort((left, right) => compareBills(left, right));
  }, [bills, lockedProperty.id]);
  const summary = useMemo(() => propertyBillSummary(rows, today), [rows, today]);
  const series = useMemo(() => chargeSeries(rows, today), [rows, today]);

  const preview = editor.mode === "list" ? null : editor.preview;
  const formPropertyId =
    editor.mode === "edit"
      ? editor.bill.propertyId
      : editor.mode === "add"
        ? editor.propertyId
        : "";
  const propertyLabel =
    editor.mode === "edit"
      ? editor.bill.propertyName
      : lockedProperty?.name ?? properties.find((property) => property.id === formPropertyId)?.name;
  const addProperty = properties.find((property) => property.id === formPropertyId);

  const lookup = useCallback(async (context: {
    propertyId: string;
    billType: BillType;
    periodMonth: string;
  }) => {
    if (!context.propertyId) {
      return;
    }

    const id = lookupId.current + 1;
    lookupId.current = id;
    const result = await billFieldDefaults(context);

    if (lookupId.current !== id) {
      return;
    }

    if ("error" in result) {
      return;
    }

    setSuggestions((current) =>
      current.issuerName === result.issuerName && current.accountNumber === result.accountNumber
        ? current
        : result,
    );
  }, []);

  async function upload(file: File | null) {
    if (!file || editor.mode === "list") {
      return;
    }

    const propertyForFile = editor.mode === "edit" ? editor.bill.propertyId : formPropertyId;

    if (!propertyForFile) {
      toast.error("Select a property before uploading a bill.");
      return;
    }

    setUploading(true);
    setProgress({ value: 0, label: "Uploading bill" });
    const started = await startBillUpload({
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
      await uploadBillFile(started.path, file, started.contentType, (value) => {
        setProgress({ value, label: "Uploading bill" });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the file.");
      setUploading(false);
      setProgress(null);
      return;
    }

    const opened = await openUploadedBillFile({
      propertyId: propertyForFile,
      path: started.path,
    });

    if ("error" in opened) {
      await discardBillUpload(started.path);
      toast.error(opened.error);
      setUploading(false);
      setProgress(null);
      return;
    }

    const previous = editor.preview;

    setEditor((current) => {
      if (current.mode === "list") {
        void discardBillUpload(started.path);
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
      await discardBillUpload(previous.path);
    }

    setUploading(false);
    setProgress(null);
  }

  function removePreview() {
    if (editor.mode === "list" || !editor.preview) {
      return;
    }

    if (!editor.preview.persisted) {
      void discardBillUpload(editor.preview.path);
    }

    setEditor((current) => (current.mode === "list" ? current : { ...current, preview: null }));
  }

  function cancel() {
    const current = editor.mode === "list" ? null : editor.preview;

    if (current && !current.persisted) {
      void discardBillUpload(current.path);
    }

    setServerError(null);
    setSuggestions(emptySuggestions);
    setEditor({ mode: "list" });
  }

  function save(values: BillFormValues) {
    if (editor.mode === "list") {
      return;
    }

    const path = editor.preview?.path ?? null;
    const editing = editor.mode === "edit" ? editor.bill : null;

    startTransition(async () => {
      const result = editing
        ? await updateBill({ ...values, path, billId: editing.id })
        : await createBill({ ...values, path });

      if ("error" in result) {
        setServerError(result.error);
        return;
      }

      setServerError(null);
      setSuggestions(emptySuggestions);
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
        void discardBillUpload(current.preview.path);
      }

      return { ...current, propertyId: nextPropertyId, preview: null };
    });
  }

  async function viewFile(bill: RatesBill, kind: "bill" | "proof") {
    const opened = await openSavedBillFile(bill.id, kind);

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setViewer({
      title: kind === "bill" ? "Bill" : "Proof of payment",
      url: opened.url,
      mimeType: opened.mimeType,
    });
  }

  async function openEditor(bill: RatesBill) {
    if (!bill.filePath) {
      setServerError(null);
      setEditor({ mode: "edit", bill, preview: null });
      return;
    }

    const opened = await openSavedBillFile(bill.id, "bill");

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setServerError(null);
    setEditor({
      mode: "edit",
      bill,
      preview: {
        path: bill.filePath,
        url: opened.url,
        mimeType: opened.mimeType,
        persisted: true,
      },
    });
  }

  if (editor.mode !== "list") {
    const editing = editor.mode === "edit" ? editor.bill : null;

    return (
      <section className="grid gap-4">
        <h2 className="font-heading text-lg font-medium">
          {editing ? "Edit bill" : "Add bill"}
        </h2>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className="order-1 grid gap-4 lg:sticky lg:top-4">
            {preview ? (
              <ExpensePreview url={preview.url} mimeType={preview.mimeType} title="Bill" />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload the bill if you have it. It stays beside the form so you can read the
                issuer, dates and amounts while you type them in. You can save without a file and
                attach the document later.
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
                Remove bill file
              </Button>
            ) : null}
          </div>
          <div className="order-2">
            <BillForm
              key={editing ? editing.id : "new"}
              properties={properties}
              lockProperty={Boolean(lockedProperty) || editor.mode === "edit"}
              propertyLabel={propertyLabel}
              suggestFields={editor.mode === "add"}
              suggestions={suggestions}
              onContextChange={lookup}
              onPropertyIdChange={changeDraftProperty}
              defaultValues={
                editing
                  ? billToFormValues(editing)
                  : emptyBillFormValues(
                      formPropertyId,
                      defaultBillType(addProperty?.propertyType ?? "freehold"),
                      today.slice(0, 7),
                    )
              }
              pending={pending || uploading}
              serverError={serverError}
              onSubmit={save}
              onCancel={cancel}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      <SummaryCards summary={summary} />
      <MissingBillNotice months={summary.missingMonths} hasBills={rows.length > 0} />
      <ChargesChart points={series} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="font-heading text-lg font-medium">Bills</h2>
        <Button
          type="button"
          disabled={properties.length === 0}
          onClick={() => {
            setServerError(null);
            setSuggestions(emptySuggestions);
            setEditor({
              mode: "add",
              preview: null,
              propertyId: lockedProperty.id,
            });
          }}
        >
          Add bill
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rates or levies bills entered yet.</p>
      ) : (
        <Table>
          <TableCaption className="text-left">
            Utilities are water, electricity, refuse, sewerage, other charges and interest. Months
            run newest first. Overdue rows are red.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Issuer</TableHead>
              <TableHead className="text-right">Levy</TableHead>
              <TableHead className="text-right">Special levy</TableHead>
              <TableHead className="text-right">Rates</TableHead>
              <TableHead className="text-right">Utilities</TableHead>
              <TableHead className="text-right">Arrears</TableHead>
              <TableHead className="text-right">Total due</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((bill) => {
              const displayStatus = effectiveStatus(bill, today);
              const upcoming = isUpcoming(bill, today);

              return (
                <TableRow
                  key={bill.id}
                  className={cn(
                    displayStatus === "overdue" && "bg-destructive/10 hover:bg-destructive/15",
                    upcoming && "bg-amber-500/15 hover:bg-amber-500/25",
                  )}
                >
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{formatMonthLabel(bill.periodMonth.slice(0, 7))}</span>
                      {bill.filePath ? null : <Badge variant="outline">Missing bill</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{bill.issuerName}</div>
                    {bill.accountNumber ? (
                      <p className="text-xs text-muted-foreground">{bill.accountNumber}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">{formatZAR(bill.levy)}</TableCell>
                  <TableCell className="text-right">{formatZAR(bill.specialLevy)}</TableCell>
                  <TableCell className="text-right">{formatZAR(bill.municipalRates)}</TableCell>
                  <TableCell className="text-right">
                    {formatZAR(centsToMoney(utilitiesCents(bill)))}
                  </TableCell>
                  <TableCell className="text-right">{formatZAR(bill.arrears)}</TableCell>
                  <TableCell className="text-right">{formatZAR(bill.totalDue)}</TableCell>
                  <TableCell>{formatDateOnly(bill.dueDate)}</TableCell>
                  <TableCell>
                    <ExpenseStatusBadge status={displayStatus} upcoming={upcoming} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {bill.filePath ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void viewFile(bill, "bill")}
                        >
                          View bill
                        </Button>
                      ) : null}
                      {bill.proofFilePath ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void viewFile(bill, "proof")}
                        >
                          Proof
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void openEditor(bill)}
                      >
                        Edit
                      </Button>
                      {displayStatus === "paid" ? null : (
                        <MarkBillPaidDialog bill={bill} today={today} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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
            <DialogDescription>Saved with this bill.</DialogDescription>
          </DialogHeader>
          {viewer ? (
            <ExpensePreview url={viewer.url} mimeType={viewer.mimeType} title={viewer.title} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCards({
  summary,
}: {
  summary: ReturnType<typeof propertyBillSummary>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard
        label="This month"
        value={summary.currentMonthTotal === null ? "—" : formatZAR(summary.currentMonthTotal)}
        detail={summary.currentMonthLabel}
      />
      <SummaryCard
        label="Outstanding"
        value={formatZAR(summary.outstanding)}
        detail="Due and overdue"
      />
      <SummaryCard
        label="Paid this tax year"
        value={formatZAR(summary.paidThisTaxYear)}
        detail="By payment date"
      />
      <SummaryCard
        label="Average monthly cost"
        value={summary.averageMonthlyCost === null ? "—" : formatZAR(summary.averageMonthlyCost)}
        detail="This tax year, arrears excluded"
      />
      <SummaryCard
        label="Vs last year"
        value={summary.yearOnYear ?? "—"}
        detail={
          summary.comparisonLabel
            ? `Charges against ${summary.comparisonLabel}`
            : "Charges, same month last year"
        }
        emphasize={summary.yearOnYear?.startsWith("+") ?? false}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  emphasize = false,
}: {
  label: string;
  value: string;
  detail: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-medium", emphasize && "text-destructive")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MissingBillNotice({ months, hasBills }: { months: string[]; hasBills: boolean }) {
  if (!hasBills) {
    return (
      <div
        className="flex gap-2 rounded-lg border border-foreground/15 bg-muted px-3 py-2 text-sm"
        role="status"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>No bill has been uploaded for this property.</p>
      </div>
    );
  }

  if (months.length === 0) {
    return null;
  }

  return (
    <div
      className="flex gap-2 rounded-lg border border-foreground/15 bg-muted px-3 py-2 text-sm"
      role="status"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-medium">Missing bill. </span>
        No bill uploaded for {months.map((month) => formatMonthLabel(month)).join(", ")}.
      </p>
    </div>
  );
}

function compareBills(left: RatesBill, right: RatesBill): number {
  const period = right.periodMonth.localeCompare(left.periodMonth);

  if (period !== 0) {
    return period;
  }

  const due = right.dueDate.localeCompare(left.dueDate);

  if (due !== 0) {
    return due;
  }

  return left.issuerName.localeCompare(right.issuerName, "en-ZA");
}
