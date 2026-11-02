import { notFound } from "next/navigation";

import { BillBrowser } from "@/components/bills/bill-browser";
import { TablePager } from "@/components/ui/table-pager";
import { loadBills } from "@/lib/bills/queries";
import { johannesburgDateOnly } from "@/lib/format";
import { parsePage } from "@/lib/pagination";
import { propertyTabPath } from "@/lib/properties/paths";
import { getProperty } from "@/lib/properties/queries";

type RatesPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function PropertyRatesPage({ params, searchParams }: RatesPageProps) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);
  const [result, billDesk] = await Promise.all([getProperty(id), loadBills(id, page)]);

  if (result.status === "not_found") {
    notFound();
  }

  if (result.status === "error") {
    return <p className="text-sm text-destructive">{result.message}</p>;
  }

  if (!billDesk.ok) {
    return <p className="text-sm text-destructive">{billDesk.message}</p>;
  }

  return (
    <div className="grid gap-4">
      <BillBrowser
        bills={billDesk.bills}
        properties={billDesk.properties}
        today={johannesburgDateOnly()}
        lockedProperty={{ id, name: result.property.name }}
        canDelete={result.isAdmin}
      />
      <TablePager
        page={billDesk.page}
        pageCount={billDesk.pageCount}
        path={propertyTabPath(id, "rates-levies")}
      />
    </div>
  );
}
