import { Badge } from "@/components/ui/badge";
import {
  propertyStatusLabels,
  rentalTypeLabels,
  type PropertyStatus,
  type RentalType,
} from "@/lib/properties/labels";

export function RentalTypeBadge({ type }: { type: RentalType }) {
  return (
    <Badge variant={type === "long_term" ? "default" : "secondary"}>
      {rentalTypeLabels[type]}
    </Badge>
  );
}

export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <Badge variant={status === "sold" ? "outline" : "secondary"}>
      {propertyStatusLabels[status]}
    </Badge>
  );
}
