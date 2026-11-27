import { and, asc, eq, isNull } from "drizzle-orm";

import { AccessDenied } from "@/components/layout/access-denied";
import { can, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { centers, contactLists } from "@/lib/db/schema";
import { loadTemperatureOptionsDirect } from "@/lib/leads/temperature-options-direct";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions } from "@/app/(app)/settings/rules/load-options";

import { FlowForm } from "../flow-form";

export const dynamic = "force-dynamic";

export default async function NewWhatsAppFlowPage() {
  const user = await getCurrentUser();
  if (!user || !can(user, "whatsapp.campaign")) return <AccessDenied />;

  const supabase = await createClient();
  const [temperatureOptions, centerRows, ruleOptions, listRows] = await Promise.all([
    loadTemperatureOptionsDirect(),
    db
      .select({ id: centers.id, name: centers.name })
      .from(centers)
      .where(eq(centers.isActive, true))
      .orderBy(asc(centers.name)),
    loadRuleOptions(supabase),
    db
      .select({ id: contactLists.id, name: contactLists.name })
      .from(contactLists)
      .where(and(isNull(contactLists.archivedAt), eq(contactLists.useForWhatsapp, true)))
      .orderBy(asc(contactLists.name)),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">New automation</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Name it and say what starts it. The steps come next — and it stays switched off until you
          turn it on, so nothing goes out while you are still writing it.
        </p>
      </div>

      <FlowForm
        values={{
          name: "",
          description: "",
          triggerType: "temperature_entered",
          temperature: "",
          keywords: "",
          listIds: [],
          centerId: "",
          audience: "lead",
          appliesTo: [],
        }}
        statuses={temperatureOptions
          .filter((option) => option.isActive)
          .map((option) => ({ value: option.value, label: option.label }))}
        centers={centerRows}
        fields={ruleOptions.fields}
        optionsByField={ruleOptions.optionsByField}
        lists={listRows}
      />
    </div>
  );
}
