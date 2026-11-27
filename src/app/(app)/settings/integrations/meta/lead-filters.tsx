"use client";

import { useActionState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addMetaLeadFilter, removeMetaLeadFilter, type FilterState } from "./lead-filter-actions";

export interface FilterRow {
  id: string;
  kind: string;
  externalId: string;
  label: string | null;
}

export interface SeenCampaign {
  campaignId: string;
  name: string | null;
  leads: number;
}

const KIND_TEXT: Record<string, string> = { campaign: "Campaign", adset: "Ad set", form: "Lead form" };

export function LeadFilters({ rules, seen }: { rules: FilterRow[]; seen: SeenCampaign[] }) {
  const [state, action, pending] = useActionState(addMetaLeadFilter, {} as FilterState);
  const [, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {rules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{KIND_TEXT[rule.kind] ?? rule.kind}</span>
                {rule.label ? ` “${rule.label}”` : ""} <span className="font-mono text-xs text-muted-foreground">{rule.externalId}</span>
                <span className="ml-2 text-xs text-muted-foreground">— leads stay out of the CRM</span>
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => start(() => void removeMetaLeadFilter(rule.id))}>
                Switch back on
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-wrap items-start gap-2">
        <select name="kind" className="h-9 rounded-md border bg-transparent px-3 text-sm" aria-label="What to switch off" defaultValue="campaign">
          <option value="campaign">Campaign</option>
          <option value="adset">Ad set</option>
          <option value="form">Lead form</option>
        </select>
        <Input name="externalId" placeholder="ID from Ads Manager, e.g. 120210…" className="h-9 w-64" aria-label="ID" />
        <Input name="label" placeholder="Name (optional)" className="h-9 w-56" aria-label="Name" />
        <Button type="submit" size="sm" disabled={pending}>
          Keep these leads out
        </Button>
        <FormMessage error={state.error} success={state.success} />
      </form>

      {seen.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">Campaigns your leads have come from recently</p>
          <ul className="flex flex-col gap-1">
            {seen.map((c) => (
              <li key={c.campaignId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {c.name ?? "Campaign"} <span className="font-mono text-xs text-muted-foreground">{c.campaignId}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {c.leads} lead{c.leads === 1 ? "" : "s"}</span>
                </span>
                <form action={action}>
                  <input type="hidden" name="kind" value="campaign" />
                  <input type="hidden" name="externalId" value={c.campaignId} />
                  <input type="hidden" name="label" value={c.name ?? ""} />
                  <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                    Keep out of the CRM
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
