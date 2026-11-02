import type { LeaseStatus } from "@/lib/leases/labels";

export type TenantRecord = {
  id: string;
  fullName: string;
  idNumber: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type LeaseRecord = {
  id: string;
  propertyId: string;
  tenantId: string;
  tenant: TenantRecord;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  depositAmount: string;
  depositHeldBy: string;
  escalationPercent: string | null;
  escalationDate: string | null;
  rentDueDay: number;
  status: LeaseStatus;
};
