"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DocumentTable } from "@/components/documents/document-table";
import { FileUpload } from "@/components/documents/file-upload";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePager } from "@/components/ui/table-pager";
import { uploadPropertyDocumentFile } from "@/lib/documents/browser-upload";
import { prepareDocumentUpload } from "@/lib/documents/prepare-upload";
import {
  displayNameFromFile,
  documentFieldsSchema,
  thumbnailPathFor,
  validateUploadFile,
} from "@/lib/documents/schema";
import {
  discardPropertyDocumentUpload,
  finishPropertyDocumentUpload,
  startPropertyDocumentUpload,
} from "@/lib/documents/actions";
import {
  DOCUMENT_FILE_RULES,
  categoryFilterOptions,
  documentCategories,
  documentCategoryLabels,
  isDocumentCategory,
  type DocumentCategory,
} from "@/lib/documents/labels";
import type { DocumentListItem } from "@/lib/documents/types";

export function PropertyDocuments({
  propertyId,
  documents,
  isAdmin,
  page,
  pageCount,
}: {
  propertyId: string;
  documents: DocumentListItem[];
  isAdmin: boolean;
  page: number;
  pageCount: number;
}) {
  const [category, setCategory] = useState<"all" | DocumentCategory>("all");
  const visible =
    category === "all"
      ? documents
      : documents.filter((item) => item.category === category);

  return (
    <div className="grid gap-4">
      <UploadCard propertyId={propertyId} />
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            Files are stored privately. Preview links last for an hour and are
            refreshed before they expire.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="sm:max-w-xs">
            <Select
              value={category}
              onValueChange={(value) => {
                if (value === "all" || isDocumentCategory(value)) {
                  setCategory(value);
                }
              }}
            >
              <SelectTrigger className="w-full" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                {categoryFilterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DocumentTable
            documents={visible}
            isAdmin={isAdmin}
            emptyMessage={
              documents.length === 0
                ? "No documents yet."
                : "No documents in this category."
            }
          />
          <TablePager
            page={page}
            pageCount={pageCount}
            path={`/properties/${propertyId}/documents`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function UploadCard({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ value: number; label: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function onFileChange(next: File | null) {
    setFile(next);
    setError(null);

    if (next && !nameTouched) {
      setName(displayNameFromFile(next.name));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = documentFieldsSchema.safeParse({
      propertyId,
      name,
      category,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the document and try again.");
      return;
    }

    const uploaded = validateUploadFile(file);

    if (!uploaded.ok) {
      setError(uploaded.message);
      return;
    }

    setBusy(true);
    setProgress({ value: 0, label: "Preparing…" });

    let prepared: Awaited<ReturnType<typeof prepareDocumentUpload>>;

    try {
      prepared = await prepareDocumentUpload(uploaded.file);
    } catch (prepareError) {
      setBusy(false);
      setProgress(null);
      setError(
        prepareError instanceof Error
          ? prepareError.message
          : "Could not prepare the file.",
      );
      return;
    }

    const ready = validateUploadFile(prepared.file);

    if (!ready.ok) {
      setBusy(false);
      setProgress(null);
      setError(ready.message);
      return;
    }

    setProgress({ value: 0, label: "Uploading…" });

    const started = await startPropertyDocumentUpload({
      propertyId: parsed.data.propertyId,
      name: parsed.data.name,
      category: parsed.data.category,
      fileName: ready.file.name,
      fileSize: ready.file.size,
      contentType: ready.contentType,
    });

    if ("error" in started) {
      setBusy(false);
      setProgress(null);
      setError(started.error);
      return;
    }

    let thumbnailPath: string | undefined;

    try {
      await uploadPropertyDocumentFile(
        started.path,
        ready.file,
        ready.contentType,
        (value) => {
          setProgress({ value, label: "Uploading…" });
        },
      );
    } catch (uploadError) {
      await discardPropertyDocumentUpload(started.path);
      setBusy(false);
      setProgress(null);
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Could not upload the file.",
      );
      return;
    }

    if (prepared.thumbnail) {
      const thumbPath = thumbnailPathFor(started.path);

      if (thumbPath) {
        try {
          await uploadPropertyDocumentFile(
            thumbPath,
            prepared.thumbnail,
            "image/jpeg",
            () => undefined,
          );
          thumbnailPath = thumbPath;
        } catch (thumbnailError) {
          console.error(thumbnailError);
        }
      }
    }

    setProgress({ value: 100, label: "Saving…" });
    const finished = await finishPropertyDocumentUpload({
      propertyId: parsed.data.propertyId,
      name: parsed.data.name,
      category: parsed.data.category,
      path: started.path,
      thumbnailPath,
    });

    setBusy(false);
    setProgress(null);

    if (finished?.error) {
      setError(finished.error);
      return;
    }

    setName("");
    setNameTouched(false);
    setCategory("");
    setFile(null);
    toast.success("Document uploaded.");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload</CardTitle>
        <CardDescription>{DOCUMENT_FILE_RULES}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="document-name">Name</Label>
              <Input
                id="document-name"
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-category">Category</Label>
              <Select
                value={category}
                disabled={busy}
                onValueChange={(value) => setCategory(value as DocumentCategory)}
              >
                <SelectTrigger id="document-category" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                  {documentCategories.map((value) => (
                    <SelectItem key={value} value={value}>
                      {documentCategoryLabels[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <FileUpload
            id="document-file"
            file={file}
            onFileChange={onFileChange}
            disabled={busy}
            progress={progress}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div>
            <Button type="submit" disabled={busy}>
              {progress?.label ?? "Upload document"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
