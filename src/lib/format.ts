import { LOCALE, TIMEZONE } from "@/lib/constants";

function toNumber(amount: number | string): number {
  return typeof amount === "string" ? Number(amount) : amount;
}

export function formatZAR(amount: number | string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "ZAR",
  }).format(toNumber(amount));
}

export function formatDate(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/** Calendar date stored as `YYYY-MM-DD`, shown as `dd/mm/yyyy` without a timezone shift. */
export function formatDateOnly(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);

  if (!match) {
    return formatDate(isoDate);
  }

  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Calendar date in Africa/Johannesburg as `YYYY-MM-DD`. */
export function johannesburgDateOnly(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Whole days from `today` (`YYYY-MM-DD`) until `isoDate`. Negative when the date has passed. */
export function daysUntil(isoDate: string, today = johannesburgDateOnly()): number | null {
  const target = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const from = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);

  if (!target?.[1] || !target[2] || !target[3] || !from?.[1] || !from[2] || !from[3]) {
    return null;
  }

  const targetUtc = Date.UTC(
    Number(target[1]),
    Number(target[2]) - 1,
    Number(target[3]),
  );
  const fromUtc = Date.UTC(Number(from[1]), Number(from[2]) - 1, Number(from[3]));

  return Math.round((targetUtc - fromUtc) / 86_400_000);
}

export function formatRentDueDay(day: number): string {
  const mod100 = day % 100;
  const mod10 = day % 10;
  let suffix = "th";

  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) {
      suffix = "st";
    } else if (mod10 === 2) {
      suffix = "nd";
    } else if (mod10 === 3) {
      suffix = "rd";
    }
  }

  return `${day}${suffix} of the month`;
}

/** A ratio such as 0.120000, shown as a percentage. */
export function formatPercentRatio(ratio: number | string): string {
  const value = typeof ratio === "string" ? Number(ratio) : ratio;

  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Calendar month of a stored date, e.g. "November 2026", without a timezone shift. */
export function formatMonthYear(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);

  if (!match?.[1] || !match[2]) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

export function formatRate(rate: number | string): string {
  const value = typeof rate === "string" ? Number(rate) : rate;

  return `${new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)}%`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${new Intl.NumberFormat(LOCALE, {
      maximumFractionDigits: 0,
    }).format(bytes / 1024)} KB`;
  }

  return `${new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
  }).format(bytes / (1024 * 1024))} MB`;
}

function johannesburgYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return { year, month };
}

export function getJohannesburgYear(date: Date = new Date()): number {
  return johannesburgYearMonth(date).year;
}

/** South African tax year: 1 March – 28/29 February, e.g. "2026/27". */
export function getTaxYear(date: Date): string {
  const { year, month } = johannesburgYearMonth(date);
  const startYear = month >= 3 ? year : year - 1;

  return taxYearLabel(startYear);
}

/** Tax year for a stored calendar date, without shifting it through a timezone. */
export function taxYearForIso(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const startYear = month >= 3 ? year : year - 1;

  return taxYearLabel(startYear);
}

function taxYearLabel(startYear: number): string {
  const endYear = (startYear + 1) % 100;

  return `${startYear}/${String(endYear).padStart(2, "0")}`;
}
