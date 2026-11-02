import { moneyToCents } from "@/lib/invoices/calc";

export type IncomeSource = "payment" | "statement";

export type IncomeEntry = {
  id: string;
  source: IncomeSource;
  date: string;
  propertyId: string;
  propertyName: string;
  detail: string;
  gross: string;
  deductions: string | null;
  net: string;
  status: "paid" | "expected" | "received";
};

export type IncomeProperty = {
  id: string;
  name: string;
};

export function incomeNetCents(entries: IncomeEntry[]): bigint {
  return entries.reduce((sum, entry) => sum + moneyToCents(entry.net), BigInt(0));
}
