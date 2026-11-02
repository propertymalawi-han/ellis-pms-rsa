"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FileText, Pencil, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DocumentPreviewSheet } from "@/components/documents/document-preview-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deletePropertyDocument,
  refreshDocumentPreviewUrls,
  renamePropertyDocument,
  updatePropertyDocumentCategory,
} from "@/lib/documents/actions";
import {
  documentCategories,
  documentCategoryLabels,
  SIGNED_URL_REFRESH_LEAD_MS,
  type DocumentCategory,
} from "@/lib/documents/labels";
import { documentNameSchema } from "@/lib/documents/schema";
import type { DocumentListItem } from "@/lib/documents/types";
import { formatDate, formatFileSize } from "@/lib/format";

export function DocumentTable({
  documents,
  isAdmin,
  showProperty = false,
  emptyMessage,
}: {
  documents: DocumentListItem[];
  isAdmin: boolean;
  showProperty?: boolean;
  emptyMessage: string;
}) {
  const [items, setItems] = useState(documents);
  const [preview, setPreview] = useState<DocumentListItem | null>(null);

  useEffect(() => {
    setItems(documents);
  }, [documents]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const expiresAt = items.reduce((soonest, item) => {
      const time = Date.parse(item.previewExpiresAt);
      return Number.isNaN(time) ? soonest : Math.min(soonest, time);
    }, Number.POSITIVE_INFINITY);

    if (!Number.isFinite(expiresAt)) {
      return;
    }

    let cancelled = false;

    async function refresh() {
      const result = await refreshDocumentPreviewUrls(items.map((item) => item.id));

      if (cancelled || "error" in result) {
        return;
      }

      const byId = new Map(result.previews.map((item) => [item.id, item]));
      setItems((current) =>
        current.map((item) => {
          const next = byId.get(item.id);
          return next
            ? {
                ...item,
                previewUrl: next.previewUrl,
                thumbnailUrl: next.thumbnailUrl,
                previewExpiresAt: next.previewExpiresAt,
              }
            : item;
        }),
      );
      setPreview((current) => {
        if (!current) {
          return current;
        }

        const next = byId.get(current.id);
        return next
          ? {
              ...current,
              previewUrl: next.previewUrl,
              thumbnailUrl: next.thumbnailUrl,
              previewExpiresAt: next.previewExpiresAt,
            }
          : current;
      });
    }

    const delay = expiresAt - SIGNED_URL_REFRESH_LEAD_MS - Date.now();

    if (delay <= 0) {
      void refresh();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      void refresh();
    }, delay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [items]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">File</TableHead>
              {showProperty ? <TableHead>Property</TableHead> : null}
              <TableHead>Category</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <DocumentRow key={item.id} item={item} showProperty={showProperty} isAdmin={isAdmin} onView={setPreview} />
            ))}
          </TableBody>
        </Table>
      </div>
      <DocumentPreviewSheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreview(null);
          }
        }}
        title={preview?.name ?? "Document"}
        url={preview?.previewUrl ?? null}
        mimeType={preview?.mimeType ?? null}
      />
    </>
  );
}

