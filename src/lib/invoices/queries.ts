import { z } from "zod";

import { getActor } from "@/lib/auth/access";
import { vatCents, centsToMoney, moneyToCents } from "@/lib/invoices/calc";
import { isInvoiceStatus, isPaymentMethod } from "@/lib/invoices/labels";
import { isLeaseStatus } from "@/lib/leases/labels";
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceListItem,
  InvoicePayment,
  LeaseOption,
  PropertyOption,
} from "@/lib/invoices/types";
import { MONEY, parseDecimal } from "@/lib/money";
import { pageBounds, pageCountFor } from "@/lib/pagination";
import { provinceLabels, provinces, type Province } from "@/lib/properties/labels";

const listColumns =
  "id, invoice_number, property_id, property_name, lease_id, tenant_id, tenant_name, issue_date, due_date, period_start, period_end, subtotal, vat_amount, total, amount_paid, issued, status, notes, pdf_path, created_at";

const propertyIncomeColumns =
  "id, invoice_number, property_id, property_name, lease_id, tenant_id, tenant_name, issue_date, due_date, period_start, period_end, subtotal, vat_amount, total, amount_paid, issued, status, notes, pdf_path";

export async function listInvoices(): Promise<
  { ok: true; invoices: InvoiceListItem[] } | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("invoices_list")
    .select(listColumns)
    .order("issue_date", { ascending: false })
    .order("invoice_number", { ascending: false });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load invoices." };
  }

  return {
    ok: true,
    invoices: data.flatMap((row) => {
      const invoice = mapListItem(row);
      return invoice ? [invoice] : [];
    }),
  };
}

export async function listInvoiceProperties(): Promise<
  { ok: true; properties: PropertyOption[] } | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("properties_basic")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load properties." };
  }

  return {
    ok: true,
    properties: data.flatMap((row) =>
      row.id && row.name ? [{ id: row.id, name: row.name }] : [],
    ),
  };
}

export async function listLeaseOptions(): Promise<
  { ok: true; leases: LeaseOption[] } | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const [leasesResult, propertiesResult] = await Promise.all([
    actor.supabase
      .from("leases")
      .select(
        "id, property_id, monthly_rent, rent_due_day, start_date, end_date, status, tenants(full_name)",
      )
      .order("start_date", { ascending: false }),
    actor.supabase.from("properties_basic").select("id, name"),
  ]);

  if (leasesResult.error || propertiesResult.error) {
    console.error(leasesResult.error?.message ?? propertiesResult.error?.message);
    return { ok: false, message: "Could not load leases." };
  }

  const names = new Map(
    propertiesResult.data.flatMap((row) =>
      row.id && row.name ? [[row.id, row.name] as const] : [],
    ),
  );

  const leases = leasesResult.data.flatMap((row) => {
    const rent = moneyString(row.monthly_rent);
    const tenant = tenantName(row.tenants);
    const propertyName = names.get(row.property_id);

    if (
      !rent ||
      !tenant ||
      !propertyName ||
      !Number.isInteger(row.rent_due_day) ||
      !isLeaseStatus(row.status)
    ) {
      return [];
    }

    return [
      {
        id: row.id,
        propertyId: row.property_id,
        propertyName,
        tenantName: tenant,
        monthlyRent: rent,
        rentDueDay: row.rent_due_day,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
      },
    ];
  });

  leases.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "active" ? -1 : 1;
    }

    return left.propertyName.localeCompare(right.propertyName);
  });

  return { ok: true, leases };
}

export async function getInvoice(invoiceId: string): Promise<
  | { ok: true; invoice: InvoiceDetail }
  | { ok: false; status: "not_found" | "error"; message: string }
