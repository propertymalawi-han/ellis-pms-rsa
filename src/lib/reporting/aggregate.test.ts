import { describe, expect, it } from "vitest";

import {
  comparisonRows,
  expenseBreakdown,
  monthlyFlows,
  portfolioFigures,
  propertyEquity,
  shortTermMonths,
  type PortfolioProperty,
} from "@/lib/reporting/aggregate";
import type { PropertyFinancialSummary } from "@/lib/reporting/queries";

const OAK: PortfolioProperty = {
  id: "oak",
  name: "Oak",
  propertyType: "freehold",
  rentalType: "long_term",
  status: "active",
  purchasePrice: "1000000.00",
  transferCosts: "50000.00",
  improvementCosts: "25000.00",
  currentValue: "1200000.00",
  bondAmount: "600000.00",
};

function summary(
  overrides: Partial<PropertyFinancialSummary> & Pick<PropertyFinancialSummary, "propertyId">,
): PropertyFinancialSummary {
  return {
    propertyName: "Property",
    rentalType: "long_term",
    income: "0.00",
    operatingExpenses: "0.00",
    bondPayments: "0.00",
    netIncome: "0.00",
    grossYield: null,
    netYield: null,
    cashOnCash: null,
    capitalGrowth: null,
    occupancy: null,
    averageDailyRate: null,
    ...overrides,
  };
}

describe("portfolio figures", () => {
  it("sums active properties and annualises the net yield", () => {
    const figures = portfolioFigures({
      properties: [
        OAK,
        {
          ...OAK,
          id: "sold",
          name: "Sold",
          status: "sold",
          currentValue: "9000000.00",
        },
      ],
      summaries: [
        summary({
          propertyId: "oak",
          propertyName: "Oak",
          income: "120000.00",
          operatingExpenses: "30000.00",
          netIncome: "90000.00",
        }),
        summary({
          propertyId: "sold",
          propertyName: "Sold",
          income: "50000.00",
          operatingExpenses: "1000.00",
          netIncome: "49000.00",
        }),
      ],
      occupiedPropertyIds: new Set(["oak"]),
      periodDays: 365,
    });

    expect(figures.portfolioValue).toEqual({ amount: "1200000.00", missing: 0 });
    expect(figures.totalInvestment).toEqual({ amount: "1075000.00", missing: 0 });
    expect(figures.equity).toEqual({ amount: "600000.00", missing: 0 });
    expect(figures.income).toBe("120000.00");
    expect(figures.expenses).toBe("30000.00");
    expect(figures.netIncome).toBe("90000.00");
    expect(figures.netYield).toBe("0.083721");
    expect(figures.netYieldExcluded).toBe(0);
    expect(figures.longTermOccupancy).toBe("1.000000");
    expect(figures.longTermOccupied).toBe(1);
    expect(figures.longTermUnits).toBe(1);
  });

  it("leaves a yield out when the purchase price is missing and allows negative equity", () => {
    const figures = portfolioFigures({
      properties: [
        OAK,
        {
          ...OAK,
          id: "gap",
          name: "Gap",
          purchasePrice: null,
          currentValue: "100.00",
          bondAmount: "150.00",
        },
      ],
      summaries: [
        summary({ propertyId: "oak", netIncome: "90000.00", income: "1.00", operatingExpenses: "0.00" }),
        summary({ propertyId: "gap", netIncome: "10000.00", income: "2.00", operatingExpenses: "0.00" }),
      ],
      occupiedPropertyIds: new Set(),
      periodDays: 365,
    });

    expect(figures.equity).toEqual({ amount: "599950.00", missing: 0 });
    expect(figures.netYield).toBe("0.083721");
    expect(figures.netYieldExcluded).toBe(1);
    expect(figures.income).toBe("3.00");
    expect(figures.longTermOccupancy).toBe("0.000000");
    expect(propertyEquity({ currentValue: null, bondAmount: "10.00" })).toBeNull();
  });
});

describe("charts and comparison", () => {
  it("builds monthly flows without capital categories", () => {
    const ids = new Set(["oak"]);
    const flows = monthlyFlows(
      [
        { propertyId: "oak", month: "2026-03-01", income: "100.00" },
        { propertyId: "oak", month: "2026-04-01", income: "50.00" },
        { propertyId: "other", month: "2026-03-01", income: "999.00" },
      ],
      [
        {
          propertyId: "oak",
          month: "2026-03-01",
          categoryId: "bond",
          categoryName: "Bond interest",
          sortOrder: 6,
          amount: "999.00",
        },
        {
          propertyId: "oak",
          month: "2026-03-01",
          categoryId: "ins",
          categoryName: "Insurance",
          sortOrder: 5,
          amount: "40.00",
        },
        {
          propertyId: "oak",
          month: "2026-04-01",
          categoryId: "cap",
          categoryName: "Furniture & equipment (capital)",
          sortOrder: 15,
          amount: "80.00",
        },
      ],
      ids,
      "2026-03-01",
      "2026-04-15",
    );

    expect(flows).toEqual([
      { month: "2026-03", label: "Mar 26", income: "100.00", expenses: "40.00", net: "60.00" },
      { month: "2026-04", label: "Apr 26", income: "50.00", expenses: "0.00", net: "50.00" },
    ]);

    expect(expenseBreakdown(
      [
        {
          propertyId: "oak",
          month: "2026-03-01",
          categoryId: "ins",
          categoryName: "Insurance",
          sortOrder: 5,
          amount: "40.00",
        },
        {
          propertyId: "oak",
          month: "2026-03-01",
          categoryId: "bond",
          categoryName: "Bond interest",
          sortOrder: 6,
          amount: "10.00",
        },
        {
          propertyId: "oak",
          month: "2026-04-01",
          categoryId: "credit",
          categoryName: "Other",
          sortOrder: 16,
          amount: "-5.00",
        },
      ],
      ids,
      "2026-03-01",
      "2026-04-30",
    )).toEqual({
      slices: [
        { categoryId: "ins", name: "Insurance", sortOrder: 5, amount: "40.00" },
      ],
      credits: [
        { categoryId: "credit", name: "Other", sortOrder: 16, amount: "-5.00" },
      ],
    });
  });

  it("counts a missing short-term statement as empty nights", () => {
    const months = shortTermMonths(
      [
        {
          propertyId: "sea",
          periodMonth: "2026-04-01",
          nightsBooked: 10,
          grossIncome: "10000.00",
        },
      ],
      ["sea", "bay"],
      "2026-03-01",
      "2026-04-30",
    );

    expect(months[0]).toMatchObject({
      month: "2026-03",
      occupancy: "0.000000",
      averageDailyRate: null,
    });
    expect(months[1]).toMatchObject({
      month: "2026-04",
      occupancy: "0.166667",
      averageDailyRate: "1000.00",
    });
  });

  it("compares active properties only", () => {
    const rows = comparisonRows(
      [
        summary({
          propertyId: "oak",
          propertyName: "Oak",
          income: "10.00",
          grossYield: "0.120000",
        }),
        summary({ propertyId: "sold", propertyName: "Sold", income: "99.00" }),
      ],
      [OAK, { ...OAK, id: "sold", name: "Sold", status: "sold" }],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.propertyName).toBe("Oak");
    expect(rows[0]?.propertyType).toBe("freehold");
    expect(rows[0]?.grossYield).toBe("0.120000");
  });
});
