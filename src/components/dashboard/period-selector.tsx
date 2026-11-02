"use client";

import { useRouter } from "next/navigation";
import { type FormEvent } from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_LABELS,
  PERIOD_PRESETS,
  isPeriodPreset,
  type PeriodPreset,
} from "@/lib/reporting/period";

export function PeriodSelector({
  preset,
  from,
  to,
}: {
  preset: PeriodPreset;
  from: string;
  to: string;
}) {
  const router = useRouter();

  function onPreset(next: string) {
    if (!isPeriodPreset(next)) {
      return;
    }

    if (next === "custom") {
      const params = new URLSearchParams({ period: "custom", from, to });
      router.push(`/dashboard?${params.toString()}`);
      return;
    }

    router.push(next === "current_tax_year" ? "/dashboard" : `/dashboard?period=${next}`);
  }

  function onCustom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({
      period: "custom",
      from: String(data.get("from") ?? ""),
      to: String(data.get("to") ?? ""),
    });
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={preset} onValueChange={onPreset}>
        <SelectTrigger
          id="dashboard-period"
          className="h-9 w-full rounded-full px-3 sm:w-56"
          aria-label="Period"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((option) => (
            <SelectItem key={option} value={option}>
              {PERIOD_LABELS[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" ? (
        <form onSubmit={onCustom} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard-from">From</Label>
            <Input id="dashboard-from" name="from" type="date" defaultValue={from} required className="w-full sm:w-44" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dashboard-to">To</Label>
            <Input id="dashboard-to" name="to" type="date" defaultValue={to} required className="w-full sm:w-44" />
          </div>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      ) : null}
    </div>
  );
}
