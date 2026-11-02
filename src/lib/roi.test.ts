import { describe, expect, it } from "vitest";

import {
  annualBondPayments,
  annualise,
  averageDailyRate,
  capitalGrowth,
  cashInvested,
  cashOnCash,
  grossYield,
  netIncome,
  netYield,
  occupancy,
  periodBondPayments,
  summarisePeriod,
  totalInvestment,
} from "@/lib/roi";

const YEAR = 365;

describe("total investment", () => {
  it("adds the purchase price, transfer costs and improvements", () => {
    expect(
      totalInvestment({
        purchasePrice: "1000000.00",
        transferCosts: "50000.00",
        improvementCosts: "25000.00",
      }),
    ).toBe("1075000.00");
  });

  it("treats missing costs as zero and a missing purchase price as unknown", () => {
    expect(
      totalInvestment({
        purchasePrice: "1000000.00",
        transferCosts: null,
        improvementCosts: null,
      }),
    ).toBe("1000000.00");
    expect(
      totalInvestment({
        purchasePrice: null,
        transferCosts: "50000.00",
        improvementCosts: "25000.00",
      }),
    ).toBeNull();
  });

  it("keeps a zero purchase price when other costs were paid", () => {
    expect(
      totalInvestment({
        purchasePrice: "0.00",
        transferCosts: "10000.00",
        improvementCosts: null,
      }),
    ).toBe("10000.00");
  });
});

describe("yields for a full year with a bond", () => {
  // Purchase R1 000 000, transfer R50 000, improvements R25 000.
  // Rent R120 000, operating costs R30 000, bond R600 000 at R8 000 a month.
  // Current value R1 200 000.
  const investment = "1075000.00";
  const net = "90000.00";

  it("follows the spec formulas", () => {
    expect(totalInvestment({
      purchasePrice: "1000000.00",
      transferCosts: "50000.00",
      improvementCosts: "25000.00",
    })).toBe(investment);
    expect(grossYield({ annualIncome: "120000.00", purchasePrice: "1000000.00" })).toBe(
      "0.120000",
    );
    expect(
      netIncome({ annualIncome: "120000.00", annualOperatingExpenses: "30000.00" }),
    ).toBe(net);
    // 90 000 / 1 075 000 = 0.08372093… → 0.083721
    expect(netYield({ netIncome: net, totalInvestment: investment })).toBe("0.083721");
    expect(cashInvested({ totalInvestment: investment, bondAmount: "600000.00" })).toBe(
      "475000.00",
    );
    expect(annualBondPayments("8000.00")).toBe("96000.00");
    // (90 000 − 96 000) / 475 000 = −0.01263157… → −0.012632
    expect(
      cashOnCash({
        netIncome: net,
        annualBondPayments: "96000.00",
        cashInvested: "475000.00",
      }),
    ).toBe("-0.012632");
    expect(
      capitalGrowth({ currentValue: "1200000.00", purchasePrice: "1000000.00" }),
    ).toBe("0.200000");
  });

  it("summarises the same year in one step", () => {
    expect(
      summarisePeriod({
        rentalType: "long_term",
        income: "120000.00",
        operatingExpenses: "30000.00",
        bondMonthlyPayment: "8000.00",
        purchasePrice: "1000000.00",
        transferCosts: "50000.00",
        improvementCosts: "25000.00",
        bondAmount: "600000.00",
        currentValue: "1200000.00",
        periodDays: YEAR,
        nightsBooked: null,
        daysAvailable: null,
        grossIncome: null,
      }),
    ).toEqual({
      income: "120000.00",
      operatingExpenses: "30000.00",
      bondPayments: "96000.00",
      netIncome: "90000.00",
      grossYield: "0.120000",
      netYield: "0.083721",
      cashOnCash: "-0.012632",
      capitalGrowth: "0.200000",
      occupancy: null,
      averageDailyRate: null,
    });
  });
});

