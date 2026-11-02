"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { generateMonthlyRentInvoices } from "@/lib/invoices/actions";

export function GenerateRentButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const result = await generateMonthlyRentInvoices();
    setPending(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    if (result.created === 0 && result.skipped === 0) {
      toast.message("There are no active leases for this month.");
      return;
    }

    if (result.created === 0) {
      toast.message("Every active lease already has an invoice for this month.");
      return;
    }

    const created =
      result.created === 1
        ? "Created 1 draft rent invoice."
        : `Created ${result.created} draft rent invoices.`;
    const skipped =
      result.skipped > 0 ? ` ${result.skipped} already had one for this month.` : "";

    if (result.pdfFailed > 0) {
      toast.warning(`${created}${skipped} ${result.pdfFailed} PDFs could not be saved.`);
    } else {
      toast.success(`${created}${skipped}`);
    }

    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
      {pending ? "Generating…" : "Generate this month's rent invoices"}
    </Button>
  );
}
