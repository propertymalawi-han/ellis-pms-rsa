"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatZAR } from "@/lib/format";
import type { PayoutPoint } from "@/lib/statements/calc";

export function PayoutChart({ points }: { points: PayoutPoint[] }) {
  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-lg font-medium">Net payout, last 12 months</h2>
      <div className="overflow-x-auto">
        <div className="h-72 min-w-[36rem]" aria-label="Net payout for the last 12 months">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
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
              <Tooltip
                formatter={(value) => formatTooltip(value)}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="net" name="Net payout" fill="var(--chart-3)" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function formatTooltip(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return formatZAR(value);
  }

  return "";
}
