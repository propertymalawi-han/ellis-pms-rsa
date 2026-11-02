import { describe, expect, it } from "vitest";

import { buildAttention } from "@/lib/reporting/attention";
import { formatMonthYear } from "@/lib/format";

const TODAY = "2026-11-03";
const LAST_MONTH = "2026-10-01";

describe("attention panel", () => {
  it("splits overdue, upcoming bills, missing months and expiring leases", () => {
    const panel = buildAttention({
      today: TODAY,
      lastMonth: LAST_MONTH,
      invoices: [
        {
          id: "inv-1",
          invoiceNumber: "INV-2026-0004",
          propertyName: "Oak",
          tenantName: "Jane Doe",
          dueDate: "2026-10-01",
          balance: "8500.00",
        },
      ],
      expenses: [
        {
          id: "exp-soon",
          propertyId: "oak",
          propertyName: "Oak",
          label: "Insurance",
          dueDate: "2026-11-10",
          total: "100.00",
          status: "due",
          paidDate: null,
          billId: null,
        },
        {
          id: "exp-late",
          propertyId: "oak",
          propertyName: "Oak",
          label: "Repairs",
          dueDate: "2026-10-01",
          total: "200.00",
          status: "due",
          paidDate: null,
          billId: null,
        },
        {
          id: "exp-paid",
          propertyId: "oak",
          propertyName: "Oak",
          label: "Cleaning",
          dueDate: "2026-10-01",
          total: "50.00",
          status: "paid",
          paidDate: "2026-10-02",
          billId: null,
        },
        {
          id: "exp-from-bill",
          propertyId: "oak",
          propertyName: "Oak",
          label: "City",
          dueDate: "2026-10-01",
          total: "500.00",
          status: "overdue",
          paidDate: null,
          billId: "bill-late",
        },
      ],
      bills: [
        {
          id: "bill-soon",
          propertyId: "oak",
          propertyName: "Oak",
          issuerName: "City",
          dueDate: "2026-11-10",
          totalDue: "300.00",
          status: "due",
          paidDate: null,
        },
        {
          id: "bill-later",
          propertyId: "bay",
          propertyName: "Bay",
          issuerName: "Body corporate",
          dueDate: "2026-11-20",
          totalDue: "400.00",
          status: "due",
          paidDate: null,
        },
        {
          id: "bill-late",
          propertyId: "oak",
          propertyName: "Oak",
          issuerName: "Municipality",
          dueDate: "2026-10-01",
          totalDue: "500.00",
          status: "due",
          paidDate: null,
        },
      ],
      properties: [
        { id: "oak", name: "Oak", rentalType: "long_term", status: "active" },
        { id: "sea", name: "Sea", rentalType: "short_term", status: "active" },
        { id: "bay", name: "Bay", rentalType: "short_term", status: "active" },
        { id: "old", name: "Old", rentalType: "short_term", status: "sold" },
      ],
      statementPropertyIds: new Set(["bay"]),
      billPropertyIds: new Set(["oak", "bay"]),
      leases: [
        {
          id: "lease-edge",
          propertyId: "oak",
          propertyName: "Oak",
          tenantName: "Jane Doe",
          endDate: "2027-01-02",
          status: "active",
        },
        {
          id: "lease-later",
          propertyId: "oak",
          propertyName: "Oak",
          tenantName: "Later",
          endDate: "2027-01-03",
          status: "active",
        },
        {
          id: "lease-past",
          propertyId: "oak",
          propertyName: "Oak",
          tenantName: "Past",
          endDate: "2026-11-01",
          status: "active",
        },
        {
          id: "lease-ended",
          propertyId: "oak",
          propertyName: "Oak",
          tenantName: "Ended",
          endDate: "2026-11-04",
          status: "ended",
        },
      ],
    });

    expect(panel.overdueInvoices.map((item) => item.id)).toEqual(["invoice:inv-1"]);
    expect(panel.overdueInvoices[0]?.amount).toBe("8500.00");
    expect(panel.unpaid.map((item) => item.id)).toEqual([
      "bill:bill-late",
      "expense:exp-late",
      "expense:exp-soon",
      "bill:bill-later",
    ]);
    expect(panel.unpaid.some((item) => item.id === "expense:exp-from-bill")).toBe(false);
    expect(panel.unpaid[0]?.tone).toBe("overdue");
    expect(panel.dueSoonBills.map((item) => item.id)).toEqual(["bill-soon:bill-soon"]);
    expect(panel.missing.map((item) => item.subtitle)).toEqual([
      `No owner's statement for ${formatMonthYear(LAST_MONTH)}`,
      `No rates or levy bill for ${formatMonthYear(LAST_MONTH)}`,
    ]);
    expect(panel.expiringLeases.map((item) => item.title)).toEqual(["Past", "Jane Doe"]);
    expect(panel.expiringLeases[0]?.tone).toBe("overdue");
  });
});
