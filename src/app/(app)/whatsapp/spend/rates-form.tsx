"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/layout/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BILLING_CATEGORIES, CATEGORY_LABELS } from "@/lib/whatsapp/pricing";

import { saveRates, type RatesState } from "./actions";

export function RatesForm({ rates }: { rates: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveRates, {} as RatesState);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">What WhatsApp charges per message</h3>
      <p className="max-w-2xl text-xs text-muted-foreground">
        Rupees per message, from Meta&apos;s rate card for India. Meta changes these, so check them against WhatsApp
        Manager → Billing and edit here; every estimate uses what is saved. The spend figures below come from Meta&apos;s own
        delivery reports.
      </p>
      <div className="flex flex-wrap gap-3">
        {BILLING_CATEGORIES.map((category) => (
          <div key={category} className="flex flex-col gap-1">
            <Label htmlFor={`rate-${category}`} className="text-xs">
              {CATEGORY_LABELS[category]}
            </Label>
            <Input id={`rate-${category}`} name={category} defaultValue={rates[category] ?? "0.0000"} className="h-9 w-28" />
          </div>
        ))}
      </div>
      <FormMessage error={state.error} success={state.success} />
      <Button type="submit" size="sm" disabled={pending} className="w-fit">
        {pending ? "Saving…" : "Save rates"}
      </Button>
    </form>
  );
}
