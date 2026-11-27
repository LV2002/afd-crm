"use client";

import { useActionState, useState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { addMetaLeadFilter, removeMetaLeadFilter, type FilterState } from "./lead-filter-actions";

export interface FilterRow {
  id: string;
  kind: string;
  externalId: string;
  label: string | null;
  destination: string;
  listName: string | null;
}

export interface SeenCampaign {
  campaignId: string;
  name: string | null;
  leads: number;
}

const KIND_TEXT: Record<string, string> = { campaign: "Campaign", adset: "Ad set", form: "Lead form" };

export function LeadFilters({
  rules,
  seen,
  lists,
}: {
  rules: FilterRow[];
  seen: SeenCampaign[];
  lists: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(addMetaLeadFilter, {} as FilterState);
  const [, start] = useTransition();
  const [destination, setDestination] = useState<"skip" | "contact_list">("skip");
  const [listId, setListId] = useState(lists[0]?.id ?? "");

  return (
    <div className="flex flex-col gap-4">
      {rules.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{KIND_TEXT[rule.kind] ?? rule.kind}</span>
                {rule.label ? ` “${rule.label}”` : ""} <span className="font-mono text-xs text-muted-foreground">{rule.externalId}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {rule.destination === "contact_list"
                    ? `— new people go to the database “${rule.listName ?? "(missing)"}” instead of the CRM`
                    : "— leads stay out of the CRM"}
                </span>
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
        <select
          name="destination"
          value={destination}
          onChange={(event) => setDestination(event.target.value as "skip" | "contact_list")}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
          aria-label="What to do with their leads"
        >
          <option value="skip">Keep the leads out of the CRM</option>
          <option value="contact_list">Add the people to a database instead</option>
        </select>
        {destination === "contact_list" && (
          <select
            name="contactListId"
            value={listId}
            onChange={(event) => setListId(event.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
            aria-label="Database"
          >
            {lists.length === 0 && <option value="">No databases yet</option>}
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          Apply
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
                  <input type="hidden" name="destination" value={destination} />
                  <input type="hidden" name="contactListId" value={destination === "contact_list" ? listId : ""} />
                  <input type="hidden" name="externalId" value={c.campaignId} />
                  <input type="hidden" name="label" value={c.name ?? ""} />
                  <Button type="submit" size="sm" variant="ghost" disabled={pending}>
                    {destination === "contact_list" ? "Send to the database" : "Keep out of the CRM"}
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
