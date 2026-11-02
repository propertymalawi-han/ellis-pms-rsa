import { Constants, type Database } from "@/types/database";

export const leaseStatuses = Constants.public.Enums.lease_status;

export type LeaseStatus = Database["public"]["Enums"]["lease_status"];

export const leaseStatusLabels: Record<LeaseStatus, string> = {
  active: "Active",
  ended: "Ended",
};

export function isLeaseStatus(value: string): value is LeaseStatus {
  return (leaseStatuses as readonly string[]).includes(value);
}
