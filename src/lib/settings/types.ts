export type BusinessSettings = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  vatNumber: string | null;
  logoPath: string | null;
  paymentTermsDays: number;
};

export type BusinessSettingsValues = {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branchCode: string;
  vatNumber: string;
  paymentTermsDays: string;
};
