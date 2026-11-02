"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { FileUpload } from "@/components/documents/file-upload";
import { PayoutChart } from "@/components/statements/payout-chart";
import { StatementForm } from "@/components/statements/statement-form";
import { StatementPreview } from "@/components/statements/statement-preview";
import { StatementStatusBadge } from "@/components/statements/statement-status-badge";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatZAR } from "@/lib/format";
import { centsToMoney } from "@/lib/invoices/calc";
import { formatMonthLabel } from "@/lib/invoices/period";
import {
  averageDailyRate,
  deductionsCents,
  occupancyLabel,
  payoutSeries,
} from "@/lib/statements/calc";
import { uploadStatementFile } from "@/lib/statements/browser-upload";
import {
  createOwnerStatement,
  discardStatementUpload,
  markStatementReceived,
  openSavedStatement,
  openUploadedStatement,
  startStatementUpload,
  updateOwnerStatement,
} from "@/lib/statements/actions";
import {
  emptyStatementFormValues,
  statementToFormValues,
  type StatementFormValues,
} from "@/lib/statements/schema";
import type { OwnerStatement, StatementPreview as PreviewFile } from "@/lib/statements/types";

type Editor =
  | { mode: "list" }
  | { mode: "add"; preview: PreviewFile | null }
  | { mode: "edit"; statement: OwnerStatement; preview: PreviewFile | null };

export function PropertyStatements({
  propertyId,
  statements,
  today,
}: {
  propertyId: string;
  statements: OwnerStatement[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<Editor>({ mode: "list" });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ title: string; url: string; mimeType: string } | null>(
    null,
  );

  const preview = editor.mode === "list" ? null : editor.preview;

  async function upload(file: File | null) {
    if (!file || editor.mode === "list") {
      return;
    }

    setUploading(true);
    setProgress({ value: 0, label: "Uploading statement" });
    const started = await startStatementUpload({
      propertyId,
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
      await uploadStatementFile(started.path, file, started.contentType, (value) => {
        setProgress({ value, label: "Uploading statement" });
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the file.");
      setUploading(false);
      setProgress(null);
      return;
    }

    const opened = await openUploadedStatement({ propertyId, path: started.path });

    if ("error" in opened) {
      await discardStatementUpload(started.path);
      toast.error(opened.error);
      setUploading(false);
      setProgress(null);
      return;
    }

    const previous = editor.preview;

    setEditor((current) => {
      if (current.mode === "list") {
        void discardStatementUpload(started.path);
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
      await discardStatementUpload(previous.path);
    }
    setUploading(false);
    setProgress(null);
  }

  function cancel() {
    const current = editor.mode === "list" ? null : editor.preview;

    if (current && !current.persisted) {
      void discardStatementUpload(current.path);
    }

    setServerError(null);
    setEditor({ mode: "list" });
  }

  function save(values: StatementFormValues) {
    if (editor.mode === "list" || !editor.preview) {
      setServerError("Upload the statement first.");
      return;
    }

    const path = editor.preview.path;
    const editing = editor.mode === "edit" ? editor.statement : null;

    startTransition(async () => {
      const result = editing
        ? await updateOwnerStatement({
            ...values,
            propertyId,
            path,
            statementId: editing.id,
          })
        : await createOwnerStatement({ ...values, propertyId, path });

      if ("error" in result) {
        setServerError(result.error);
        return;
      }

      setServerError(null);
      setEditor({ mode: "list" });
      router.refresh();
    });
  }

  function markReceived(statement: OwnerStatement) {
    startTransition(async () => {
      const result = await markStatementReceived(statement.id);

      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }

      router.refresh();
    });
  }

  async function viewStatement(statement: OwnerStatement) {
    const opened = await openSavedStatement(statement.id);

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setViewer({
      title: formatMonthLabel(statement.periodMonth.slice(0, 7)),
      url: opened.url,
      mimeType: opened.mimeType,
    });
  }

  async function openEditor(statement: OwnerStatement) {
    const opened = await openSavedStatement(statement.id);

    if ("error" in opened) {
      toast.error(opened.error);
      return;
    }

    setEditor({
      mode: "edit",
      statement,
      preview: {
        path: statement.filePath,
        url: opened.url,
        mimeType: opened.mimeType,
        persisted: true,
      },
    });
  }

  return (
    <div className="grid gap-8">
      {editor.mode === "list" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-medium">Owner&apos;s statements</h2>
            <Button
              type="button"
              onClick={() => {
                setServerError(null);
                setEditor({ mode: "add", preview: null });
              }}
            >
              Add owner&apos;s statement
            </Button>
          </div>
          <PayoutChart points={payoutSeries(statements, today)} />
          {statements.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No owner&apos;s statements for this property yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Nights</TableHead>
                    <TableHead className="text-right">Occupancy</TableHead>
                    <TableHead className="text-right">ADR</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Deductions</TableHead>
                    <TableHead className="text-right">Net payout</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((statement) => {
                    const deductions = deductionsCents(statement);
                    const adr = averageDailyRate(statement.grossIncome, statement.nightsBooked);
                    const occupancy = occupancyLabel(statement.nightsBooked, statement.periodMonth);

                    return (
                      <TableRow key={statement.id}>
                        <TableCell>
                          {formatMonthLabel(statement.periodMonth.slice(0, 7))}
                        </TableCell>
                        <TableCell className="text-right">{statement.nightsBooked}</TableCell>
                        <TableCell className="text-right">{occupancy ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          {adr ? formatZAR(adr) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatZAR(statement.grossIncome)}
                        </TableCell>
                        <TableCell className="text-right">
                          {deductions === null ? "—" : formatZAR(centsToMoney(deductions))}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatZAR(statement.netPayout)}
                        </TableCell>
                        <TableCell>
                          <StatementStatusBadge status={statement.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void viewStatement(statement)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setServerError(null);
                                void openEditor(statement);
                              }}
                            >
                              Edit
                            </Button>
                            {statement.status === "expected" ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={() => markReceived(statement)}
                              >
                                Mark received
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <section className="grid gap-4">
          <h2 className="font-heading text-lg font-medium">
            {editor.mode === "edit" ? "Edit owner's statement" : "Add owner's statement"}
          </h2>
          {preview ? (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <StatementForm
                key={editor.mode === "edit" ? editor.statement.id : "new"}
                defaultValues={
                  editor.mode === "edit"
                    ? statementToFormValues(editor.statement)
                    : emptyStatementFormValues(today)
                }
                pending={pending || uploading}
                serverError={serverError}
                onSubmit={save}
                onCancel={cancel}
              />
              <div className="grid gap-4">
                <StatementPreview url={preview.url} mimeType={preview.mimeType} />
                <FileUpload
                  file={null}
                  onFileChange={(file) => {
                    if (file) {
                      void upload(file);
                    }
                  }}
                  disabled={uploading || pending}
                  progress={progress}
                />
              </div>
            </div>
          ) : (
            <div className="grid max-w-xl gap-3">
              <p className="text-sm text-muted-foreground">
                Upload the PDF or image first. It stays beside the form so you can read the
                figures while you type them in.
              </p>
              <FileUpload
                file={null}
                onFileChange={(file) => {
                  if (file) {
                    void upload(file);
                  }
                }}
                disabled={uploading}
                progress={progress}
              />
            </div>
          )}
        </section>
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
            <DialogTitle>{viewer?.title ?? "Statement"}</DialogTitle>
            <DialogDescription>Owner&apos;s statement for this month.</DialogDescription>
          </DialogHeader>
          {viewer ? <StatementPreview url={viewer.url} mimeType={viewer.mimeType} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
