import type { PropertyType } from "@/lib/properties/labels";

import type { BillStatus, BillType } from "@/lib/bills/labels";

export type BillProperty = {
  id: string;
  name: string;
  propertyType: PropertyType;
};

export type RatesBill = {
  id: string;
  propertyId: string;
  propertyName: string;
  billType: BillType;
  issuerName: string;
  accountNumber: string | null;
  periodMonth: string;
  statementDate: string | null;
  dueDate: string;
  levy: string;
  specialLevy: string;
  municipalRates: string;
  water: string;
  electricity: string;
  refuse: string;
  sewerage: string;
  otherCharges: string;
  arrears: string;
  interest: string;
  totalDue: string;
  amountPaid: string | null;
  paidDate: string | null;
  status: BillStatus;
  filePath: string | null;
  proofFilePath: string | null;
};

export type BillPreview = {
  path: string;
  url: string;
  mimeType: string;
  persisted: boolean;
};

export type BillFileKind = "bill" | "proof";

export type BillFieldDefaults = {
  issuerName: string;
  accountNumber: string;
};
