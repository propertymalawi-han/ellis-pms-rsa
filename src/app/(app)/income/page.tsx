import type { Metadata } from "next";

import { IncomeBrowser } from "@/components/income/income-browser";
import { PageHeader } from "@/components/layout/page-header";
import { johannesburgDateOnly } from "@/lib/format";
import { listIncome } from "@/lib/income/queries";

export const metadata: Metadata = {
  title: "Income",
};

export default async function IncomePage() {
  const income = await listIncome();
  const today = johannesburgDateOnly();

  return (
    <div>
      <PageHeader
        title="Income"
        description="Long-term rent payments and short-term owner's statements, by property and tax year."
      />
      {income.ok ? (
        <IncomeBrowser entries={income.entries} properties={income.properties} today={today} />
      ) : (
        <p className="text-sm text-destructive">{income.message}</p>
      )}
    </div>
  );
}
