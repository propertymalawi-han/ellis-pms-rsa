import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PropertyFinancials,
  type PropertyFinancialReport,
} from "@/components/properties/property-financials";
import { formatDate, formatDateOnly, formatRate, formatZAR } from "@/lib/format";
import {
  displayValue,
  propertyStatusLabels,
  propertyTypeLabels,
  provinceLabels,
  rentalTypeLabels,
} from "@/lib/properties/labels";
import type { PropertyDetail } from "@/lib/properties/types";

export function PropertyOverview({
  property,
  isAdmin,
  financials = null,
}: {
  property: PropertyDetail;
  isAdmin: boolean;
  financials?: PropertyFinancialReport | null;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              { label: "Name", value: property.name },
              { label: "Rental type", value: rentalTypeLabels[property.rentalType] },
              {
                label: "Property type",
                value: propertyTypeLabels[property.propertyType],
              },
              { label: "Status", value: propertyStatusLabels[property.status] },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Location</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              { label: "Street", value: displayValue(property.addressLine1) },
              { label: "Address line 2", value: displayValue(property.addressLine2) },
              { label: "Suburb", value: displayValue(property.suburb) },
              { label: "City", value: displayValue(property.city) },
              {
                label: "Province",
                value: property.province
                  ? provinceLabels[property.province]
                  : "—",
              },
              { label: "Postal code", value: displayValue(property.postalCode) },
              { label: "Erf number", value: displayValue(property.erfNumber) },
              { label: "Unit number", value: displayValue(property.unitNumber) },
              { label: "Scheme number", value: displayValue(property.schemeNumber) },
            ]}
          />
        </CardContent>
      </Card>

      {isAdmin && property.finance ? (
        <Card>
          <CardHeader>
            <CardTitle>Purchase & finance</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts
              items={[
                {
                  label: "Purchase price",
                  value: money(property.finance.purchasePrice),
                },
                {
                  label: "Purchase date",
                  value: property.finance.purchaseDate
                    ? formatDateOnly(property.finance.purchaseDate)
                    : "—",
                },
                {
                  label: "Transfer costs",
                  value: money(property.finance.transferCosts),
                },
                {
                  label: "Improvement costs",
                  value: money(property.finance.improvementCosts),
                },
                {
                  label: "Current value",
                  value: money(property.finance.currentValue),
                },
                { label: "Bond bank", value: displayValue(property.finance.bondBank) },
                { label: "Bond amount", value: money(property.finance.bondAmount) },
                {
                  label: "Monthly bond payment",
                  value: money(property.finance.bondMonthlyPayment),
                },
                {
                  label: "Interest rate",
                  value:
                    property.finance.bondInterestRate === null
                      ? "—"
                      : formatRate(property.finance.bondInterestRate),
                },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      {isAdmin && financials ? (
        <PropertyFinancials property={property} report={financials} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <Facts
            items={[
              {
                label: "Body corporate name",
                value: displayValue(property.bodyCorporateName),
              },
              {
                label: "Municipal account number",
                value: displayValue(property.municipalAccountNumber),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {property.notes?.trim() ? (
            <p className="whitespace-pre-wrap break-words">{property.notes}</p>
          ) : (
            <p className="text-muted-foreground">No notes yet.</p>
          )}
        </CardContent>
      </Card>

      {property.createdAt || property.updatedAt ? (
        <p className="text-xs text-muted-foreground">
          {property.createdAt ? `Added ${formatDate(property.createdAt)}` : null}
          {property.createdAt && property.updatedAt ? " · " : null}
          {property.updatedAt ? `Updated ${formatDate(property.updatedAt)}` : null}
        </p>
      ) : null}
    </div>
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

function money(amount: number | null): string {
  return amount === null ? "—" : formatZAR(amount);
}
