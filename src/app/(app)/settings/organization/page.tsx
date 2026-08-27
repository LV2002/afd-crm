import { createClient } from "@/lib/supabase/server";

import { OrganizationForm } from "./organization-form";

export default async function OrganizationSettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("name, logo_url, primary_color, timezone, currency, locale")
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="text-sm text-muted-foreground">
          A singleton row — everyone signed in can see it, only settings.manage can change it.
        </p>
      </div>
      <OrganizationForm
        values={{
          name: data?.name ?? "",
          logoUrl: data?.logo_url ?? "",
          primaryColor: data?.primary_color ?? "#0f172a",
          timezone: data?.timezone ?? "Asia/Kolkata",
          currency: data?.currency ?? "INR",
          locale: data?.locale ?? "en-IN",
        }}
      />
    </div>
  );
}
