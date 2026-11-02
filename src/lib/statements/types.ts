import type { StatementStatus } from "@/lib/statements/labels";

export type OwnerStatement = {
  id: string;
  propertyId: string;
  periodMonth: string;
  statementDate: string | null;
  managerName: string | null;
  nightsBooked: number;
  bookingsCount: number;
  grossIncome: string;
  platformFees: string;
  managementFee: string;
  cleaningFees: string;
  otherDeductions: string;
  vatOnFees: string;
  netPayout: string;
  payoutDate: string | null;
  status: StatementStatus;
  filePath: string;
};

export type StatementPreview = {
  path: string;
  url: string;
  mimeType: string;
  persisted: boolean;
};
