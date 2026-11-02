import { effectiveStatus, isUpcoming } from "@/lib/expenses/calc";
import { UPCOMING_DAYS } from "@/lib/expenses/labels";
import { formatMonthYear } from "@/lib/format";
import { LEASE_EXPIRY_WARNING_DAYS } from "@/lib/leases/warnings";
import type { RentalType } from "@/lib/properties/labels";
import { shiftIsoDate } from "@/lib/reporting/period";

type OpenStatus = "due" | "paid" | "overdue";

export type AttentionItem = {
  id: string;
  href: string;
  title: string;
  subtitle: string;
  amount: string | null;
  date: string | null;
  tone: "default" | "overdue";
};

export type AttentionPanel = {
  overdueInvoices: AttentionItem[];
  unpaid: AttentionItem[];
  dueSoonBills: AttentionItem[];
  missing: AttentionItem[];
  expiringLeases: AttentionItem[];
};

export type AttentionInvoice = {
  id: string;
  invoiceNumber: string;
  propertyName: string;
  tenantName: string;
  dueDate: string;
  balance: string;
};

export type AttentionExpense = {
  id: string;
  propertyId: string;
  propertyName: string;
  label: string;
  dueDate: string;
  total: string;
  status: OpenStatus;
  paidDate: string | null;
  /** Set when the expense was created from a rates or levy bill. */
  billId: string | null;
};

export type AttentionBill = {
  id: string;
  propertyId: string;
  propertyName: string;
  issuerName: string;
  dueDate: string;
  totalDue: string;
  status: OpenStatus;
  paidDate: string | null;
};

export type AttentionProperty = {
  id: string;
  name: string;
  rentalType: RentalType;
  status: "active" | "sold";
};

export type AttentionLease = {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  endDate: string;
  status: "active" | "ended";
};

export function buildAttention(input: {
  today: string;
  lastMonth: string;
  invoices: readonly AttentionInvoice[];
  expenses: readonly AttentionExpense[];
  bills: readonly AttentionBill[];
  properties: readonly AttentionProperty[];
  statementPropertyIds: ReadonlySet<string>;
  billPropertyIds: ReadonlySet<string>;
  leases: readonly AttentionLease[];
}): AttentionPanel {
  const horizon = shiftIsoDate(input.today, LEASE_EXPIRY_WARNING_DAYS);
  const monthLabel = formatMonthYear(input.lastMonth);

  const overdueInvoices = input.invoices
    .map((invoice) => ({
      id: `invoice:${invoice.id}`,
      href: `/invoices/${invoice.id}`,
      title: invoice.invoiceNumber,
      subtitle: `${invoice.propertyName} · ${invoice.tenantName}`,
      amount: invoice.balance,
      date: invoice.dueDate,
      tone: "overdue" as const,
    }))
    .sort(byDateThenTitle);

  const openBillIds = new Set(
    input.bills
      .filter((bill) => effectiveStatus(bill, input.today) !== "paid")
      .map((bill) => bill.id),
  );
  const unpaidExpenses = input.expenses.flatMap((expense) => {
    const status = effectiveStatus(expense, input.today);

    if (status === "paid" || (expense.billId !== null && openBillIds.has(expense.billId))) {
      return [];
    }

    return [
      {
        id: `expense:${expense.id}`,
        href: `/properties/${expense.propertyId}/expenses`,
        title: expense.label,
        subtitle: expense.propertyName,
        amount: expense.total,
        date: expense.dueDate,
        tone: status === "overdue" ? ("overdue" as const) : ("default" as const),
      },
    ];
  });

  const dueSoonBills = input.bills.flatMap((bill) => {
    if (!isUpcoming(bill, input.today)) {
      return [];
    }

    return [
      {
        id: `bill-soon:${bill.id}`,
        href: `/properties/${bill.propertyId}/rates-levies`,
        title: bill.issuerName,
        subtitle: bill.propertyName,
        amount: bill.totalDue,
        date: bill.dueDate,
        tone: "default" as const,
      },
    ];
  });

  const dueSoonIds = new Set(dueSoonBills.map((bill) => bill.id.replace("bill-soon:", "")));
  const unpaidBills = input.bills.flatMap((bill) => {
    const status = effectiveStatus(bill, input.today);

    if (status === "paid" || dueSoonIds.has(bill.id)) {
      return [];
    }

    return [
      {
        id: `bill:${bill.id}`,
        href: `/properties/${bill.propertyId}/rates-levies`,
        title: bill.issuerName,
        subtitle: bill.propertyName,
        amount: bill.totalDue,
        date: bill.dueDate,
        tone: status === "overdue" ? ("overdue" as const) : ("default" as const),
      },
    ];
  });

  const active = input.properties.filter((property) => property.status === "active");
  const missing = active
    .flatMap((property) => {
      const items: AttentionItem[] = [];

      if (property.rentalType === "short_term" && !input.statementPropertyIds.has(property.id)) {
        items.push({
          id: `statement:${property.id}`,
          href: `/properties/${property.id}/income`,
          title: property.name,
          subtitle: `No owner's statement for ${monthLabel}`,
          amount: null,
          date: null,
          tone: "default",
        });
      }

      if (!input.billPropertyIds.has(property.id)) {
        items.push({
          id: `rates:${property.id}`,
          href: `/properties/${property.id}/rates-levies`,
          title: property.name,
          subtitle: `No rates or levy bill for ${monthLabel}`,
          amount: null,
          date: null,
          tone: "default",
        });
      }

      return items;
    })
    .sort(byTitle);

  const expiringLeases =
    horizon === null
      ? []
      : input.leases
          .filter((lease) => lease.status === "active" && lease.endDate <= horizon)
          .map((lease) => ({
            id: `lease:${lease.id}`,
            href: `/properties/${lease.propertyId}/tenants`,
            title: lease.tenantName,
            subtitle: lease.propertyName,
            amount: null,
            date: lease.endDate,
            tone: lease.endDate < input.today ? ("overdue" as const) : ("default" as const),
          }))
          .sort(byDateThenTitle);

  return {
    overdueInvoices,
    unpaid: [...unpaidExpenses, ...unpaidBills].sort(byDateThenTitle),
    dueSoonBills: dueSoonBills.sort(byDateThenTitle),
    missing,
    expiringLeases,
  };
}

export const ATTENTION_WINDOWS = {
  billsDueWithinDays: UPCOMING_DAYS,
  leasesExpiringWithinDays: LEASE_EXPIRY_WARNING_DAYS,
} as const;

function byDateThenTitle(left: AttentionItem, right: AttentionItem): number {
  const date = (left.date ?? "").localeCompare(right.date ?? "");

  if (date !== 0) {
    return date;
  }

  return left.title.localeCompare(right.title, "en-ZA");
}

function byTitle(left: AttentionItem, right: AttentionItem): number {
  const title = left.title.localeCompare(right.title, "en-ZA");

  if (title !== 0) {
    return title;
  }

  return left.subtitle.localeCompare(right.subtitle, "en-ZA");
}
