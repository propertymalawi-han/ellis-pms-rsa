import { formatPercentRatio, formatZAR } from "@/lib/format";
import type { MoneyRollup, MonthFlow, PortfolioFigures } from "@/lib/reporting/aggregate";

export function KpiGrid({
  figures,
  flows,
}: {
  figures: PortfolioFigures;
  flows: MonthFlow[];
}) {
  const occupancy =
    figures.longTermUnits === 0 || figures.longTermOccupancy === null
      ? "—"
      : formatPercentRatio(figures.longTermOccupancy);
  const occupancyDetail =
    figures.longTermUnits === 0
      ? "No long-term units"
      : `${figures.longTermOccupied} of ${figures.longTermUnits} let today`;

  const income = series(flows, "income");
  const expenses = series(flows, "expenses");
  const net = series(flows, "net");

  const stats = [
    {
      label: "Income",
      value: formatZAR(figures.income),
      detail: "Rent received in this period",
      sparkline: income,
    },
    {
      label: "Expenses",
      value: formatZAR(figures.expenses),
      detail: "Operating expenses, excluding the bond instalment",
      sparkline: expenses,
    },
    {
      label: "Net income",
      value: formatZAR(figures.netIncome),
      detail: "Income minus operating expenses",
      sparkline: net,
    },
    {
      label: "Long-term occupancy",
      value: occupancy,
      detail: occupancyDetail,
      sparkline: [] as number[],
    },
    {
      label: "Portfolio value",
      value: money(figures.portfolioValue),
      detail: rollupDetail(figures.portfolioValue, "without a current value", "Active properties"),
      sparkline: [] as number[],
    },
    {
      label: "Total investment",
      value: money(figures.totalInvestment),
      detail: rollupDetail(
        figures.totalInvestment,
        "without a purchase price",
        "Purchase, transfer and improvements",
      ),
      sparkline: [] as number[],
    },
    {
      label: "Equity",
      value: money(figures.equity),
      detail: rollupDetail(figures.equity, "without a current value", "Current value minus the bond"),
      sparkline: [] as number[],
    },
    {
      label: "Portfolio net yield",
      value: figures.netYield === null ? "—" : formatPercentRatio(figures.netYield),
      detail:
        figures.netYieldExcluded > 0
          ? `Annualised. Excludes ${countLabel(figures.netYieldExcluded)} without a purchase price.`
          : "Annualised net income divided by total investment",
      sparkline: [] as number[],
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <h2 className="text-[15px] font-semibold">Key stats</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Kpi key={stat.label} {...stat} />
        ))}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  detail,
  sparkline,
}: {
  label: string;
  value: string;
  detail: string;
  sparkline: number[];
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Sparkline values={sparkline} />
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return null;
  }

  const width = 84;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / span) * (height - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points.at(-1)?.split(",") ?? ["0", "0"];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-7 w-20 shrink-0 text-primary" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.join(" ")}
      />
      <circle cx={last[0]} cy={last[1]} r="2.25" fill="currentColor" />
    </svg>
  );
}

function series(flows: MonthFlow[], key: "income" | "expenses" | "net"): number[] {
  return flows.map((row) => Number(row[key]));
}

function money(rollup: MoneyRollup): string {
  return rollup.amount === null ? "—" : formatZAR(rollup.amount);
}

function rollupDetail(rollup: MoneyRollup, missingPhrase: string, ready: string): string {
  if (rollup.amount === null && rollup.missing === 0) {
    return "No active properties";
  }

  if (rollup.amount === null) {
    return `No active property has a ${missingPhrase.replace("without a ", "")}.`;
  }

  if (rollup.missing === 0) {
    return ready;
  }

  return `Excludes ${countLabel(rollup.missing)} ${missingPhrase}.`;
}

function countLabel(count: number): string {
  return count === 1 ? "1 property" : `${count} properties`;
}
