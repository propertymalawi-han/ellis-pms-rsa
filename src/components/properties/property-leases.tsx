"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { LeaseForm } from "@/components/properties/lease-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateOnly, formatRentDueDay, formatZAR } from "@/lib/format";
import { endLease } from "@/lib/leases/actions";
import { leaseStatusLabels } from "@/lib/leases/labels";
import { emptyLeaseFormValues, type LeaseFormValues } from "@/lib/leases/schema";
import type { LeaseRecord, TenantRecord } from "@/lib/leases/types";
import { daysUntilExpiryLabel, nextEscalationSummary } from "@/lib/leases/warnings";
import { decimalToInput } from "@/lib/money";
import { displayValue } from "@/lib/properties/labels";

export function PropertyLeases({
  propertyId,
  leases,
  tenants,
  today,
}: {
  propertyId: string;
  leases: LeaseRecord[];
  tenants: TenantRecord[];
  today: string;
}) {
  const [editing, setEditing] = useState<LeaseRecord | "new" | null>(null);
  const current = leases.find((lease) => lease.status === "active") ?? null;
  const history = leases.filter((lease) => lease.status === "ended");

  return (
    <div className="grid gap-4">
      {editing ? (
        <LeaseForm
          key={editing === "new" ? "new" : editing.id}
          propertyId={propertyId}
          leaseId={editing === "new" ? null : editing.id}
          tenants={tenantsForForm(tenants, editing)}
          defaultValues={
            editing === "new"
              ? emptyLeaseFormValues(propertyId)
              : leaseToFormValues(editing, propertyId)
          }
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      ) : (
        <CurrentLease
          lease={current}
          today={today}
          onAdd={() => setEditing("new")}
          onEdit={() => {
            if (current) {
              setEditing(current);
            }
          }}
        />
      )}
      <Card>
        <CardHeader>
          <CardTitle>Lease history</CardTitle>
          <CardDescription>Ended leases stay on file.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No earlier leases.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((lease) => (
                    <TableRow key={lease.id}>
                      <TableCell className="break-words">{lease.tenant.fullName}</TableCell>
                      <TableCell>{formatDateOnly(lease.startDate)}</TableCell>
                      <TableCell>{formatDateOnly(lease.endDate)}</TableCell>
                      <TableCell>{formatZAR(lease.monthlyRent)}</TableCell>
                      <TableCell>{leaseStatusLabels[lease.status]}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit lease for ${lease.tenant.fullName}`}
                          onClick={() => setEditing(lease)}
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CurrentLease({
  lease,
  today,
  onAdd,
  onEdit,
}: {
  lease: LeaseRecord | null;
  today: string;
  onAdd: () => void;
  onEdit: () => void;
}) {
  if (!lease) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Current lease</CardTitle>
          <CardDescription>No lease is active on this property.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={onAdd}>
            Add lease
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-1">
          <CardTitle>Current lease</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{leaseStatusLabels[lease.status]}</Badge>
            <span>{lease.tenant.fullName}</span>
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <EndLeaseButton leaseId={lease.id} tenantName={lease.tenant.fullName} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Facts
          items={[
            { label: "Tenant", value: lease.tenant.fullName },
            { label: "ID number", value: displayValue(lease.tenant.idNumber) },
            { label: "Email", value: displayValue(lease.tenant.email) },
            { label: "Phone", value: displayValue(lease.tenant.phone) },
            { label: "Monthly rent", value: formatZAR(lease.monthlyRent) },
            { label: "Deposit", value: formatZAR(lease.depositAmount) },
            { label: "Deposit held by", value: lease.depositHeldBy },
            { label: "Start date", value: formatDateOnly(lease.startDate) },
            { label: "End date", value: formatDateOnly(lease.endDate) },
            {
              label: "Days until expiry",
              value: daysUntilExpiryLabel(lease.endDate, today),
            },
            { label: "Rent due", value: formatRentDueDay(lease.rentDueDay) },
            {
              label: "Next escalation",
              value: nextEscalationSummary(lease, today),
            },
          ]}
        />
        {lease.tenant.notes?.trim() ? (
          <div className="grid gap-1">
            <p className="text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap break-words">{lease.tenant.notes}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EndLeaseButton({
  leaseId,
  tenantName,
}: {
  leaseId: string;
  tenantName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await endLease(leaseId);

      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
      toast.success(`Lease for ${tenantName} ended.`);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
        }
      }}
    >
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        End lease
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End this lease?</DialogTitle>
          <DialogDescription>
            The lease for {tenantName} stays on file as history. Rent and dates
            are unchanged. You can add a new lease once this one has ended.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? "Saving…" : "End lease"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Facts({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function tenantsForForm(
  tenants: TenantRecord[],
  editing: LeaseRecord | "new",
): TenantRecord[] {
  if (editing === "new") {
    return tenants;
  }

  if (tenants.some((tenant) => tenant.id === editing.tenant.id)) {
    return tenants;
  }

  return [editing.tenant, ...tenants];
}

function leaseToFormValues(lease: LeaseRecord, propertyId: string): LeaseFormValues {
  return {
    propertyId,
    mode: "edit",
    tenantChoice: "existing",
    tenantId: lease.tenantId,
    fullName: lease.tenant.fullName,
    idNumber: lease.tenant.idNumber ?? "",
    email: lease.tenant.email ?? "",
    phone: lease.tenant.phone ?? "",
    notes: lease.tenant.notes ?? "",
    startDate: lease.startDate.slice(0, 10),
    endDate: lease.endDate.slice(0, 10),
    monthlyRent: decimalToInput(lease.monthlyRent),
    depositAmount: decimalToInput(lease.depositAmount),
    depositHeldBy: lease.depositHeldBy,
    escalationPercent: lease.escalationPercent
      ? decimalToInput(lease.escalationPercent)
      : "",
    escalationDate: lease.escalationDate?.slice(0, 10) ?? "",
    rentDueDay: String(lease.rentDueDay),
    status: lease.status,
  };
}
