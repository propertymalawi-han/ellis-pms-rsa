"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, Pencil, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
  getPropertyDocumentUrl,
  renamePropertyDocument,
  updatePropertyDocumentCategory,
} from "@/lib/documents/actions";
import {
  documentCategories,
  documentCategoryLabels,
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
  if (documents.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
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
          {documents.map((item) => (
            <TableRow key={item.id}>
              {showProperty ? (
                <TableCell className="whitespace-normal">
                  <Link
                    href={`/properties/${item.propertyId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.propertyName}
                  </Link>
                </TableCell>
              ) : null}
              <TableCell>{documentCategoryLabels[item.category]}</TableCell>
              <TableCell className="whitespace-normal font-medium">
                {item.name}
              </TableCell>
              <TableCell>{formatDate(item.createdAt)}</TableCell>
              <TableCell>{item.uploadedByName}</TableCell>
              <TableCell>
                {item.fileSize === null ? "—" : formatFileSize(item.fileSize)}
              </TableCell>
              <TableCell className="text-right">
                <DocumentActions item={item} isAdmin={isAdmin} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DocumentActions({
  item,
  isAdmin,
}: {
  item: DocumentListItem;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<DocumentCategory>(item.category);
  const [formError, setFormError] = useState<string | null>(null);

  function openDocument(mode: "view" | "download") {
    startTransition(async () => {
      const result = await getPropertyDocumentUrl(item.id, mode);

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      if (mode === "view") {
        const opened = window.open(result.url, "_blank", "noopener,noreferrer");

        if (!opened) {
          toast.error("Allow pop-ups to view this document.");
        }

        return;
      }

      const anchor = window.document.createElement("a");
      anchor.href = result.url;
      anchor.rel = "noopener";
      anchor.click();
    });
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
          <DropdownMenuItem onSelect={() => openDocument("view")}>
            <Eye />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openDocument("download")}>
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
