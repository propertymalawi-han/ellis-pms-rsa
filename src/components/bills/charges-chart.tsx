"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatZAR } from "@/lib/format";
import type { ChargePoint } from "@/lib/bills/summary";

export function ChargesChart({ points }: { points: ChargePoint[] }) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="font-heading text-lg font-medium">Monthly total, last 24 months</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Stacked by levy (including special levy), municipal rates and utilities. The line is the
          monthly total. Arrears are left out so a balance brought forward does not look like a
          higher charge.
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="h-80 min-w-[64rem]" aria-label="Monthly rates and levies for the last 24 months">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval={1}
                angle={-40}
                textAnchor="end"
                height={64}
              />
              <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} />
              <Tooltip content={<ChargeTooltip />} />
              <Legend />
              <Area
                type="linear"
                dataKey="levy"
                name="Levy"
                stackId="charges"
                stroke="var(--chart-5)"
                fill="var(--chart-5)"
              />
              <Area
                type="linear"
                dataKey="rates"
                name="Rates"
                stackId="charges"
                stroke="var(--chart-3)"
                fill="var(--chart-3)"
              />
              <Area
                type="linear"
                dataKey="utilities"
                name="Utilities"
                stackId="charges"
                stroke="var(--chart-2)"
                fill="var(--chart-2)"
              />
              <Line
                type="linear"
                dataKey="total"
                name="Monthly total"
                stroke="var(--foreground)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function ChargeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChargePoint }>;
  label?: string | number;
}) {
  const point = payload?.[0]?.payload;

  if (!active || !point) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{label}</p>
      <p>Levy {formatZAR(point.levy)}</p>
      <p>Rates {formatZAR(point.rates)}</p>
      <p>Utilities {formatZAR(point.utilities)}</p>
      <p>Total {formatZAR(point.total)}</p>
    </div>
  );
}
