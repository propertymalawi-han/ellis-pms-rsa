"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TablePager({
  page,
  pageCount,
  path,
  param = "page",
  preserved,
}: {
  page: number;
  pageCount: number;
  path: string;
  param?: string;
  preserved?: Record<string, string | number | undefined>;
}) {
  if (pageCount <= 1) {
    return null;
  }

  function href(nextPage: number) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(preserved ?? {})) {
      if (key === param || value === undefined || String(value) === "" || String(value) === "1") {
        continue;
      }

      params.set(key, String(value));
    }

    if (nextPage > 1) {
      params.set(param, String(nextPage));
    }

    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <PagerLink href={page > 1 ? href(page - 1) : null} label="Previous" />
        <PagerLink href={page < pageCount ? href(page + 1) : null} label="Next" />
      </div>
    </div>
  );
}

function PagerLink({ href, label }: { href: string | null; label: string }) {
  const className = cn(buttonVariants({ variant: "outline", size: "sm" }));

  if (!href) {
    return <span className={cn(className, "pointer-events-none opacity-50")}>{label}</span>;
  }

  return (
    <Link href={href} prefetch className={className}>
      {label}
    </Link>
  );
}
