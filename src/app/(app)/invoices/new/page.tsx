import type { Metadata } from "next";

import { InvoiceForm } from "@/components/invoices/invoice-form";
import { PageHeader } from "@/components/layout/page-header";
import { johannesburgDateOnly } from "@/lib/format";
import { johannesburgYearMonth, monthBounds, addCalendarDays } from "@/lib/invoices/period";
import { listLeaseOptions } from "@/lib/invoices/queries";
import { emptyInvoiceFormValues } from "@/lib/invoices/schema";
import { getBusinessSettings } from "@/lib/settings/queries";

export const metadata: Metadata = {
  title: "New invoice",
};

export default async function NewInvoicePage() {
  const [leases, settings] = await Promise.all([
    listLeaseOptions(),
    getBusinessSettings(),
  ]);
  const today = johannesburgDateOnly();
  const { year, month } = johannesburgYearMonth();
  const bounds = monthBounds(year, month);
  const terms = settings.ok ? settings.settings.paymentTermsDays : 7;
  const defaults = emptyInvoiceFormValues();
  defaults.issueDate = today;
  defaults.dueDate = addCalendarDays(today, terms);
  defaults.periodStart = bounds.start;
  defaults.periodEnd = bounds.end;

  return (
    <div>
      <PageHeader
        title="New invoice"
        description="Choose a lease to prefill the rent. Add water, electricity recovery, a late fee, or any other line. VAT is 15% and optional on each line."
      />
      {!leases.ok ? (
        <p className="text-sm text-destructive">{leases.message}</p>
      ) : leases.leases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a lease before creating an invoice.
        </p>
      ) : (
        <InvoiceForm
          invoiceId={null}
          leases={leases.leases}
          defaultValues={defaults}
          linesLocked={false}
        />
      )}
    </div>
  );
}
