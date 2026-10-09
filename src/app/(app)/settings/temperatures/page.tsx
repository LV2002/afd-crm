import type { RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { can, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { OptionsEditor } from "../dropdowns/options-editor";
import { toOptionRowData } from "../dropdowns/option-row-data";
import { describeConditions } from "@/lib/rules/describe-rule";

import { loadRuleOptions, ruleLabelLookup } from "../rules/load-options";
import { RuleForm } from "./rule-form";
import { RuleRow, type TemperatureRuleData } from "./rule-row";

export default async function TemperaturesSettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: options } = await supabase
    .from("dropdown_options")
    .select("id, value, label, color, is_active, metadata")
    .eq("category", "temperature")
    .is("deleted_at", null)
    .order("sort_order")
    .returns<
      Array<{
        id: string;
        value: string;
        label: string;
        color: string | null;
        is_active: boolean;
        metadata: unknown;
      }>
    >();
  const optionRows = (options ?? []).map(toOptionRowData);

  const canEditValues = user ? can(user, "settings.manage") : false;
  const canEditRules = user ? can(user, "rules.manage") : false;

  // Only the rule builder needs these, and only somebody who may edit
  // rules sees it — no reason to query dropdowns for everybody else.
  const ruleOptions = canEditRules ? await loadRuleOptions(supabase) : null;

  let rules: TemperatureRuleData[] = [];
  if (canEditRules && ruleOptions) {
    const { data } = await supabase
      .from("temperature_rules")
      .select("id, temperature_value, priority, conditions, is_active")
      .order("priority", { ascending: false })
      .returns<
        Array<{
          id: string;
          temperature_value: string;
          priority: number;
          conditions: RuleConditions | null;
          is_active: boolean;
        }>
      >();
    const label = ruleLabelLookup(ruleOptions);
    rules = (data ?? []).map((rule) => ({
      id: rule.id,
      temperature_value: rule.temperature_value,
      priority: rule.priority,
      conditions: describeConditions(rule.conditions ?? {}, label),
      is_active: rule.is_active,
    }));
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Temperatures</h1>
        <p className="text-sm text-muted-foreground">
          A lead&apos;s temperature is its whole status: Not contacted, Contacted, Cold, Warm, Hot,
          Took admission, Future prospect, and the ways a lead can end. Rename them, recolour,
          reorder, say what each one means and how likely it is to become an admission. The
          rules below re-grade leads that are being worked, automatically — a counsellor&apos;s
          manual change still wins over any rule while it&apos;s in effect.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Values</h2>
        {canEditValues ? (
          <OptionsEditor category="temperature" options={optionRows} />
        ) : (
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to edit temperature values.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Rules</h2>
        {canEditRules && ruleOptions ? (
          <div className="flex flex-col gap-3">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} />
            ))}
            <RuleForm
              temperatureOptions={optionRows.filter((o) => o.kind === "open").map((o) => ({ value: o.value, label: o.label }))}
              fields={ruleOptions.fields}
              optionsByField={ruleOptions.optionsByField}
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
