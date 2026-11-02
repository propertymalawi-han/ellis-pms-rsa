import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { getActor } from "@/lib/auth/access";
import { INVOICES_BUCKET, SIGNED_URL_SECONDS } from "@/lib/invoices/labels";
import { settingsToFormValues } from "@/lib/settings/schema";
import { getBusinessSettings } from "@/lib/settings/queries";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const actor = await getActor();

  if (!actor.ok) {
    return (
      <div>
        <PageHeader title="Settings" description="Business details printed on invoices." />
        <p className="text-sm text-destructive">{actor.message}</p>
      </div>
    );
  }

  if (!actor.isAdmin) {
    return (
      <div>
        <PageHeader title="Settings" description="Business details printed on invoices." />
        <p className="text-sm text-muted-foreground">
          Business settings are managed by the owner or a partner.
        </p>
      </div>
    );
  }

  const settings = await getBusinessSettings();

  if (!settings.ok) {
    return (
      <div>
        <PageHeader title="Settings" description="Business details printed on invoices." />
        <p className="text-sm text-destructive">{settings.message}</p>
      </div>
    );
  }

  let logoUrl: string | null = null;

  if (settings.settings.logoPath) {
    const signed = await actor.supabase.storage
      .from(INVOICES_BUCKET)
      .createSignedUrl(settings.settings.logoPath, SIGNED_URL_SECONDS);

    logoUrl = signed.data?.signedUrl ?? null;
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="These details appear on invoice PDFs, including the banking block and payment reference."
      />
      <BusinessSettingsForm
        defaultValues={settingsToFormValues(settings.settings)}
        logoUrl={logoUrl}
      />
    </div>
  );
}
