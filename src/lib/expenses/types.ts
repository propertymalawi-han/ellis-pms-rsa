import type {
  ExpenseRecurrence,
  ExpenseStatus,
  PaymentMethod,
} from "@/lib/expenses/labels";

export type ExpenseCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ExpenseProperty = {
  id: string;
  name: string;
};

export type Expense = {
  id: string;
  propertyId: string;
  propertyName: string;
  categoryId: string;
  categoryName: string;
  categorySort: number;
  supplier: string | null;
  description: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  amountExclVat: string;
  vatAmount: string;
  total: string;
  dueDate: string;
  paidDate: string | null;
  amountPaid: string | null;
  status: ExpenseStatus;
  paymentMethod: PaymentMethod | null;
  recurring: boolean;
  recurrence: ExpenseRecurrence | null;
  filePath: string | null;
  proofFilePath: string | null;
  billId: string | null;
};

export type ExpensePreview = {
  path: string;
  url: string;
  mimeType: string;
  persisted: boolean;
};

export type ExpenseFileKind = "invoice" | "proof";
