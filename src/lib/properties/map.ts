import { INTEREST_RATE, MONEY, decimalColumn, numberToDecimalInput } from "@/lib/money";
import type { PropertyFormValues } from "@/lib/properties/schema";
import type { PropertyDetail } from "@/lib/properties/types";
import type { TablesInsert } from "@/types/database";

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function toPropertyWrite(
  values: PropertyFormValues,
): TablesInsert<"properties"> {
  return {
    name: values.name.trim(),
    rental_type: values.rentalType,
    property_type: values.propertyType,
    status: values.status,
    address_line1: blankToNull(values.addressLine1),
    address_line2: blankToNull(values.addressLine2),
    suburb: blankToNull(values.suburb),
    city: blankToNull(values.city),
    province: values.province === "" ? null : values.province,
    postal_code: blankToNull(values.postalCode),
    erf_number: blankToNull(values.erfNumber),
    unit_number: blankToNull(values.unitNumber),
    scheme_number: blankToNull(values.schemeNumber),
    purchase_price: decimalColumn(values.purchasePrice, MONEY),
    purchase_date: blankToNull(values.purchaseDate),
    transfer_costs: decimalColumn(values.transferCosts, MONEY),
    improvement_costs: decimalColumn(values.improvementCosts, MONEY),
    current_value: decimalColumn(values.currentValue, MONEY),
    bond_bank: blankToNull(values.bondBank),
    bond_amount: decimalColumn(values.bondAmount, MONEY),
    bond_monthly_payment: decimalColumn(values.bondMonthlyPayment, MONEY),
    bond_interest_rate: decimalColumn(values.bondInterestRate, INTEREST_RATE),
    body_corporate_name: blankToNull(values.bodyCorporateName),
    municipal_account_number: blankToNull(values.municipalAccountNumber),
    notes: blankToNull(values.notes),
  };
}

export function propertyToFormValues(property: PropertyDetail): PropertyFormValues {
  if (!property.finance) {
    throw new Error("Finance fields are required to edit a property.");
  }

  return {
    name: property.name,
    rentalType: property.rentalType,
    propertyType: property.propertyType,
    status: property.status,
    addressLine1: property.addressLine1 ?? "",
    addressLine2: property.addressLine2 ?? "",
    suburb: property.suburb ?? "",
    city: property.city ?? "",
    province: property.province ?? "",
    postalCode: property.postalCode ?? "",
    erfNumber: property.erfNumber ?? "",
    unitNumber: property.unitNumber ?? "",
    schemeNumber: property.schemeNumber ?? "",
    purchasePrice: numberToDecimalInput(property.finance.purchasePrice, MONEY),
    purchaseDate: property.finance.purchaseDate ?? "",
    transferCosts: numberToDecimalInput(property.finance.transferCosts, MONEY),
    improvementCosts: numberToDecimalInput(
      property.finance.improvementCosts,
      MONEY,
    ),
    currentValue: numberToDecimalInput(property.finance.currentValue, MONEY),
    bondBank: property.finance.bondBank ?? "",
    bondAmount: numberToDecimalInput(property.finance.bondAmount, MONEY),
    bondMonthlyPayment: numberToDecimalInput(
      property.finance.bondMonthlyPayment,
      MONEY,
    ),
    bondInterestRate: numberToDecimalInput(
      property.finance.bondInterestRate,
      INTEREST_RATE,
    ),
    bodyCorporateName: property.bodyCorporateName ?? "",
    municipalAccountNumber: property.municipalAccountNumber ?? "",
    notes: property.notes ?? "",
  };
}