function DocumentRow({
  item,
  showProperty,
  isAdmin,
  onView,
}: {
  item: DocumentListItem;
  showProperty: boolean;
  isAdmin: boolean;
  onView: (item: DocumentListItem) => void;
}) {
  const prefetched = useRef(false);
  const rowRef = useRef<HTMLTableRowElement>(null);
  const prefetch = useCallback(() => {
    if (prefetched.current || !item.previewUrl) {
      return;
    }

    prefetched.current = true;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = item.previewUrl;

    if (item.mimeType?.startsWith("image/")) {
      link.as = "image";
    } else if (item.mimeType === "application/pdf") {
      link.as = "document";
    }

    document.head.appendChild(link);
  }, [item.mimeType, item.previewUrl]);

  useEffect(() => {
    const node = rowRef.current;

    if (!node) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        prefetch();
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [prefetch]);

  return (
    <TableRow ref={rowRef} onMouseEnter={prefetch}>
      <TableCell>
        <button
          type="button"
          className="block overflow-hidden rounded-md border bg-muted"
          onClick={() => onView(item)}
          aria-label={`Preview ${item.name}`}
        >
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.thumbnailUrl} alt="" className="size-10 object-cover" />
          ) : (
            <span className="flex size-10 items-center justify-center text-muted-foreground">
              <FileText className="size-4" />
            </span>
          )}
        </button>
      </TableCell>
      {showProperty ? (
        <TableCell className="whitespace-normal">
          <Link
            href={`/properties/${item.propertyId}/overview`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {item.propertyName}
          </Link>
        </TableCell>
      ) : null}
      <TableCell>{documentCategoryLabels[item.category]}</TableCell>
      <TableCell className="whitespace-normal font-medium">{item.name}</TableCell>
      <TableCell>{formatDate(item.createdAt)}</TableCell>
      <TableCell>{item.uploadedByName}</TableCell>
      <TableCell>{item.fileSize === null ? "—" : formatFileSize(item.fileSize)}</TableCell>
      <TableCell className="text-right">
        <DocumentActions item={item} isAdmin={isAdmin} onView={() => onView(item)} />
      </TableCell>
    </TableRow>
  );
}

function DocumentActions({
  item,
  isAdmin,
  onView,
}: {
  item: DocumentListItem;
  isAdmin: boolean;
  onView: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<DocumentCategory>(item.category);
  const [formError, setFormError] = useState<string | null>(null);

  function downloadDocument() {
    if (!item.previewUrl) {
      toast.error("Could not download the document.");
      return;
    }

    const anchor = window.document.createElement("a");
    anchor.href = item.previewUrl;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    anchor.click();
  }

  function saveName() {
    setFormError(null);
    const parsed = documentNameSchema.safeParse(name);

    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Enter a document name.");
      return;
    }

    startTransition(async () => {
      const result = await renamePropertyDocument(item.id, parsed.data);

      if (result?.error) {
        setFormError(result.error);
        return;
      }

      setRenameOpen(false);
      toast.success("Document renamed.");
      router.refresh();
    });
  }

  function saveCategory() {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePropertyDocumentCategory(item.id, category);

      if (result?.error) {
        setFormError(result.error);
        return;
      }

      setCategoryOpen(false);
      toast.success("Category updated.");
      router.refresh();
    });
  }

  function remove() {
    setFormError(null);
    startTransition(async () => {
      const result = await deletePropertyDocument(item.id);

      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }

      setDeleteOpen(false);

      if (result && "warning" in result) {
        toast.warning(result.warning);
      } else {
        toast.success("Document deleted.");
      }

      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            aria-label={`Actions for ${item.name}`}
          >
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onView}>
            <Eye />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={downloadDocument}>
            <Download />
            Download
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setName(item.name);
              setFormError(null);
              setRenameOpen(true);
            }}
          >
            <Pencil />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setCategory(item.category);
              setFormError(null);
              setCategoryOpen(true);
            }}
          >
            <Tags />
            Change category
          </DropdownMenuItem>
          {isAdmin ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setFormError(null);
                setDeleteOpen(true);
              }}
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setRenameOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              This changes the name shown in the list. The stored file stays the same.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`rename-${item.id}`}>Name</Label>
            <Input
              id={`rename-${item.id}`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
            />
          </div>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={saveName}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={categoryOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setCategoryOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change category</DialogTitle>
            <DialogDescription>
              Choose the category for {item.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`category-${item.id}`}>Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as DocumentCategory)}
            >
              <SelectTrigger id={`category-${item.id}`} className="w-full">
                <SelectValue />
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
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setCategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={saveCategory}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!pending) {
            setDeleteOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              {item.name} will be removed from {item.propertyName}.
            </DialogDescription>
          </DialogHeader>
          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={remove}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
