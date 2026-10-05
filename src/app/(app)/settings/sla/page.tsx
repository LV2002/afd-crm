import type { RuleConditions } from "@/lib/assignment/evaluate-conditions";
import { describeConditions } from "@/lib/rules/describe-rule";
import { describeEscalationLadder } from "@/lib/sla/policy-copy";
import { createClient } from "@/lib/supabase/server";

import { loadRuleOptions, ruleLabelLookup } from "../rules/load-options";
import { BusinessHoursForm, type DayHours } from "./business-hours-form";
import { HolidaysList, type HolidayData } from "./holidays-list";
import { PolicyForm } from "./policy-form";
import { PolicyRow, type SlaPolicyData } from "./policy-row";

export default async function SlaSettingsPage() {
  const supabase = await createClient();

  const [{ data: policyRows }, { data: centers }, { data: hours }, { data: holidays }, ruleOptions] =
    await Promise.all([
      supabase
        .from("sla_policies")
        .select(
          "id, name, priority, measure, target_hours, business_hours_only, is_active, applies_to, escalations",
        )
        .order("priority", { ascending: false })
        .returns<
          Array<{
            id: string;
            name: string;
            priority: number;
            measure: string;
            target_hours: number;
            business_hours_only: boolean;
            is_active: boolean;
            applies_to: RuleConditions | null;
            escalations: unknown;
          }>
        >(),
      supabase.from("centers").select("id, name").order("name").returns<Array<{ id: string; name: string }>>(),
      supabase
        .from("business_hours")
        .select("center_id, day_of_week, opens_at, closes_at, is_closed")
        .returns<Array<{ center_id: string; day_of_week: number; opens_at: string | null; closes_at: string | null; is_closed: boolean }>>(),
      supabase
        .from("holidays")
        .select("id, center_id, date, name")
        .order("date")
        .returns<Array<{ id: string; center_id: string; date: string; name: string }>>(),
      loadRuleOptions(supabase),
    ]);

  const label = ruleLabelLookup(ruleOptions);
  const policies: SlaPolicyData[] = (policyRows ?? []).map((policy) => ({
    id: policy.id,
    name: policy.name,
    priority: policy.priority,
    measure: policy.measure,
    target_hours: policy.target_hours,
    business_hours_only: policy.business_hours_only,
    is_active: policy.is_active,
    applies_to: describeConditions(policy.applies_to ?? {}, label),
    escalations: describeEscalationLadder(policy.escalations),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">SLA Policies</h1>
        <p className="text-sm text-muted-foreground">
          A policy is a promise about how quickly a lead gets answered, and what happens when it
          doesn&apos;t. The clock runs from the moment the lead arrives — not from a follow-up date
          a counsellor chose and can move, which is the thing the previous system got wrong.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Every hour, a job checks each lead against the one policy that applies to it. A lead past
          its target shows up under <strong>At risk</strong> on the dashboard, and whoever the
          policy&apos;s steps name is told.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Policies</h2>
        {policies.map((policy) => (
          <PolicyRow key={policy.id} policy={policy} />
        ))}
        {policies.length === 0 && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No policies yet, so nothing is being measured and nothing appears under At risk.
          </p>
        )}
        <PolicyForm fields={ruleOptions.fields} optionsByField={ruleOptions.optionsByField} />
      </div>

      <div className="flex flex-col gap-6">
        <h2 className="text-lg font-medium">Business hours &amp; holidays</h2>
        <p className="-mt-4 text-sm text-muted-foreground">
          When a policy is business-hours-only, its clock pauses outside these hours and on
          these dates — otherwise a Saturday-evening lead breaches its SLA before anyone is at
          work.
        </p>
        {(centers ?? []).map((center) => {
          const centerHours = (hours ?? []).filter((h) => h.center_id === center.id);
          const days: DayHours[] = Array.from({ length: 7 }, (_, day) => {
            const row = centerHours.find((h) => h.day_of_week === day);
            return {
              opensAt: row?.opens_at?.slice(0, 5) ?? "09:00",
              closesAt: row?.closes_at?.slice(0, 5) ?? "18:00",
              isClosed: row?.is_closed ?? false,
            };
          });
          const centerHolidays: HolidayData[] = (holidays ?? [])
            .filter((h) => h.center_id === center.id)
            .map((h) => ({ id: h.id, date: h.date, name: h.name }));

          return (
            <div key={center.id} className="flex flex-col gap-4 rounded-lg border p-4">
              <h3 className="font-medium">{center.name}</h3>
              <BusinessHoursForm centerId={center.id} days={days} />
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">Holidays</h4>
                <HolidaysList centerId={center.id} holidays={centerHolidays} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
