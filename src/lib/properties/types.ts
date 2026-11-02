import type {
  PropertyStatus,
  PropertyType,
  Province,
  RentalType,
} from "@/lib/properties/labels";

export type PropertyListItem = {
  id: string;
  name: string;
  suburb: string | null;
  city: string | null;
  rentalType: RentalType;
  propertyType: PropertyType;
  status: PropertyStatus;
  purchasePrice: number | null;
  currentValue: number | null;
};

export type PropertyFinance = {
  purchasePrice: number | null;
  purchaseDate: string | null;
  transferCosts: number | null;
  improvementCosts: number | null;
  currentValue: number | null;
  bondBank: string | null;
  bondAmount: number | null;
  bondMonthlyPayment: number | null;
  bondInterestRate: number | null;
};

export type PropertyDetail = {
  id: string;
  name: string;
  rentalType: RentalType;
  propertyType: PropertyType;
  status: PropertyStatus;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: Province | null;
  postalCode: string | null;
  erfNumber: string | null;
  unitNumber: string | null;
  schemeNumber: string | null;
  bodyCorporateName: string | null;
  municipalAccountNumber: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Null for property managers. Finance columns are not selected for them. */
  finance: PropertyFinance | null;
};
