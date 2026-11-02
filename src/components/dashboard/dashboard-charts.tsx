"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPercentRatio, formatZAR } from "@/lib/format";
import type { CategoryShare, MonthFlow, ShortTermMonth } from "@/lib/reporting/aggregate";

const SLICE_COLORS = [
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--foreground)",
];

export function DashboardCharts({
  flows,
  slices,
  credits,
  shortTerm,
  shortTermCount,
}: {
  flows: MonthFlow[];
  slices: CategoryShare[];
  credits: CategoryShare[];
  shortTerm: ShortTermMonth[];
  shortTermCount: number;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <IncomeChart flows={flows} />
      <ExpenseChart slices={slices} credits={credits} />
      <div className="xl:col-span-2">
        <StayChart points={shortTerm} propertyCount={shortTermCount} />
      </div>
    </div>
  );
}

function IncomeChart({ flows }: { flows: MonthFlow[] }) {
  const points = flows.map((row) => ({
    label: row.label,
    income: Number(row.income),
    expenses: Number(row.expenses),
    net: Number(row.net),
  }));

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Income and expenses</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Whole calendar months that overlap this period. Bond interest and capital purchases are
          left out. The line is income minus expenses.
        </p>
      </div>
      {points.length === 0 ? (
        <EmptyChart label="No months in this period." />
      ) : (
        <div className="overflow-x-auto">
          <div className="h-80 min-w-[36rem]" aria-label="Monthly income, expenses and net">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={56}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
                <Tooltip content={<MoneyTooltip />} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="var(--chart-2)" radius={4} />
                <Bar dataKey="expenses" name="Expenses" fill="var(--chart-5)" radius={4} />
                <Line
                  type="linear"
                  dataKey="net"
                  name="Net"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpenseChart({ slices, credits }: { slices: CategoryShare[]; credits: CategoryShare[] }) {
  const points = slices.map((slice, index) => ({
    name: slice.name,
    amount: Number(slice.amount),
    fill: SLICE_COLORS[index % SLICE_COLORS.length] ?? "var(--chart-3)",
  }));

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Expenses by category</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Operating expenses in the months that overlap this period.
        </p>
      </div>
      {points.length === 0 ? (
        <EmptyChart label="No operating expenses in this period." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[16rem_1fr] sm:items-center">
          <div className="h-64" aria-label="Expenses by category">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={points}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="var(--background)"
                >
                  {points.map((point) => (
                    <Cell key={point.name} fill={point.fill} />
                  ))}
                </Pie>
                <Tooltip content={<SliceTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid gap-1.5">
            {points.map((slice) => (
              <li key={slice.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: slice.fill }}
                    aria-hidden
                  />
                  <span className="truncate">{slice.name}</span>
                </span>
                <span className="shrink-0">{formatZAR(slice.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {credits.length > 0 ? (
        <ul className="grid gap-1 text-sm text-muted-foreground">
          {credits.map((credit) => (
            <li key={credit.categoryId}>
              {credit.name} credit {formatZAR(credit.amount)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function StayChart({ points, propertyCount }: { points: ShortTermMonth[]; propertyCount: number }) {
  const chartPoints = points.map((point) => ({
    label: point.label,
    occupancy: point.occupancy === null ? null : Number(point.occupancy),
    adr: point.averageDailyRate === null ? null : Number(point.averageDailyRate),
  }));

  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Short-term occupancy and ADR</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Occupancy is nights booked divided by the days in the month across active short-term
          properties. A missing statement counts as no nights. ADR is gross income divided by nights
          booked.
        </p>
      </div>
      {propertyCount === 0 ? (
        <EmptyChart label="No active short-term properties." />
      ) : (
        <div className="overflow-x-auto">
          <div className="h-80 min-w-[36rem]" aria-label="Short-term occupancy and average daily rate by month">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartPoints} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  yAxisId="occupancy"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={48}
                  tickFormatter={(value: number) => formatPercentRatio(value)}
                />
                <YAxis
                  yAxisId="adr"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={64}
                />
                <Tooltip content={<StayTooltip />} />
                <Legend />
                <Bar
                  yAxisId="occupancy"
                  dataKey="occupancy"
                  name="Occupancy"
                  fill="var(--chart-3)"
                  radius={4}
                />
                <Line
                  yAxisId="adr"
                  type="linear"
                  dataKey="adr"
                  name="ADR"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyChart({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { income: number; expenses: number; net: number } }>;
  label?: string | number;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{label}</p>
      <p>Income {formatZAR(point.income)}</p>
      <p>Expenses {formatZAR(point.expenses)}</p>
      <p>Net {formatZAR(point.net)}</p>
    </div>
  );
}

function SliceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { name: string; amount: number } }>;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{point.name}</p>
      <p>{formatZAR(point.amount)}</p>
    </div>
  );
}

function StayTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { occupancy: number | null; adr: number | null } }>;
  label?: string | number;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{label}</p>
      <p>Occupancy {point.occupancy === null ? "—" : formatPercentRatio(point.occupancy)}</p>
      <p>ADR {point.adr === null ? "—" : formatZAR(point.adr)}</p>
    </div>
  );
}
