"use client";

import { useEffect, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

export function DocumentPreviewSheet({
  open,
  onOpenChange,
  title,
  url,
  mimeType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string | null;
  mimeType: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const image = mimeType?.startsWith("image/") ?? false;

  useEffect(() => {
    setLoaded(false);
  }, [open, url]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="pr-8">{title}</SheetTitle>
          <SheetDescription>
            {url ? (
              <a href={url} rel="noreferrer" className="underline-offset-4 hover:underline">
                Download
              </a>
            ) : (
              "This file could not be opened."
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="relative min-h-[70vh] flex-1 px-4 pb-4">
          {url && image ? (
            // Signed storage URLs are temporary and are not a configured image host.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={title}
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={
                loaded
                  ? "h-full max-h-[calc(100svh-8rem)] w-full rounded-lg border object-contain"
                  : "sr-only"
              }
            />
          ) : null}
          {url && !image ? (
            <iframe
              title={title}
              src={url}
              onLoad={() => setLoaded(true)}
              className={
                loaded
                  ? "h-[calc(100svh-8rem)] w-full rounded-lg border bg-muted"
                  : "h-[calc(100svh-8rem)] w-full rounded-lg border opacity-0"
              }
            />
          ) : null}
          {url && !loaded ? <Skeleton className="absolute inset-4 z-10 rounded-lg" /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
