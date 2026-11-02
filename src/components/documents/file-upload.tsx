"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Upload, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_FILE_RULES,
} from "@/lib/documents/labels";
import { validateUploadFile } from "@/lib/documents/schema";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FileUpload({
  id,
  file,
  onFileChange,
  disabled = false,
  progress = null,
}: {
  id?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  progress?: { value: number; label: string } | null;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const rulesId = `${inputId}-rules`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  function choose(next: File | null, rejected?: string) {
    setError(rejected ?? null);

    if (next) {
      onFileChange(next);
    }
  }

  function takeFile(candidate: File | undefined, extraCount = 0) {
    if (extraCount > 0) {
      choose(null, "Upload one file at a time.");
      return;
    }

    const uploaded = validateUploadFile(candidate);

    if (!uploaded.ok) {
      choose(null, uploaded.message);
      return;
    }

    choose(uploaded.file);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);

    if (disabled) {
      return;
    }

    const files = event.dataTransfer.files;
    takeFile(files[0], Math.max(0, files.length - 1));
  }

  return (
    <div className="grid gap-2">
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        }}
        onDrop={onDrop}
        aria-disabled={disabled}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
          dragging
            ? "border-primary bg-muted"
            : "border-input hover:bg-muted/50",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <Upload className="size-5 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drag a file here, or browse
        </span>
        <span id={rulesId} className="text-xs text-muted-foreground">
          {DOCUMENT_FILE_RULES}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={DOCUMENT_FILE_ACCEPT}
          disabled={disabled}
          aria-describedby={error ? `${rulesId} ${errorId}` : rulesId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const files = event.target.files;
            takeFile(files?.[0], Math.max(0, (files?.length ?? 0) - 1));
            event.target.value = "";
          }}
        />
      </label>
      {file ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(file.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label="Remove file"
            onClick={() => {
              setError(null);
              onFileChange(null);
            }}
          >
            <XIcon />
          </Button>
        </div>
      ) : null}
      {progress ? (
        <div className="grid gap-1.5">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.value}
            aria-label={progress.label}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress.value}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {progress.label}
            {progress.value < 100 ? ` ${progress.value}%` : null}
          </p>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