describe("no bond and missing prices", () => {
  it("uses the full investment as cash when there is no bond", () => {
    const investment = "1075000.00";

    expect(cashInvested({ totalInvestment: investment, bondAmount: null })).toBe(investment);
    expect(cashInvested({ totalInvestment: investment, bondAmount: "0.00" })).toBe(
      investment,
    );
    expect(annualBondPayments(null)).toBe("0.00");
    expect(
      cashOnCash({
        netIncome: "90000.00",
        annualBondPayments: "0.00",
        cashInvested: investment,
      }),
    ).toBe("0.083721");
  });

  it("does not divide by a missing or zero purchase price", () => {
    expect(grossYield({ annualIncome: "120000.00", purchasePrice: null })).toBeNull();
    expect(grossYield({ annualIncome: "120000.00", purchasePrice: "0.00" })).toBeNull();
    expect(capitalGrowth({ currentValue: "1200000.00", purchasePrice: null })).toBeNull();
    expect(capitalGrowth({ currentValue: "1200000.00", purchasePrice: "0.00" })).toBeNull();
    expect(capitalGrowth({ currentValue: null, purchasePrice: "1000000.00" })).toBeNull();
    expect(netYield({ netIncome: "90000.00", totalInvestment: null })).toBeNull();
    expect(netYield({ netIncome: "90000.00", totalInvestment: "0.00" })).toBeNull();
  });

  it("returns no cash-on-cash when the bond covers the investment", () => {
    expect(
      cashInvested({ totalInvestment: "1075000.00", bondAmount: "1075000.00" }),
    ).toBeNull();
    expect(
      cashInvested({ totalInvestment: "1075000.00", bondAmount: "1500000.00" }),
    ).toBeNull();
    expect(
      cashOnCash({
        netIncome: "90000.00",
        annualBondPayments: "96000.00",
        cashInvested: null,
      }),
    ).toBeNull();
    expect(
      cashOnCash({
        netIncome: "90000.00",
        annualBondPayments: null,
        cashInvested: "0.00",
      }),
    ).toBeNull();
  });

  it("still reports a zero yield when income is zero and the price is known", () => {
    expect(grossYield({ annualIncome: "0.00", purchasePrice: "1000000.00" })).toBe(
      "0.000000",
    );
    expect(
      capitalGrowth({ currentValue: "1000000.00", purchasePrice: "1000000.00" }),
    ).toBe("0.000000");
  });
});

describe("short-term occupancy and ADR", () => {
  it("divides nights by the days in the period and gross income by nights", () => {
    expect(occupancy({ nightsBooked: 20, days: 30 })).toBe("0.666667");
    expect(averageDailyRate({ grossIncome: "45000.00", nightsBooked: 20 })).toBe(
      "2250.00",
    );
    expect(occupancy({ nightsBooked: 0, days: 30 })).toBe("0.000000");
    expect(averageDailyRate({ grossIncome: "45000.00", nightsBooked: 0 })).toBeNull();
    expect(occupancy({ nightsBooked: 10, days: 0 })).toBeNull();
  });

  it("leaves occupancy and ADR empty for a long-term property", () => {
    const summary = summarisePeriod({
      rentalType: "long_term",
      income: "0.00",
      operatingExpenses: "0.00",
      bondMonthlyPayment: null,
      purchasePrice: "1000000.00",
      bondAmount: null,
      currentValue: "1000000.00",
      periodDays: YEAR,
      nightsBooked: 20,
      daysAvailable: 30,
      grossIncome: "45000.00",
    });

    expect(summary?.occupancy).toBeNull();
    expect(summary?.averageDailyRate).toBeNull();
  });

  it("reports occupancy and ADR for a short-term month inside a full year", () => {
    const summary = summarisePeriod({
      rentalType: "short_term",
      income: "120000.00",
      operatingExpenses: "30000.00",
      bondMonthlyPayment: null,
      purchasePrice: "1000000.00",
      transferCosts: "50000.00",
      improvementCosts: "25000.00",
      bondAmount: null,
      currentValue: "1200000.00",
      periodDays: YEAR,
      nightsBooked: 20,
      daysAvailable: 30,
      grossIncome: "45000.00",
    });

    expect(summary?.occupancy).toBe("0.666667");
    expect(summary?.averageDailyRate).toBe("2250.00");
    expect(summary?.cashOnCash).toBe("0.083721");
  });
});

describe("periods that are not a full year", () => {
  it("annualises a 30-day amount and the bond instalment", () => {
    expect(annualise("10000.00", 30)).toBe("121666.67");
    expect(annualise("-100.00", 30)).toBe("-1216.67");
    expect(periodBondPayments("8000.00", 30)).toBe("7890.41");
    expect(annualise("10000.00", 365)).toBe("10000.00");
    expect(annualise("10000.00", 366)).toBe("10000.00");
    expect(periodBondPayments("8000.00", 366)).toBe("96000.00");
  });

  it("rejects an empty period", () => {
    expect(annualise("10000.00", 0)).toBeNull();
    expect(periodBondPayments("8000.00", 0)).toBeNull();
    expect(
      summarisePeriod({
        rentalType: "long_term",
        income: "10000.00",
        operatingExpenses: "0.00",
        bondMonthlyPayment: null,
        purchasePrice: "1000000.00",
        bondAmount: null,
        currentValue: null,
        periodDays: 0,
        nightsBooked: null,
        daysAvailable: null,
        grossIncome: null,
      }),
    ).toBeNull();
  });
});
