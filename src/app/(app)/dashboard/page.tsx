import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ActionPanel } from "@/components/dashboard/action-panel";
import { ComparisonTable } from "@/components/dashboard/comparison-table";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { PeriodSelector } from "@/components/dashboard/period-selector";
import { PageHeader } from "@/components/layout/page-header";
import { getActor } from "@/lib/auth/access";
import { formatDateOnly, johannesburgDateOnly } from "@/lib/format";
import { loadDashboard } from "@/lib/reporting/dashboard";
import {
  isPeriodPreset,
  resolvePeriodForToday,
  type PeriodPreset,
} from "@/lib/reporting/period";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DashboardPageProps = {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const actor = await getActor();

  if (!actor.ok) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Portfolio performance." />
        <p className="text-sm text-destructive">{actor.message}</p>
      </div>
    );
  }

  if (!actor.isAdmin) {
    redirect("/properties");
  }

  const params = await searchParams;
  const requested = params.period ?? "current_tax_year";
  const preset: PeriodPreset = isPeriodPreset(requested) ? requested : "current_tax_year";
  const today = johannesburgDateOnly();
  const period = resolvePeriodForToday(preset, { from: params.from ?? "", to: params.to ?? "" }, today);
  const fallback = period.ok ? period : resolvePeriodForToday("current_tax_year", undefined, today);
  const loaded = fallback.ok ? await loadDashboard(fallback.range, today) : null;
  const description = period.ok
    ? `${formatDateOnly(period.range.from)} – ${formatDateOnly(period.range.to)} · ${period.label}`
    : "Choose a reporting period.";

  return (
    <div className="grid gap-8">
      <div>
        <PageHeader title="Dashboard" description={description} />
        <PeriodSelector
          preset={preset}
          from={period.ok ? period.range.from : (params.from ?? "")}
          to={period.ok ? period.range.to : (params.to ?? "")}
        />
        {period.ok ? null : <p className="mt-3 text-sm text-destructive">{period.message}</p>}
      </div>

      {loaded && period.ok ? (
        loaded.report.ok ? (
          <div className="grid gap-8">
            <KpiGrid figures={loaded.report.data.figures} />
            <DashboardCharts
              flows={loaded.report.data.flows}
              slices={loaded.report.data.expenses.slices}
              credits={loaded.report.data.expenses.credits}
              shortTerm={loaded.report.data.shortTerm}
              shortTermCount={loaded.report.data.shortTermCount}
            />
            <ComparisonTable rows={loaded.report.data.rows} />
          </div>
        ) : (
          <p className="text-sm text-destructive">{loaded.report.message}</p>
        )
      ) : null}

      {loaded ? (
        loaded.attention.ok ? (
          <ActionPanel panel={loaded.attention.panel} today={today} />
        ) : (
          <p className="text-sm text-destructive">{loaded.attention.message}</p>
        )
      ) : null}
    </div>
  );
}
