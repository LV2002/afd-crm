"use client";

import { useActionState, useTransition } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { saveAlertRule, setAlertRuleActive, type AlertRuleState } from "./actions";

const initial: AlertRuleState = {};
const select = "h-9 rounded-md border bg-background px-3 text-sm";

function Fields({ metric, limit, warnPercent, label }: { metric: string; limit: string; warnPercent: number; label: string }) {
  return (
    <>
      <select name="metric" defaultValue={metric} className={select} aria-label="What to watch">
        <option value="bank_balance">Bank balance (all bank accounts)</option>
        <option value="income_fy">Income this financial year</option>
      </select>
      <Input name="limit" defaultValue={limit} placeholder="Mark in ₹" aria-label="Mark in rupees" className="w-36" />
      <Input name="warnPercent" type="number" min={50} max={99} defaultValue={warnPercent} aria-label="Warn at percent" className="w-20" />
      <span className="text-sm text-muted-foreground">%</span>
      <Input name="label" defaultValue={label} placeholder="Name, e.g. ₹20 lakh" aria-label="Name" className="w-36" />
    </>
  );
}

export function RuleRow(props: { id: string; metric: string; limitRupees: string; warnPercent: number; label: string; isActive: boolean }) {
  const [state, action, pending] = useActionState(saveAlertRule, initial);
  const [, start] = useTransition();
  return (
    <li className={`flex flex-col gap-1 py-2 ${props.isActive ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={props.id} />
          <Fields metric={props.metric} limit={props.limitRupees} warnPercent={props.warnPercent} label={props.label} />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Save</Button>
        </form>
        <Button type="button" size="sm" variant="ghost" onClick={() => start(() => void setAlertRuleActive(props.id, !props.isActive))}>
          {props.isActive ? "Switch off" : "Switch on"}
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </li>
  );
}

export function AddRuleForm() {
  const [state, action, pending] = useActionState(saveAlertRule, initial);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Fields metric="bank_balance" limit="" warnPercent={90} label="" />
        <Button type="submit" disabled={pending}>Add mark</Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </form>
  );
}
