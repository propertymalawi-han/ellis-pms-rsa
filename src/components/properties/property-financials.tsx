import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateOnly, formatPercentRatio, formatZAR } from "@/lib/format";
import { SIGNED_MONEY, parseDecimal } from "@/lib/money";
import type { PropertyDetail } from "@/lib/properties/types";
import { propertyEquity } from "@/lib/reporting/aggregate";
import type { PropertyFinancialSummary } from "@/lib/reporting/queries";
import { totalInvestment } from "@/lib/roi";

export type PropertyFinancialReport =
  | {
      ok: true;
      periodLabel: string;
      from: string;
      to: string;
      summary: PropertyFinancialSummary | null;
      occupied: boolean | null;
    }
  | { ok: false; message: string };

export function PropertyFinancials({
  property,
  report,
}: {
  property: PropertyDetail;
  report: PropertyFinancialReport;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financials</CardTitle>
        <CardDescription>
          {report.ok
            ? `${formatDateOnly(report.from)} – ${formatDateOnly(report.to)} · ${report.periodLabel}. Yields are annualised. Capital growth does not depend on the period.`
            : "Current tax year."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {report.ok ? (
          <Figures property={property} report={report} />
        ) : (
          <p className="text-sm text-destructive">{report.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Figures({
  property,
  report,
}: {
  property: PropertyDetail;
  report: Extract<PropertyFinancialReport, { ok: true }>;
}) {
  const finance = property.finance;
  const purchasePrice = moneyFromNumber(finance?.purchasePrice ?? null);
  const investment = finance
    ? totalInvestment({
        purchasePrice,
        transferCosts: moneyFromNumber(finance.transferCosts),
        improvementCosts: moneyFromNumber(finance.improvementCosts),
      })
    : null;
  const equity = finance
    ? propertyEquity({
        currentValue: moneyFromNumber(finance.currentValue),
        bondAmount: moneyFromNumber(finance.bondAmount),
      })
    : null;
  const summary = report.summary;
  const longTerm = property.rentalType === "long_term";

  return (
    <div className="grid gap-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Current value" value={money(moneyFromNumber(finance?.currentValue ?? null))} />
        <Fact label="Total investment" value={money(investment)} />
        <Fact label="Equity" value={money(equity)} />
        <Fact label="Income" value={summary ? formatZAR(summary.income) : "—"} />
        <Fact label="Expenses" value={summary ? formatZAR(summary.operatingExpenses) : "—"} />
        <Fact label="Net income" value={summary ? formatZAR(summary.netIncome) : "—"} />
        <Fact label="Gross yield" value={ratio(summary?.grossYield ?? null)} />
        <Fact label="Net yield" value={ratio(summary?.netYield ?? null)} />
        <Fact label="Cash-on-cash" value={ratio(summary?.cashOnCash ?? null)} />
        <Fact label="Capital growth" value={ratio(summary?.capitalGrowth ?? null)} />
        <Fact
          label="Occupancy"
          value={
            longTerm
              ? report.occupied === null
                ? "Could not check the lease"
                : report.occupied
                  ? "Occupied"
                  : "Vacant"
              : ratio(summary?.occupancy ?? null)
          }
        />
        {longTerm ? null : (
          <Fact
            label="ADR"
            value={summary?.averageDailyRate ? formatZAR(summary.averageDailyRate) : "—"}
          />
        )}
      </dl>
      {summary ? null : (
        <p className="text-sm text-muted-foreground">
          Income and yields are not available for this property.
        </p>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  );
}

function money(amount: string | null): string {
  return amount === null ? "—" : formatZAR(amount);
}

function ratio(value: string | null): string {
  return value === null ? "—" : formatPercentRatio(value);
}

function moneyFromNumber(value: number | null): string | null {
  if (value === null) {
    return null;
  }

  const parsed = parseDecimal(value.toFixed(2), SIGNED_MONEY);

  return parsed.ok ? parsed.canonical : null;
}
