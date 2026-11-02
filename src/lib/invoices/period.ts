import { LOCALE, TIMEZONE } from "@/lib/constants";

export function johannesburgYearMonth(date: Date = new Date()): {
  year: number;
  month: number;
} {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthBounds(year: number, month: number): {
  start: string;
  end: string;
} {
  const monthText = String(month).padStart(2, "0");
  const last = String(lastDayOfMonth(year, month)).padStart(2, "0");

  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${last}`,
  };
}

/** Rent due day clamped to the last day of the month, as YYYY-MM-DD. */
export function dueDateForRentDay(
  year: number,
  month: number,
  rentDueDay: number,
): string {
  const day = Math.min(Math.max(rentDueDay, 1), lastDayOfMonth(year, month));

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);

  if (!match?.[1] || !match[2] || !match[3]) {
    return isoDate;
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function yearMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function formatMonthLabel(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);

  if (!match?.[1] || !match[2]) {
    return yearMonth;
  }

  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
