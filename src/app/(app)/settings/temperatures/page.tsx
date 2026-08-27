import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { OptionsEditor } from "../dropdowns/options-editor";
import type { OptionRowData } from "../dropdowns/option-row";
import { RuleForm } from "./rule-form";
import { RuleRow, type TemperatureRuleData } from "./rule-row";

export default async function TemperaturesSettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: options } = await supabase
    .from("dropdown_options")
    .select("id, value, label, color, is_active")
    .eq("category", "temperature")
    .order("sort_order")
    .returns<OptionRowData[]>();

  const canEditValues = user ? can(user, "settings.manage") : false;
  const canEditRules = user ? can(user, "rules.manage") : false;

  let rules: TemperatureRuleData[] = [];
  if (canEditRules) {
    const { data } = await supabase
      .from("temperature_rules")
      .select("id, temperature_value, priority, conditions, is_active")
      .order("priority", { ascending: false })
      .returns<TemperatureRuleData[]>();
    rules = data ?? [];
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Temperatures</h1>
        <p className="text-sm text-muted-foreground">
          Hot/Warm/Cold/Dead by default — rename them, add one, reorder, and set the rules
          that assign them automatically. A counsellor&apos;s manual override still wins over
          any rule while it&apos;s in effect.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Values</h2>
        {canEditValues ? (
          <OptionsEditor category="temperature" options={options ?? []} />
        ) : (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to edit temperature values.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Rules</h2>
        {canEditRules ? (
          <div className="flex flex-col gap-3">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
            <RuleForm
              temperatureOptions={(options ?? []).map((o) => ({ value: o.value, label: o.label }))}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to manage temperature rules.
          </p>
        )}
      </div>
    </div>
  );
}
