import { notFound } from "next/navigation";

import { PropertyIncome } from "@/components/properties/property-income";
import { PropertyStatements } from "@/components/statements/property-statements";
import { TablePager } from "@/components/ui/table-pager";
import { johannesburgDateOnly } from "@/lib/format";
import { listPropertyIncome } from "@/lib/invoices/queries";
import { parsePage } from "@/lib/pagination";
import { propertyTabPath } from "@/lib/properties/paths";
import { getProperty } from "@/lib/properties/queries";
import { listPropertyStatements } from "@/lib/statements/queries";

type IncomePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; payPage?: string }>;
};

export default async function PropertyIncomePage({ params, searchParams }: IncomePageProps) {
  const { id } = await params;
  const query = await searchParams;
  const page = parsePage(query.page);
  const payPage = parsePage(query.payPage);
  const result = await getProperty(id);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  const path = propertyTabPath(id, "income");

  if (result.property.rentalType === "long_term") {
    const income = await listPropertyIncome(id, page, payPage);

    if (!income.ok) {
      return <p className="text-sm text-destructive">{income.message}</p>;
    }

    return (
      <PropertyIncome
        invoices={income.invoices}
        payments={income.payments}
        invoicePager={
          <TablePager
            page={income.invoicePage}
            pageCount={income.invoicePageCount}
            path={path}
            preserved={{ payPage }}
          />
        }
        paymentPager={
          <TablePager
            page={income.paymentPage}
            pageCount={income.paymentPageCount}
            path={path}
            param="payPage"
            preserved={{ page }}
          />
        }
        canDeleteAny={result.isAdmin}
      />
    );
  }

  const statements = await listPropertyStatements(id, page);

  if (!statements.ok) {
    return <p className="text-sm text-destructive">{statements.message}</p>;
  }

  return (
    <div className="grid gap-4">
      <PropertyStatements
        propertyId={id}
        statements={statements.statements}
        today={johannesburgDateOnly()}
      />
      <TablePager page={statements.page} pageCount={statements.pageCount} path={path} />
    </div>
  );
}
