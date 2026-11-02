import { daysUntil, formatDateOnly, formatRate } from "@/lib/format";
import type { LeaseRecord } from "@/lib/leases/types";

export const LEASE_EXPIRY_WARNING_DAYS = 60;
export const ESCALATION_WARNING_DAYS = 30;

type LeaseDates = Pick<
  LeaseRecord,
  "status" | "endDate" | "escalationDate" | "escalationPercent"
>;

export function daysUntilExpiryLabel(endDate: string, today: string): string {
  const days = daysUntil(endDate, today);

  if (days === null) {
    return "—";
  }

  if (days > 1) {
    return `${days} days`;
  }

  if (days === 1) {
    return "1 day";
  }

  if (days === 0) {
    return "Expires today";
  }

  if (days === -1) {
    return "Expired yesterday";
  }

  return `Expired ${Math.abs(days)} days ago`;
}

export function nextEscalationSummary(
  lease: Pick<LeaseRecord, "escalationDate" | "escalationPercent">,
  today: string,
): string {
  if (!lease.escalationDate && !lease.escalationPercent) {
    return "None scheduled";
  }

  const percent = lease.escalationPercent ? formatRate(lease.escalationPercent) : null;

  if (!lease.escalationDate) {
    return percent ?? "None scheduled";
  }

  const days = daysUntil(lease.escalationDate, today);
  const date = formatDateOnly(lease.escalationDate);
  let when = date;

  if (days === 0) {
    when = `${date} (today)`;
  } else if (days === 1) {
    when = `${date} (tomorrow)`;
  } else if (days !== null && days > 1) {
    when = `${date} (in ${days} days)`;
  } else if (days === -1) {
    when = `${date} (yesterday)`;
  } else if (days !== null && days < -1) {
    when = `${date} (${Math.abs(days)} days ago)`;
  }

  return percent ? `${percent} on ${when}` : when;
}

export function leaseWarningMessages(lease: LeaseDates, today: string): string[] {
  if (lease.status !== "active") {
    return [];
  }

  const messages: string[] = [];
  const untilEnd = daysUntil(lease.endDate, today);

  if (untilEnd !== null && untilEnd <= LEASE_EXPIRY_WARNING_DAYS) {
    const date = formatDateOnly(lease.endDate);

    if (untilEnd < -1) {
      messages.push(`The lease expired ${Math.abs(untilEnd)} days ago, on ${date}.`);
    } else if (untilEnd === -1) {
      messages.push(`The lease expired yesterday, on ${date}.`);
    } else if (untilEnd === 0) {
      messages.push("The lease expires today.");
    } else if (untilEnd === 1) {
      messages.push(`The lease expires tomorrow, on ${date}.`);
    } else {
      messages.push(`The lease expires in ${untilEnd} days, on ${date}.`);
    }
  }

  if (lease.escalationDate) {
    const untilEscalation = daysUntil(lease.escalationDate, today);

    if (
      untilEscalation !== null &&
      untilEscalation >= 0 &&
      untilEscalation <= ESCALATION_WARNING_DAYS
    ) {
      const percent = lease.escalationPercent
        ? ` (${formatRate(lease.escalationPercent)})`
        : "";
      const date = formatDateOnly(lease.escalationDate);

      if (untilEscalation === 0) {
        messages.push(`A rent escalation is due today${percent}.`);
      } else if (untilEscalation === 1) {
        messages.push(`A rent escalation is due tomorrow, on ${date}${percent}.`);
      } else {
        messages.push(
          `A rent escalation is due in ${untilEscalation} days, on ${date}${percent}.`,
        );
      }
    }
  }

  return messages;
}

export function warningsForLeases(leases: LeaseDates[], today: string): string[] {
  return leases.flatMap((lease) => leaseWarningMessages(lease, today));
}
