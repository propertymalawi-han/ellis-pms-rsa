import { formatPercentRatio, formatZAR } from "@/lib/format";
import type { MoneyRollup, PortfolioFigures } from "@/lib/reporting/aggregate";

export function KpiGrid({ figures }: { figures: PortfolioFigures }) {
  const occupancy =
    figures.longTermUnits === 0 || figures.longTermOccupancy === null
      ? "—"
      : formatPercentRatio(figures.longTermOccupancy);
  const occupancyDetail =
    figures.longTermUnits === 0
      ? "No long-term units"
      : `${figures.longTermOccupied} of ${figures.longTermUnits} let today`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label="Portfolio value"
        value={money(figures.portfolioValue)}
        detail={rollupDetail(figures.portfolioValue, "without a current value", "Active properties")}
      />
      <Kpi
        label="Total investment"
        value={money(figures.totalInvestment)}
        detail={rollupDetail(
          figures.totalInvestment,
          "without a purchase price",
          "Purchase, transfer and improvements",
        )}
      />
      <Kpi
        label="Equity"
        value={money(figures.equity)}
        detail={rollupDetail(figures.equity, "without a current value", "Current value minus the bond")}
      />
      <Kpi
        label="Income"
        value={formatZAR(figures.income)}
        detail="Rent received in this period"
      />
      <Kpi
        label="Expenses"
        value={formatZAR(figures.expenses)}
        detail="Operating expenses, excluding the bond instalment"
      />
      <Kpi
        label="Net income"
        value={formatZAR(figures.netIncome)}
        detail="Income minus operating expenses"
      />
      <Kpi
        label="Portfolio net yield"
        value={figures.netYield === null ? "—" : formatPercentRatio(figures.netYield)}
        detail={
          figures.netYieldExcluded > 0
            ? `Annualised. Excludes ${countLabel(figures.netYieldExcluded)} without a purchase price.`
            : "Annualised net income divided by total investment"
        }
      />
      <Kpi label="Long-term occupancy" value={occupancy} detail={occupancyDetail} />
    </div>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-medium">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
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
