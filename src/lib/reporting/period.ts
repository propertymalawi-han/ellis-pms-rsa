import { johannesburgDateOnly } from "@/lib/format";

/**
 * Reporting windows for South Africa.
 * The tax year runs 1 March to 28/29 February.
 * Open periods end today in Africa/Johannesburg. A previous tax year is the
 * full closed year. Last 12 months is the trailing year through today.
 */

export const PERIOD_PRESETS = [
  "this_month",
  "last_12_months",
  "current_tax_year",
  "previous_tax_year",
  "custom",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type DateRange = {
  from: string;
  to: string;
};

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: "This month",
  last_12_months: "Last 12 months",
  current_tax_year: "Current tax year",
  previous_tax_year: "Previous tax year",
  custom: "Custom",
};

export type PeriodResult =
  | {
      ok: true;
      preset: PeriodPreset;
      label: string;
      range: DateRange;
      days: number;
    }
  | { ok: false; message: string };

export function resolvePeriodForToday(
  preset: PeriodPreset,
  custom?: { from: string; to: string },
  today = johannesburgDateOnly(),
): PeriodResult {
  return resolvePeriod(preset, today, custom);
}

export function resolvePeriod(
  preset: PeriodPreset,
  today: string,
  custom?: { from: string; to: string },
): PeriodResult {
  const current = parseIsoDate(today);

  if (!current) {
    return { ok: false, message: "Enter a valid date." };
  }

  if (preset === "custom") {
    return customPeriod(custom);
  }

  const range = presetRange(preset, current);

  return {
    ok: true,
    preset,
    label: PERIOD_LABELS[preset],
    range,
    days: inclusiveDayCount(range.from, range.to) ?? 0,
  };
}

export function isPeriodPreset(value: string): value is PeriodPreset {
  return (PERIOD_PRESETS as readonly string[]).includes(value);
}

/** First day of the calendar month that contains `iso`. */
export function monthStartIso(iso: string): string | null {
  const parsed = parseIsoDate(iso);

  if (!parsed) {
    return null;
  }

  return formatIso(parsed.year, parsed.month, 1);
}

/** First day of the calendar month before `iso`. */
export function previousMonthStart(iso: string): string | null {
  const parsed = parseIsoDate(iso);

  if (!parsed) {
    return null;
  }

  const month = parsed.month === 1 ? 12 : parsed.month - 1;
  const year = parsed.month === 1 ? parsed.year - 1 : parsed.year;

  return formatIso(year, month, 1);
}

/** Every month-start from `from` through `to`, inclusive. Empty when the range is invalid. */
export function eachMonthStart(from: string, to: string): string[] {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);

  if (!start || !end || inclusiveDayCount(from, to) === null) {
    return [];
  }

  const months: string[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(formatIso(year, month, 1));
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

/** Shift a calendar date by whole days. Negative days move backward. */
export function shiftIsoDate(iso: string, days: number): string | null {
  const parsed = parseIsoDate(iso);

  if (!parsed || !Number.isInteger(days)) {
    return null;
  }

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));

  return formatIso(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

export function inclusiveDayCount(from: string, to: string): number | null {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);

  if (!start || !end) {
    return null;
  }

  const diff = Math.round(
    (Date.UTC(end.year, end.month - 1, end.day) -
      Date.UTC(start.year, start.month - 1, start.day)) /
      86_400_000,
  );

  if (diff < 0) {
    return null;
  }

  return diff + 1;
}

export function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day };
}

function presetRange(
  preset: Exclude<PeriodPreset, "custom">,
  today: { year: number; month: number; day: number },
): DateRange {
  const todayIso = formatIso(today.year, today.month, today.day);

  if (preset === "this_month") {
    return {
      from: formatIso(today.year, today.month, 1),
      to: todayIso,
    };
  }

  if (preset === "last_12_months") {
    const previous = shiftYears(today, -1);

    return {
      from: addDays(formatIso(previous.year, previous.month, previous.day), 1),
      to: todayIso,
    };
  }

  const startYear = today.month >= 3 ? today.year : today.year - 1;

  if (preset === "current_tax_year") {
    return {
      from: formatIso(startYear, 3, 1),
      to: todayIso,
    };
  }

  const previousStart = startYear - 1;

  return {
    from: formatIso(previousStart, 3, 1),
    to: formatIso(previousStart + 1, 2, daysInMonth(previousStart + 1, 2)),
  };
}

function customPeriod(custom: { from: string; to: string } | undefined): PeriodResult {
  const from = custom?.from.trim() ?? "";
  const to = custom?.to.trim() ?? "";

  if (from === "" || to === "") {
    return { ok: false, message: "Enter both dates for a custom range." };
  }

  if (!parseIsoDate(from) || !parseIsoDate(to)) {
    return { ok: false, message: "Enter a valid date." };
  }

  const days = inclusiveDayCount(from, to);

  if (days === null) {
    return { ok: false, message: "Choose a start date on or before the end date." };
  }

  return {
    ok: true,
    preset: "custom",
    label: PERIOD_LABELS.custom,
    range: { from, to },
    days,
  };
}

function shiftYears(
  date: { year: number; month: number; day: number },
  years: number,
): { year: number; month: number; day: number } {
  const year = date.year + years;

  return {
    year,
    month: date.month,
    day: Math.min(date.day, daysInMonth(year, date.month)),
  };
}

function addDays(iso: string, days: number): string {
  const parsed = parseIsoDate(iso);

  if (!parsed) {
    return iso;
  }

  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));

  return formatIso(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
