import { describe, expect, it } from "vitest";

import {
  PERIOD_LABELS,
  eachMonthStart,
  inclusiveDayCount,
  isPeriodPreset,
  monthStartIso,
  previousMonthStart,
  resolvePeriod,
  shiftIsoDate,
} from "@/lib/reporting/period";

const TODAY = "2026-11-02";

describe("period presets", () => {
  it("uses the month to date", () => {
    expect(resolvePeriod("this_month", TODAY)).toEqual({
      ok: true,
      preset: "this_month",
      label: PERIOD_LABELS.this_month,
      range: { from: "2026-11-01", to: "2026-11-02" },
      days: 2,
    });
  });

  it("uses the trailing year through today", () => {
    const period = resolvePeriod("last_12_months", TODAY);

    expect(period).toEqual({
      ok: true,
      preset: "last_12_months",
      label: "Last 12 months",
      range: { from: "2025-11-03", to: "2026-11-02" },
      days: 365,
    });
  });

  it("counts 366 days when the trailing year includes 29 February", () => {
    const period = resolvePeriod("last_12_months", "2024-11-02");

    expect(period.ok).toBe(true);

    if (period.ok) {
      expect(period.range).toEqual({ from: "2023-11-03", to: "2024-11-02" });
      expect(period.days).toBe(366);
    }
  });

  it("starts the current tax year on 1 March and ends today", () => {
    expect(resolvePeriod("current_tax_year", TODAY)).toMatchObject({
      ok: true,
      range: { from: "2026-03-01", to: "2026-11-02" },
    });
    expect(resolvePeriod("current_tax_year", "2026-02-15")).toMatchObject({
      ok: true,
      range: { from: "2025-03-01", to: "2026-02-15" },
    });
  });

  it("uses the previous closed tax year, including a leap day", () => {
    const previous = resolvePeriod("previous_tax_year", TODAY);

    expect(previous).toMatchObject({
      ok: true,
      range: { from: "2025-03-01", to: "2026-02-28" },
    });

    if (previous.ok) {
      expect(previous.days).toBe(365);
    }

    const leap = resolvePeriod("previous_tax_year", "2024-06-01");

    expect(leap).toMatchObject({
      ok: true,
      range: { from: "2023-03-01", to: "2024-02-29" },
    });

    if (leap.ok) {
      expect(leap.days).toBe(366);
    }
  });

  it("clamps 29 February when stepping back to a non-leap year", () => {
    const period = resolvePeriod("last_12_months", "2024-02-29");

    expect(period.ok).toBe(true);

    if (period.ok) {
      expect(period.range.from).toBe("2023-03-01");
      expect(period.range.to).toBe("2024-02-29");
      expect(period.days).toBe(366);
    }
  });
});

describe("custom periods", () => {
  it("accepts an inclusive custom range", () => {
    expect(
      resolvePeriod("custom", TODAY, { from: "2025-03-01", to: "2026-02-28" }),
    ).toMatchObject({
      ok: true,
      preset: "custom",
      label: "Custom",
      range: { from: "2025-03-01", to: "2026-02-28" },
      days: 365,
    });
  });

  it("rejects a missing, invalid or reversed range", () => {
    expect(resolvePeriod("custom", TODAY)).toEqual({
      ok: false,
      message: "Enter both dates for a custom range.",
    });
    expect(resolvePeriod("custom", TODAY, { from: "2026-02-29", to: "2026-03-01" })).toEqual(
      {
        ok: false,
        message: "Enter a valid date.",
      },
    );
    expect(resolvePeriod("custom", TODAY, { from: "2026-04-01", to: "2026-03-01" })).toEqual(
      {
        ok: false,
        message: "Choose a start date on or before the end date.",
      },
    );
  });

  it("counts inclusive days without a timezone shift", () => {
    expect(inclusiveDayCount("2024-02-28", "2024-03-01")).toBe(3);
    expect(inclusiveDayCount("2026-11-02", "2026-11-01")).toBeNull();
  });
});

describe("calendar helpers", () => {
  it("recognises presets", () => {
    expect(isPeriodPreset("current_tax_year")).toBe(true);
    expect(isPeriodPreset("this-year")).toBe(false);
  });

  it("walks month starts and the previous month", () => {
    expect(monthStartIso("2026-11-03")).toBe("2026-11-01");
    expect(previousMonthStart("2026-03-01")).toBe("2026-02-01");
    expect(previousMonthStart("2026-01-15")).toBe("2025-12-01");
    expect(eachMonthStart("2026-03-15", "2026-05-01")).toEqual([
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
    expect(eachMonthStart("2026-05-01", "2026-03-01")).toEqual([]);
  });

  it("shifts a calendar date by whole days", () => {
    expect(shiftIsoDate("2026-11-03", 60)).toBe("2027-01-02");
    expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDate("not-a-date", 1)).toBeNull();
  });
});
