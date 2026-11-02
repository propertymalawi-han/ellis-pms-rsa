import type { Metadata } from "next";
import Link from "next/link";

import { GenerateRentButton } from "@/components/invoices/generate-rent-button";
import { InvoiceBrowser } from "@/components/invoices/invoice-browser";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { johannesburgDateOnly } from "@/lib/format";
import { listInvoiceProperties, listInvoices } from "@/lib/invoices/queries";

export const metadata: Metadata = {
  title: "Invoices",
};

export default async function InvoicesPage() {
  const [invoices, properties] = await Promise.all([
    listInvoices(),
    listInvoiceProperties(),
  ]);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Drafts stay drafts until you mark them sent. Outstanding and overdue exclude drafts."
        actions={
          <>
            <GenerateRentButton />
            <Button asChild>
              <Link href="/invoices/new">New invoice</Link>
            </Button>
          </>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Generate this month&apos;s rent invoices creates a draft for each active lease that
        does not already have one. The due date is the lease rent due day, and VAT is not added.
      </p>
      {!invoices.ok ? (
        <p className="text-sm text-destructive">{invoices.message}</p>
      ) : !properties.ok ? (
        <p className="text-sm text-destructive">{properties.message}</p>
      ) : (
        <InvoiceBrowser
          invoices={invoices.invoices}
          properties={properties.properties}
          today={johannesburgDateOnly()}
        />
      )}
    </div>
  );
}
