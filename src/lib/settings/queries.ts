import { getActor } from "@/lib/auth/access";
import type { BusinessSettings } from "@/lib/settings/types";

export async function getBusinessSettings(): Promise<
  { ok: true; settings: BusinessSettings } | { ok: false; message: string }
> {
  const actor = await getActor();

  if (!actor.ok) {
    return actor;
  }

  const { data, error } = await actor.supabase
    .from("business_settings")
    .select(
      "business_name, address, phone, email, bank_name, account_name, account_number, branch_code, vat_number, logo_path, payment_terms_days",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error(error.message);
    return { ok: false, message: "Could not load business settings." };
  }

  if (!data) {
    return { ok: false, message: "Could not load business settings." };
  }

  return {
    ok: true,
    settings: {
      businessName: data.business_name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      bankName: data.bank_name,
      accountName: data.account_name,
      accountNumber: data.account_number,
      branchCode: data.branch_code,
      vatNumber: data.vat_number,
      logoPath: data.logo_path,
      paymentTermsDays: data.payment_terms_days,
    },
  };
}