> {
  if (!z.uuid().safeParse(invoiceId).success) {
    return { ok: false, status: "not_found", message: "Invoice not found." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return { ok: false, status: "error", message: actor.message };
  }

  const { data, error } = await actor.supabase
    .from("invoices_list")
    .select(listColumns)
    .eq("id", invoiceId)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { ok: false, status: "error", message: "Could not load the invoice." };
  }

  const invoice = data ? mapListItem(data) : null;

  if (!invoice || !data?.created_at) {
    return { ok: false, status: "not_found", message: "Invoice not found." };
  }

  const [linesResult, paymentsResult, propertyResult, tenantResult] = await Promise.all([
    actor.supabase
      .from("invoice_items")
      .select("id, description, quantity, unit_price, vat_applicable, line_total, position")
      .eq("invoice_id", invoiceId)
      .order("position", { ascending: true }),
    actor.supabase
      .from("payments")
      .select("id, invoice_id, amount, payment_date, method, reference, proof_file_path")
      .eq("invoice_id", invoiceId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
    actor.supabase
      .from("properties_basic")
      .select("address_line1, address_line2, suburb, city, province, postal_code")
      .eq("id", invoice.propertyId)
      .maybeSingle(),
    actor.supabase
      .from("tenants")
      .select("email, phone")
      .eq("id", invoice.tenantId)
      .maybeSingle(),
  ]);

  if (linesResult.error || paymentsResult.error) {
    console.error(linesResult.error?.message ?? paymentsResult.error?.message);
    return { ok: false, status: "error", message: "Could not load the invoice." };
  }

  const lines = linesResult.data.flatMap((row) => {
    const line = mapLine(row);
    return line ? [line] : [];
  });
  const payments = paymentsResult.data.flatMap((row) => {
    const payment = mapPayment(row);
    return payment ? [payment] : [];
  });

  return {
    ok: true,
    invoice: {
      ...invoice,
      lines,
      payments,
      propertyAddress: propertyResult.data
        ? formatAddress(propertyResult.data)
        : "",
      tenantEmail: tenantResult.data?.email ?? null,
      tenantPhone: tenantResult.data?.phone ?? null,
      createdAt: data.created_at,
    },
  };
}

export async function listPropertyIncome(
  propertyId: string,
  invoicePage: number,
  paymentPage: number,
): Promise<
  | {
      ok: true;
      invoices: InvoiceListItem[];
      payments: InvoicePayment[];
      invoicePage: number;
      invoicePageCount: number;
      paymentPage: number;
      paymentPageCount: number;
    }
  | { ok: false; message: string }
> {
  if (!z.uuid().safeParse(propertyId).success) {
    return { ok: false, message: "Could not load income." };
  }

  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const invoicesBounds = pageBounds(invoicePage);
  const paymentsBounds = pageBounds(paymentPage);
  const [invoicesResult, paymentsResult] = await Promise.all([
    actor.supabase
      .from("invoices_list")
      .select(propertyIncomeColumns, { count: "exact" })
      .eq("property_id", propertyId)
      .order("issue_date", { ascending: false })
      .order("invoice_number", { ascending: false })
      .range(invoicesBounds.from, invoicesBounds.to),
    actor.supabase
      .from("payments")
      .select(
        "id, invoice_id, amount, payment_date, method, reference, proof_file_path, invoices!inner(invoice_number, property_id)",
        { count: "exact" },
      )
      .eq("invoices.property_id", propertyId)
      .order("payment_date", { ascending: false })
      .range(paymentsBounds.from, paymentsBounds.to),
  ]);

  if (invoicesResult.error || paymentsResult.error) {
    console.error(invoicesResult.error?.message ?? paymentsResult.error?.message);
    return { ok: false, message: "Could not load income." };
  }

  const invoices = invoicesResult.data.flatMap((row) => {
    const invoice = mapListItem(row);
    return invoice ? [invoice] : [];
  });
  const payments = paymentsResult.data.flatMap((row) => {
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
    const payment = mapPayment({
      ...row,
      invoice_number: invoice?.invoice_number ?? null,
    });
    return payment ? [payment] : [];
  });

  return {
    ok: true,
    invoices,
    payments,
    invoicePage,
    invoicePageCount: pageCountFor(invoicesResult.count ?? invoices.length),
    paymentPage,
    paymentPageCount: pageCountFor(paymentsResult.count ?? payments.length),
  };
}

function mapListItem(row: {
  id: string | null;
  invoice_number: string | null;
  property_id: string | null;
  property_name: string | null;
  lease_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  period_start: string | null;
  period_end: string | null;
  subtotal: number | null;
  vat_amount: number | null;
  total: number | null;
  amount_paid: number | null;
  issued: boolean | null;
  status: string | null;
  notes: string | null;
  pdf_path: string | null;
}): InvoiceListItem | null {
  const subtotal = moneyString(row.subtotal);
  const vatAmount = moneyString(row.vat_amount);
  const total = moneyString(row.total);
  const amountPaid = moneyString(row.amount_paid);

  if (
    !row.id ||
    !row.invoice_number ||
    !row.property_id ||
    !row.property_name ||
    !row.lease_id ||
    !row.tenant_id ||
    !row.tenant_name ||
    !row.issue_date ||
    !row.due_date ||
    !row.period_start ||
    !row.period_end ||
    !subtotal ||
    !vatAmount ||
    !total ||
    !amountPaid ||
    row.issued === null ||
    !row.status ||
    !isInvoiceStatus(row.status)
  ) {
    return null;
  }

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    propertyId: row.property_id,
    propertyName: row.property_name,
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    issueDate: row.issue_date.slice(0, 10),
    dueDate: row.due_date.slice(0, 10),
    periodStart: row.period_start.slice(0, 10),
    periodEnd: row.period_end.slice(0, 10),
    subtotal,
    vatAmount,
    total,
    amountPaid,
    issued: row.issued,
    status: row.status,
    notes: row.notes,
    pdfPath: row.pdf_path,
  };
}

function mapLine(row: {
  id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  vat_applicable: boolean;
  line_total: number | string;
  position: number;
}): InvoiceLine | null {
  const quantity = moneyString(row.quantity);
  const unitPrice = moneyString(row.unit_price);
  const lineTotal = moneyString(row.line_total);

  if (!quantity || !unitPrice || !lineTotal) {
    return null;
  }

  return {
    id: row.id,
    description: row.description,
    quantity,
    unitPrice,
    vatApplicable: row.vat_applicable,
    lineTotal,
    vatAmount: centsToMoney(vatCents(moneyToCents(lineTotal), row.vat_applicable)),
    position: row.position,
  };
}

function mapPayment(row: {
  id: string;
  invoice_id: string;
  amount: number | string;
  payment_date: string;
  method: string;
  reference: string | null;
  proof_file_path: string | null;
  invoice_number?: string | null;
}): InvoicePayment | null {
  const amount = moneyString(row.amount);

  if (!amount || !isPaymentMethod(row.method)) {
    return null;
  }

  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    amount,
    paymentDate: row.payment_date.slice(0, 10),
    method: row.method,
    reference: row.reference,
    proofFilePath: row.proof_file_path,
  };
}

function moneyString(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = typeof value === "number" ? value.toFixed(2) : value;
  const parsed = parseDecimal(raw, MONEY);

  return parsed.ok ? parsed.canonical : null;
}

function tenantName(
  value: { full_name: string } | { full_name: string }[] | null,
): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const name = row?.full_name.trim();

  return name ? name : null;
}

function formatAddress(row: {
  address_line1: string | null;
  address_line2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
}): string {
  const province =
    row.province && isProvince(row.province) ? provinceLabels[row.province] : null;

  return [row.address_line1, row.address_line2, row.suburb, row.city, province, row.postal_code]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

function isProvince(value: string): value is Province {
  return (provinces as readonly string[]).includes(value);
}
