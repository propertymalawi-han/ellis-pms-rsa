import type { InvoiceStatus, PaymentMethod } from "@/lib/invoices/labels";

export type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  propertyId: string;
  propertyName: string;
  leaseId: string;
  tenantId: string;
  tenantName: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  vatAmount: string;
  total: string;
  amountPaid: string;
  issued: boolean;
  status: InvoiceStatus;
  notes: string | null;
  pdfPath: string | null;
};

export type InvoiceLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatApplicable: boolean;
  lineTotal: string;
  vatAmount: string;
  position: number;
};

export type InvoicePayment = {
  id: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  amount: string;
  paymentDate: string;
  method: PaymentMethod;
  reference: string | null;
  proofFilePath: string | null;
};

export type LeaseOption = {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  monthlyRent: string;
  rentDueDay: number;
  startDate: string;
  endDate: string;
  status: "active" | "ended";
};

export type InvoiceDetail = InvoiceListItem & {
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  propertyAddress: string;
  tenantEmail: string | null;
  tenantPhone: string | null;
  createdAt: string;
};

export type PropertyOption = {
  id: string;
  name: string;
};
